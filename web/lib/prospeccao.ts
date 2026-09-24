import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CategoriaEtiquetaProspeccao,
  CodigoEtiquetaProspeccao,
} from "./calculo/catalogoEtiquetas";
import {
  caixaBuscaGeografica,
  chaveImovelIdentificado,
  geografiaOpina,
  raioBuscaCandidatosMetros,
  type IdentidadeParaDedupe,
} from "./calculo/dedupeProspeccao";
import { chaveEndereco, chaveImovel } from "./calculo/duplicidade";
import {
  escolherCapaCatalogo,
  termoBuscaCatalogo,
  type CapaCatalogo,
  type FotoParaCapa,
} from "./calculo/catalogoVisual";
import {
  etiquetasDoImovel,
  type EtiquetaDoImovel,
  type EtiquetaProspeccaoLeitura,
} from "./calculo/etiquetasProspeccao";
import {
  ordenarAvistamentosPorRecencia,
  type AvistamentoProspeccao,
  type EstadoClassificacaoAvistamento,
  type EstadoEtiquetaProspeccao,
  type EstadoFotoAvistamento,
  type ModoClassificacaoProspeccao,
  type OrigemEtiquetaProspeccao,
  type PrecisaoLocalizacao,
  type SituacaoImovelIdentificado,
  type TipoImovelProspeccao,
} from "./calculo/prospeccao";
import {
  atributoMemoriaValido,
  type AfirmacaoRegistrada,
  type InvestigacaoRegistrada,
} from "./calculo/memoriaIdentidade";
import { getSupabase } from "./persistencia/supabase";

export type OrigemIdentificacaoProspeccao = "campo" | "placa";
export type OrigemTipoProspeccao = "manual" | "ia-texto" | "carteira";
export type EstadoTipoProspeccao = "declarado" | "inferido" | "confirmado";
export type EstadoExecucaoClassificacao =
  | "processando"
  | "concluida"
  | "falhou"
  | "abandonada";

