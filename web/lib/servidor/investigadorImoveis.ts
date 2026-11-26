import {
  deduplicarResultadosInvestigacao,
  extrairCamposInvestigacao,
  haEvidenciaSuficiente,
  MAXIMO_BUSCAS_POR_INVESTIGACAO,
  triarCorrespondenciasInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { segundosRetryAfter } from "@/lib/calculo/retryAfter";
import { MARGEM_FINALIZACAO_INVESTIGACAO_MS } from "@/lib/servidor/investigadorOrcamento";
import {
  classificarErroFetch,
  registrarFalhaProvider,
  registrarSucessoProvider,
  type MotivoParadaPesquisa,
  type ResumoEtapaPesquisa,
} from "@/lib/servidor/investigadorObservabilidade";

const HOST_FIRECRAWL = "api.firecrawl.dev";
const URL_BUSCA_FIRECRAWL = `https://${HOST_FIRECRAWL}/v2/search`;
const TIMEOUT_BUSCA_MS = 22_000;
const TIMEOUT_LINK_MS = 3_500;
const MAXIMO_RESULTADOS_POR_BUSCA = 10;
const MINIMO_TEMPO_CONSULTA_MS = TIMEOUT_LINK_MS;
const HOSTS_REDIRECIONAMENTO_GOOGLE = new Set(["google.com", "google.com.br", "share.google"]);

interface ResultadoWebFirecrawl {
  title?: unknown;
  description?: unknown;
  markdown?: unknown;
  url?: unknown;
  link?: unknown;
}

interface RespostaFirecrawlSearch {
  success?: unknown;
  data?: unknown;
}

/** Contagens da fila no momento em que a busca desistiu; só números, para
    a linha de conclusão da investigação. */
export interface ResumoBuscaInterrompida {
  consultasExecutadas: number;
  falhas: number;
  motivoParada?: MotivoParadaPesquisa;
  etapas?: ResumoEtapaPesquisa[];
}

export class BuscaWebIndisponivel extends Error {
  constructor(
    message: string,
    public readonly motivo: "configuracao" | "limite" | "indisponivel" | "orcamento",
    public readonly retryAfterSegundos?: number,
    public readonly resumo: ResumoBuscaInterrompida = { consultasExecutadas: 0, falhas: 0 },
  ) {
    super(message);
  }
}

export interface ResultadoBuscaWebInvestigacao {
  resultados: ResultadoWebInvestigacao[];
  falhas: number;
  limiteAtingido: boolean;
  consultasExecutadas: string[];
  pesquisasEvitadas: number;
  encerramentoAntecipado: boolean;
  orcamentoEsgotado: boolean;
  consultasLimitadasPeloOrcamento: number;
  retryAfterSegundos?: number;
  /** B1: uma entrada por consulta executada, na ordem da fila. */
  etapas: ResumoEtapaPesquisa[];
  /** B2: alinhado com `etapas`: quantos dos `novos` de cada etapa o gate
      de relevância descartou naquele momento. Só contagem. */
  descartadosPorEtapa: number[];
  motivoParada: MotivoParadaPesquisa;
  orcamentoRestanteNaParadaMs?: number;
}

const HEADERS_RATE_LIMIT_SEGUROS = [
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-ratelimit-requests-limit",
  "x-ratelimit-requests-remaining",
  "x-ratelimit-requests-reset",
] as const;

function diagnosticoHeaders(resposta: Response): Record<string, string> {
  return Object.fromEntries(HEADERS_RATE_LIMIT_SEGUROS.flatMap((nome) => {
    const valor = resposta.headers.get(nome)?.trim();
    // Somente contadores numéricos: um header permitido ainda pode conter texto privado.
    return valor && /^\d{1,10}$/.test(valor) ? [[nome, valor]] : [];
  }));
}

function retryAfterEmSegundos(resposta: Response): number | undefined {
  return segundosRetryAfter(resposta.headers.get("retry-after"));
}

function texto(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, limite) : "";
}

