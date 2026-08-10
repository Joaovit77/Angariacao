import { chaveEndereco } from "./duplicidade";
import type { AnuncioCentralAngariacao, PortalAngariacao } from "./centralAngariacao";
import type { Imovel } from "../tipos";

export type MotivoRepeticaoCentral = "url-na-carteira" | "casa-no-pipeline" | "apartamento-no-endereco";

export interface SituacaoRepeticaoCentral {
  motivo: MotivoRepeticaoCentral | null;
  ocultar: boolean;
}

export function chaveAnuncio(anuncio: { portal: PortalAngariacao; idExterno: string }): string {
  return `${anuncio.portal}:${anuncio.idExterno}`;
}

export function urlCanonicaAnuncio(valor: string | null | undefined): string {
  if (!valor?.trim()) return "";
  try {
    const url = new URL(valor);
    url.hash = "";
    url.search = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return valor.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

function textoNormalizado(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function ehApartamento(valor: string): boolean {
  return /\b(apartamento|apto|studio|flat|kitnet|loft)\b/.test(textoNormalizado(valor));
}

function ehCasa(valor: string): boolean {
  return /\b(casa|sobrado)\b/.test(textoNormalizado(valor));
}

export function tipoDoAnuncio(anuncio: Pick<AnuncioCentralAngariacao, "titulo" | "descricao">): "casa" | "apartamento" | "indefinido" {
  const texto = `${anuncio.titulo} ${anuncio.descricao || ""}`;
  if (ehApartamento(texto)) return "apartamento";
  if (ehCasa(texto)) return "casa";
  return "indefinido";
}

/** Exige número no fim ou depois de vírgula; "Rua 10 de Dezembro" não é endereço completo. */
export function enderecoTemNumero(endereco: string | null | undefined): boolean {
  if (!endereco?.trim()) return false;
  return /(?:,\s*|\b(?:n|nº|n°|numero)\.?\s*)\d+[a-z]?\b/i.test(endereco) || /\b\d+[a-z]?\s*$/i.test(endereco);
}

function mesmoEndereco(anuncio: AnuncioCentralAngariacao, imovel: Imovel): boolean {
  const endereco = chaveEndereco(anuncio.endereco);
  const cidade = chaveEndereco(anuncio.cidade);
  return !!endereco && !!cidade && endereco === chaveEndereco(imovel.endereco) && cidade === chaveEndereco(imovel.cidade);
}

function imovelEhApartamento(imovel: Imovel): boolean {
  return !!imovel.unidade?.trim() || !!imovel.bloco?.trim() || ehApartamento(`${imovel.tipo || ""} ${imovel.edificio || ""}`);
}

export function urlsDosImoveis(imoveis: Imovel[]): Set<string> {
  const urls = new Set<string>();
  for (const imovel of imoveis) {
    for (const match of (imovel.textoAnuncio || "").matchAll(/https?:\/\/\S+/g)) {
      const url = urlCanonicaAnuncio(match[0].replace(/[),.;]+$/, ""));
      if (url) urls.add(url);
    }
  }
  return urls;
}

export function situacaoRepeticaoCentral(
  anuncio: AnuncioCentralAngariacao,
  imoveis: Imovel[],
  urlsNaCarteira: Set<string> = urlsDosImoveis(imoveis),
): SituacaoRepeticaoCentral {
  if (urlsNaCarteira.has(urlCanonicaAnuncio(anuncio.url))) {
    return { motivo: "url-na-carteira", ocultar: true };
  }

  const tipo = tipoDoAnuncio(anuncio);
  const mesmoLocal = imoveis.filter((imovel) => mesmoEndereco(anuncio, imovel));
  if (!mesmoLocal.length) return { motivo: null, ocultar: false };

  if (tipo === "casa" && enderecoTemNumero(anuncio.endereco) && mesmoLocal.some((imovel) => !imovelEhApartamento(imovel))) {
    return { motivo: "casa-no-pipeline", ocultar: true };
  }

  if (tipo === "apartamento") return { motivo: "apartamento-no-endereco", ocultar: false };
  return { motivo: null, ocultar: false };
}