export interface ImovelIdentificado {
  id: string;
  situacao: SituacaoImovelIdentificado;
  logradouro: string | null;
  numero: string | null;
  unidade: string | null;
  bloco: string | null;
  edificio: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  pontoReferencia: string | null;
  enderecoChave: string;
  cidadeChave: string;
  bairroChave: string;
  latitude: number | null;
  longitude: number | null;
  acuraciaMetros: number | null;
  precisaoLocalizacao: PrecisaoLocalizacao;
  tipo: TipoImovelProspeccao | null;
  tipoOrigem: OrigemTipoProspeccao | null;
  tipoConfianca: number | null;
  tipoEstado: EstadoTipoProspeccao | null;
  tipoDefinidoEm: string | null;
  tipoClassificacaoId: string | null;
  tipoAvistamentoId: string | null;
  tipoConfirmadoPor: string | null;
  tipoConfirmadoEm: string | null;
  avistamentosTotal: number;
  primeiroAvistamentoEm: string | null;
  ultimoAvistamentoEm: string | null;
  avistamentoCorrenteId: string | null;
  origemIdentificacao: OrigemIdentificacaoProspeccao;
  ultimaInvestigacaoEm: string | null;
  imovelId: string | null;
  promovidoEm: string | null;
  descartadoMotivo: string | null;
  descartadoEm: string | null;
  fundidoEm: string | null;
  fundidoEmImovelId: string | null;
  exclusaoSolicitadaEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface AvistamentoIdentificado extends AvistamentoProspeccao {
  revisaoConflitoEm: string | null;
  classificacaoId: string | null;
  classificacaoEm: string | null;
  fingerprint: string | null;
}

export interface FotoAvistamento {
  id: string;
  avistamentoId: string;
  imovelIdentificadoId: string;
  estado: EstadoFotoAvistamento;
  caminho: string;
  caminhoMiniatura: string;
  largura: number;
  altura: number;
  bytes: number;
  capturadaEm: string | null;
  reservadaEm: string;
  ativadaEm: string | null;
  criadoEm: string;
}

export interface ClassificacaoAvistamento {
  id: string;
  avistamentoId: string;
  imovelIdentificadoId: string;
  estado: EstadoExecucaoClassificacao;
  modo: ModoClassificacaoProspeccao;
  reusadaDeClassificacaoId: string | null;
  observacaoRevisao: number;
  fingerprint: string;
  modelo: string | null;
  esforco: string | null;
  versaoCatalogo: number;
  versaoClassificador: number;
  confiancaMinima: number;
  tipoSugerido: TipoImovelProspeccao | null;
  tipoConfianca: number | null;
  snapshotAplicado: boolean;
  sugeridas: number;
  aplicadas: number;
  abaixoDoPiso: number;
  foraDoCatalogo: number;
  semEvidencia: number;
  jaConfirmada: number;
  falhaCodigo: string | null;
  iniciadaEm: string;
  concluidaEm: string | null;
  leaseToken: string | null;
  leaseExpiraEm: string | null;
}

export interface EtiquetaIdentificado {
  id: number;
  imovelIdentificadoId: string;
  avistamentoId: string | null;
  classificacaoId: string | null;
  categoria: CategoriaEtiquetaProspeccao;
  codigo: CodigoEtiquetaProspeccao;
  origem: OrigemEtiquetaProspeccao;
  confianca: number | null;
  estado: EstadoEtiquetaProspeccao;
  observadoEm: string | null;
  modelo: string | null;
  versaoCatalogo: number;
  versaoClassificador: number | null;
  revisaoObservacao: number | null;
  confirmadaPor: string | null;
  confirmadaEm: string | null;
  substituidaEm: string | null;
  substituidaPorClassificacaoId: string | null;
  desatualizadaEm: string | null;
  criadoEm: string;
}

export interface AvistamentoLongitudinal extends AvistamentoIdentificado {
  fotos: FotoAvistamento[];
  classificacoes: ClassificacaoAvistamento[];
  etiquetas: EtiquetaIdentificado[];
}

export interface DetalheImovelIdentificado {
  identificado: ImovelIdentificado;
  avistamentos: AvistamentoLongitudinal[];
  etiquetasDoImovel: EtiquetaIdentificado[];
  classificacoesCarregadas: boolean;
}

export interface PaginaImoveisIdentificados {
  itens: ImovelIdentificado[];
  pagina: number;
  porPagina: number;
  total: number;
  temMais: boolean;
}

export interface DadosIdentificacao {
  logradouro?: string | null;
  numero?: string | null;
  unidade?: string | null;
  bloco?: string | null;
  edificio?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  pontoReferencia?: string | null;
  origemIdentificacao?: OrigemIdentificacaoProspeccao;
  tipo?: TipoImovelProspeccao | null;
}

/** O endereço sozinho: o que pode ser informado ou corrigido depois do
    cadastro. Origem e tipo ficam de fora — o tipo tem as próprias portas
    (§7.2) e a origem é do momento da identificação. */
export type DadosEnderecoIdentificado = Omit<DadosIdentificacao, "origemIdentificacao" | "tipo">;

export interface DadosAvistamento {
  observadoEm: string;
  latitude?: number | null;
  longitude?: number | null;
  acuraciaMetros?: number | null;
  precisaoLocalizacao?: PrecisaoLocalizacao;
  observacao?: string;
}

export interface ResultadoCriacaoIdentificado {
  identificado: ImovelIdentificado;
  avistamento: AvistamentoIdentificado;
}

export interface ReservaFotoAvistamento {
  fotoId: string;
  caminho: string;
  caminhoMiniatura: string | null;
  repetida: boolean;
}

export interface ResultadoRpcProspeccao {
  repetida: boolean;
}

export interface ResultadoFusaoIdentificados extends ResultadoRpcProspeccao {
  sobreviventeId: string;
  absorvidoId: string;
}

/** Antecipação para a interface; a RPC continua validando o estado no banco. */
export function podeFundirIdentificado(
  identificado: Pick<ImovelIdentificado, "situacao" | "exclusaoSolicitadaEm">,
): boolean {
  return !identificado.exclusaoSolicitadaEm
    && !["fundido", "promovido", "promovendo"].includes(identificado.situacao);
}

/** O contrato exato da rota `/api/prospeccao/excluir` (§19). `concluido` só é
    verdadeiro sem objeto pendente E com o prefixo do Storage vazio na releitura. */
export interface ResultadoExclusaoProspeccao {
  removidos: number;
  pendentes: number;
  prefixoVazio: boolean;
  concluido: boolean;
}

/** Os três corpos aceitos pela rota; não existe quarto. */
export type PedidoExclusaoProspeccao =
  | { fotoId: string }
  | { imovelIdentificadoId: string }
  | { tudo: true };

/** O que o diálogo mostra ANTES de iniciar: arquivos e lápides envolvidos. */
export interface PreviaExclusaoIdentificado {
  fotosTotal: number;
  lapidesTotal: number;
}

export class ErroProspeccao extends Error {
  constructor(
    public readonly codigo: string,
    mensagem = "A operação de prospecção não pôde ser concluída.",
  ) {
    super(mensagem);
    this.name = "ErroProspeccao";
  }
}

const UUID_PROSPECCAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUNAS_IDENTIFICADO = [
  "id",
  "situacao",
  "logradouro",
  "numero",
  "unidade",
  "bloco",
  "edificio",
  "bairro",
  "cidade",
  "estado",
  "cep",
  "ponto_referencia",
  "endereco_chave",
  "cidade_chave",
  "bairro_chave",
  "latitude",
  "longitude",
  "acuracia_metros",
  "precisao_localizacao",
  "tipo",
  "tipo_origem",
  "tipo_confianca",
  "tipo_estado",
  "tipo_definido_em",
  "tipo_classificacao_id",
  "tipo_avistamento_id",
  "tipo_confirmado_por",
  "tipo_confirmado_em",
  "avistamentos_total",
  "primeiro_avistamento_em",
  "ultimo_avistamento_em",
  "avistamento_corrente_id",
  "origem_identificacao",
  "ultima_investigacao_em",
  "imovel_id",
  "promovido_em",
  "descartado_motivo",
  "descartado_em",
  "fundido_em",
  "fundido_em_imovel_id",
  "exclusao_solicitada_em",
  "created_at",
  "updated_at",
].join(",");

const COLUNAS_AVISTAMENTO = [
  "id",
  "imovel_identificado_id",
  "observado_em",
  "latitude",
  "longitude",
  "acuracia_metros",
  "precisao_localizacao",
  "observacao",
  "observacao_revisao",
  "revisao_conflito_em",
  "classificacao_estado",
  "classificacao_id",
  "classificacao_em",
  "fingerprint",
  "created_at",
].join(",");

const COLUNAS_FOTO = [
  "id",
  "avistamento_id",
  "imovel_identificado_id",
  "estado",
  "caminho",
  "caminho_miniatura",
  "largura",
  "altura",
  "bytes",
  "capturada_em",
  "reservada_em",
  "ativada_em",
  "created_at",
].join(",");

const COLUNAS_CLASSIFICACAO = [
  "id",
  "avistamento_id",
  "imovel_identificado_id",
  "estado",
  "modo",
  "reusada_de_classificacao_id",
  "observacao_revisao",
  "fingerprint",
  "modelo",
  "esforco",
  "versao_catalogo",
  "versao_classificador",
  "confianca_minima",
  "tipo_sugerido",
  "tipo_confianca",
  "snapshot_aplicado",
  "sugeridas",
  "aplicadas",
  "abaixo_do_piso",
  "fora_do_catalogo",
  "sem_evidencia",
  "ja_confirmada",
  "falha_codigo",
  "iniciada_em",
  "concluida_em",
  "lease_token",
  "lease_expira_em",
].join(",");

const COLUNAS_ETIQUETA = [
  "id",
  "imovel_identificado_id",
  "avistamento_id",
  "classificacao_id",
  "categoria",
  "codigo",
  "origem",
  "confianca",
  "estado",
  "observado_em",
  "modelo",
  "versao_catalogo",
  "versao_classificador",
  "revisao_observacao",
  "confirmada_por",
  "confirmada_em",
  "substituida_em",
  "substituida_por_classificacao_id",
  "desatualizada_em",
  "created_at",
].join(",");

/* C13: memória de identidade. As duas tabelas do C13A, lidas sob RLS
   (select próprio) e mapeadas para os tipos do módulo puro. */
const COLUNAS_INVESTIGACAO_MEMORIA = [
  "id",
  "imovel_identificado_id",
  "origem",
  "resultados_total",
  "atributos_total",
  "recusados_total",
  "concluida_em",
  "created_at",
].join(",");

const COLUNAS_ATRIBUTO_MEMORIA = [
  "id",
  "imovel_identificado_id",
  "investigacao_id",
  "atributo",
  "valor_texto",
  "valor_num",
  "origem",
  "estado",
  "confianca",
  "fonte_url",
  "fonte_dominio",
  "observado_em",
  "confirmado_por",
  "confirmado_em",
  "created_at",
].join(",");

type Linha = Record<string, unknown>;
type RespostaRpc = Record<string, unknown> & { ok?: boolean; codigo?: string; repetida?: boolean };

function numeroOuNulo(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

function textoOuNulo(valor: string | null | undefined): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

function mapearIdentificado(linha: Linha): ImovelIdentificado {
  return {
    id: String(linha.id),
    situacao: linha.situacao as SituacaoImovelIdentificado,
    logradouro: linha.logradouro as string | null,
    numero: linha.numero as string | null,
    unidade: linha.unidade as string | null,
    bloco: linha.bloco as string | null,
    edificio: linha.edificio as string | null,
    bairro: linha.bairro as string | null,
    cidade: linha.cidade as string | null,
    estado: linha.estado as string | null,
    cep: linha.cep as string | null,
    pontoReferencia: linha.ponto_referencia as string | null,
    enderecoChave: String(linha.endereco_chave),
    cidadeChave: String(linha.cidade_chave),
    bairroChave: String(linha.bairro_chave),
    latitude: numeroOuNulo(linha.latitude),
    longitude: numeroOuNulo(linha.longitude),
    acuraciaMetros: numeroOuNulo(linha.acuracia_metros),
    precisaoLocalizacao: linha.precisao_localizacao as PrecisaoLocalizacao,
    tipo: linha.tipo as TipoImovelProspeccao | null,
    tipoOrigem: linha.tipo_origem as OrigemTipoProspeccao | null,
    tipoConfianca: numeroOuNulo(linha.tipo_confianca),
    tipoEstado: linha.tipo_estado as EstadoTipoProspeccao | null,
    tipoDefinidoEm: linha.tipo_definido_em as string | null,
    tipoClassificacaoId: linha.tipo_classificacao_id as string | null,
    tipoAvistamentoId: linha.tipo_avistamento_id as string | null,
    tipoConfirmadoPor: linha.tipo_confirmado_por as string | null,
    tipoConfirmadoEm: linha.tipo_confirmado_em as string | null,
    avistamentosTotal: Number(linha.avistamentos_total),
    primeiroAvistamentoEm: linha.primeiro_avistamento_em as string | null,
    ultimoAvistamentoEm: linha.ultimo_avistamento_em as string | null,
    avistamentoCorrenteId: linha.avistamento_corrente_id as string | null,
    origemIdentificacao: linha.origem_identificacao as OrigemIdentificacaoProspeccao,
    ultimaInvestigacaoEm: linha.ultima_investigacao_em as string | null,
    imovelId: linha.imovel_id as string | null,
    promovidoEm: linha.promovido_em as string | null,
    descartadoMotivo: linha.descartado_motivo as string | null,
    descartadoEm: linha.descartado_em as string | null,
    fundidoEm: linha.fundido_em as string | null,
    fundidoEmImovelId: linha.fundido_em_imovel_id as string | null,
    exclusaoSolicitadaEm: linha.exclusao_solicitada_em as string | null,
    criadoEm: String(linha.created_at),
    atualizadoEm: String(linha.updated_at),
  };
}

function mapearAvistamento(linha: Linha): AvistamentoIdentificado {
  return {
    id: String(linha.id),
    imovelIdentificadoId: String(linha.imovel_identificado_id),
    observadoEm: String(linha.observado_em),
    latitude: numeroOuNulo(linha.latitude),
    longitude: numeroOuNulo(linha.longitude),
    acuraciaMetros: numeroOuNulo(linha.acuracia_metros),
    precisaoLocalizacao: linha.precisao_localizacao as PrecisaoLocalizacao,
    observacao: String(linha.observacao ?? ""),
    observacaoRevisao: Number(linha.observacao_revisao),
    classificacaoEstado: linha.classificacao_estado as EstadoClassificacaoAvistamento,
    createdAt: String(linha.created_at),
    revisaoConflitoEm: linha.revisao_conflito_em as string | null,
    classificacaoId: linha.classificacao_id as string | null,
    classificacaoEm: linha.classificacao_em as string | null,
    fingerprint: linha.fingerprint as string | null,
  };
}

function mapearFoto(linha: Linha): FotoAvistamento {
  return {
    id: String(linha.id),
    avistamentoId: String(linha.avistamento_id),
    imovelIdentificadoId: String(linha.imovel_identificado_id),
    estado: linha.estado as EstadoFotoAvistamento,
    caminho: String(linha.caminho),
    caminhoMiniatura: String(linha.caminho_miniatura),
    largura: Number(linha.largura),
    altura: Number(linha.altura),
    bytes: Number(linha.bytes),
    capturadaEm: linha.capturada_em as string | null,
    reservadaEm: String(linha.reservada_em),
    ativadaEm: linha.ativada_em as string | null,
    criadoEm: String(linha.created_at),
  };
}

function mapearClassificacao(linha: Linha): ClassificacaoAvistamento {
  return {
    id: String(linha.id),
    avistamentoId: String(linha.avistamento_id),
    imovelIdentificadoId: String(linha.imovel_identificado_id),
    estado: linha.estado as EstadoExecucaoClassificacao,
    modo: linha.modo as ModoClassificacaoProspeccao,
    reusadaDeClassificacaoId: linha.reusada_de_classificacao_id as string | null,
    observacaoRevisao: Number(linha.observacao_revisao),
    fingerprint: String(linha.fingerprint),
    modelo: linha.modelo as string | null,
    esforco: linha.esforco as string | null,
    versaoCatalogo: Number(linha.versao_catalogo),
    versaoClassificador: Number(linha.versao_classificador),
    confiancaMinima: Number(linha.confianca_minima),
    tipoSugerido: linha.tipo_sugerido as TipoImovelProspeccao | null,
    tipoConfianca: numeroOuNulo(linha.tipo_confianca),
    snapshotAplicado: linha.snapshot_aplicado === true,
    sugeridas: Number(linha.sugeridas),
    aplicadas: Number(linha.aplicadas),
    abaixoDoPiso: Number(linha.abaixo_do_piso),
    foraDoCatalogo: Number(linha.fora_do_catalogo),
    semEvidencia: Number(linha.sem_evidencia),
    jaConfirmada: Number(linha.ja_confirmada),
    falhaCodigo: linha.falha_codigo as string | null,
    iniciadaEm: String(linha.iniciada_em),
    concluidaEm: linha.concluida_em as string | null,
    leaseToken: linha.lease_token as string | null,
    leaseExpiraEm: linha.lease_expira_em as string | null,
  };
}

function mapearEtiqueta(linha: Linha): EtiquetaIdentificado {
  return {
    id: Number(linha.id),
    imovelIdentificadoId: String(linha.imovel_identificado_id),
    avistamentoId: linha.avistamento_id as string | null,
    classificacaoId: linha.classificacao_id as string | null,
    categoria: linha.categoria as CategoriaEtiquetaProspeccao,
    codigo: linha.codigo as CodigoEtiquetaProspeccao,
    origem: linha.origem as OrigemEtiquetaProspeccao,
    confianca: numeroOuNulo(linha.confianca),
    estado: linha.estado as EstadoEtiquetaProspeccao,
    observadoEm: linha.observado_em as string | null,
    modelo: linha.modelo as string | null,
    versaoCatalogo: Number(linha.versao_catalogo),
    versaoClassificador: numeroOuNulo(linha.versao_classificador),
    revisaoObservacao: numeroOuNulo(linha.revisao_observacao),
    confirmadaPor: linha.confirmada_por as string | null,
    confirmadaEm: linha.confirmada_em as string | null,
    substituidaEm: linha.substituida_em as string | null,
    substituidaPorClassificacaoId:
      linha.substituida_por_classificacao_id as string | null,
    desatualizadaEm: linha.desatualizada_em as string | null,
    criadoEm: String(linha.created_at),
  };
}

function falha(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new ErroProspeccao("falha_supabase");
}

async function chamarRpc(
  client: SupabaseClient,
  nome: string,
  parametros: Record<string, unknown>,
): Promise<RespostaRpc> {
  const { data, error } = await client.rpc(nome, parametros);
  if (error) falha(error);
  const resposta = data as RespostaRpc | null;
  if (!resposta || resposta.ok !== true) {
    throw new ErroProspeccao(resposta?.codigo ?? "resposta_rpc_invalida");
  }
  return resposta;
}

/** Situações que aparecem na lista normal. Descartado e fundido ficam atrás do
    filtro "ocultos", junto com exclusão pendente (§13.3 / §13.4). */
export const SITUACOES_VISIVEIS_PROSPECCAO: readonly SituacaoImovelIdentificado[] = [
  "identificado",
  "investigando",
  "promovendo",
  "promovido",
];

export async function listarIdentificados(
  opcoes: { pagina?: number; porPagina?: number; incluirOcultos?: boolean } = {},
  client: SupabaseClient = getSupabase(),
): Promise<PaginaImoveisIdentificados> {
  const pagina = Math.max(1, Math.trunc(opcoes.pagina ?? 1));
  const porPagina = Math.min(100, Math.max(1, Math.trunc(opcoes.porPagina ?? 24)));
  const inicio = (pagina - 1) * porPagina;
  const fim = inicio + porPagina - 1;
  let consulta = client
    .from("imoveis_identificados")
    .select(COLUNAS_IDENTIFICADO, { count: "exact" });
  if (!opcoes.incluirOcultos) {
    consulta = consulta
      .in("situacao", [...SITUACOES_VISIVEIS_PROSPECCAO])
      .is("exclusao_solicitada_em", null);
  }
  const { data, error, count } = await consulta
    .order("ultimo_avistamento_em", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(inicio, fim);

  if (error) falha(error);
  const total = count ?? 0;
  return {
    itens: ((data ?? []) as unknown as Linha[]).map(mapearIdentificado),
    pagina,
    porPagina,
    total,
    temMais: inicio + porPagina < total,
  };
}

/* ----------------------------------------------------------------
   CATÁLOGO VISUAL (C12) — leitura, nunca escrita.

   Um card por identificado com ao menos UMA foto ativa. A consulta é
   UMA: `imoveis_identificados` com o embed `!inner` das fotos ativas (o
   `!inner` faz o filtro da foto valer para o pai, então quem não tem foto
   nem vem) e, dentro de cada foto, o `observado_em` da passagem dona. A
   capa é escolhida aqui, na leitura; a foto continua da passagem original.
   Mesma visibilidade e mesma ordem temporal da lista do Garimpo. Sem
   tabela, coluna, RPC ou policy nova: RLS de posse das três tabelas basta.
   ---------------------------------------------------------------- */

export interface FiltrosCatalogoVisual {
  /** Texto livre: endereço, bairro ou cidade, normalizado como as chaves. */
  busca?: string;
  tipo?: TipoImovelProspeccao | "";
  situacao?: SituacaoImovelIdentificado | "";
}

export interface ItemCatalogoVisual {
  identificado: ImovelIdentificado;
  capa: CapaCatalogo;
  /** Quantas fotos ativas o imóvel tem, somando as passagens. */
  fotosAtivas: number;
}

export interface PaginaCatalogoVisual {
  itens: ItemCatalogoVisual[];
  pagina: number;
  porPagina: number;
  total: number;
  temMais: boolean;
}

const COLUNAS_CATALOGO = [
  COLUNAS_IDENTIFICADO,
  "fotos:imoveis_identificados_fotos!inner("
    + "id,avistamento_id,estado,caminho,caminho_miniatura,created_at,"
    + "avistamento:imoveis_identificados_avistamentos!avistamento_id(observado_em)"
    + ")",
].join(",");

function fotoParaCapa(linha: Linha): FotoParaCapa {
  const avistamento = (linha.avistamento ?? null) as { observado_em?: unknown } | null;
  return {
    id: String(linha.id),
    avistamentoId: String(linha.avistamento_id),
    estado: String(linha.estado),
    caminho: String(linha.caminho),
    caminhoMiniatura: String(linha.caminho_miniatura),
    observadoEm: typeof avistamento?.observado_em === "string" ? avistamento.observado_em : null,
    criadoEm: String(linha.created_at),
  };
}

export async function listarCatalogoVisual(
  opcoes: { pagina?: number; porPagina?: number; filtros?: FiltrosCatalogoVisual } = {},
  client: SupabaseClient = getSupabase(),
): Promise<PaginaCatalogoVisual> {
  const pagina = Math.max(1, Math.trunc(opcoes.pagina ?? 1));
  const porPagina = Math.min(100, Math.max(1, Math.trunc(opcoes.porPagina ?? 24)));
  const inicio = (pagina - 1) * porPagina;
  const fim = inicio + porPagina - 1;
  const filtros = opcoes.filtros ?? {};

  let consulta = client
    .from("imoveis_identificados")
    .select(COLUNAS_CATALOGO, { count: "exact" })
    .eq("fotos.estado", "ativa")
    .in("situacao", [...SITUACOES_VISIVEIS_PROSPECCAO])
    .is("exclusao_solicitada_em", null);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.situacao && SITUACOES_VISIVEIS_PROSPECCAO.includes(filtros.situacao)) {
    consulta = consulta.eq("situacao", filtros.situacao);
  }
  const termo = termoBuscaCatalogo(filtros.busca);
  if (termo) {
    // `%` e `_` são curingas do ILIKE; o texto normalizado não os contém
    // (a chave só tem letras, dígitos e espaço), então o padrão é literal.
    const padrao = `%${termo}%`;
    consulta = consulta.or(
      `endereco_chave.ilike.${padrao},bairro_chave.ilike.${padrao},cidade_chave.ilike.${padrao}`,
    );
  }

  const { data, error, count } = await consulta
    .order("ultimo_avistamento_em", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(inicio, fim);
  if (error) falha(error);

  const itens: ItemCatalogoVisual[] = [];
  for (const linha of (data ?? []) as unknown as Linha[]) {
    const fotos = ((linha.fotos ?? []) as Linha[]).map(fotoParaCapa);
    const capa = escolherCapaCatalogo(fotos);
    // Sem capa não há card: o `!inner` já garante ao menos uma ativa, mas a
    // escolha é a fonte da verdade e não confia no transporte.
    if (!capa) continue;
    itens.push({
      identificado: mapearIdentificado(linha),
      capa,
      fotosAtivas: fotos.filter((foto) => foto.estado === "ativa").length,
    });
  }
  const total = count ?? 0;
  return { itens, pagina, porPagina, total, temMais: inicio + porPagina < total };
}

export async function obterIdentificado(
  id: string,
  opcoes: { incluirClassificacoes?: boolean } = {},
  client: SupabaseClient = getSupabase(),
): Promise<DetalheImovelIdentificado | null> {
  const { data: linhaIdentificado, error: erroIdentificado } = await client
    .from("imoveis_identificados")
    .select(COLUNAS_IDENTIFICADO)
    .eq("id", id)
    .maybeSingle();
  if (erroIdentificado) falha(erroIdentificado);
  if (!linhaIdentificado) return null;

  const incluirClassificacoes = opcoes.incluirClassificacoes === true;
  const classificacoes = incluirClassificacoes
    ? client
        .from("imoveis_identificados_classificacoes")
        .select(COLUNAS_CLASSIFICACAO)
        .eq("imovel_identificado_id", id)
        .order("iniciada_em", { ascending: false })
        .order("id", { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const [respostaAvistamentos, respostaFotos, respostaEtiquetas, respostaClassificacoes] =
    await Promise.all([
      client
        .from("imoveis_identificados_avistamentos")
        .select(COLUNAS_AVISTAMENTO)
        .eq("imovel_identificado_id", id)
        .order("observado_em", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      client
        .from("imoveis_identificados_fotos")
        .select(COLUNAS_FOTO)
        .eq("imovel_identificado_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      client
        .from("imoveis_identificados_etiquetas")
        .select(COLUNAS_ETIQUETA)
        .eq("imovel_identificado_id", id)
        .order("observado_em", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false }),
      classificacoes,
    ]);

  for (const resposta of [
    respostaAvistamentos,
    respostaFotos,
    respostaEtiquetas,
    respostaClassificacoes,
  ]) {
    if (resposta.error) falha(resposta.error);
  }

  const fotos = ((respostaFotos.data ?? []) as unknown as Linha[]).map(mapearFoto);
  const etiquetas = ((respostaEtiquetas.data ?? []) as unknown as Linha[]).map(mapearEtiqueta);
  const classificacoesMapeadas = ((
    respostaClassificacoes.data ?? []
  ) as unknown as Linha[]).map(
    mapearClassificacao,
  );
  const avistamentos = ordenarAvistamentosPorRecencia(
    ((respostaAvistamentos.data ?? []) as unknown as Linha[]).map(mapearAvistamento),
  ).map<AvistamentoLongitudinal>((avistamento) => ({
    ...avistamento,
    fotos: fotos.filter((foto) => foto.avistamentoId === avistamento.id),
    classificacoes: classificacoesMapeadas.filter(
      (classificacao) => classificacao.avistamentoId === avistamento.id,
    ),
    etiquetas: etiquetas.filter((etiqueta) => etiqueta.avistamentoId === avistamento.id),
  }));

  return {
    identificado: mapearIdentificado(linhaIdentificado as unknown as Linha),
    avistamentos,
    etiquetasDoImovel: etiquetas.filter((etiqueta) => etiqueta.avistamentoId === null),
    classificacoesCarregadas: incluirClassificacoes,
  };
}

function payloadAvistamento(
  usuarioId: string,
  imovelIdentificadoId: string,
  dados: DadosAvistamento,
) {
  return {
    imovel_identificado_id: imovelIdentificadoId,
    user_id: usuarioId,
    observado_em: dados.observadoEm,
    latitude: dados.latitude ?? null,
    longitude: dados.longitude ?? null,
    acuracia_metros: dados.acuraciaMetros ?? null,
    precisao_localizacao: dados.precisaoLocalizacao ?? "desconhecida",
    observacao: dados.observacao ?? "",
  };
}

/** As colunas de endereço com as chaves de dedupe derivadas — uma só
    função para o cadastro e para a correção posterior, senão a chave que a
    deduplicação consulta divergiria de quem a escreveu. */
function colunasEndereco(dados: DadosEnderecoIdentificado) {
  const logradouro = textoOuNulo(dados.logradouro);
  const numero = textoOuNulo(dados.numero);
  const unidade = textoOuNulo(dados.unidade);
  const bloco = textoOuNulo(dados.bloco);
  const cidade = textoOuNulo(dados.cidade);
  const bairro = textoOuNulo(dados.bairro);
  const endereco = [logradouro, numero].filter(Boolean).join(", ");
  return {
    logradouro,
    numero,
    unidade,
    bloco,
    edificio: textoOuNulo(dados.edificio),
    bairro,
    cidade,
    estado: textoOuNulo(dados.estado)?.toUpperCase() ?? null,
    cep: textoOuNulo(dados.cep),
    ponto_referencia: textoOuNulo(dados.pontoReferencia),
    endereco_chave: endereco
      ? chaveImovel({ endereco, cidade: cidade ?? "", unidade, bloco })
      : "",
    cidade_chave: chaveEndereco(cidade),
    bairro_chave: chaveEndereco(bairro),
  };
}

export async function criarIdentificado(
  usuarioId: string,
  dados: DadosIdentificacao,
  primeiroAvistamento: DadosAvistamento,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoCriacaoIdentificado> {
  const { data: linhaIdentificado, error: erroIdentificado } = await client
    .from("imoveis_identificados")
    .insert({
      user_id: usuarioId,
      ...colunasEndereco(dados),
      origem_identificacao: dados.origemIdentificacao ?? "campo",
      tipo: dados.tipo ?? null,
    })
    .select(COLUNAS_IDENTIFICADO)
    .single();
  if (erroIdentificado) falha(erroIdentificado);

  const identificado = mapearIdentificado(linhaIdentificado as unknown as Linha);
  const { data: linhaAvistamento, error: erroAvistamento } = await client
    .from("imoveis_identificados_avistamentos")
    .insert(payloadAvistamento(usuarioId, identificado.id, primeiroAvistamento))
    .select(COLUNAS_AVISTAMENTO)
    .single();
  if (erroAvistamento) falha(erroAvistamento);

  return {
    identificado,
    avistamento: mapearAvistamento(linhaAvistamento as unknown as Linha),
  };
}

export async function acrescentarAvistamento(
  usuarioId: string,
  imovelIdentificadoId: string,
  dados: DadosAvistamento,
  client: SupabaseClient = getSupabase(),
): Promise<AvistamentoIdentificado> {
  const { data, error } = await client
    .from("imoveis_identificados_avistamentos")
    .insert(payloadAvistamento(usuarioId, imovelIdentificadoId, dados))
    .select(COLUNAS_AVISTAMENTO)
    .single();
  if (error) falha(error);
  return mapearAvistamento(data as unknown as Linha);
}

export async function corrigirObservacaoAvistamento(
  avistamentoId: string,
  observacao: string,
  client: SupabaseClient = getSupabase(),
): Promise<AvistamentoIdentificado> {
  const { data, error } = await client
    .from("imoveis_identificados_avistamentos")
    .update({ observacao })
    .eq("id", avistamentoId)
    .select(COLUNAS_AVISTAMENTO)
    .single();
  if (error) falha(error);
  return mapearAvistamento(data as unknown as Linha);
}

/** Informa ou corrige o endereço de um imóvel já identificado (quem sai
    com pressa registra a foto e deixa o endereço para depois). Só as
    colunas de endereço, pelo grant de update que a V7 já concede; as
    chaves de dedupe são recalculadas junto, e as passagens, a localização
    e o tipo não são tocados. */
export async function atualizarEnderecoIdentificado(
  imovelIdentificadoId: string,
  dados: DadosEnderecoIdentificado,
  client: SupabaseClient = getSupabase(),
): Promise<ImovelIdentificado> {
  const { data, error } = await client
    .from("imoveis_identificados")
    .update(colunasEndereco(dados))
    .eq("id", imovelIdentificadoId)
    .select(COLUNAS_IDENTIFICADO)
    .single();
  if (error) falha(error);
  return mapearIdentificado(data as unknown as Linha);
}

export async function reservarFotoAvistamento(
  avistamentoId: string,
  dados: { largura: number; altura: number; bytes: number },
  client: SupabaseClient = getSupabase(),
): Promise<ReservaFotoAvistamento> {
  const resposta = await chamarRpc(client, "reservar_foto_avistamento", {
    p_avistamento_id: avistamentoId,
    p_largura: dados.largura,
    p_altura: dados.altura,
    p_bytes: dados.bytes,
  });
  if (typeof resposta.foto_id !== "string" || typeof resposta.caminho !== "string") {
    throw new ErroProspeccao("resposta_rpc_invalida");
  }
  return {
    fotoId: resposta.foto_id,
    caminho: resposta.caminho,
    caminhoMiniatura:
      typeof resposta.caminho_miniatura === "string" ? resposta.caminho_miniatura : null,
    repetida: resposta.repetida === true,
  };
}

export async function finalizarFotoAvistamento(
  fotoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "finalizar_foto_avistamento", {
    p_foto_id: fotoId,
  });
  return { repetida: resposta.repetida === true };
}

export async function descartarIdentificado(
  imovelIdentificadoId: string,
  motivo?: string | null,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "definir_situacao_identificado", {
    p_imovel_identificado_id: imovelIdentificadoId,
    p_situacao: "descartado",
    p_motivo: textoOuNulo(motivo),
  });
  return { repetida: resposta.repetida === true };
}

export async function aplicarEtiquetaHumana(
  imovelIdentificadoId: string,
  avistamentoId: string | null,
  categoria: CategoriaEtiquetaProspeccao,
  codigo: CodigoEtiquetaProspeccao,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "aplicar_etiqueta_humana", {
    p_imovel_identificado_id: imovelIdentificadoId,
    p_avistamento_id: avistamentoId,
    p_categoria: categoria,
    p_codigo: codigo,
  });
  return { repetida: resposta.repetida === true };
}

async function definirEstadoEtiqueta(
  etiquetaId: number,
  estado: "confirmada" | "contestada",
  client: SupabaseClient,
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "definir_estado_etiqueta", {
    p_etiqueta_id: etiquetaId,
    p_estado: estado,
  });
  return { repetida: resposta.repetida === true };
}

export function confirmarEtiqueta(
  etiquetaId: number,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  return definirEstadoEtiqueta(etiquetaId, "confirmada", client);
}

export function contestarEtiqueta(
  etiquetaId: number,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  return definirEstadoEtiqueta(etiquetaId, "contestada", client);
}

/** Endossa um tipo inferido pela IA: vira `confirmado` mantendo a origem
    `ia-texto` e os ids da execução/avistamento (V7 §7.2, regra 5). */
export async function confirmarTipoIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "confirmar_tipo_identificado", {
    p_imovel_identificado_id: imovelIdentificadoId,
  });
  return { repetida: resposta.repetida === true };
}

/** O que a memória de identidade (C13) já sabe deste registro: as
    investigações concluídas e as afirmações que elas deixaram, com a
    procedência. Só leitura, só o que a RLS deixa ver; a composição
    (vigência, divergência, linha do tempo) é do módulo puro. */
export interface MemoriaIdentificadoCarregada {
  investigacoes: InvestigacaoRegistrada[];
  atributos: AfirmacaoRegistrada[];
}

function mapearInvestigacaoMemoria(linha: Linha): InvestigacaoRegistrada {
  return {
    id: String(linha.id),
    imovelIdentificadoId: String(linha.imovel_identificado_id),
    origem: "investigador-web",
    resultadosTotal: Number(linha.resultados_total ?? 0),
    atributosTotal: Number(linha.atributos_total ?? 0),
    recusadosTotal: Number(linha.recusados_total ?? 0),
    concluidaEm: String(linha.concluida_em),
    criadoEm: String(linha.created_at),
  };
}

function mapearAtributoMemoria(linha: Linha): AfirmacaoRegistrada | null {
  // Fora do catálogo não existe para a tela: o CHECK do banco impede, mas
  // a leitura não confia em ninguém.
  if (!atributoMemoriaValido(linha.atributo)) return null;
  // Estado também é lista fechada: só `hipotese` e `confirmada` existem para
  // esta versão. Qualquer outro (um estado que um schema mais novo venha a
  // aceitar, ou um valor corrompido) é descartado da leitura, NUNCA tratado
  // como hipótese: isso ressuscitaria como candidato algo que foi decidido.
  const estado = linha.estado;
  if (estado !== "hipotese" && estado !== "confirmada") return null;
  const confianca = linha.confianca;
  return {
    id: Number(linha.id),
    imovelIdentificadoId: String(linha.imovel_identificado_id),
    investigacaoId: String(linha.investigacao_id),
    atributo: linha.atributo,
    valorTexto: typeof linha.valor_texto === "string" ? linha.valor_texto : null,
    valorNum: numeroOuNulo(linha.valor_num),
    origem: "investigador-web",
    estado,
    confianca: confianca === "muito-forte" || confianca === "forte" || confianca === "possivel" || confianca === "indicio"
      ? confianca
      : null,
    fonteUrl: String(linha.fonte_url ?? ""),
    fonteDominio: String(linha.fonte_dominio ?? ""),
    observadoEm: String(linha.observado_em),
    confirmadoPor: typeof linha.confirmado_por === "string" ? linha.confirmado_por : null,
    confirmadoEm: typeof linha.confirmado_em === "string" ? linha.confirmado_em : null,
    criadoEm: String(linha.created_at),
  };
}

export async function obterMemoriaIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<MemoriaIdentificadoCarregada> {
  const [respostaInvestigacoes, respostaAtributos] = await Promise.all([
    client
      .from("imoveis_identificados_investigacoes")
      .select(COLUNAS_INVESTIGACAO_MEMORIA)
      .eq("imovel_identificado_id", imovelIdentificadoId)
      .order("concluida_em", { ascending: false })
      .order("id", { ascending: false }),
    client
      .from("imoveis_identificados_atributos")
      .select(COLUNAS_ATRIBUTO_MEMORIA)
      .eq("imovel_identificado_id", imovelIdentificadoId)
      .order("observado_em", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  if (respostaInvestigacoes.error) falha(respostaInvestigacoes.error);
  if (respostaAtributos.error) falha(respostaAtributos.error);
  return {
    investigacoes: ((respostaInvestigacoes.data ?? []) as unknown as Linha[]).map(mapearInvestigacaoMemoria),
    atributos: ((respostaAtributos.data ?? []) as unknown as Linha[])
      .map(mapearAtributoMemoria)
      .filter((atributo): atributo is AfirmacaoRegistrada => atributo !== null),
  };
}

/** Uma pessoa valida uma hipótese da memória (C13A): só o estado muda;
    origem, fonte, valor e data de observação ficam como estavam. A RPC
    é a única porta e decide tudo (dono, exclusão pendente, repetição). */
export async function confirmarAtributoIdentificado(
  atributoId: number,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "confirmar_atributo_identificado", {
    p_atributo_id: atributoId,
  });
  return { repetida: resposta.repetida === true };
}

export async function definirTipoManual(
  imovelIdentificadoId: string,
  tipo: TipoImovelProspeccao | null,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "definir_tipo_manual", {
    p_imovel_identificado_id: imovelIdentificadoId,
    p_tipo: tipo,
  });
  return { repetida: resposta.repetida === true };
}

/** Uma intenção humana, uma RPC. Histórico e vínculos só mudam no banco. */
export async function fundirIdentificados(
  sobreviventeId: string,
  absorvidoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoFusaoIdentificados> {
  if (!UUID_PROSPECCAO.test(sobreviventeId) || !UUID_PROSPECCAO.test(absorvidoId)
      || sobreviventeId === absorvidoId) {
    throw new ErroProspeccao("par_invalido", "Escolha dois registros diferentes para unir.");
  }
  const { data, error } = await client.rpc("fundir_imoveis_identificados", {
    p_sobrevivente_id: sobreviventeId,
    p_absorvido_id: absorvidoId,
  });
  const resposta = data as RespostaRpc | null;
  if (error || resposta?.ok !== true) {
    const codigo = error?.code ?? resposta?.codigo ?? "resposta_rpc_invalida";
    const mensagens: Record<string, string> = {
      exclusao_em_andamento: "Um dos registros está com exclusão em andamento. Retome ou cancele a exclusão antes de unir.",
      situacao_incompativel: "Um dos registros já foi unido ou está em promoção. Atualize a lista antes de continuar.",
      fusao_em_si_mesmo: "Escolha dois registros diferentes para unir.",
      P0002: "Um dos registros não foi encontrado nesta conta. Atualize a lista antes de continuar.",
      "42501": "Sua sessão não permite unir estes registros. Confira o acesso à conta.",
    };
    throw new ErroProspeccao(codigo, mensagens[codigo] ?? error?.message
      ?? "Não foi possível confirmar a união. Tente novamente com a mesma escolha.");
  }
  if (resposta.sobrevivente_id !== sobreviventeId || resposta.absorvido_id !== absorvidoId
      || typeof resposta.repetida !== "boolean") {
    throw new ErroProspeccao("resposta_rpc_invalida", "O retorno da união não pôde ser confirmado. Atualize a lista antes de continuar.");
  }
  return { sobreviventeId, absorvidoId, repetida: resposta.repetida };
}

/* ----------------------------------------------------------------
   PROMOÇÃO (C10) — o Garimpo NÃO escreve em `imoveis`.

   A oportunidade nasce no ModalImovel + salvarImovel, por clique humano.
   Daqui saem só os três passos do contrato de §13.2: marcar `promovendo`
   ANTES de abrir o modal, gravar o vínculo DEPOIS que o humano salvou, e
   voltar a `identificado` se ele desistir. As três são RPCs do navegador
   (`auth.uid()`); nenhuma cria, apaga ou toca o `Imovel`.
   ---------------------------------------------------------------- */

const MENSAGENS_PROMOCAO: Record<string, string> = {
  exclusao_em_andamento: "Este registro está com exclusão em andamento. Retome ou cancele a exclusão antes de continuar.",
  registro_fundido: "Este registro foi unido a outro. Abra o registro principal para continuar.",
  registro_descartado: "Este registro está descartado. Reative-o antes de transformá-lo em oportunidade.",
  ja_promovido: "Este registro já foi transformado em oportunidade.",
  ja_promovido_em_outra: "Este registro já está vinculado a outra oportunidade do Pipeline. O vínculo não foi alterado.",
  imovel_ja_vinculado: "Esta oportunidade já está vinculada a outro registro do Garimpo. Escolha outra.",
  P0002: "O registro ou a oportunidade não foi encontrado nesta conta. Atualize a lista antes de continuar.",
  "42501": "Sua sessão não permite esta ação. Confira o acesso à conta.",
};

function falhaPromocao(codigo: string, padrao: string): never {
  throw new ErroProspeccao(codigo, MENSAGENS_PROMOCAO[codigo] ?? padrao);
}

async function definirSituacaoIdentificado(
  imovelIdentificadoId: string,
  situacao: "promovendo" | "identificado",
  client: SupabaseClient,
): Promise<ResultadoRpcProspeccao> {
  const { data, error } = await client.rpc("definir_situacao_identificado", {
    p_imovel_identificado_id: imovelIdentificadoId,
    p_situacao: situacao,
    p_motivo: null,
  });
  const resposta = data as RespostaRpc | null;
  if (error || resposta?.ok !== true) {
    falhaPromocao(
      error?.code ?? resposta?.codigo ?? "resposta_rpc_invalida",
      error?.message ?? "Não foi possível atualizar a situação deste registro.",
    );
  }
  return { repetida: resposta.repetida === true };
}

/** Passo 1 de §13.2: `promovendo` ANTES de abrir o ModalImovel. A partir
    daqui a tela não oferece mais "Transformar em oportunidade" — só
    concluir o vínculo ou desistir. */
export function iniciarPromocaoIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  return definirSituacaoIdentificado(imovelIdentificadoId, "promovendo", client);
}

/** Desistir da recuperação: o identificado volta a `identificado`. A
    oportunidade já criada CONTINUA no Pipeline — apagá-la não é decisão
    deste módulo, e esta função não a alcança. */
export async function desistirPromocaoIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resultado = await definirSituacaoIdentificado(imovelIdentificadoId, "identificado", client);
  esquecerOportunidadeCriada(imovelIdentificadoId);
  return resultado;
}

export interface ResultadoVinculoPromocao extends ResultadoRpcProspeccao {
  imovelId: string;
}

/** Passo 3 de §13.2: o ÚNICO caminho de `imovel_id`/`promovido_em`/
    `situacao='promovido'`. Idempotente com o MESMO `imovel_id` num registro
    já promovido (`repetida: true`); com outro, o banco recusa e a recusa é
    propagada como está — nunca "corrigida" pelo cliente. */
export async function vincularPromocaoIdentificado(
  imovelIdentificadoId: string,
  imovelId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoVinculoPromocao> {
  if (!UUID_PROSPECCAO.test(imovelIdentificadoId) || !UUID_PROSPECCAO.test(imovelId)) {
    throw new ErroProspeccao("par_invalido", "Escolha uma oportunidade válida para concluir o vínculo.");
  }
  const { data, error } = await client.rpc("vincular_promocao_imovel_identificado", {
    p_imovel_identificado_id: imovelIdentificadoId,
    p_imovel_id: imovelId,
  });
  const resposta = data as RespostaRpc | null;
  if (error || resposta?.ok !== true) {
    falhaPromocao(
      error?.code ?? resposta?.codigo ?? "resposta_rpc_invalida",
      error?.message ?? "Não foi possível concluir o vínculo. A oportunidade continua no Pipeline; tente de novo.",
    );
  }
  if (resposta.imovel_id !== imovelId) {
    throw new ErroProspeccao("resposta_rpc_invalida", "O retorno do vínculo não pôde ser confirmado. Atualize a lista antes de continuar.");
  }
  esquecerOportunidadeCriada(imovelIdentificadoId);
  return { repetida: resposta.repetida === true, imovelId };
}

/* Memória de SESSÃO da promoção parcial (§13.2): `salvarImovel` criou o
   `Imovel` e o vínculo falhou. O retry usa EXATAMENTE este id — não
   pesquisa outro, não cria outro, não adivinha. Some com o reload; aí a
   recuperação passa a ser a escolha humana entre oportunidades elegíveis. */
const oportunidadesCriadasNaSessao: Record<string, string> = {};

export function lembrarOportunidadeCriada(imovelIdentificadoId: string, imovelId: string): void {
  oportunidadesCriadasNaSessao[imovelIdentificadoId] = imovelId;
}

export function oportunidadeCriadaNaSessao(imovelIdentificadoId: string): string | null {
  return oportunidadesCriadasNaSessao[imovelIdentificadoId] ?? null;
}

export function esquecerOportunidadeCriada(imovelIdentificadoId: string): void {
  delete oportunidadesCriadasNaSessao[imovelIdentificadoId];
}

/** Os `imoveis.id` já reivindicados por algum identificado da conta (RLS).
    A recuperação após reload oferece só o que NÃO está aqui — o `not
    exists` de §13.2, resolvido do lado do Garimpo, sem consultar `imoveis`. */
export async function listarImoveisJaVinculados(
  client: SupabaseClient = getSupabase(),
): Promise<Set<string>> {
  const { data, error } = await client
    .from("imoveis_identificados")
    .select("imovel_id")
    .not("imovel_id", "is", null);
  if (error) falha(error);
  return new Set(
    ((data ?? []) as Linha[])
      .map((linha) => linha.imovel_id)
      .filter((valor): valor is string => typeof valor === "string"),
  );
}

/* ----------------------------------------------------------------
   INVESTIGAÇÃO (C10 → C13B) — a data é do servidor.

   `ultima_investigacao_em` continua sendo a única coluna de investigação
   da identidade (as derivadas `nunca-investigado` /
   `investigado-ha-mais-de-90-dias` são leitura sobre ela). Desde o C13B
   o navegador não a escreve mais: quem anota é a RPC de servidor
   `registrar_investigacao_identificado`, na mesma transação que grava o
   evento e as descobertas da memória. Uma fonte de verdade; o trigger
   `proteger_identificado` segue normalizando o instante por `now()`.
   ---------------------------------------------------------------- */

/* ----------------------------------------------------------------
   VIGÊNCIA DERIVADA (C9) — nenhuma coluna "atual".

   As etiquetas do avistamento corrente são as ATUAIS; as demais são
   histórico, com a data em que foram vistas por último. É a leitura de
   `etiquetasDoImovel()` (núcleo puro) sobre tudo o que o detalhe carrega —
   feita aqui uma vez, para o card, o painel e a lista lerem a mesma coisa.
   ---------------------------------------------------------------- */
export function leituraDeEtiqueta(etiqueta: EtiquetaIdentificado): EtiquetaProspeccaoLeitura {
  return {
    categoria: etiqueta.categoria,
    codigo: etiqueta.codigo,
    avistamentoId: etiqueta.avistamentoId,
    revisaoObservacao: etiqueta.revisaoObservacao,
    observadoEm: etiqueta.observadoEm,
    createdAt: etiqueta.criadoEm,
    estado: etiqueta.estado,
    origem: etiqueta.origem,
    confianca: etiqueta.confianca,
  };
}

/** Por código: atual (vigente no avistamento corrente) ou histórica, com
    `ultimaVezObservado`. Nunca a união ingênua de todos os avistamentos. */
export function vigenciaDasEtiquetas(detalhe: DetalheImovelIdentificado): EtiquetaDoImovel[] {
  const corrente = detalhe.avistamentos.find(
    (avistamento) => avistamento.id === detalhe.identificado.avistamentoCorrenteId,
  ) ?? null;
  const todas = [
    ...detalhe.etiquetasDoImovel,
    ...detalhe.avistamentos.flatMap((avistamento) => avistamento.etiquetas),
  ].map(leituraDeEtiqueta);
  return etiquetasDoImovel(
    todas,
    corrente ? { id: corrente.id, observacaoRevisao: corrente.observacaoRevisao } : null,
  );
}

/* ----------------------------------------------------------------
   CLASSIFICAÇÃO POR IA (C8) — o navegador manda SÓ o id do avistamento.

   O texto, a revisão e o tipo declarado são relidos do banco pela rota; o
   claim, o lease e a conclusão são do banco. Aqui não há decisão nenhuma:
   pede-se, lê-se a resposta e depois relê-se o detalhe. IA indisponível
   (dev, Preview, sem permissão) NÃO é erro para o usuário — o avistamento
   fica "aguardando classificação" e a tela mostra isso pelo estado.
   ---------------------------------------------------------------- */
export interface ResultadoClassificacaoAvistamento {
  ok: boolean;
  repetida: boolean;
  estado: EstadoClassificacaoAvistamento | null;
  modo: ModoClassificacaoProspeccao | null;
  etiquetas: { categoria: CategoriaEtiquetaProspeccao; codigo: CodigoEtiquetaProspeccao; confianca: number }[];
  tipo: { sugerido: TipoImovelProspeccao; confianca: number | null } | null;
  snapshotAplicado: boolean;
  /** Código fechado da rota (`nao-configurado`, `ocupado`, `limite-diario`…). */
  falha: string | null;
}

export async function classificarAvistamento(
  avistamentoId: string,
  client: SupabaseClient = getSupabase(),
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoClassificacaoAvistamento> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new ErroProspeccao("sessao_expirada", "Sua sessão expirou. Entre novamente.");
  const resposta = await fetchImpl("/api/prospeccao/classificar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ avistamentoId }),
  });
  const corpo = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo || typeof corpo.ok !== "boolean") throw new ErroProspeccao("resposta_rota_invalida");
  const etiquetas = Array.isArray(corpo.etiquetas) ? corpo.etiquetas : [];
  const tipo = corpo.tipo && typeof corpo.tipo === "object"
    ? (corpo.tipo as { sugerido: TipoImovelProspeccao; confianca: number | null })
    : null;
  return {
    ok: corpo.ok,
    repetida: corpo.repetida === true,
    estado: typeof corpo.estado === "string" ? (corpo.estado as EstadoClassificacaoAvistamento) : null,
    modo: corpo.modo === "modelo" || corpo.modo === "reuso" ? corpo.modo : null,
    etiquetas: etiquetas as ResultadoClassificacaoAvistamento["etiquetas"],
    tipo,
    snapshotAplicado: corpo.snapshotAplicado === true,
    falha: typeof corpo.falha === "string" ? corpo.falha : null,
  };
}