function dominioDaUrl(valor: string): string {
  try {
    return new URL(valor).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function desembrulharParametroGoogle(valor: string): string {
  if (!/^https?:\/\//i.test(valor)) return "";
  try {
    const analisada = new URL(valor);
    const host = analisada.hostname.toLowerCase().replace(/^www\./, "");
    if (HOSTS_REDIRECIONAMENTO_GOOGLE.has(host)) {
      for (const parametro of ["url", "q", "adurl", "u"]) {
        const destino = analisada.searchParams.get(parametro) || "";
        if (/^https?:\/\//i.test(destino)) return destino;
      }
    }
    return valor;
  } catch {
    return "";
  }
}

async function resolverUrlResultado(
  valor: string,
  fetcher: typeof fetch,
  sinalConsulta: AbortSignal,
): Promise<string> {
  const inicial = desembrulharParametroGoogle(valor);
  if (!inicial) return "";
  try {
    const host = new URL(inicial).hostname.toLowerCase().replace(/^www\./, "");
    if (!HOSTS_REDIRECIONAMENTO_GOOGLE.has(host)) return inicial;
    const resposta = await fetcher(inicial, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.any([sinalConsulta, AbortSignal.timeout(TIMEOUT_LINK_MS)]),
      cache: "no-store",
    });
    const destino = resposta.headers.get("location") || "";
    const resolvido = desembrulharParametroGoogle(destino);
    if (resolvido) return resolvido;
  } catch {
    /* Mantém o link original clicável como fallback. */
  }
  return inicial;
}

/** Lista bruta como veio do Firecrawl `/v2/search`, ou null quando o corpo
    não tem `data.web` (ou `data` array) utilizável ou declara `success: false`. */
function listaWebBruta(corpo: RespostaFirecrawlSearch | null): ResultadoWebFirecrawl[] | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  if (corpo.success === false) return null;
  if (Array.isArray(corpo.data)) return corpo.data as ResultadoWebFirecrawl[];
  if (corpo.data && typeof corpo.data === "object" && !Array.isArray(corpo.data)) {
    const web = (corpo.data as { web?: unknown }).web;
    if (Array.isArray(web)) return web as ResultadoWebFirecrawl[];
  }
  return null;
}

async function buscarConsultaNoFirecrawl(
  consulta: string,
  indiceConsulta: number,
  apiKey: string,
  fetcher: typeof fetch,
  execucao: string | null,
  timeoutMs: number,
): Promise<ResultadoWebInvestigacao[]> {
  const inicio = performance.now();
  const sinalConsulta = AbortSignal.timeout(timeoutMs);
  const prazoLimitado = timeoutMs < TIMEOUT_BUSCA_MS;
  let resposta: Response;
  try {
    resposta = await fetcher(URL_BUSCA_FIRECRAWL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: consulta,
        limit: MAXIMO_RESULTADOS_POR_BUSCA,
        sources: [{ type: "web" }],
        country: "BR",
        location: "Brazil",
        timeout: timeoutMs,
      }),
      signal: sinalConsulta,
      cache: "no-store",
    });
  } catch (erro) {
    // O fetch rejeitou antes de haver Response: timeout próprio, DNS, TLS,
    // reset... A classificação guarda só o nome do erro e um código curto.
    registrarFalhaProvider({
      execucao,
      indiceConsulta,
      duracaoMs: performance.now() - inicio,
      motivo: "indisponivel",
      ...(sinalConsulta.aborted && prazoLimitado
        ? { causa: "abort-orcamento" as const, erro: "TimeoutError" }
        : classificarErroFetch(erro)),
    });
    throw new BuscaWebIndisponivel("O provider não respondeu.", "indisponivel");
  }
  if (resposta.status === 429 || resposta.status === 402) {
    const retryAfterSegundos = resposta.status === 429 ? retryAfterEmSegundos(resposta) : undefined;
    registrarFalhaProvider({
      execucao,
      indiceConsulta,
      duracaoMs: performance.now() - inicio,
      causa: "http",
      motivo: "limite",
      status: resposta.status,
      headersRateLimit: diagnosticoHeaders(resposta),
    });
    throw new BuscaWebIndisponivel("Limite de buscas atingido.", "limite", retryAfterSegundos);
  }
  if (!resposta.ok) {
    registrarFalhaProvider({
      execucao,
      indiceConsulta,
      duracaoMs: performance.now() - inicio,
      causa: "http",
      motivo: "indisponivel",
      status: resposta.status,
      headersRateLimit: diagnosticoHeaders(resposta),
    });
    throw new BuscaWebIndisponivel(`Provider respondeu ${resposta.status}.`, "indisponivel");
  }
  const corpo = await resposta.json().catch(() => null) as RespostaFirecrawlSearch | null;
  if (sinalConsulta.aborted) {
    registrarFalhaProvider({
      execucao, indiceConsulta, duracaoMs: performance.now() - inicio,
      causa: prazoLimitado ? "abort-orcamento" : "timeout-provider",
      motivo: "indisponivel", erro: "TimeoutError",
    });
    throw new BuscaWebIndisponivel("A pesquisa excedeu o tempo disponível.", "indisponivel");
  }
  const duracaoMs = performance.now() - inicio;
  const lista = listaWebBruta(corpo);
  if (lista === null) {
    // 200 sem lista utilizável. O comportamento entregue continua o mesmo
    // (zero resultados, sem contar falha); só deixa de ser silencioso.
    registrarFalhaProvider({
      execucao,
      indiceConsulta,
      duracaoMs,
      causa: "resposta-invalida",
      motivo: "resposta-invalida",
      status: resposta.status,
      headersRateLimit: diagnosticoHeaders(resposta),
    });
  } else {
    registrarSucessoProvider({
      execucao,
      indiceConsulta,
      duracaoMs,
      status: resposta.status,
      resultadosBrutos: lista.length,
    });
  }
  const web = (lista ?? []).slice(0, MAXIMO_RESULTADOS_POR_BUSCA);

  return Promise.all(web.map(async (item) => {
    const titulo = texto(item.title, 300);
    const descricao = texto(item.description ?? item.markdown, 1_000);
    const urlRecebida = texto(item.url ?? item.link, 2_000);
    const urlOriginal = urlRecebida ? await resolverUrlResultado(urlRecebida, fetcher, sinalConsulta) : "";
    const campos = extrairCamposInvestigacao(`${titulo} ${descricao}`);
    return {
      titulo,
      url: urlOriginal,
      dominio: dominioDaUrl(urlOriginal),
      descricao,
      consultas: [consulta],
      ...campos,
    };
  })).then((itens) => itens.filter((item) => item.titulo && item.url && item.dominio));
}

