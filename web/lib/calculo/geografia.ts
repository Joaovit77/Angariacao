import { chaveNormalizada } from "@/lib/normalizacao";

export const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type UfBrasil = (typeof UFS_BRASIL)[number];

const UFS = new Set<string>(UFS_BRASIL);
const NOMES_UF: Record<string, UfBrasil> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
const NOMES_UF_ORDENADOS = Object.keys(NOMES_UF).sort((a, b) => b.length - a.length);

function separarSufixoEstado(cidade: string): { cidade: string; estado: string } | null {
  const comSeparador = cidade.match(/^(.*?)\s*[-/,]\s*([^-/]+)$/u);
  if (comSeparador && ufValida(comSeparador[2])) {
    return { cidade: comSeparador[1].trim(), estado: normalizarUf(comSeparador[2]) };
  }
  const comSigla = cidade.match(/^(.*?)\s+([a-z]{2})$/iu);
  if (comSigla && ufValida(comSigla[2])) {
    return { cidade: comSigla[1].trim(), estado: normalizarUf(comSigla[2]) };
  }
  const cidadeChave = chaveNormalizada(cidade);
  const nome = NOMES_UF_ORDENADOS.find((item) => cidadeChave.endsWith(` ${item}`));
  if (!nome) return null;
  return {
    cidade: cidade.slice(0, cidade.length - nome.length).trim(),
    estado: NOMES_UF[nome],
  };
}

export function normalizarUf(valor: string | null | undefined): string {
  const limpo = (valor || "").replace(/\s+/g, " ").trim();
  const sigla = limpo.toUpperCase();
  return UFS.has(sigla) ? sigla : (NOMES_UF[chaveNormalizada(limpo)] || sigla);
}

export function ufValida(valor: string | null | undefined): valor is UfBrasil {
  return UFS.has(normalizarUf(valor));
}

export function separarCidadeEUf(
  cidade: string | null | undefined,
  estado?: string | null,
): { cidade: string; estado: string | null } {
  const cidadeLimpa = (cidade || "").replace(/\s+/g, " ").trim();
  const estadoExplicito = normalizarUf(estado);
  const sufixo = separarSufixoEstado(cidadeLimpa);
  return {
    cidade: sufixo?.cidade || cidadeLimpa,
    estado: ufValida(estadoExplicito)
      ? estadoExplicito
      : (sufixo?.estado || null),
  };
}

export function mesmoMercadoGeografico(
  a: { cidade?: string | null; estado?: string | null },
  b: { cidade?: string | null; estado?: string | null },
): boolean {
  const localA = separarCidadeEUf(a.cidade, a.estado);
  const localB = separarCidadeEUf(b.cidade, b.estado);
  return !!chaveNormalizada(localA.cidade)
    && chaveNormalizada(localA.cidade) === chaveNormalizada(localB.cidade)
    && !!localA.estado
    && localA.estado === localB.estado;
}

export function ehLondrinaParana(
  cidade: string | null | undefined,
  estado: string | null | undefined,
): boolean {
  const local = separarCidadeEUf(cidade, estado);
  return local.estado === "PR" && chaveNormalizada(local.cidade) === "londrina";
}