/* ----------------------------------------------------------------
   EXCLUSÃO COORDENADA — o navegador NUNCA apaga arquivo nem linha.

   Quem remove é a rota, com service role e na ordem objeto → linha. Aqui
   só se pede, se relê o resultado honesto e se cancela pela RPC do
   navegador. Retomar é chamar de novo: a rota é idempotente.
   ---------------------------------------------------------------- */
async function chamarRotaExclusao(
  pedido: PedidoExclusaoProspeccao,
  client: SupabaseClient,
  fetchImpl: typeof fetch,
): Promise<ResultadoExclusaoProspeccao> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new ErroProspeccao("sessao_expirada", "Sua sessão expirou. Entre novamente.");
  const resposta = await fetchImpl("/api/prospeccao/excluir", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(pedido),
  });
  const corpo = (await resposta.json().catch(() => null)) as
    | (Partial<ResultadoExclusaoProspeccao> & { falha?: string })
    | null;
  if (!resposta.ok || !corpo || typeof corpo.concluido !== "boolean") {
    throw new ErroProspeccao(corpo?.falha ?? "resposta_rota_invalida");
  }
  return {
    removidos: Number(corpo.removidos ?? 0),
    pendentes: Number(corpo.pendentes ?? 0),
    prefixoVazio: corpo.prefixoVazio === true,
    concluido: corpo.concluido,
  };
}