/** Fronteira interna do Investigador. Nenhum componente conhece o Firecrawl. */
export interface OpcoesBuscaWebInvestigacao {
  /** Id da execução gerado pela rota; amarra todas as linhas de log. */
  execucao?: string;
  /** Prazo absoluto medido desde a entrada da rota. */
  deadlineMs?: number;
  /** Permite testar o orçamento sem esperar pelo relógio real. */
  agoraMs?: () => number;
}

export async function buscarImovelNaWeb(
  consultaOriginal: string,
  consultas: string[],
  fetcher: typeof fetch = fetch,
  aoConcluirPesquisa?: (consultasExecutadas: string[]) => void,
  opcoes: OpcoesBuscaWebInvestigacao = {},
): Promise<ResultadoBuscaWebInvestigacao> {
  const execucao = opcoes.execucao ?? null;
  const agoraMs = opcoes.agoraMs ?? (() => performance.now());
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new BuscaWebIndisponivel("FIRECRAWL_API_KEY não configurada.", "configuracao");
  }

  const fila = consultas.slice(0, MAXIMO_BUSCAS_POR_INVESTIGACAO);
  const resultados: ResultadoWebInvestigacao[] = [];
  const consultasExecutadas: string[] = [];
  let falhas = 0;
  let limiteAtingido = false;
  let encerramentoAntecipado = false;
  let orcamentoEsgotado = false;
  let consultasLimitadasPeloOrcamento = 0;
  let retryAfterSegundos: number | undefined;
  // B1: a fila é progressiva (da consulta mais restrita para a mais ampla).
  // Avança só sem evidência suficiente, sem 429 e com orçamento A2; o
  // orçamento é conferido antes de cada etapa e sempre prevalece.
  const etapas: ResumoEtapaPesquisa[] = [];
  let motivoParada: MotivoParadaPesquisa = "plano-esgotado";
  let orcamentoRestanteNaParadaMs: number | undefined;
  let unicosAteAqui = 0;
  const descartadosPorEtapa: number[] = [];
  const urlsJaVistas = new Set<string>();

  for (const [indice, consulta] of fila.entries()) {
    const restante = opcoes.deadlineMs === undefined
      ? TIMEOUT_BUSCA_MS
      : opcoes.deadlineMs - agoraMs() - MARGEM_FINALIZACAO_INVESTIGACAO_MS;
    if (restante < MINIMO_TEMPO_CONSULTA_MS) {
      orcamentoEsgotado = true;
      motivoParada = "orcamento";
      orcamentoRestanteNaParadaMs = Math.max(0, Math.round(restante));
      break;
    }
    const timeoutMs = Math.max(1, Math.floor(Math.min(TIMEOUT_BUSCA_MS, restante)));
    if (timeoutMs < TIMEOUT_BUSCA_MS) consultasLimitadasPeloOrcamento += 1;
    consultasExecutadas.push(consulta);
    let daEtapa: ResultadoWebInvestigacao[] = [];
    let falhou = false;
    try {
      daEtapa = await buscarConsultaNoFirecrawl(consulta, indice + 1, apiKey, fetcher, execucao, timeoutMs);
      resultados.push(...daEtapa);
    } catch (erro) {
      falhas += 1;
      falhou = true;
      if (erro instanceof BuscaWebIndisponivel && erro.motivo === "limite") {
        limiteAtingido = true;
        retryAfterSegundos = erro.retryAfterSegundos;
      }
    }
    aoConcluirPesquisa?.([...consultasExecutadas]);

    const unicos = deduplicarResultadosInvestigacao(resultados);
    etapas.push({
      resultados: daEtapa.length,
      novos: unicos.length - unicosAteAqui,
      falhou,
      orcamentoRestanteMs: opcoes.deadlineMs === undefined ? null : Math.round(restante),
    });
    unicosAteAqui = unicos.length;
    // B2: a regra de parada só enxerga o que passou pelo gate; um resultado
    // descartado como ruído não encerra a fila. O gate não cria etapa nova:
    // se tudo for descartado, a fila segue o plano do B1 e o orçamento A2.
    const triagem = triarCorrespondenciasInvestigacao(consultaOriginal, unicos);
    // O dedupe já devolve a URL canônica: ela identifica o card entre etapas.
    descartadosPorEtapa.push(triagem.itens.filter((item) =>
      item.motivo !== null && !urlsJaVistas.has(item.correspondencia.url)
    ).length);
    for (const item of unicos) urlsJaVistas.add(item.url);

    if (limiteAtingido) {
      motivoParada = "limite-provider";
      break;
    }
    if (haEvidenciaSuficiente(triagem.mantidos)) {
      encerramentoAntecipado = consultasExecutadas.length < fila.length;
      motivoParada = "evidencia-suficiente";
      break;
    }
  }

  if (!resultados.length && falhas) {
    const resumo = { consultasExecutadas: consultasExecutadas.length, falhas, motivoParada, etapas };
    if (limiteAtingido) {
      throw new BuscaWebIndisponivel("Limite de buscas atingido.", "limite", retryAfterSegundos, resumo);
    }
    if (orcamentoEsgotado) {
      throw new BuscaWebIndisponivel("O tempo da investigação se esgotou.", "orcamento", undefined, resumo);
    }
    throw new BuscaWebIndisponivel("O serviço de pesquisa não respondeu.", "indisponivel", undefined, resumo);
  }
  if (!resultados.length && orcamentoEsgotado) {
    throw new BuscaWebIndisponivel("O tempo da investigação se esgotou.", "orcamento", undefined, {
      consultasExecutadas: consultasExecutadas.length, falhas, motivoParada, etapas,
    });
  }
  return {
    resultados,
    falhas,
    limiteAtingido,
    consultasExecutadas,
    pesquisasEvitadas: fila.length - consultasExecutadas.length,
    encerramentoAntecipado,
    orcamentoEsgotado,
    consultasLimitadasPeloOrcamento,
    retryAfterSegundos,
    etapas,
    descartadosPorEtapa,
    motivoParada,
    ...(orcamentoRestanteNaParadaMs !== undefined ? { orcamentoRestanteNaParadaMs } : {}),
  };
}
