/**
 * Contrato compartilhado da configuração operacional da IA.
 *
 * Este arquivo pode chegar ao browser: contém apenas opções públicas e
 * validação. Leitura do banco e chaves ficam em `lib/servidor/ia`.
 */

export const MODELOS_IA_PERMITIDOS = [
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
] as const;

export type ModeloIaPermitido = (typeof MODELOS_IA_PERMITIDOS)[number];

export const ESFORCOS_IA_PERMITIDOS = ["none", "low", "medium", "high", "xhigh"] as const;
export type EsforcoIaPermitido = (typeof ESFORCOS_IA_PERMITIDOS)[number];

export interface RotaModeloIa {
  modelo: ModeloIaPermitido;
  esforco: EsforcoIaPermitido;
}

export interface ConfiguracaoIa {
  operacoes: RotaModeloIa;
  classificacao: RotaModeloIa;
  atendimento: RotaModeloIa;
  assistente: RotaModeloIa;
  instrucaoAtendimento: string;
}

export interface VersaoConfiguracaoIa extends ConfiguracaoIa {
  versao: number | null;
  criadoEm: string | null;
  alteradoPor: string | null;
  origem: "banco" | "padrao";
}

export const MAX_INSTRUCAO_ATENDIMENTO = 1200;

export const CONFIGURACAO_IA_PADRAO: ConfiguracaoIa = {
  operacoes: { modelo: "gpt-5.4-mini", esforco: "medium" },
  classificacao: { modelo: "gpt-5.4-mini", esforco: "low" },
  atendimento: { modelo: "gpt-5.4-mini", esforco: "low" },
  assistente: { modelo: "gpt-5.4-mini", esforco: "low" },
  instrucaoAtendimento: "",
};

/** Preset sugerido, aplicado apenas quando o admin escolher e salvar. */
export const CONFIGURACAO_IA_RECOMENDADA: ConfiguracaoIa = {
  operacoes: { modelo: "gpt-5.6-terra", esforco: "low" },
  classificacao: { modelo: "gpt-5.6-luna", esforco: "low" },
  atendimento: { modelo: "gpt-5.6-terra", esforco: "low" },
  assistente: { modelo: "gpt-5.6-terra", esforco: "low" },
  instrucaoAtendimento: "",
};

export const INFO_MODELOS_IA: Record<ModeloIaPermitido, {
  nome: string;
  perfil: string;
  entradaUsd: number;
  saidaUsd: number;
}> = {
  "gpt-5.4-nano": { nome: "GPT-5.4 nano", perfil: "baixo custo", entradaUsd: 0.2, saidaUsd: 1.25 },
  "gpt-5.4-mini": { nome: "GPT-5.4 mini", perfil: "base atual", entradaUsd: 0.75, saidaUsd: 4.5 },
  "gpt-5.6-luna": { nome: "GPT-5.6 Luna", perfil: "volume e velocidade", entradaUsd: 0.2, saidaUsd: 1.2 },
  "gpt-5.6-terra": { nome: "GPT-5.6 Terra", perfil: "equilíbrio", entradaUsd: 2, saidaUsd: 12 },
  "gpt-5.6-sol": { nome: "GPT-5.6 Sol", perfil: "qualidade máxima", entradaUsd: 4, saidaUsd: 20 },
};

export function ehModeloIaPermitido(valor: unknown): valor is ModeloIaPermitido {
  return typeof valor === "string" && (MODELOS_IA_PERMITIDOS as readonly string[]).includes(valor);
}

export function ehEsforcoIaPermitido(valor: unknown): valor is EsforcoIaPermitido {
  return typeof valor === "string" && (ESFORCOS_IA_PERMITIDOS as readonly string[]).includes(valor);
}

function rotaValida(valor: unknown): RotaModeloIa | null {
  if (!valor || typeof valor !== "object") return null;
  const rota = valor as Record<string, unknown>;
  if (!ehModeloIaPermitido(rota.modelo) || !ehEsforcoIaPermitido(rota.esforco)) return null;
  return { modelo: rota.modelo, esforco: rota.esforco };
}

export function normalizarConfiguracaoIa(valor: unknown): ConfiguracaoIa | null {
  if (!valor || typeof valor !== "object") return null;
  const bruto = valor as Record<string, unknown>;
  const operacoes = rotaValida(bruto.operacoes);
  const classificacao = rotaValida(bruto.classificacao);
  const atendimento = rotaValida(bruto.atendimento);
  const assistente = rotaValida(bruto.assistente);
  if (!operacoes || !classificacao || !atendimento || !assistente) return null;
  if (typeof bruto.instrucaoAtendimento !== "string") return null;
  const instrucaoAtendimento = bruto.instrucaoAtendimento.trim();
  if (instrucaoAtendimento.length > MAX_INSTRUCAO_ATENDIMENTO) return null;
  return { operacoes, classificacao, atendimento, assistente, instrucaoAtendimento };
}
