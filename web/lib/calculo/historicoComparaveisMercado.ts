/* ================================================================
   FATOS HISTÓRICOS DE COMPARÁVEIS DE MERCADO

   Este módulo interpreta somente observações positivas persistidas. Uma
   ausência na amostra ou uma falha de portal não é uma observação e, por
   isso, nunca entra aqui como status, retirada ou negócio concluído.

   O histórico legado não registra necessariamente todas as aparições: o
   trigger conserva criação, mudanças e uma confirmação por dia, e parte do
   catálogo antecede a tabela de observações. Por isso distinguimos eventos
   persistidos de quantidade mínima comprovável, sem inventar uma contagem.
   ================================================================ */
import { PORTAIS_ANGARIACAO } from "./centralAngariacao";
import { normalizarUf, ufValida } from "./geografia";
import { chaveNormalizada } from "../normalizacao";
import { timestampDeIso } from "../datas";

export type TipoEventoHistoricoComparavel =
  | "novo"
  | "reobservado"
  | "preco_alterado"
  | "status_alterado"
  | "preco_e_status_alterados"
  | "reapareceu";

export type StatusHistoricoComparavel =
  | "ativo"
  | "nao_encontrado"
  | "removido"
  | "historico"
  | "possivel_negociado"
  | "desconhecido";

export interface SnapshotObservacaoComparavel {
  valorAnterior?: unknown;
  statusAnterior?: unknown;
  /**
   * Não existe nos registros legados. Só pode ser `true` quando a fronteira
   * que produziu a observação provar a origem explícita do status anterior.
   */
  statusAnteriorExplicitamenteObservado?: boolean;
}

export interface ObservacaoPositivaComparavel {
  observadoEm: string | null;
  tipoEvento: TipoEventoHistoricoComparavel;
  valorAnunciado: number | string | null;
  statusAnuncio: string | null;
  dadosSnapshot?: SnapshotObservacaoComparavel | null;
  /**
   * Ausente por padrão: nomes de evento ou valores legados não provam, por si
   * sós, que o portal declarou um status. A presença do anúncio prova apenas
   * que ele foi observado naquele instante.
   */
  statusExplicitamenteObservado?: boolean;
}

export interface ReferenciaHistoricaComparavel {
  primeiroVistoEm: string | null;
  ultimoVistoEm: string | null;
  portal: string | null;
  idExterno?: string | null;
  urlCanonica?: string | null;
  fingerprintForte?: boolean;
  estado?: string | null;
  cidadeChave?: string | null;
}

export interface AlteracaoPrecoObservada {
  observadoEm: string;
  valorAnterior: number;
  valorAtual: number;
  diferenca: number;
  origemComparacao: "observacoes-consecutivas" | "snapshot-da-persistencia";
}

export interface AlteracaoStatusObservada {
  observadoEm: string;
  statusAnterior: StatusHistoricoComparavel;
  statusAtual: StatusHistoricoComparavel;
}

export interface QualidadeHistoricaComparavel {
  portalConhecido: boolean;
  identidadeConfiavel: boolean;
  localizacaoConhecida: boolean;
  datasConsistentes: boolean;
  precoObservado: boolean;
  reobservacaoComprovada: boolean;
  inicioDoHistoricoPersistidoComprovado: boolean;
  contagemCompletaDeObservacoesConhecida: false;
}

export interface FatosHistoricosComparavel {
  primeiraObservacaoConhecida: string | null;
  ultimaObservacaoConhecida: string | null;
  quantidadeEventosPersistidos: number;
  quantidadeMinimaObservacoesComprovadas: number;
  foiReobservado: boolean;
  alteracoesPrecoObservadas: AlteracaoPrecoObservada[];
  alteracoesStatusObservadas: AlteracaoStatusObservada[];
  reaparecimentosComprovados: number;
  ultimoStatusExplicitamenteObservado: StatusHistoricoComparavel | null;
  qualidade: QualidadeHistoricaComparavel;
}

