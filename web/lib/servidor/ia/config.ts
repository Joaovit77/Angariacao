/** Modelo textual único da aplicação. Não inclui o modelo de transcrição. */
export const MODELO_TEXTO_IA = "gpt-5.4-mini";

/** Orçamento das operações textuais disparadas pela rota /api/ia. */
export const MAX_TOKENS_IA = 4000;

/** Orçamento menor da classificação curta executada pelo webhook. */
export const MAX_TOKENS_CLASSIFICACAO_IA = 1200;