/** Hard delete de uma identidade. Chamar de novo retoma de onde parou. */
export function excluirIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoExclusaoProspeccao> {
  return chamarRotaExclusao({ imovelIdentificadoId }, client, fetchImpl);
}

/** Remove uma foto isolada pela mesma rota. Falha de Storage deixa a foto onde está. */
export function removerFotoAvistamento(
  fotoId: string,
  client: SupabaseClient = getSupabase(),
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoExclusaoProspeccao> {
  return chamarRotaExclusao({ fotoId }, client, fetchImpl);
}

/** "Apagar todos os meus dados": o módulo inteiro, Storage incluído. */
export function apagarProspeccaoDoUsuario(
  client: SupabaseClient = getSupabase(),
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoExclusaoProspeccao> {
  return chamarRotaExclusao({ tudo: true }, client, fetchImpl);
}

/** A saída de quem começou por engano. As fotos já removidas não voltam. */
export async function cancelarExclusaoIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoRpcProspeccao> {
  const resposta = await chamarRpc(client, "cancelar_exclusao_imovel_identificado", {
    p_imovel_identificado_id: imovelIdentificadoId,
  });
  return { repetida: resposta.repetida === true };
}

/** Conta sob RLS o que a exclusão vai alcançar: fotos (inclusive reservas) e lápides. */
export async function previaExclusaoIdentificado(
  imovelIdentificadoId: string,
  client: SupabaseClient = getSupabase(),
): Promise<PreviaExclusaoIdentificado> {
  const [fotos, lapides] = await Promise.all([
    client
      .from("imoveis_identificados_fotos")
      .select("id", { count: "exact", head: true })
      .eq("imovel_identificado_id", imovelIdentificadoId),
    client
      .from("imoveis_identificados")
      .select("id", { count: "exact", head: true })
      .eq("fundido_em_imovel_id", imovelIdentificadoId)
      .eq("situacao", "fundido"),
  ]);
  if (fotos.error) falha(fotos.error);
  if (lapides.error) falha(lapides.error);
  return { fotosTotal: fotos.count ?? 0, lapidesTotal: lapides.count ?? 0 };
}

/* ----------------------------------------------------------------
   DEDUPE (C7) — só a consulta. O veredito é do núcleo puro
   (`encontrarDuplicatasProspeccao`), e ele avisa: nunca bloqueia, nunca
   funde, nunca promove. Duas fontes de candidatos, dentro da conta (RLS):
   a chave textual persistida (`endereco_chave`, índice por usuário) e a
   bounding box sobre `(user_id, latitude, longitude)` — pré-filtro; a
   distância que decide é o haversine do núcleo. Lápides e registros em
   exclusão não entram: não são operáveis.

   O pré-filtro não pode escolher quais candidatos o algoritmo vai ver:
   um prédio com 21 unidades na mesma coordenada encheria um limite de 20
   com linhas que o veto de unidade descarta, e a casa ao lado — a
   duplicata real — nunca chegaria ao haversine. Por isso as duas
   consultas são lidas até o fim, em páginas com ordem estável.
   ---------------------------------------------------------------- */
const PAGINA_CANDIDATOS_DEDUPE = 100;

type ConsultaCandidatos = {
  order: (coluna: string, opcoes: { ascending: boolean }) => ConsultaCandidatos;
  range: (inicio: number, fim: number) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Lê TODAS as páginas de uma consulta: a bounding box é pequena, mas nunca
    é o banco quem decide quem fica de fora. */
async function lerTodasAsPaginas(montar: () => ConsultaCandidatos): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let inicio = 0; ; inicio += PAGINA_CANDIDATOS_DEDUPE) {
    const { data, error } = await montar()
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA_CANDIDATOS_DEDUPE - 1);
    if (error) falha(error);
    const pagina = (data ?? []) as Linha[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA_CANDIDATOS_DEDUPE) return linhas;
  }
}

