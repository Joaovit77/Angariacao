import { agoraTimestamp, timestampDeIso } from "../datas";
import { extrairCaracteristicasImovel } from "./caracteristicasImovel";

/* ================================================================
   CENTRAL DE ANGARIAÇÃO — contratos e regras puras

   Resultado de portal NÃO é Imovel: ele ainda não pertence à carteira.
   Só vira pré-cadastro depois da revisão humana. Manter os contratos
   separados impede que uma busca polua silenciosamente o Pipeline.
   ================================================================ */

export const PORTAIS_ANGARIACAO = ["olx", "chaves-na-mao", "wimoveis", "viva-real"] as const;
export type PortalAngariacao = (typeof PORTAIS_ANGARIACAO)[number];
export const PERIODOS_PUBLICACAO = [1, 7, 30] as const;
export type PeriodoPublicacao = (typeof PERIODOS_PUBLICACAO)[number];

export interface FiltrosCentralAngariacao {
  portal: PortalAngariacao;
  cidade: string;
  estado: string;
  bairro?: string;
  tipo?: string;
  valorMin?: number | null;
  valorMax?: number | null;
  dormitorios?: number | null;
  somenteProprietario?: boolean;
  diasPublicacao?: PeriodoPublicacao | null;
}

export interface AnuncioCentralAngariacao {
  idExterno: string;
  portal: PortalAngariacao;
  titulo: string;
  preco?: number | null;
  cidade?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  imagem?: string | null;
  url: string;
  descricao?: string | null;
  tipo?: string | null;
  areaM2?: number | null;
  areaTotalM2?: number | null;
  areaTerrenoM2?: number | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  andar?: number | null;
  pavimentos?: number | null;
  mobiliado?: boolean | null;
  valorCondominio?: number | null;
  valorIptu?: number | null;
  publicadoEm?: string | null;
  publicadoTexto?: string | null;
  anunciante: "proprietario" | "imobiliaria" | "incerto";
}

/** Acrescenta somente características declaradas no card do portal. */
export function comCaracteristicasDoAnuncio(
  anuncio: AnuncioCentralAngariacao,
  tipoPreferido?: string | null,
): AnuncioCentralAngariacao {
  const extraidas = extrairCaracteristicasImovel(
    [anuncio.titulo, anuncio.descricao].filter(Boolean).join(" · "),
    anuncio.tipo || tipoPreferido,
  );
  return {
    ...anuncio,
    tipo: anuncio.tipo ?? extraidas.tipo,
    areaM2: anuncio.areaM2 ?? extraidas.areaM2,
    areaTotalM2: anuncio.areaTotalM2 ?? extraidas.areaTotalM2,
    areaTerrenoM2: anuncio.areaTerrenoM2 ?? extraidas.areaTerrenoM2,
    quartos: anuncio.quartos ?? extraidas.quartos,
    suites: anuncio.suites ?? extraidas.suites,
    banheiros: anuncio.banheiros ?? extraidas.banheiros,
    vagas: anuncio.vagas ?? extraidas.vagas,
    andar: anuncio.andar ?? extraidas.andar,
    pavimentos: anuncio.pavimentos ?? extraidas.pavimentos,
    mobiliado: anuncio.mobiliado ?? extraidas.mobiliado,
    valorCondominio: anuncio.valorCondominio ?? extraidas.valorCondominio,
    valorIptu: anuncio.valorIptu ?? extraidas.valorIptu,
  };
}

export interface ResultadoBuscaCentral {
  ok: boolean;
  anuncios: AnuncioCentralAngariacao[];
  urlPesquisa: string;
  aviso?: string;
}

export interface AvaliacaoOportunidade {
  nota: number;
  faixa: "alta" | "media" | "baixa";
  motivos: string[];
}

/**
 * Triagem explicável do Radar. Não tenta prever fechamento nem inventa dados:
 * apenas valoriza os sinais que tornam uma oportunidade mais acionável.
 */
