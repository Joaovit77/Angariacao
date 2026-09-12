import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CategoriaEtiquetaProspeccao,
  CodigoEtiquetaProspeccao,
} from "./calculo/catalogoEtiquetas";
import { chaveEndereco, chaveImovel } from "./calculo/duplicidade";
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

export async function criarIdentificado(
  usuarioId: string,
  dados: DadosIdentificacao,
  primeiroAvistamento: DadosAvistamento,
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoCriacaoIdentificado> {
  const logradouro = textoOuNulo(dados.logradouro);
  const numero = textoOuNulo(dados.numero);
  const unidade = textoOuNulo(dados.unidade);
  const bloco = textoOuNulo(dados.bloco);
  const cidade = textoOuNulo(dados.cidade);
  const bairro = textoOuNulo(dados.bairro);
  const endereco = [logradouro, numero].filter(Boolean).join(", ");
  const { data: linhaIdentificado, error: erroIdentificado } = await client
    .from("imoveis_identificados")
    .insert({
      user_id: usuarioId,
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
