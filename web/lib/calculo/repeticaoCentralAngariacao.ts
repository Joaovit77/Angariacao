import { chaveEndereco } from "./duplicidade";
import type { AnuncioCentralAngariacao, PortalAngariacao } from "./centralAngariacao";
import type { Imovel } from "../tipos";

export type MotivoRepeticaoCentral = "url-na-carteira" | "casa-no-pipeline" | "apartamento-no-endereco";

/**
 * Imóvel da carteira que corresponde ao anúncio mas não pode escondê-lo.
 * Guarda o contexto ("já esteve na carteira") para a tela exibir depois.
 */
export interface CorrespondenciaSemBloqueio {
  codigo: string;
  status: string;
  motivoPerda: string | null;
  via: "url" | "endereco";
}

export interface SituacaoRepeticaoCentral {
  motivo: MotivoRepeticaoCentral | null;
  ocultar: boolean;
  /** Presente só quando houve correspondência com imóvel que não bloqueia. */
  naCarteiraSemBloqueio?: CorrespondenciaSemBloqueio[];
}

/**
 * Status que continuam na carteira (histórico, detecção, contexto) mas não
 * escondem anúncio do Radar/Central. "Perdido" diz o que aconteceu no passado;
 * a casa de volta ao mercado pode ser nova oportunidade (R4.1c.0). Os demais
 * status, inclusive "Sem resposta", mantêm o bloqueio.
 */
export const STATUS_CARTEIRA_SEM_BLOQUEIO_RADAR: readonly string[] = ["Perdido"];

/** Regra única de "este imóvel da carteira pode esconder o anúncio?", usada
    pela lista, pelo contador do Radar e pelo shadow do R4.1a. */
export function imovelBloqueiaRadar(imovel: Pick<Imovel, "status">): boolean {
  return !STATUS_CARTEIRA_SEM_BLOQUEIO_RADAR.includes(imovel.status);
}

/**
 * Texto curto da etiqueta "já esteve na carteira" e o detalhe completo (dica).
 * Com mais de um imóvel, a etiqueta mostra o primeiro na ordem em que a regra
 * os encontrou (URL antes de endereço, depois a ordem da carteira) mais "+N";
 * o detalhe lista todos, cada um com o motivo da perda quando houver.
 */
export function rotuloCarteiraSemBloqueio(
  correspondencias: readonly CorrespondenciaSemBloqueio[] | undefined,
): { texto: string; detalhe: string } | null {
  if (!correspondencias?.length) return null;
  const [primeira] = correspondencias;
  const extras = correspondencias.length - 1;
  return {
    texto: `Já esteve na carteira · ${primeira.codigo} · ${primeira.status}${extras ? ` +${extras}` : ""}`,
    detalhe: correspondencias
      .map((item) => [item.codigo, item.status, item.motivoPerda].filter(Boolean).join(" · "))
      .join("\n"),
  };
}

function correspondenciaSemBloqueio(imovel: Imovel, via: CorrespondenciaSemBloqueio["via"]): CorrespondenciaSemBloqueio {
  return {
    codigo: imovel.codigo || imovel.id,
    status: imovel.status,
    motivoPerda: imovel.motivoPerda || null,
    via,
  };
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

type AnuncioComparavelComCarteira = Pick<AnuncioCentralAngariacao, "url" | "titulo" | "descricao" | "endereco" | "cidade">;

function mesmoEndereco(anuncio: AnuncioComparavelComCarteira, imovel: Imovel): boolean {
  const endereco = chaveEndereco(anuncio.endereco);
  const cidade = chaveEndereco(anuncio.cidade);
  return !!endereco && !!cidade && endereco === chaveEndereco(imovel.endereco) && cidade === chaveEndereco(imovel.cidade);
}

function imovelEhApartamento(imovel: Imovel): boolean {
  return !!imovel.unidade?.trim() || !!imovel.bloco?.trim() || ehApartamento(`${imovel.tipo || ""} ${imovel.edificio || ""}`);
}

function urlsDoImovel(imovel: Imovel): string[] {
  return [...(imovel.textoAnuncio || "").matchAll(/https?:\/\/\S+/g)]
    .map((match) => urlCanonicaAnuncio(match[0].replace(/[),.;]+$/, "")))
    .filter(Boolean);
}

export function urlsDosImoveis(imoveis: Imovel[]): Set<string> {
  return new Set(imoveis.flatMap(urlsDoImovel));
}

/**
 * Correspondência e bloqueio são decisões separadas: a URL e o endereço dizem
 * se o anúncio é de um imóvel da carteira; `imovelBloqueiaRadar` diz se esse
 * imóvel pode esconder o card. Quando só imóveis sem bloqueio correspondem, o
 * card fica visível e o contexto segue em `naCarteiraSemBloqueio`.
 */
export function situacaoRepeticaoCentral(
  anuncio: AnuncioComparavelComCarteira,
  imoveis: Imovel[],
  urlsNaCarteira: Set<string> = urlsDosImoveis(imoveis),
): SituacaoRepeticaoCentral {
  const semBloqueio = new Map<string, CorrespondenciaSemBloqueio>();
  const registrar = (lista: Imovel[], via: CorrespondenciaSemBloqueio["via"]) => {
    for (const imovel of lista) {
      if (!semBloqueio.has(imovel.id)) semBloqueio.set(imovel.id, correspondenciaSemBloqueio(imovel, via));
    }
  };
  const resultado = (motivo: MotivoRepeticaoCentral | null, ocultar: boolean): SituacaoRepeticaoCentral =>
    semBloqueio.size ? { motivo, ocultar, naCarteiraSemBloqueio: [...semBloqueio.values()] } : { motivo, ocultar };

  const urlAnuncio = urlCanonicaAnuncio(anuncio.url);
  if (urlsNaCarteira.has(urlAnuncio)) {
    const donos = imoveis.filter((imovel) => urlsDoImovel(imovel).includes(urlAnuncio));
    // Sem dono identificável (conjunto montado fora desta lista), vale o
    // comportamento anterior: a URL da carteira esconde.
    if (!donos.length || donos.some(imovelBloqueiaRadar)) {
      return { motivo: "url-na-carteira", ocultar: true };
    }
    registrar(donos, "url");
  }

  const tipo = tipoDoAnuncio(anuncio);
  const mesmoLocal = imoveis.filter((imovel) => mesmoEndereco(anuncio, imovel));
  if (!mesmoLocal.length) return resultado(null, false);

  if (tipo === "casa" && enderecoTemNumero(anuncio.endereco)) {
    const casas = mesmoLocal.filter((imovel) => !imovelEhApartamento(imovel));
    if (casas.some(imovelBloqueiaRadar)) return { motivo: "casa-no-pipeline", ocultar: true };
    registrar(casas, "endereco");
  }

  if (tipo === "apartamento") return resultado("apartamento-no-endereco", false);
  return resultado(null, false);
}
