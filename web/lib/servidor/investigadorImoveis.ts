import {
  analisarCorrespondenciasInvestigacao,
  deduplicarResultadosInvestigacao,
  extrairCamposInvestigacao,
  haEvidenciaSuficiente,
  MAXIMO_BUSCAS_POR_INVESTIGACAO,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { MARGEM_FINALIZACAO_INVESTIGACAO_MS } from "@/lib/servidor/investigadorOrcamento";
import {
  classificarErroFetch,
  registrarFalhaProvider,
  registrarSucessoProvider,
  type MotivoParadaPesquisa,
  type ResumoEtapaPesquisa,
} from "@/lib/servidor/investigadorObservabilidade";

const HOST_RAPIDAPI = "google-search-api7.p.rapidapi.com";
const URL_BUSCA_RAPIDAPI = `https://${HOST_RAPIDAPI}/search`;
const TIMEOUT_BUSCA_MS = 22_000;
const TIMEOUT_LINK_MS = 3_500;
const MAXIMO_RESULTADOS_POR_BUSCA = 10;
const MINIMO_TEMPO_CONSULTA_MS = TIMEOUT_LINK_MS;

interface ResultadoOrganicoRapidApi {
  title?: unknown;
  description?: unknown;
  desc?: unknown;
  link?: unknown;
  url?: unknown;
  displayedLink?: unknown;
}

interface RespostaRapidApi {
  organic_results?: unknown;
  data?: { organic_results?: unknown };
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
  motivoParada: MotivoParadaPesquisa;
  orcamentoRestanteNaParadaMs?: number;
}

const HEADERS_RATE_LIMIT_SEGUROS = [
  "retry-after",
  "x-ratelimit-requests-limit",
  "x-ratelimit-requests-remaining",
  "x-ratelimit-requests-reset",
  "x-rate-limit-rapid-free-plans-hard-limit-limit",
  "x-rate-limit-rapid-free-plans-hard-limit-remaining",
  "x-rate-limit-rapid-free-plans-hard-limit-reset",
] as const;

function diagnosticoHeaders(resposta: Response): Record<string, string> {
  return Object.fromEntries(HEADERS_RATE_LIMIT_SEGUROS.flatMap((nome) => {
    const valor = resposta.headers.get(nome)?.trim();
    // Somente contadores numéricos: um header permitido ainda pode conter texto privado.
    return valor && /^\d{1,10}$/.test(valor) ? [[nome, valor]] : [];
  }));
}

function retryAfterEmSegundos(resposta: Response): number | undefined {
  const valor = resposta.headers.get("retry-after")?.trim();
  if (!valor || !/^\d+$/.test(valor)) return undefined;
  const segundos = Number(valor);
  return Number.isSafeInteger(segundos) && segundos >= 0 ? segundos : undefined;
}

function texto(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, limite) : "";
}

function dominioExibido(valor: unknown): string {
  const exibido = texto(valor, 300).replace(/^https?:\/\//i, "").split(/[ ›/]/)[0];
  return exibido.toLowerCase().replace(/^www\./, "");
}

function dominioDaUrl(valor: string, fallback = ""): string {
  try {
    return new URL(valor).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

async function resolverUrlOriginal(link: string, fetcher: typeof fetch, sinalConsulta: AbortSignal): Promise<string> {
  if (!link.startsWith("/goto?")) return /^https?:\/\//i.test(link) ? link : "";
  const redirecionamento = `https://www.google.com${link}`;
  try {
    const resposta = await fetcher(redirecionamento, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.any([sinalConsulta, AbortSignal.timeout(TIMEOUT_LINK_MS)]),
      cache: "no-store",
    });
    const destino = resposta.headers.get("location");
    if (destino && /^https?:\/\//i.test(destino)) return destino;
  } catch {
    /* O redirecionamento do Google continua clicável como fallback. */
  }
  return redirecionamento;
}

/** Lista bruta como veio, ou null quando o corpo não tem `organic_results`
    utilizável (JSON inválido, campo ausente ou de outro tipo). */
function listaOrganicaBruta(corpo: RespostaRapidApi | null): ResultadoOrganicoRapidApi[] | null {
  const valor = corpo?.organic_results ?? corpo?.data?.organic_results;
  return Array.isArray(valor) ? valor as ResultadoOrganicoRapidApi[] : null;
}

async function buscarConsultaNoGoogle(
  consulta: string,
  indiceConsulta: number,
  apiKey: string,
  fetcher: typeof fetch,
  execucao: string | null,
  timeoutMs: number,
): Promise<ResultadoWebInvestigacao[]> {
  const url = new URL(URL_BUSCA_RAPIDAPI);
  url.searchParams.set("keyword", consulta);
  url.searchParams.set("device", "Desktop");

  const inicio = performance.now();
  const sinalConsulta = AbortSignal.timeout(timeoutMs);
  const prazoLimitado = timeoutMs < TIMEOUT_BUSCA_MS;
  let resposta: Response;
  try {
    resposta = await fetcher(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": HOST_RAPIDAPI,
      },
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
  if (resposta.status === 429) {
    const retryAfterSegundos = retryAfterEmSegundos(resposta);
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
  const corpo = await resposta.json().catch(() => null) as RespostaRapidApi | null;
  if (sinalConsulta.aborted) {
    registrarFalhaProvider({
      execucao, indiceConsulta, duracaoMs: performance.now() - inicio,
      causa: prazoLimitado ? "abort-orcamento" : "timeout-provider",
      motivo: "indisponivel", erro: "TimeoutError",
    });
    throw new BuscaWebIndisponivel("A pesquisa excedeu o tempo disponível.", "indisponivel");
  }
  const duracaoMs = performance.now() - inicio;
  const lista = listaOrganicaBruta(corpo);
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
  const organicos = (lista ?? []).slice(0, MAXIMO_RESULTADOS_POR_BUSCA);

  return Promise.all(organicos.map(async (item) => {
    const titulo = texto(item.title, 300);
    const descricao = texto(item.description ?? item.desc, 1_000);
    const linkRecebido = texto(item.link ?? item.url, 2_000);
    const urlOriginal = linkRecebido ? await resolverUrlOriginal(linkRecebido, fetcher, sinalConsulta) : "";
    const dominioFallback = dominioExibido(item.displayedLink);
    const campos = extrairCamposInvestigacao(`${titulo} ${descricao}`);
    return {
      titulo,
      url: urlOriginal,
      dominio: dominioDaUrl(urlOriginal, dominioFallback),
      descricao,
      consultas: [consulta],
      ...campos,
    };
  })).then((itens) => itens.filter((item) => item.titulo && item.url && item.dominio));
}

/** Fronteira interna do Investigador. Nenhum componente conhece RapidAPI. */
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
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  if (!apiKey) {
    throw new BuscaWebIndisponivel("RAPIDAPI_KEY não configurada.", "configuracao");
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
      daEtapa = await buscarConsultaNoGoogle(consulta, indice + 1, apiKey, fetcher, execucao, timeoutMs);
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

    if (limiteAtingido) {
      motivoParada = "limite-provider";
      break;
    }
    if (haEvidenciaSuficiente(analisarCorrespondenciasInvestigacao(consultaOriginal, unicos))) {
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
    motivoParada,
    ...(orcamentoRestanteNaParadaMs !== undefined ? { orcamentoRestanteNaParadaMs } : {}),
  };
}
