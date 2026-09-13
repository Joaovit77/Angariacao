const CONTEXTOS = {
  consultarSupabase: { provider: "supabase", operation: "consultar", error_code: "database_request_failed" },
  iaTexto: { provider: "openai", operation: "gerar_texto", error_code: "text_request_failed" },
  processarRespostaIa: { provider: "aplicacao", operation: "processar_resposta_ia", error_code: "response_processing_failed" },
  embedding: { provider: "openai", operation: "embedding", error_code: "embedding_request_failed" },
  persistirEmbedding: { provider: "supabase", operation: "persistir_embedding", error_code: "embedding_persistence_failed" },
  buscarComparaveis: { provider: "supabase", operation: "buscar_comparaveis", error_code: "comparable_search_failed" },
  persistirComparaveis: { provider: "supabase", operation: "persistir_comparaveis", error_code: "comparable_persistence_failed" },
  registrar: { provider: "supabase", operation: "registrar", error_code: "registration_failed" },
  firecrawl: { provider: "firecrawl", operation: "coletar", error_code: "collection_failed" },
  navegador: { provider: "portal", operation: "navegar", error_code: "navigation_failed" },
  portal: { provider: "portal", operation: "consultar", error_code: "portal_request_failed" },
} as const;

export type ContextoErroExterno = keyof typeof CONTEXTOS;

/** Allowlist: contexto definido pelo código e somente status HTTP numérico externo.
 * Não lê message, stack, cause, headers, request, response nem serializadores do erro.
 * Nenhum texto externo é considerado seguro por truncamento ou blacklist.
 */
export function sanitizarErroExterno(erro: unknown, contexto: ContextoErroExterno) {
  let status: number | null = null;
  try {
    const valor = erro && typeof erro === "object" && "status" in erro ? erro.status : null;
    if (typeof valor === "number" && Number.isInteger(valor) && valor >= 100 && valor <= 599) {
      status = valor;
    }
  } catch {
    // Getters/proxies malformados não podem interromper o fallback da aplicação.
  }
  return { ...CONTEXTOS[contexto], status };
}

/* Classes SQLSTATE que descrevem uma falha passageira do banco, não da
   consulta: 08 conexão, 40 transação desfeita (deadlock, serialização),
   53 recurso esgotado, 57 intervenção do operador (statement_timeout,
   reinício). Qualquer outra classe é recusa determinística; repetir não
   muda nada. */
const CLASSES_SQLSTATE_TRANSITORIAS = ["08", "40", "53", "57"];
const CODIGO_ERRO_VALIDO = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;

export interface FalhaSupabase {
  /** Código local, seguro para log: nunca a mensagem crua do erro. */
  codigo: "rede" | "gateway" | "banco-transitorio" | "recusado";
  /** SQLSTATE ou código do PostgREST, só quando tem o formato esperado. */
  sqlstate: string | null;
  status: number;
  transitoria: boolean;
}

/**
 * Classifica uma resposta de erro do supabase-js pela mesma allowlist:
 * status HTTP e código validado pelo formato. `status` 0 é o cliente
 * dizendo que o fetch nem completou (socket fechado, DNS, timeout); 5xx
 * sem SQLSTATE é o gateway do Supabase, não o Postgres. `transitoria`
 * é o que autoriza uma repetição.
 */
export function classificarFalhaSupabase(erro: { code?: string | null }, status: number): FalhaSupabase {
  const code = erro.code ?? "";
  const sqlstate = CODIGO_ERRO_VALIDO.test(code) ? code : null;
  const base = { sqlstate, status };
  if (status === 0) return { ...base, codigo: "rede", transitoria: true };
  if (sqlstate && CLASSES_SQLSTATE_TRANSITORIAS.includes(sqlstate.slice(0, 2)))
    return { ...base, codigo: "banco-transitorio", transitoria: true };
  if (status >= 500) return { ...base, codigo: "gateway", transitoria: true };
  return { ...base, codigo: "recusado", transitoria: false };
}

/** Forma curta para `detalhe` de log: `rede:0`, `banco-transitorio:500:57014`. */
export function descreverFalhaSupabase(falha: FalhaSupabase): string {
  return `${falha.codigo}:${falha.status}${falha.sqlstate ? `:${falha.sqlstate}` : ""}`;
}
