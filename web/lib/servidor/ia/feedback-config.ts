/**
 * Trava de implantação: só deve mudar para true em uma alteração de código
 * posterior à validação e aplicação do schema no ambiente real.
 */
export const IA_FEEDBACK_SCHEMA_READY = false;

let schemaReadyParaTeste: boolean | null = null;

/**
 * Preserva a cobertura do modo ativo sem criar um mecanismo de ativação em
 * produção. Fora do Vitest, qualquer tentativa de sobrescrita falha.
 */
export function definirSchemaFeedbackSugestoesIaProntoParaTeste(
  pronto: boolean | null,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("A trava de schema do feedback só pode ser sobrescrita em testes.");
  }
  schemaReadyParaTeste = pronto;
}

function schemaFeedbackSugestoesIaPronto(): boolean {
  return schemaReadyParaTeste ?? IA_FEEDBACK_SCHEMA_READY;
}

/**
 * A coleta exige simultaneamente schema liberado no código e consentimento
 * explícito do ambiente. Valores equivalentes a booleano não são aceitos.
 */
export function feedbackSugestoesIaHabilitado(): boolean {
  return (
    schemaFeedbackSugestoesIaPronto() &&
    process.env.IA_FEEDBACK_SUGESTOES_ENABLED === "true"
  );
}
