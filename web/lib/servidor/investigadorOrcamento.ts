/**
 * Limite efetivo da rota: 60 s. Nos 20 smokes de A1, três chamadas de até
 * 22 s ultrapassaram esse teto; o restante da função levou até alguns
 * segundos. Buscas param aos 42 s desde a entrada. Reservamos 10 s para
 * análise, leitura de referências, memória opcional e evento final, mais
 * 8 s de folga antes de a plataforma encerrar a função.
 */
export const ORCAMENTO_TOTAL_INVESTIGACAO_MS = 52_000;
export const MARGEM_FINALIZACAO_INVESTIGACAO_MS = 10_000;