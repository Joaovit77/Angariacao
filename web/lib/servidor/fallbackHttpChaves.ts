import { exigirTempoFaseRadar, type TempoRodadaRadar, type OrcamentoRodadaRadar } from "./orcamentoRadar";
import { agoraISOString } from "@/lib/datas";
import type { AquisicaoPortalRadar, TransportePaginaRadar } from "./coberturaRadar";
import { urlPaginaChavesRadar } from "./urlPaginaRadar";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { getCache } from "@vercel/functions";
import { anuncioPertenceAoMercado, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { urlAbsolutaDoCardChaves } from "@/lib/calculo/urlChavesHttp";
import { exigirCapacidadeAquisicaoRadar, urlDaPesquisa } from "./centralAngariacao";
import { chaveCanonicaConsultaPortal } from "./planejadorColetaMercados";
import {
  buscarComFirecrawl, CACHE_FIRECRAWL_TTL_SEGUNDOS, extrairAnunciosFirecrawl,
  FirecrawlIndisponivel, type DiagnosticoPaginaOlx, type EventoConsultaFirecrawl,
  type PoliticaRetryFirecrawl,
  type OrigemConsultaFirecrawl,
} from "./firecrawlCentralAngariacao";

export type CodigoErroHttpChaves = "http_status_falhou" | "http_timeout"
  | "http_transporte_falhou" | "http_parser_falhou" | "http_resultado_indeterminado"
  | "http_orcamento_insuficiente";
export type OrigemColetaCentral = OrigemConsultaFirecrawl | "http_direto";

export const TIMEOUT_HTTP_CHAVES_MS = 15_000;
/** Inclui interpretação, cache e finalização na rota da Central. */
export const RESERVA_PROCESSAMENTO_CENTRAL_MS = 35_000;

export class HttpChavesIndisponivel extends Error {
  constructor(
    readonly codigo: CodigoErroHttpChaves,
    readonly statusHttp: number | null = null,
  ) {
    super("Consulta HTTP do Chaves não confirmou resultados utilizáveis.");
  }
}

type ResultadoHttp = { html: string; anuncios: AnuncioCentralAngariacao[]; statusHttp: number; transporte?: TransportePaginaRadar; origemRadar?: AquisicaoPortalRadar };
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

function exigirOrcamento(restanteMs: (() => number) | undefined, minimoMs: number): void {
  if (!restanteMs) return;
  const restante = restanteMs();
  if (!Number.isFinite(restante) || restante < minimoMs) {
    throw new HttpChavesIndisponivel("http_orcamento_insuficiente");
  }
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
  tempoRadar?: TempoRodadaRadar,
): Promise<ResultadoHttp> {
  if (tempoRadar) exigirTempoFaseRadar(tempoRadar, TIMEOUT_HTTP_CHAVES_MS);
  let resposta: Response;
  try {
    observar("fetch_iniciado");
    resposta = await fetch(urlPesquisa, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CentralAngariacao/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_HTTP_CHAVES_MS),
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
  return { html, anuncios: [], statusHttp: resposta.status, transporte: {
    urlSolicitada: urlPesquisa, urlEfetiva: resposta.url || null, statusHttp: resposta.status,
    statusPortalHttp: resposta.status, redirecionada: resposta.redirected,
  } };
}

async function buscarHttpChaves(
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string,
  registrarOrigem?: (origem: OrigemColetaCentral) => void,
  observar?: (evento: EventoConsultaFirecrawl) => void,
  registrarAquisicao?: (aquisicao: AquisicaoPortalRadar) => void,
  tempoRadar?: TempoRodadaRadar,
): Promise<AnuncioCentralAngariacao[]> {
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  const existente = consultasHttpEmAndamento.get(chave);
  if (existente) {
    registrarOrigem?.("em_andamento");
    notificar(observar, { fase: "fallback", aquisicao: "http_direto", coletaId: existente.coletaId });
    notificar(observar, { fase: "single_flight", aquisicao: "desconhecida", coletaId: existente.coletaId });
    try {
      const compartilhado = await existente.promessa;
      if (compartilhado.origemRadar) registrarAquisicao?.(compartilhado.origemRadar);
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
    }, tempoRadar);
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
    return { ...coletado, anuncios, origemRadar: {
      id: coletaId, em: agoraISOString(), html: coletado.html, origem: "http_direto" as const, confiavel: true, transporte: coletado.transporte,
    } };
  })().finally(() => consultasHttpEmAndamento.delete(chave));
  consultasHttpEmAndamento.set(chave, { coletaId, promessa, estado });
  try {
    const coletado = await promessa;
    if (coletado.origemRadar) registrarAquisicao?.(coletado.origemRadar);
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
  restanteMs?: () => number,
  /** R5: repassada à aquisição; o Chaves nunca repete o Firecrawl (a decisão
      recusa), porque este fallback HTTP já é sua segunda via. */
  politicaRetry?: PoliticaRetryFirecrawl,
  registrarAquisicao?: (aquisicao: AquisicaoPortalRadar) => void,
  orcamentoRadar?: OrcamentoRodadaRadar,
  /** Só a paginação opta pelo orçamento temporal por fase; demais consumidores conservam o contrato. */
  tempoRadar?: TempoRodadaRadar,
): Promise<AnuncioCentralAngariacao[]> {
  exigirCapacidadeAquisicaoRadar(filtros);
  const exigirTempo = (duracaoFaseMs: number) => tempoRadar
    ? exigirTempoFaseRadar(tempoRadar, duracaoFaseMs)
    : exigirOrcamento(restanteMs, duracaoFaseMs + RESERVA_PROCESSAMENTO_CENTRAL_MS);
  const numeroPagina = Number(new URL(urlPesquisa).searchParams.get("pg") || 1);
  const paginaRadarSegura = filtros.portal === "chaves-na-mao" && !!orcamentoRadar && Number.isSafeInteger(numeroPagina) && numeroPagina >= 1
    && urlPesquisa === urlPaginaChavesRadar(urlDaPesquisa(filtros), numeroPagina);
  if (filtros.portal !== "chaves-na-mao" || urlPesquisa !== urlDaPesquisa(filtros)) {
    if (!paginaRadarSegura) return buscarComFirecrawl(filtros, urlPesquisa, registrarOrigem, registrarDiagnosticoOlx, observar, politicaRetry, registrarAquisicao, orcamentoRadar, tempoRadar);
  }
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  if (!politicaRetry?.exigirNova && await cacheFirecrawlDisponivel(chave)) {
    return buscarComFirecrawl(filtros, urlPesquisa, registrarOrigem, registrarDiagnosticoOlx, observar, politicaRetry, registrarAquisicao, orcamentoRadar, tempoRadar);
  }
  const armazenado = politicaRetry?.exigirNova ? null : await cacheHttp(chave, filtros);
  if (armazenado) {
    exigirTempo(0);
    registrarOrigem?.("cache");
    const coletaId = randomUUID();
    notificar(observar, { fase: "cache_hit", aquisicao: "cache", coletaId });
    notificar(observar, { fase: "resultado_interpretado", aquisicao: "cache", coletaId });
    return armazenado.anuncios;
  }
  try {
    return await buscarComFirecrawl(filtros, urlPesquisa, registrarOrigem, registrarDiagnosticoOlx, observar, politicaRetry, registrarAquisicao, orcamentoRadar, tempoRadar);
  } catch (erro) {
    if (!(erro instanceof FirecrawlIndisponivel)) throw erro;
  }
  const cacheAposFalha = politicaRetry?.exigirNova ? null : await cacheHttp(chave, filtros);
  if (cacheAposFalha) {
    exigirTempo(0);
    registrarOrigem?.("cache");
    const coletaId = randomUUID();
    notificar(observar, { fase: "cache_hit", aquisicao: "cache", coletaId });
    notificar(observar, { fase: "resultado_interpretado", aquisicao: "cache", coletaId });
    return cacheAposFalha.anuncios;
  }
  exigirTempo(TIMEOUT_HTTP_CHAVES_MS);
  return buscarHttpChaves(filtros, urlPesquisa, registrarOrigem, observar, registrarAquisicao, tempoRadar);
}