const STATUS_VALIDOS = new Set<StatusHistoricoComparavel>([
  "ativo",
  "nao_encontrado",
  "removido",
  "historico",
  "possivel_negociado",
  "desconhecido",
]);

function numeroPositivo(valor: unknown): number | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function statusValido(valor: unknown): StatusHistoricoComparavel | null {
  if (typeof valor !== "string") return null;
  const normalizado = valor.trim().toLowerCase() as StatusHistoricoComparavel;
  return STATUS_VALIDOS.has(normalizado) ? normalizado : null;
}

function ordenarObservacoes(observacoes: readonly ObservacaoPositivaComparavel[]) {
  return observacoes
    .flatMap((observacao) => {
      const instante = timestampDeIso(observacao.observadoEm);
      return instante === null || !observacao.observadoEm ? [] : [{ observacao, instante }];
    })
    .sort((a, b) => a.instante - b.instante);
}

/**
 * Incorpora somente uma observação positiva válida. `null` representa que
 * não houve observação — seja por ausência na amostra, portal indisponível ou
 * coleta não executada — e conserva o histórico exatamente como estava.
 */
export function incorporarObservacaoPositiva(
  historico: readonly ObservacaoPositivaComparavel[],
  observacao: ObservacaoPositivaComparavel | null,
): readonly ObservacaoPositivaComparavel[] {
  if (!observacao || timestampDeIso(observacao.observadoEm) === null) return historico;
  return [...historico, observacao];
}

function extremosTemporais(
  referencia: ReferenciaHistoricaComparavel,
  observacoes: ReturnType<typeof ordenarObservacoes>,
) {
  const candidatos = [
    referencia.primeiroVistoEm,
    referencia.ultimoVistoEm,
    ...observacoes.map(({ observacao }) => observacao.observadoEm),
  ].flatMap((valor) => {
    const instante = timestampDeIso(valor);
    return instante === null || !valor ? [] : [{ valor, instante }];
  });
  if (!candidatos.length) return { primeira: null, ultima: null, instantes: new Set<number>() };
  candidatos.sort((a, b) => a.instante - b.instante);
  return {
    primeira: candidatos[0].valor,
    ultima: candidatos.at(-1)!.valor,
    instantes: new Set(candidatos.map(({ instante }) => instante)),
  };
}

function alteracoesDePreco(
  observacoes: ReturnType<typeof ordenarObservacoes>,
): AlteracaoPrecoObservada[] {
  const alteracoes: AlteracaoPrecoObservada[] = [];
  observacoes.forEach(({ observacao }, indice) => {
    const atual = numeroPositivo(observacao.valorAnunciado);
    if (atual === null || !observacao.observadoEm) return;
    const eventoRegistraPreco = observacao.tipoEvento === "preco_alterado"
      || observacao.tipoEvento === "preco_e_status_alterados";
    const anteriorDoSnapshot = eventoRegistraPreco
      ? numeroPositivo(observacao.dadosSnapshot?.valorAnterior)
      : null;
    const anteriorDaObservacao = indice > 0
      ? numeroPositivo(observacoes[indice - 1].observacao.valorAnunciado)
      : null;
    const anterior = anteriorDoSnapshot ?? anteriorDaObservacao;
    if (anterior === null || anterior === atual) return;
    alteracoes.push({
      observadoEm: observacao.observadoEm,
      valorAnterior: anterior,
      valorAtual: atual,
      diferenca: atual - anterior,
      origemComparacao: anteriorDoSnapshot === null
        ? "observacoes-consecutivas"
        : "snapshot-da-persistencia",
    });
  });
  return alteracoes;
}

