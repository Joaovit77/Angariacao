import { agoraTimestamp, timestampDeIso } from "../datas";
import { extrairCaracteristicasImovel, extrairTipoImovelDeclarado } from "./caracteristicasImovel";
import { normalizarUf, separarCidadeEUf, ufValida } from "./geografia";
import { qualidadeLocalizacaoRadar, type CategoriaLocalizacaoRadar } from "./localizacaoRadar";
import { capacidadeAquisicaoRadar, capacidadeContratoExplicitoRadar, filtrosRadarSaoLegados, tipoRecorteRadar, type FinalidadeRadar, type TipoRecorteRadar } from "./aquisicaoRadar";

/* ================================================================
   CENTRAL DE ANGARIAÇÃO — contratos e regras puras

   Resultado de portal NÃO é Imovel: ele ainda não pertence à carteira.
   Só vira pré-cadastro depois da revisão humana. Manter os contratos
   separados impede que uma busca polua silenciosamente o Pipeline.
   ================================================================ */

/* Dois conjuntos com papéis diferentes (R4.2g):
   - CONHECIDOS: valores que o sistema representa, lê e persiste. Dado salvo
     de um portal conhecido nunca é descartado por não ser coletável.
   - ATIVOS: portais que podem ser consultados agora (busca da Central,
     builder, parsers, planejador, cron do Radar, telemetria de coleta).
   Todo ativo é conhecido; um conhecido só vira ativo quando ganha coleta
   própria. O ZAP é ativo desde o R4.2h, com capacidade funcional restrita
   (ver capacidadeFuncionalZap). */
export const PORTAIS_CONHECIDOS = ["olx", "chaves-na-mao", "wimoveis", "viva-real", "zap"] as const;
export type PortalAngariacao = (typeof PORTAIS_CONHECIDOS)[number];
export const PORTAIS_ATIVOS = ["olx", "chaves-na-mao", "wimoveis", "viva-real", "zap"] as const satisfies readonly PortalAngariacao[];
export type PortalAtivoAngariacao = (typeof PORTAIS_ATIVOS)[number];

export function ehPortalConhecido(valor: unknown): valor is PortalAngariacao {
  return typeof valor === "string" && (PORTAIS_CONHECIDOS as readonly string[]).includes(valor);
}

export function ehPortalAtivo(valor: unknown): valor is PortalAtivoAngariacao {
  return typeof valor === "string" && (PORTAIS_ATIVOS as readonly string[]).includes(valor);
}

export const PERIODOS_PUBLICACAO = [1, 7, 30] as const;
export type PeriodoPublicacao = (typeof PERIODOS_PUBLICACAO)[number];

export interface FiltrosCentralAngariacao {
  /** Filtro de consulta: só portal ativo pode ser pesquisado. */
  portal: PortalAtivoAngariacao;
  /** Ausência apenas no estado legado persistido. Novos produtores informam. */
  finalidade?: FinalidadeRadar;
  /** Recorte solicitado; nunca substitui tipoDeclarado do anúncio. */
  tipoRecorte?: TipoRecorteRadar;
  cidade: string;
  estado: string;
  bairro?: string;
  regiao?: string;
  tipo?: string;
  valorMin?: number | null;
  valorMax?: number | null;
  dormitorios?: number | null;
  somenteProprietario?: boolean;
  diasPublicacao?: PeriodoPublicacao | null;
}

export interface FiltrosAquisicaoRadar extends FiltrosCentralAngariacao {
  finalidade: FinalidadeRadar;
  tipoRecorte: TipoRecorteRadar;
}

