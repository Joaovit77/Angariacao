/* ================================================================
   RETRY DA AQUISIÇÃO FIRECRAWL (R5) — fonte única da decisão

   No caminho saudável a aquisição faz 1 chamada. Com política habilitada,
   uma falha TRANSITÓRIA de aquisição pode ganhar UMA segunda tentativa,
   nunca uma terceira. Parser, zero resultados, bloqueio do portal, filtro,
   persistência e erro interno nunca chegam aqui: só a aquisição decide.

   - 502/503/504 e erro de rede antes da resposta (ECONNRESET,
     UND_ERR_SOCKET, EAI_AGAIN): espera de 750–1250 ms.
   - 429: só com `Retry-After` válido de até 5 s, e espera exatamente isso.
   - Todo o resto (500, 4xx, 408, timeout, ENOTFOUND, resposta inválida,
     portal com erro) não repete.
   - O Chaves na Mão não repete: o fallback HTTP já é sua segunda via.
   - Só repete se ainda couberem a espera, uma aquisição inteira e a reserva
     de processamento do chamador.

   Núcleo puro: sem rede, relógio ou aleatoriedade próprios.
   ================================================================ */
import type { PortalAngariacao } from "./centralAngariacao";

export const MAX_TENTATIVAS_FIRECRAWL_COM_RETRY = 2;
export const MAX_TENTATIVAS_FIRECRAWL_SEM_RETRY = 1;
export const STATUS_HTTP_RETRY_FIRECRAWL: ReadonlySet<number> = new Set([502, 503, 504]);
/** `erro.cause.code` do fetch (undici). ENOTFOUND fica de fora de propósito. */
export const CAUSAS_REDE_RETRY_FIRECRAWL: ReadonlySet<string> = new Set(["ECONNRESET", "UND_ERR_SOCKET", "EAI_AGAIN"]);
export const LIMITE_RETRY_AFTER_FIRECRAWL_MS = 5_000;
export const ESPERA_MINIMA_RETRY_FIRECRAWL_MS = 750;
export const ESPERA_MAXIMA_RETRY_FIRECRAWL_MS = 1_250;
/** Portais com segunda via própria, que não recebem retry Firecrawl. */
const PORTAIS_COM_FALLBACK_PROPRIO: ReadonlySet<PortalAngariacao> = new Set<PortalAngariacao>(["chaves-na-mao"]);

export type MotivoRetryFirecrawl = "firecrawl_5xx" | "firecrawl_rede_transitoria" | "firecrawl_429";
export type MotivoSemRetryFirecrawl =
  | "politica_ausente" | "portal_com_fallback" | "limite_tentativas"
  | "falha_nao_transitoria" | "retry_after_invalido" | "orcamento_insuficiente";

/** Só os sinais que a decisão usa; nunca corpo, header bruto ou URL. */
export interface FalhaAquisicaoFirecrawl {
  codigo: string;
  statusHttp: number | null;
  causaRede: string | null;
  retryAfterMs: number | null;
}

export type DecisaoRetryFirecrawl =
  | { retentar: true; motivo: MotivoRetryFirecrawl; esperaMs: number }
  | { retentar: false; motivo: MotivoSemRetryFirecrawl };

export function decidirRetryFirecrawl(entrada: {
  falha: FalhaAquisicaoFirecrawl;
  portal: PortalAngariacao;
  politicaHabilitada: boolean;
  /** Tentativa que acabou de falhar (1-based). */
  tentativa: number;
  restanteMs: number;
  /** Duração máxima de uma nova aquisição (timeout do fetch). */
  duracaoMaximaTentativaMs: number;
  /** Tempo que o chamador precisa depois da aquisição (interpretar, persistir). */
  reservaPosAquisicaoMs: number;
  /** Valor em [0, 1) para o jitter; injetado para manter a decisão pura. */
  jitter: number;
}): DecisaoRetryFirecrawl {
  if (!entrada.politicaHabilitada) return { retentar: false, motivo: "politica_ausente" };
  if (PORTAIS_COM_FALLBACK_PROPRIO.has(entrada.portal)) return { retentar: false, motivo: "portal_com_fallback" };
  if (entrada.tentativa >= MAX_TENTATIVAS_FIRECRAWL_COM_RETRY) return { retentar: false, motivo: "limite_tentativas" };

  const { falha } = entrada;
  let motivo: MotivoRetryFirecrawl;
  let esperaMs: number;
  if (falha.codigo === "firecrawl_http_falhou" && falha.statusHttp != null && STATUS_HTTP_RETRY_FIRECRAWL.has(falha.statusHttp)) {
    motivo = "firecrawl_5xx";
    esperaMs = esperaComJitter(entrada.jitter);
  } else if (falha.codigo === "firecrawl_indisponivel" && falha.causaRede != null && CAUSAS_REDE_RETRY_FIRECRAWL.has(falha.causaRede)) {
    motivo = "firecrawl_rede_transitoria";
    esperaMs = esperaComJitter(entrada.jitter);
  } else if (falha.codigo === "firecrawl_429") {
    const retryAfter = falha.retryAfterMs;
    if (retryAfter == null || !Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > LIMITE_RETRY_AFTER_FIRECRAWL_MS) {
      return { retentar: false, motivo: "retry_after_invalido" };
    }
    motivo = "firecrawl_429";
    esperaMs = retryAfter;
  } else {
    return { retentar: false, motivo: "falha_nao_transitoria" };
  }

  const necessarioMs = esperaMs + entrada.duracaoMaximaTentativaMs + entrada.reservaPosAquisicaoMs;
  if (!Number.isFinite(entrada.restanteMs) || entrada.restanteMs < necessarioMs) {
    return { retentar: false, motivo: "orcamento_insuficiente" };
  }
  return { retentar: true, motivo, esperaMs };
}

function esperaComJitter(jitter: number): number {
  const fracao = Number.isFinite(jitter) ? Math.min(Math.max(jitter, 0), 1) : 0.5;
  return Math.round(ESPERA_MINIMA_RETRY_FIRECRAWL_MS
    + fracao * (ESPERA_MAXIMA_RETRY_FIRECRAWL_MS - ESPERA_MINIMA_RETRY_FIRECRAWL_MS));
}
