import OpenAI from "openai";

export const VARIAVEL_AUTORIZACAO_OPENAI_REAL = "ALLOW_REAL_OPENAI";
type AmbienteOpenAI = Readonly<Record<string, string | undefined>>;

function valorVerdadeiro(valor: string | undefined): boolean {
  return !!valor && !["0", "false", "no", "off"].includes(valor.toLowerCase());
}

export function execucaoAutomaticaOpenAIBloqueada(
  ambiente: AmbienteOpenAI = process.env,
): boolean {
  return valorVerdadeiro(ambiente.CI)
    || Object.keys(ambiente).some((nome) => nome === "CODEX_HOME" || nome.startsWith("CODEX_"));
}

export class ChamadaOpenAIRealNaoAutorizadaError extends Error {
  readonly codigo = "openai-real-nao-autorizada";

  constructor(ambiente: string | undefined = process.env.NODE_ENV) {
    const nomeAmbiente = ambiente || "não informado";
    super(
      `Chamada real à OpenAI bloqueada em ${nomeAmbiente}. `
      + `Defina ${VARIAVEL_AUTORIZACAO_OPENAI_REAL}=1 somente após autorização explícita.`,
    );
    this.name = "ChamadaOpenAIRealNaoAutorizadaError";
  }
}

/**
 * Produção é o único ambiente em que a presença da chave já faz parte da
 * configuração operacional. Teste, desenvolvimento e ambientes sem NODE_ENV
 * falham fechados e exigem uma segunda autorização deliberada.
 */
export function chamadaOpenAIRealAutorizada(
  ambiente: AmbienteOpenAI = process.env,
): boolean {
  return !execucaoAutomaticaOpenAIBloqueada(ambiente) && (
    ambiente.NODE_ENV === "production"
    || ambiente[VARIAVEL_AUTORIZACAO_OPENAI_REAL] === "1"
  );
}

export function exigirAutorizacaoOpenAIReal(
  ambiente: AmbienteOpenAI = process.env,
): void {
  if (!chamadaOpenAIRealAutorizada(ambiente)) {
    throw new ChamadaOpenAIRealNaoAutorizadaError(ambiente.NODE_ENV);
  }
}

/** Único ponto autorizado a construir o cliente real do SDK. */
export function criarClienteOpenAIReal(
  opcoes?: ConstructorParameters<typeof OpenAI>[0],
): OpenAI {
  exigirAutorizacaoOpenAIReal();
  return new OpenAI(opcoes);
}
