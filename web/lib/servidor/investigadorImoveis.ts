import {
  analisarCorrespondenciasInvestigacao,
  deduplicarResultadosInvestigacao,
  extrairCamposInvestigacao,
  haEvidenciaSuficiente,
  MAXIMO_BUSCAS_POR_INVESTIGACAO,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";

const HOST_RAPIDAPI = "google-search-api7.p.rapidapi.com";
const URL_BUSCA_RAPIDAPI = `https://${HOST_RAPIDAPI}/search`;
const TIMEOUT_BUSCA_MS = 22_000;
const TIMEOUT_LINK_MS = 3_500;
const MAXIMO_RESULTADOS_POR_BUSCA = 10;

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

export class BuscaWebIndisponivel extends Error {
  constructor(
    message: string,
    public readonly motivo: "configuracao" | "limite" | "indisponivel",
    public readonly retryAfterSegundos?: number,
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
  retryAfterSegundos?: number;
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
    const valor = resposta.headers.get(nome);
    return valor ? [[nome, valor]] : [];
  }));
}

function retryAfterEmSegundos(resposta: Response): number | undefined {
  const valor = resposta.headers.get("retry-after")?.trim();
  if (!valor || !/^\d+$/.test(valor)) return undefined;
  const segundos = Number(valor);
  return Number.isSafeInteger(segundos) && segundos >= 0 ? segundos : undefined;
}

function registrarFalhaProvider(
  consulta: string,
  tentativa: number,
  duracaoMs: number,
  motivo: "limite" | "indisponivel",
  status?: number,
  headers: Record<string, string> = {},
): void {
  console.warn("[investigador-imoveis] chamada ao provider falhou", {
    status: status ?? null,
    motivo,
    tentativa,
    consulta,
    duracaoMs: Math.round(duracaoMs),
    headersRateLimit: headers,
  });
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

async function resolverUrlOriginal(link: string, fetcher: typeof fetch): Promise<string> {
  if (!link.startsWith("/goto?")) return /^https?:\/\//i.test(link) ? link : "";
  const redirecionamento = `https://www.google.com${link}`;
  try {
    const resposta = await fetcher(redirecionamento, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_LINK_MS),
      cache: "no-store",
    });
    const destino = resposta.headers.get("location");
    if (destino && /^https?:\/\//i.test(destino)) return destino;
  } catch {
    /* O redirecionamento do Google continua clicável como fallback. */
  }
  return redirecionamento;
}

function resultadosOrganicos(corpo: RespostaRapidApi | null): ResultadoOrganicoRapidApi[] {
  const valor = corpo?.organic_results ?? corpo?.data?.organic_results;
  return Array.isArray(valor) ? valor.slice(0, MAXIMO_RESULTADOS_POR_BUSCA) : [];
}

async function buscarConsultaNoGoogle(
  consulta: string,
  tentativa: number,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<ResultadoWebInvestigacao[]> {
  const url = new URL(URL_BUSCA_RAPIDAPI);
  url.searchParams.set("keyword", consulta);
  url.searchParams.set("device", "Desktop");

  const inicio = performance.now();
  let resposta: Response;
  try {
    resposta = await fetcher(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": HOST_RAPIDAPI,
      },
      signal: AbortSignal.timeout(TIMEOUT_BUSCA_MS),
      cache: "no-store",
    });
  } catch {
    registrarFalhaProvider(consulta, tentativa, performance.now() - inicio, "indisponivel");
    throw new BuscaWebIndisponivel("O provider não respondeu.", "indisponivel");
  }
  const duracaoMs = performance.now() - inicio;
  if (resposta.status === 429) {
    const retryAfterSegundos = retryAfterEmSegundos(resposta);
    registrarFalhaProvider(
      consulta,
      tentativa,
      duracaoMs,
      "limite",
      resposta.status,
      diagnosticoHeaders(resposta),
    );
    throw new BuscaWebIndisponivel("Limite de buscas atingido.", "limite", retryAfterSegundos);
  }
  if (!resposta.ok) {
    registrarFalhaProvider(
      consulta,
      tentativa,
      duracaoMs,
      "indisponivel",
      resposta.status,
      diagnosticoHeaders(resposta),
    );
    throw new BuscaWebIndisponivel(`Provider respondeu ${resposta.status}.`, "indisponivel");
  }
  const corpo = await resposta.json().catch(() => null) as RespostaRapidApi | null;
  const organicos = resultadosOrganicos(corpo);

  return Promise.all(organicos.map(async (item) => {
    const titulo = texto(item.title, 300);
    const descricao = texto(item.description ?? item.desc, 1_000);
    const linkRecebido = texto(item.link ?? item.url, 2_000);
    const urlOriginal = linkRecebido ? await resolverUrlOriginal(linkRecebido, fetcher) : "";
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
export async function buscarImovelNaWeb(
  consultaOriginal: string,
  consultas: string[],
  fetcher: typeof fetch = fetch,
  aoConcluirPesquisa?: (consultasExecutadas: string[]) => void,
): Promise<ResultadoBuscaWebInvestigacao> {
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
  let retryAfterSegundos: number | undefined;

  for (const [indice, consulta] of fila.entries()) {
    consultasExecutadas.push(consulta);
    try {
      resultados.push(...await buscarConsultaNoGoogle(consulta, indice + 1, apiKey, fetcher));
    } catch (erro) {
      falhas += 1;
      if (erro instanceof BuscaWebIndisponivel && erro.motivo === "limite") {
        limiteAtingido = true;
        retryAfterSegundos = erro.retryAfterSegundos;
      }
    }
    aoConcluirPesquisa?.([...consultasExecutadas]);

    if (limiteAtingido) break;
    const candidatos = analisarCorrespondenciasInvestigacao(
      consultaOriginal,
      deduplicarResultadosInvestigacao(resultados),
    );
    if (haEvidenciaSuficiente(candidatos)) {
      encerramentoAntecipado = consultasExecutadas.length < fila.length;
      break;
    }
  }

  if (!resultados.length && falhas) {
    if (limiteAtingido) {
      throw new BuscaWebIndisponivel("Limite de buscas atingido.", "limite", retryAfterSegundos);
    }
    throw new BuscaWebIndisponivel("O serviço de pesquisa não respondeu.", "indisponivel");
  }
  return {
    resultados,
    falhas,
    limiteAtingido,
    consultasExecutadas,
    pesquisasEvitadas: fila.length - consultasExecutadas.length,
    encerramentoAntecipado,
    retryAfterSegundos,
  };
}