export interface AnuncioCentralAngariacao {
  idExterno: string;
  portal: PortalAngariacao;
  /** Contexto da aquisição, sem inferência da finalidade pelo título. */
  finalidade?: FinalidadeRadar;
  titulo: string;
  preco?: number | null;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  imagem?: string | null;
  url: string;
  descricao?: string | null;
  tipo?: string | null;
  /** R6.0b: tipo que o próprio anúncio declara (card/JSON-LD do portal, ou
      título + descrição), nunca o filtro da busca. `tipo` continua podendo
      herdar o filtro; este campo é o que um filtro interno por tipo pode ler.
      Ausente: o anúncio ainda não passou por `comCaracteristicasDoAnuncio`.
      `null`: o anúncio não declara tipo. */
  tipoDeclarado?: string | null;
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
  const texto = [anuncio.titulo, anuncio.descricao].filter(Boolean).join(" · ");
  const extraidas = extrairCaracteristicasImovel(texto, anuncio.tipo || tipoPreferido);
  return {
    ...anuncio,
    tipo: anuncio.tipo ?? extraidas.tipo,
    // Só a primeira passada decide: depois dela `tipo` pode já ter herdado o
    // filtro, e a coleta aplica esta função mais de uma vez ao mesmo anúncio.
    tipoDeclarado: anuncio.tipoDeclarado !== undefined
      ? anuncio.tipoDeclarado
      : (anuncio.tipo?.trim() || extrairTipoImovelDeclarado(texto)),
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

/* R4.2i: a categoria de `qualidadeLocalizacaoRadar` decide os pontos de
   localização; o score não tem classificação própria. +20 exige logradouro
   útil com número confiável; qualquer localização parcial vale +10 (a cidade
   pode vir do filtro no Viva Real, então nunca prova endereço); nada, 0. */
const LOCALIZACAO_NO_SCORE: Record<CategoriaLocalizacaoRadar, { pontos: number; motivo: string | null }> = {
  logradouro_numero: { pontos: 20, motivo: "endereço com número publicado" },
  logradouro_numero_placeholder: { pontos: 10, motivo: "rua publicada, número não confirmado" },
  logradouro_sem_numero: { pontos: 10, motivo: "rua publicada, sem número" },
  indisponivel: { pontos: 10, motivo: "localização parcial disponível" },
  bairro: { pontos: 10, motivo: "bairro informado" },
  cidade: { pontos: 10, motivo: "cidade informada" },
  sem_localizacao: { pontos: 0, motivo: null },
};

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

  const localizacao = LOCALIZACAO_NO_SCORE[qualidadeLocalizacaoRadar(anuncio).categoria];
  nota += localizacao.pontos;
  if (localizacao.motivo) motivos.push(localizacao.motivo);

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
    // Só representação de dado conhecido: o ZAP ainda não é portal ativo.
    zap: "ZAP Imóveis",
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

/** Recorte funcional comprovado do ZAP (R4.2h). Só uma listagem real foi
    provada no discovery: apartamentos para alugar em Londrina/PR, sem bairro.
    Tudo fora disso é recusado aqui, antes do builder, e a própria Central usa
    esta mesma regra para não oferecer combinações que o ZAP não atende. */
export const COBERTURA_ZAP = "Londrina/PR · Apartamento";

export function capacidadeFuncionalZap(
  filtros: { cidade?: string | null; estado?: string | null; tipo?: string | null; bairro?: string | null; finalidade?: FinalidadeRadar; tipoRecorte?: TipoRecorteRadar },
): { suportado: boolean; motivo: string } {
  if (!filtrosRadarSaoLegados(filtros)) {
    return capacidadeContratoExplicitoRadar({
      ...filtros, portal: "zap", cidade: filtros.cidade || "", estado: filtros.estado || "",
      tipo: filtros.tipo || undefined, bairro: filtros.bairro || undefined,
    });
  }
  const recusa = (motivo: string) => ({ suportado: false, motivo });
  if (slugPortal(filtros.cidade || "") !== "londrina" || normalizarUf(filtros.estado) !== "PR") {
    return recusa(`O ZAP Imóveis está disponível somente em Londrina/PR (${COBERTURA_ZAP}).`);
  }
  const tipo = slugPortal(filtros.tipo || "");
  const recorte = tipoRecorteRadar(tipo);
  if (!recorte || !capacidadeAquisicaoRadar({
    portal: "zap", finalidade: "locacao", tipoRecorte: recorte,
    cidade: filtros.cidade || "", estado: filtros.estado || "",
  }).suportado) {
    return recusa(`O ZAP Imóveis está disponível somente para Apartamento (${COBERTURA_ZAP}).`);
  }
  if (filtros.bairro?.trim()) {
    return recusa("O ZAP Imóveis ainda não aceita busca por bairro.");
  }
  return { suportado: true, motivo: "Listagem real comprovada: apartamentos para alugar em Londrina/PR." };
}

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
  return slugPortal(separarCidadeEUf(anuncio.cidade).cidade) === slugPortal(cidadeDesejada);
}

/**
 * A URL de coleta já representa o mercado pedido; quando o anúncio publica a
 * UF, porém, ela precisa concordar. Isso rejeita um resultado explicitamente
 * divergente sem inventar a UF de cards que trazem apenas a cidade.
 */
export function anuncioPertenceAoMercado(
  anuncio: Pick<AnuncioCentralAngariacao, "cidade" | "estado">,
  cidadeDesejada: string,
  estadoDesejado: string,
): boolean {
  const ufDesejada = normalizarUf(estadoDesejado);
  if (!ufValida(ufDesejada) || !anuncioPertenceACidade(anuncio, cidadeDesejada)) return false;
  const localTextual = separarCidadeEUf(anuncio.cidade);
  const estadoDoCampo = normalizarUf(anuncio.estado);
  if (anuncio.estado?.trim() && !ufValida(estadoDoCampo)) return false;
  if (ufValida(estadoDoCampo) && localTextual.estado && estadoDoCampo !== localTextual.estado) {
    return false;
  }
  const estadoComprovado = ufValida(estadoDoCampo) ? estadoDoCampo : localTextual.estado;
  return !estadoComprovado || estadoComprovado === ufDesejada;
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

/** O id caiu no fallback de `idDoAnuncio`, que depende da posição do card na
    página: se a ordem mudar, o mesmo anúncio ganha outro id. Só para medir. */
export function idExternoEhFallback(portal: PortalAngariacao, idExterno: string): boolean {
  return idExterno.startsWith(`${portal}-`) && /^\d+-/.test(idExterno.slice(portal.length + 1));
}
