export type FormalidadeComunicacao = "natural" | "profissional" | "informal" | "consultivo";
export type TamanhoComunicacao = "curto" | "medio";
export type UsoEmojisComunicacao = "nenhum" | "poucos" | "moderados";
export type TratamentoComunicacao = "voce" | "senhor-senhora" | "automatico";

export interface PerfilComunicacao {
  formalidade: FormalidadeComunicacao;
  tamanho: TamanhoComunicacao;
  emojis: UsoEmojisComunicacao;
  tratamento: TratamentoComunicacao;
  expressoesPreferidas: string[];
  expressoesEvitar: string[];
}

export const PERFIL_COMUNICACAO_PADRAO: Readonly<PerfilComunicacao> = {
  formalidade: "natural",
  tamanho: "curto",
  emojis: "poucos",
  tratamento: "voce",
  expressoesPreferidas: [],
  expressoesEvitar: [],
};

const MAX_EXPRESSOES = 10;
const MAX_EXPRESSAO_CHARS = 80;

function enumSeguro<T extends string>(valor: unknown, permitidos: readonly T[], padrao: T): T {
  return typeof valor === "string" && permitidos.includes(valor as T) ? (valor as T) : padrao;
}

function expressoesSeguras(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const item of valor) {
    if (typeof item !== "string") continue;
    const limpo = item.replace(/\s+/g, " ").trim().slice(0, MAX_EXPRESSAO_CHARS);
    const chave = limpo.toLocaleLowerCase("pt-BR");
    if (!limpo || vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push(limpo);
    if (resultado.length >= MAX_EXPRESSOES) break;
  }
  return resultado;
}

/** Normaliza JSONB antigo ou malformado sem quebrar usuários existentes. */
export function normalizarPerfilComunicacao(valor: unknown): PerfilComunicacao {
  const perfil = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return {
    formalidade: enumSeguro(
      perfil.formalidade,
      ["natural", "profissional", "informal", "consultivo"] as const,
      PERFIL_COMUNICACAO_PADRAO.formalidade,
    ),
    tamanho: enumSeguro(
      perfil.tamanho,
      ["curto", "medio"] as const,
      PERFIL_COMUNICACAO_PADRAO.tamanho,
    ),
    emojis: enumSeguro(
      perfil.emojis,
      ["nenhum", "poucos", "moderados"] as const,
      PERFIL_COMUNICACAO_PADRAO.emojis,
    ),
    tratamento: enumSeguro(
      perfil.tratamento,
      ["voce", "senhor-senhora", "automatico"] as const,
      PERFIL_COMUNICACAO_PADRAO.tratamento,
    ),
    expressoesPreferidas: expressoesSeguras(perfil.expressoesPreferidas),
    expressoesEvitar: expressoesSeguras(perfil.expressoesEvitar),
  };
}

/** Limite duro do texto final, além da orientação dada ao modelo. */
export function limiteRespostaPerfil(perfil: PerfilComunicacao): number {
  return perfil.tamanho === "medio" ? 600 : 360;
}

export function textoParaExpressoes(valor: string): string[] {
  return expressoesSeguras(valor.split(/\r?\n|;/));
}
