import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { getCache } from "@vercel/functions";
import { anuncioPertenceAoMercado, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { urlAbsolutaDoCardChaves } from "@/lib/calculo/urlChavesHttp";
import { urlDaPesquisa } from "./centralAngariacao";
import { chaveCanonicaConsultaPortal } from "./planejadorColetaMercados";
import {
  buscarComFirecrawl, CACHE_FIRECRAWL_TTL_SEGUNDOS, extrairAnunciosFirecrawl,
  FirecrawlIndisponivel, type DiagnosticoPaginaOlx, type EventoConsultaFirecrawl,
  type OrigemConsultaFirecrawl,
} from "./firecrawlCentralAngariacao";

export type CodigoErroHttpChaves = "http_status_falhou" | "http_timeout"
  | "http_transporte_falhou" | "http_parser_falhou" | "http_resultado_indeterminado";
export type OrigemColetaCentral = OrigemConsultaFirecrawl | "http_direto";

export class HttpChavesIndisponivel extends Error {
  constructor(
    readonly codigo: CodigoErroHttpChaves,
    readonly statusHttp: number | null = null,
  ) {
    super("Consulta HTTP do Chaves não confirmou resultados utilizáveis.");
  }
}

type ResultadoHttp = { html: string; anuncios: AnuncioCentralAngariacao[]; statusHttp: number };
const consultasHttpEmAndamento = new Map<string, {
  coletaId: string;
  promessa: Promise<ResultadoHttp>;
  estado: { statusHttp: number | null };
}>();

function notificar(observar: ((evento: EventoConsultaFirecrawl) => void) | undefined, evento: EventoConsultaFirecrawl) {
  try { observar?.(evento); } catch { /* Telemetria acessória. */ }
}

function timeout(erro: unknown): boolean {
  return erro instanceof Error && ["AbortError", "TimeoutError"].includes(erro.name);
}

/** O parser é o mesmo do Firecrawl; só a saída do fallback recebe URL absoluta. */
export function interpretarHttpChaves(html: string, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
  let anuncios: AnuncioCentralAngariacao[];
  try {
    anuncios = extrairAnunciosFirecrawl(html, filtros);
  } catch {
    throw new HttpChavesIndisponivel("http_parser_falhou");
  }
  const normalizados = anuncios.flatMap((anuncio) => {
    const url = urlAbsolutaDoCardChaves(anuncio.url, anuncio.idExterno);
    return url ? [{ ...anuncio, url }] : [];
  });
  const validos = normalizados.filter((anuncio) =>
    !!anuncio.titulo.trim()
    && anuncioPertenceAoMercado(anuncio, filtros.cidade, filtros.estado)
    && (!filtros.somenteProprietario || anuncio.anunciante === "proprietario"));
  if (validos.length === 0) throw new HttpChavesIndisponivel("http_resultado_indeterminado");
  return filtros.somenteProprietario ? validos : normalizados;
}

async function cacheHttp(chave: string, filtros: FiltrosCentralAngariacao): Promise<{ html: string; anuncios: AnuncioCentralAngariacao[] } | null> {
  try {
    const valor = await getCache({ namespace: "central-chaves-http-html-v1" }).get(chave);
    if (typeof valor !== "string") return null;
    const html = gunzipSync(Buffer.from(valor, "base64")).toString("utf8");
    return { html, anuncios: interpretarHttpChaves(html, filtros) };
  } catch {
    // Cache danificado, inacessível ou incompatível nunca vira sucesso.
    return null;
  }
}

async function cacheFirecrawlDisponivel(chave: string): Promise<boolean> {
  try {
    const valor = await getCache({ namespace: "central-firecrawl-html-v2" }).get(chave);
    if (typeof valor !== "string") return false;
    gunzipSync(Buffer.from(valor, "base64"));
    return true;
  } catch {
    return false;
  }
}

async function coletarHttpChaves(
  urlPesquisa: string,
  observar: (fase: "fetch_iniciado" | "resposta_recebida", statusHttp?: number) => void,
): Promise<ResultadoHttp> {
  let resposta: Response;
  try {
    observar("fetch_iniciado");
    resposta = await fetch(urlPesquisa, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CentralAngariacao/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (erro) {
    throw new HttpChavesIndisponivel(timeout(erro) ? "http_timeout" : "http_transporte_falhou");
  }
  observar("resposta_recebida", resposta.status);
  if (!resposta.ok) throw new HttpChavesIndisponivel("http_status_falhou", resposta.status);
  let html: string;
  try {
    html = await resposta.text();
  } catch (erro) {
    throw new HttpChavesIndisponivel(timeout(erro) ? "http_timeout" : "http_transporte_falhou", resposta.status);
  }
  return { html, anuncios: [], statusHttp: resposta.status };
}

async function buscarHttpChaves(
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string,
  registrarOrigem?: (origem: OrigemColetaCentral) => void,
  observar?: (evento: EventoConsultaFirecrawl) => void,
): Promise<AnuncioCentralAngariacao[]> {
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  const existente = consultasHttpEmAndamento.get(chave);
  if (existente) {
    registrarOrigem?.("em_andamento");
    notificar(observar, { fase: "fallback", aquisicao: "http_direto", coletaId: existente.coletaId });
    notificar(observar, { fase: "single_flight", aquisicao: "desconhecida", coletaId: existente.coletaId });
    try {
      const compartilhado = await existente.promessa;
      notificar(observar, { fase: "coleta_compartilhada_concluida", aquisicao: "http_direto",
        coletaId: existente.coletaId, statusHttp: compartilhado.statusHttp });
      const anuncios = interpretarHttpChaves(compartilhado.html, filtros);
      notificar(observar, { fase: "resultado_interpretado", aquisicao: "http_direto", coletaId: existente.coletaId });
      return anuncios;
    } catch (erro) {
      notificar(observar, { fase: "falha", aquisicao: "http_direto", coletaId: existente.coletaId,
        ...(existente.estado.statusHttp != null ? { statusHttp: existente.estado.statusHttp } : {}),
        ...(erro instanceof HttpChavesIndisponivel ? { codigo: erro.codigo } : {}) });
      throw erro;
    }
  }

  const coletaId = randomUUID();
  const estado = { statusHttp: null as number | null };
  registrarOrigem?.("http_direto");
  notificar(observar, { fase: "fallback", aquisicao: "http_direto", coletaId });
  notificar(observar, { fase: "caminho_escolhido", aquisicao: "http_direto", coletaId });
  const promessa = (async () => {
    const coletado = await coletarHttpChaves(urlPesquisa, (fase, statusHttp) => {
      if (statusHttp != null) estado.statusHttp = statusHttp;
      notificar(observar, { fase, aquisicao: "http_direto", coletaId,
        ...(statusHttp != null ? { statusHttp } : {}) });
    });
    const anuncios = interpretarHttpChaves(coletado.html, filtros);
    try {
      await getCache({ namespace: "central-chaves-http-html-v1" }).set(
        chave, gzipSync(coletado.html).toString("base64"), {
          ttl: CACHE_FIRECRAWL_TTL_SEGUNDOS,
          tags: ["central-chaves-http"],
          name: "Central: chaves-na-mao HTTP",
        },
      );
    } catch {
      // Falha de cache não invalida uma resposta já interpretada.
    }
    return { ...coletado, anuncios };
  })().finally(() => consultasHttpEmAndamento.delete(chave));
  consultasHttpEmAndamento.set(chave, { coletaId, promessa, estado });
  try {
    const coletado = await promessa;
    notificar(observar, { fase: "resultado_interpretado", aquisicao: "http_direto", coletaId });
    return coletado.anuncios;
  } catch (erro) {
    notificar(observar, { fase: "falha", aquisicao: "http_direto", coletaId,
      ...(estado.statusHttp != null ? { statusHttp: estado.statusHttp } : {}),
      ...(erro instanceof HttpChavesIndisponivel ? { codigo: erro.codigo } : {}) });
    throw erro;
  }
}

/** Cache válido precede novas aquisições; numa coleta nova Firecrawl permanece primário. */
export async function buscarComFallbackHttpChaves(
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string,
  registrarOrigem?: (origem: OrigemColetaCentral) => void,
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void,
  observar?: (evento: EventoConsultaFirecrawl) => void,
): Promise<AnuncioCentralAngariacao[]> {
  if (filtros.portal !== "chaves-na-mao" || urlPesquisa !== urlDaPesquisa(filtros)) {
    return buscarComFirecrawl(filtros, urlPesquisa, registrarOrigem, registrarDiagnosticoOlx, observar);
  }
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  if (await cacheFirecrawlDisponivel(chave)) {
    return buscarComFirecrawl(filtros, urlPesquisa, registrarOrigem, registrarDiagnosticoOlx, observar);
  }
  const armazenado = await cacheHttp(chave, filtros);
  if (armazenado) {
    registrarOrigem?.("cache");
    const coletaId = randomUUID();
    notificar(observar, { fase: "cache_hit", aquisicao: "cache", coletaId });
    notificar(observar, { fase: "resultado_interpretado", aquisicao: "cache", coletaId });
    return armazenado.anuncios;
  }
  try {
    return await buscarComFirecrawl(filtros, urlPesquisa, registrarOrigem, registrarDiagnosticoOlx, observar);
  } catch (erro) {
    if (!(erro instanceof FirecrawlIndisponivel)) throw erro;
  }
  const cacheAposFalha = await cacheHttp(chave, filtros);
  if (cacheAposFalha) {
    registrarOrigem?.("cache");
    const coletaId = randomUUID();
    notificar(observar, { fase: "cache_hit", aquisicao: "cache", coletaId });
    notificar(observar, { fase: "resultado_interpretado", aquisicao: "cache", coletaId });
    return cacheAposFalha.anuncios;
  }
  return buscarHttpChaves(filtros, urlPesquisa, registrarOrigem, observar);
}
