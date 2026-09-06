import {
  normalizarPerfilComunicacao,
  type PerfilComunicacao,
} from "./perfilComunicacao";

export const CAMPOS_PREFERENCIA_SUPERVISIONADA = [
  "formalidade",
  "tamanho",
  "emojis",
  "tratamento",
  "expressao-preferida",
  "expressao-evitar",
] as const;

export type CampoPreferenciaSupervisionada =
  (typeof CAMPOS_PREFERENCIA_SUPERVISIONADA)[number];

export interface PreferenciaSupervisionada {
  campo: CampoPreferenciaSupervisionada;
  valor: string;
}

const VALORES_ESTRUTURADOS: Record<
  Exclude<CampoPreferenciaSupervisionada, "expressao-preferida" | "expressao-evitar">,
  readonly string[]
> = {
  formalidade: ["natural", "profissional", "informal", "consultivo"],
  tamanho: ["curto", "medio"],
  emojis: ["nenhum", "poucos", "moderados"],
  tratamento: ["voce", "senhor-senhora", "automatico"],
};

/**
 * Aplica somente uma escolha explícita aos campos que o perfil já possui.
 * Não interpreta a mensagem enviada, não classifica texto livre e não cria
 * uma memória paralela. Valor inválido ou vazio não produz alteração.
 */
export function aplicarPreferenciaSupervisionada(
  perfilAtual: PerfilComunicacao,
  preferencia: PreferenciaSupervisionada,
): PerfilComunicacao | null {
  const valor = preferencia.valor.replace(/\s+/g, " ").trim();
  if (!valor) return null;

  if (preferencia.campo === "expressao-preferida") {
    return normalizarPerfilComunicacao({
      ...perfilAtual,
      expressoesPreferidas: [...perfilAtual.expressoesPreferidas, valor],
    });
  }
  if (preferencia.campo === "expressao-evitar") {
    return normalizarPerfilComunicacao({
      ...perfilAtual,
      expressoesEvitar: [...perfilAtual.expressoesEvitar, valor],
    });
  }

  if (!VALORES_ESTRUTURADOS[preferencia.campo].includes(valor)) return null;
  return normalizarPerfilComunicacao({ ...perfilAtual, [preferencia.campo]: valor });
}