export function avaliarOportunidade(anuncio: AnuncioCentralAngariacao): AvaliacaoOportunidade {
  let nota = 20;
  const motivos: string[] = [];

  if (anuncio.anunciante === "proprietario") {
    nota += 30;
    motivos.push("anúncio direto com o proprietário");
  } else if (anuncio.anunciante === "incerto") {
    nota += 8;
    motivos.push("anunciante ainda precisa ser confirmado");
  }

  if (anuncio.endereco) {
    nota += 20;
    motivos.push("endereço publicado");
  } else if (anuncio.bairro || anuncio.cidade) {
    nota += 10;
    motivos.push("localização parcial disponível");
  }

  if (anuncio.preco && anuncio.preco > 0) {
    nota += 10;
    motivos.push("valor do aluguel informado");
  }

  if (anuncio.publicadoEm) {
    const publicado = timestampDeIso(anuncio.publicadoEm);
    const idadeHoras = publicado == null ? Number.NaN : (agoraTimestamp() - publicado) / 3_600_000;
    if (Number.isFinite(idadeHoras) && idadeHoras >= 0 && idadeHoras <= 24) {
      nota += 20;
      motivos.push("publicado nas últimas 24 horas");
    } else if (Number.isFinite(idadeHoras) && idadeHoras <= 24 * 7) {
      nota += 12;
      motivos.push("publicado nos últimos 7 dias");
    }
  } else if (anuncio.publicadoTexto) {
    nota += 4;
    motivos.push("portal informa quando foi publicado");
  }

  nota = Math.min(100, Math.max(0, nota));
  return {
    nota,
    faixa: nota >= 75 ? "alta" : nota >= 50 ? "media" : "baixa",
    motivos: motivos.length ? motivos : ["poucos dados públicos para priorização"],
  };
}

export function rotuloPortal(portal: PortalAngariacao): string {
  const rotulos: Record<PortalAngariacao, string> = {
    olx: "OLX",
    "chaves-na-mao": "Chaves na Mão",
    wimoveis: "Wimoveis",
    "viva-real": "Viva Real",
  };
  return rotulos[portal];
}

export function slugPortal(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SUFIXO_UF = /-(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$/;

/**
 * Confere a cidade declarada pelo anúncio, sem aceitar a região metropolitana
 * como se fosse a cidade pedida. O sufixo de UF é tolerado porque alguns
 * portais devolvem "Londrina - PR" e outros somente "Londrina".
 */
export function anuncioPertenceACidade(
  anuncio: Pick<AnuncioCentralAngariacao, "cidade">,
  cidadeDesejada: string,
): boolean {
  if (!anuncio.cidade?.trim() || !cidadeDesejada.trim()) return false;
  const normalizar = (valor: string) => slugPortal(valor).replace(SUFIXO_UF, "");
  return normalizar(anuncio.cidade) === normalizar(cidadeDesejada);
}

export function numeroOpcional(valor: unknown): number | null {
  if (valor === "" || valor == null) return null;
  const numero = typeof valor === "number" ? valor : Number(String(valor).replace(/\D/g, ""));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function textoParaPreCadastro(anuncio: AnuncioCentralAngariacao): string {
  return [
    anuncio.titulo,
    anuncio.descricao,
    anuncio.preco ? `Valor anunciado: R$ ${anuncio.preco}` : null,
    anuncio.endereco ? `Endereço publicado: ${anuncio.endereco}` : null,
    anuncio.bairro ? `Bairro: ${anuncio.bairro}` : null,
    anuncio.cidade ? `Cidade: ${anuncio.cidade}` : null,
    `Fonte: ${rotuloPortal(anuncio.portal)}`,
    `Link original: ${anuncio.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function idDoAnuncio(portal: PortalAngariacao, url: string, indice: number): string {
  const daUrl = url.match(/(?:-|\/)(\d{6,})(?:\?|\/|$)/)?.[1];
  return daUrl || `${portal}-${indice}-${slugPortal(url).slice(-28)}`;
}