/** A projeção que o núcleo entende, a partir da identidade lida. */
export function identidadeParaDedupe(identificado: ImovelIdentificado): IdentidadeParaDedupe {
  return {
    id: identificado.id,
    logradouro: identificado.logradouro,
    numero: identificado.numero,
    cidade: identificado.cidade,
    unidade: identificado.unidade,
    bloco: identificado.bloco,
    tipo: identificado.tipo,
    latitude: identificado.latitude,
    longitude: identificado.longitude,
    acuraciaMetros: identificado.acuraciaMetros,
  };
}

export async function buscarCandidatosDuplicidade(
  alvo: IdentidadeParaDedupe,
  client: SupabaseClient = getSupabase(),
): Promise<ImovelIdentificado[]> {
  const base = () => {
    let consulta = client
      .from("imoveis_identificados")
      .select(COLUNAS_IDENTIFICADO)
      .neq("situacao", "fundido")
      .is("exclusao_solicitada_em", null);
    if (UUID_PROSPECCAO.test(alvo.id)) consulta = consulta.neq("id", alvo.id);
    return consulta;
  };

  const consultas: Promise<Linha[]>[] = [];
  const chave = chaveImovelIdentificado(alvo);
  if (chaveEndereco([alvo.logradouro, alvo.numero].filter(Boolean).join(", "))) {
    consultas.push(lerTodasAsPaginas(() => base().eq("endereco_chave", chave)));
  }
  if (geografiaOpina(alvo)) {
    const caixa = caixaBuscaGeografica(alvo.latitude!, alvo.longitude!, raioBuscaCandidatosMetros(alvo));
    consultas.push(lerTodasAsPaginas(() => base()
      .gte("latitude", caixa.latitudeMinima)
      .lte("latitude", caixa.latitudeMaxima)
      .gte("longitude", caixa.longitudeMinima)
      .lte("longitude", caixa.longitudeMaxima)));
  }
  if (!consultas.length) return [];

  const porId = new Map<string, ImovelIdentificado>();
  for (const linhas of await Promise.all(consultas)) {
    for (const linha of linhas) {
      const identificado = mapearIdentificado(linha);
      porId.set(identificado.id, identificado);
    }
  }
  return [...porId.values()];
}
