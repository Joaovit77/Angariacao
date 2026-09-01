import type { Imovel } from "@/lib/tipos";
import { rotuloPortal, type PortalAngariacao } from "./centralAngariacao";

export type OrigemContextoInvestigador = "imovel" | "radar-anuncio" | "comparavel";

export interface ReferenciaContextoInvestigador {
  origem: OrigemContextoInvestigador;
  id: string;
}

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

export const contextoInvestigadorIdValido = imovelIdValido;

function texto(valor: string | null | undefined): string {
  return (valor || "").replace(/\s+/g, " ").trim();
}

function quantidade(valor: number | null | undefined, singular: string, plural: string): string {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return "";
  return `${valor} ${valor === 1 ? singular : plural}`;
}

function area(valor: number | null | undefined): string {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return "";
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " m²";
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

export interface AnuncioParaInvestigacao {
  idExterno: string;
  portal: PortalAngariacao;
  titulo?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  tipo?: string | null;
  areaM2?: number | null;
  quartos?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
}

/**
 * Resume apenas sinais públicos úteis para identificar o anúncio. O preço e a
 * descrição ficam de fora porque não fortalecem a classificação atual e
 * tornariam a consulta mais ruidosa.
 */
export function consultaInicialDoAnuncio(anuncio: AnuncioParaInvestigacao): string {
  const endereco = texto(anuncio.endereco);
  const titulo = texto(anuncio.titulo);
  const idExterno = texto(anuncio.idExterno);
  const partes = [
    endereco || titulo,
    texto(anuncio.bairro),
    texto(anuncio.cidade),
    texto(anuncio.estado),
    texto(anuncio.tipo),
    area(anuncio.areaM2),
    quantidade(anuncio.quartos, "quarto", "quartos"),
    quantidade(anuncio.banheiros, "banheiro", "banheiros"),
    quantidade(anuncio.vagas, "vaga", "vagas"),
    idExterno ? "anúncio " + rotuloPortal(anuncio.portal) + " " + idExterno : "",
  ].filter(Boolean);

  return partes.join(", ").slice(0, 500);
}

const PARAMETRO_POR_ORIGEM: Record<OrigemContextoInvestigador, string> = {
  imovel: "imovel",
  "radar-anuncio": "radarAnuncio",
  comparavel: "comparavel",
};

export function parametrosDaReferenciaInvestigador(
  referencia: ReferenciaContextoInvestigador,
): URLSearchParams {
  return new URLSearchParams({ [PARAMETRO_POR_ORIGEM[referencia.origem]]: referencia.id });
}

export function urlInvestigadorDaReferencia(referencia: ReferenciaContextoInvestigador): string {
  return "/investigador-imoveis?" + parametrosDaReferenciaInvestigador(referencia);
}

export function urlInvestigadorDoImovel(imovelId: string): string {
  return urlInvestigadorDaReferencia({ origem: "imovel", id: imovelId });
}

export function urlInvestigadorDoRadarAnuncio(radarAnuncioId: string): string {
  return urlInvestigadorDaReferencia({ origem: "radar-anuncio", id: radarAnuncioId });
}

export function urlInvestigadorDoComparavel(comparavelId: string): string {
  return urlInvestigadorDaReferencia({ origem: "comparavel", id: comparavelId });
}