function alteracoesDeStatus(
  observacoes: ReturnType<typeof ordenarObservacoes>,
): AlteracaoStatusObservada[] {
  const alteracoes: AlteracaoStatusObservada[] = [];
  observacoes.forEach(({ observacao }, indice) => {
    if (!observacao.statusExplicitamenteObservado || !observacao.observadoEm) return;
    const atual = statusValido(observacao.statusAnuncio);
    if (!atual) return;

    const anteriorPersistido = observacao.dadosSnapshot?.statusAnteriorExplicitamenteObservado
      ? statusValido(observacao.dadosSnapshot.statusAnterior)
      : null;
    const anteriorObservado = indice > 0
      && observacoes[indice - 1].observacao.statusExplicitamenteObservado
      ? statusValido(observacoes[indice - 1].observacao.statusAnuncio)
      : null;
    const anterior = anteriorPersistido ?? anteriorObservado;
    if (!anterior || anterior === atual) return;
    alteracoes.push({ observadoEm: observacao.observadoEm, statusAnterior: anterior, statusAtual: atual });
  });
  return alteracoes;
}

/** Deriva fatos sem interpretar silêncio, idade ou falha de coleta. */
export function derivarFatosHistoricosComparavel(
  referencia: ReferenciaHistoricaComparavel,
  observacoesBrutas: readonly ObservacaoPositivaComparavel[],
): FatosHistoricosComparavel {
  const observacoes = ordenarObservacoes(observacoesBrutas);
  const extremos = extremosTemporais(referencia, observacoes);
  const alteracoesPrecoObservadas = alteracoesDePreco(observacoes);
  const alteracoesStatusObservadas = alteracoesDeStatus(observacoes);
  const statusExplicitos = observacoes
    .filter(({ observacao }) => observacao.statusExplicitamenteObservado)
    .map(({ observacao }) => statusValido(observacao.statusAnuncio))
    .filter((status): status is StatusHistoricoComparavel => status !== null);
  const quantidadeMinimaObservacoesComprovadas = Math.max(observacoes.length, extremos.instantes.size);
  const portal = chaveNormalizada(referencia.portal);
  const portalConhecido = PORTAIS_ANGARIACAO.some((item) => item === portal);
  const temIdentidadePublica = portalConhecido && !!referencia.idExterno?.trim();
  const temUrlCanonica = /^https?:\/\//i.test(referencia.urlCanonica?.trim() || "");
  const identidadeConfiavel = temIdentidadePublica || temUrlCanonica || referencia.fingerprintForte === true;
  const localizacaoConhecida = ufValida(normalizarUf(referencia.estado))
    && !!chaveNormalizada(referencia.cidadeChave);
  const primeiraPersistida = observacoes[0];
  const primeiroVisto = timestampDeIso(referencia.primeiroVistoEm);
  const ultimoVisto = timestampDeIso(referencia.ultimoVistoEm);
  const inicioDoHistoricoPersistidoComprovado = !!primeiraPersistida
    && primeiraPersistida.observacao.tipoEvento === "novo"
    && primeiroVisto !== null
    && primeiraPersistida.instante === primeiroVisto;

  return {
    primeiraObservacaoConhecida: extremos.primeira,
    ultimaObservacaoConhecida: extremos.ultima,
    quantidadeEventosPersistidos: observacoes.length,
    quantidadeMinimaObservacoesComprovadas,
    foiReobservado: quantidadeMinimaObservacoesComprovadas >= 2,
    alteracoesPrecoObservadas,
    alteracoesStatusObservadas,
    reaparecimentosComprovados: alteracoesStatusObservadas
      .filter(({ statusAnterior, statusAtual }) => statusAnterior !== "ativo" && statusAtual === "ativo")
      .length,
    ultimoStatusExplicitamenteObservado: statusExplicitos.at(-1) ?? null,
    qualidade: {
      portalConhecido,
      identidadeConfiavel,
      localizacaoConhecida,
      datasConsistentes: primeiroVisto !== null
        && ultimoVisto !== null
        && primeiroVisto <= ultimoVisto,
      precoObservado: observacoes.some(({ observacao }) => numeroPositivo(observacao.valorAnunciado) !== null),
      reobservacaoComprovada: quantidadeMinimaObservacoesComprovadas >= 2,
      inicioDoHistoricoPersistidoComprovado,
      contagemCompletaDeObservacoesConhecida: false,
    },
  };
}
