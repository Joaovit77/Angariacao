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
