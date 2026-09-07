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
    || Object.entries(ambiente).some(([nome, valor]) =>
      (nome === "CODEX_HOME" || nome.startsWith("CODEX_")) && valorVerdadeiro(valor)
    );
}

export class ChamadaOpenAIRealNaoAutorizadaError extends Error {
  readonly codigo = "openai-real-nao-autorizada";

  constructor(
    ambiente: string | undefined = process.env.NODE_ENV,
    ambienteVercel: string | undefined = process.env.VERCEL_ENV,
  ) {
    const nomeAmbiente = ambienteVercel ? `Vercel ${ambienteVercel}` : ambiente || "não informado";
    const orientacao = ambienteVercel && ambienteVercel !== "production"
      ? "Ambientes Vercel não produtivos permanecem bloqueados; valide localmente."
      : `Defina ${VARIAVEL_AUTORIZACAO_OPENAI_REAL}=1 somente em validação local explicitamente autorizada.`;
    super(
      `Chamada real à OpenAI bloqueada em ${nomeAmbiente}. `
      + orientacao,
    );
    this.name = "ChamadaOpenAIRealNaoAutorizadaError";
  }
}

/**
 * Production da Vercel é o único ambiente hospedado autorizável. Qualquer
 * outro ambiente Vercel falha fechado, mesmo com opt-in. Fora da Vercel, o
 * opt-in literal existe exclusivamente para validação local deliberada.
 */
export function chamadaOpenAIRealAutorizada(
  ambiente: AmbienteOpenAI = process.env,
): boolean {
  if (execucaoAutomaticaOpenAIBloqueada(ambiente)) return false;

  const execucaoVercel = ambiente.VERCEL === "1" || !!ambiente.VERCEL_ENV?.trim();
  const producaoRealVercel = ambiente.VERCEL === "1"
    && ambiente.VERCEL_ENV === "production";
  if (execucaoVercel) return producaoRealVercel;

  return ambiente[VARIAVEL_AUTORIZACAO_OPENAI_REAL] === "1";
}

export function exigirAutorizacaoOpenAIReal(
  ambiente: AmbienteOpenAI = process.env,
): void {
  if (!chamadaOpenAIRealAutorizada(ambiente)) {
    throw new ChamadaOpenAIRealNaoAutorizadaError(ambiente.NODE_ENV, ambiente.VERCEL_ENV);
  }
}

/** Único ponto autorizado a construir o cliente real do SDK. */
export function criarClienteOpenAIReal(
  opcoes?: ConstructorParameters<typeof OpenAI>[0],
): OpenAI {
  exigirAutorizacaoOpenAIReal();
  const chaveDasOpcoes = typeof opcoes?.apiKey === "string"
    ? opcoes.apiKey.trim()
    : opcoes?.apiKey;
  const apiKey = chaveDasOpcoes || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada para chamada real.");
  return new OpenAI({ ...(opcoes || {}), apiKey });
}
