import type { Imovel } from "@/lib/tipos";

export type ImovelParaInvestigacao = Pick<
  Imovel,
  | "id"
  | "codigo"
  | "referenciaCrm"
  | "endereco"
  | "bairro"
  | "cidade"
  | "estado"
  | "unidade"
  | "bloco"
  | "edificio"
  | "tipo"
  | "quartos"
  | "banheiros"
  | "vagas"
>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function imovelIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor.trim());
}

function texto(valor: string | null | undefined): string {
  return (valor || "").replace(/\s+/g, " ").trim();
}

function quantidade(valor: number | null | undefined, singular: string, plural: string): string {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return "";
  return `${valor} ${valor === 1 ? singular : plural}`;
}

/**
 * Monta somente a consulta editável do Investigador. Dados pessoais, valores,
 * observações e o restante do cadastro não atravessam esta fronteira.
 */
export function consultaInicialDoImovel(imovel: ImovelParaInvestigacao): string {
  const referencia = texto(imovel.referenciaCrm);
  const codigo = texto(imovel.codigo);
  const partes = [
    texto(imovel.endereco),
    texto(imovel.unidade) ? `unidade ${texto(imovel.unidade)}` : "",
    texto(imovel.bloco) ? `bloco ${texto(imovel.bloco)}` : "",
    texto(imovel.bairro),
    texto(imovel.cidade),
    texto(imovel.estado),
    texto(imovel.edificio),
    texto(imovel.tipo),
    quantidade(imovel.quartos, "quarto", "quartos"),
    quantidade(imovel.banheiros, "banheiro", "banheiros"),
    quantidade(imovel.vagas, "vaga", "vagas"),
    referencia ? `referência ${referencia}` : "",
    codigo && codigo.toLocaleLowerCase("pt-BR") !== referencia.toLocaleLowerCase("pt-BR")
      ? `código ${codigo}`
      : "",
  ].filter(Boolean);

  return partes.join(", ").slice(0, 500);
}

export function urlInvestigadorDoImovel(imovelId: string): string {
  return `/investigador-imoveis?imovel=${encodeURIComponent(imovelId)}`;
}
