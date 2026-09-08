/* ================================================================
   REPASSES DE ANGARIAÇÃO — contratos e fronteira Supabase

   O cálculo de datas não mora aqui. Prévia e confirmação chamam a mesma
   função SQL (`private.calcular_datas_repasse`) por meio dos RPCs públicos.
   Assim o navegador nunca persiste uma data calculada por ele próprio.
   ================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./persistencia/supabase";

export type EventoOrigemRepasse = "locacao" | "primeiro_aluguel_pago" | "contrato_assinado" | "manual";
export type RegraPrimeiroVencimento = "mes_seguinte" | "proximo_vencimento" | "informado_manualmente";
export type TipoPrazoRepasse = "apos_primeiro_vencimento" | "apos_locacao" | "apos_recebimento" | "manual";
export type TipoContagemRepasse = "corridos" | "uteis";
export type AjusteDataNaoUtil = "manter" | "proximo_dia_util" | "dia_util_anterior";

export interface PoliticaRepasse {
  id: string;
  nome: string;
  descricao: string;
  eventoOrigem: EventoOrigemRepasse;
  regraPrimeiroVencimento: RegraPrimeiroVencimento;
  diasVencimento: number[];
  tipoPrazo: TipoPrazoRepasse;
  quantidadeDias: number | null;
  tipoContagem: TipoContagemRepasse;
  ajusteFimSemana: AjusteDataNaoUtil;
  ajusteFeriado: AjusteDataNaoUtil;
  ativo: boolean;
  padrao: boolean;
}

export interface ItemLocacaoRepasse {
  imovelId: string;
  dataLocacao: string;
  diaVencimento?: number | null;
  primeiroVencimento?: string | null;
  dataPrevista?: string | null;
}

export interface ItemPreviaRepasse {
  imovelId: string;
  rotulo: string;
  endereco: string;
  dataLocacao: string;
  diaVencimento: number | null;
  primeiroVencimento: string;
  dataPrevista: string;
}

export interface ErroLoteRepasse {
  imovelId?: string;
  rotulo?: string;
  codigo: string;
  mensagem: string;
}

export interface ResultadoPreviaRepasse {
  ok: boolean;
  politica?: { id: string; nome: string };
  itens: ItemPreviaRepasse[];
  erros: ErroLoteRepasse[];
  repetida?: boolean;
  totalImoveis?: number;
  totalRepasses?: number;
}

export interface RepasseAngariacao {
  id: string;
  imovelId: string;
  codigo: string;
  endereco: string;
  locacaoId: string;
  numeroCiclo: number;
  dataLocacao: string;
  primeiroVencimento: string;
  dataPrevista: string;
  status: "pendente" | "recebido" | "cancelado";
  valorPrevisto: number | null;
  dataRecebimento: string | null;
  valorRecebido: number | null;
  politicaNome: string;
  politicaSnapshot: Record<string, unknown>;
  criadoPor: string;
  recebidoPor: string | null;
  createdAt: string;
}

interface DbPoliticaRepasse {
  id: string;
  nome: string;
  descricao: string | null;
  evento_origem: EventoOrigemRepasse;
  regra_primeiro_vencimento: RegraPrimeiroVencimento;
  dias_vencimento: number[] | null;
  tipo_prazo: TipoPrazoRepasse;
  quantidade_dias: number | null;
  tipo_contagem: TipoContagemRepasse;
  ajuste_fim_semana: AjusteDataNaoUtil;
  ajuste_feriado: AjusteDataNaoUtil;
  ativo: boolean;
  padrao: boolean;
}

function politicaDoBanco(row: DbPoliticaRepasse): PoliticaRepasse {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao || "",
    eventoOrigem: row.evento_origem,
    regraPrimeiroVencimento: row.regra_primeiro_vencimento,
    diasVencimento: (row.dias_vencimento || []).map(Number).filter((dia) => dia >= 1 && dia <= 31),
    tipoPrazo: row.tipo_prazo,
    quantidadeDias: row.quantidade_dias == null ? null : Number(row.quantidade_dias),
    tipoContagem: row.tipo_contagem,
    ajusteFimSemana: row.ajuste_fim_semana,
    ajusteFeriado: row.ajuste_feriado,
    ativo: row.ativo,
    padrao: row.padrao,
  };
}

export function novaPoliticaRepasse(): PoliticaRepasse {
  return {
    id: crypto.randomUUID(),
    nome: "Repasse padrão",
    descricao: "",
    eventoOrigem: "locacao",
    regraPrimeiroVencimento: "mes_seguinte",
    diasVencimento: [],
    tipoPrazo: "apos_primeiro_vencimento",
    quantidadeDias: 0,
    tipoContagem: "corridos",
    ajusteFimSemana: "manter",
    ajusteFeriado: "manter",
    ativo: true,
    padrao: true,
  };
}

export function validarPoliticaRepasse(politica: PoliticaRepasse): string[] {
  const erros: string[] = [];
  if (!politica.nome.trim()) erros.push("Informe o nome da política.");
  if (politica.eventoOrigem !== "locacao") erros.push("Neste momento, o evento disponível é imóvel locado.");
  if (politica.regraPrimeiroVencimento !== "informado_manualmente" && politica.diasVencimento.length === 0) {
    erros.push("Informe ao menos um dia de vencimento.");
  }
  if (politica.diasVencimento.some((dia) => !Number.isInteger(dia) || dia < 1 || dia > 31)) {
    erros.push("Os dias de vencimento devem ser inteiros entre 1 e 31.");
  }
  if (new Set(politica.diasVencimento).size !== politica.diasVencimento.length) {
    erros.push("Não repita dias de vencimento.");
  }
  if (politica.tipoPrazo === "apos_recebimento") erros.push("Prazo após recebimento ainda não está disponível.");
  if (politica.tipoPrazo !== "manual" && (
    politica.quantidadeDias == null || !Number.isInteger(politica.quantidadeDias) ||
    politica.quantidadeDias < 0 || politica.quantidadeDias > 365
  )) erros.push("O prazo deve ser um número inteiro entre 0 e 365 dias.");
  if (politica.ajusteFeriado !== "manter") erros.push("Ajustes por feriado ainda não estão disponíveis.");
  return erros;
}

export async function carregarPoliticasRepasse(
  client: SupabaseClient = getSupabase(),
): Promise<PoliticaRepasse[]> {
  const { data, error } = await client
    .from("politicas_repasse")
    .select("*")
    .order("padrao", { ascending: false })
    .order("nome");
  if (error) throw error;
  return ((data || []) as DbPoliticaRepasse[]).map(politicaDoBanco);
}

export async function salvarPoliticaRepasse(
  politica: PoliticaRepasse,
  userId: string,
  client: SupabaseClient = getSupabase(),
): Promise<PoliticaRepasse> {
  const erros = validarPoliticaRepasse(politica);
  if (erros.length > 0) throw new Error(erros.join(" "));
  const dias = [...new Set(politica.diasVencimento)].sort((a, b) => a - b);
  const { data, error } = await client.from("politicas_repasse").upsert({
    id: politica.id,
    user_id: userId,
    nome: politica.nome.trim(),
    descricao: politica.descricao.trim() || null,
    evento_origem: politica.eventoOrigem,
    regra_primeiro_vencimento: politica.regraPrimeiroVencimento,
    dias_vencimento: dias,
    tipo_prazo: politica.tipoPrazo,
    quantidade_dias: politica.tipoPrazo === "manual" ? null : politica.quantidadeDias,
    tipo_contagem: politica.tipoContagem,
    ajuste_fim_semana: politica.ajusteFimSemana,
    ajuste_feriado: politica.ajusteFeriado,
    ajuste_dia_inexistente: "ultimo_dia_mes",
    ativo: politica.ativo,
    padrao: politica.padrao,
  }).select("*").single();
  if (error) throw error;
  return politicaDoBanco(data as DbPoliticaRepasse);
}

function itensParaRpc(itens: ItemLocacaoRepasse[]) {
  return itens.map((item) => ({
    imovel_id: item.imovelId,
    data_locacao: item.dataLocacao,
    dia_vencimento: item.diaVencimento ?? null,
    primeiro_vencimento: item.primeiroVencimento || null,
    data_prevista: item.dataPrevista || null,
  }));
}

function resultadoRpc(data: unknown): ResultadoPreviaRepasse {
  const valor = (data || {}) as Record<string, unknown>;
  return {
    ok: valor.ok === true,
    politica: valor.politica as ResultadoPreviaRepasse["politica"],
    itens: Array.isArray(valor.itens)
      ? (valor.itens as Array<Record<string, unknown>>).map((item) => ({
          imovelId: String(item.imovel_id || ""),
          rotulo: String(item.rotulo || ""),
          endereco: String(item.endereco || ""),
          dataLocacao: String(item.data_locacao || ""),
          diaVencimento: item.dia_vencimento == null ? null : Number(item.dia_vencimento),
          primeiroVencimento: String(item.primeiro_vencimento || ""),
          dataPrevista: String(item.data_prevista || ""),
        }))
      : [],
    erros: Array.isArray(valor.erros)
      ? (valor.erros as Array<Record<string, unknown>>).map((erro) => ({
          imovelId: erro.imovel_id ? String(erro.imovel_id) : undefined,
          rotulo: erro.rotulo ? String(erro.rotulo) : undefined,
          codigo: String(erro.codigo || "erro"),
          mensagem: String(erro.mensagem || "Não foi possível validar o item."),
        }))
      : [],
    repetida: valor.repetida === true,
    totalImoveis: valor.total_imoveis == null ? undefined : Number(valor.total_imoveis),
    totalRepasses: valor.total_repasses == null ? undefined : Number(valor.total_repasses),
  };
}

export async function preverRepassesLocacao(
  politicaId: string,
  itens: ItemLocacaoRepasse[],
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoPreviaRepasse> {
  const { data, error } = await client.rpc("prever_repasses_locacao", {
    p_politica_id: politicaId,
    p_itens: itensParaRpc(itens),
  });
  if (error) throw error;
  return resultadoRpc(data);
}

export async function locarImoveisEmLote(
  operacaoId: string,
  politicaId: string,
  itens: ItemLocacaoRepasse[],
  client: SupabaseClient = getSupabase(),
): Promise<ResultadoPreviaRepasse> {
  const { data, error } = await client.rpc("locar_imoveis_em_lote", {
    p_operacao_id: operacaoId,
    p_politica_id: politicaId,
    p_itens: itensParaRpc(itens),
  });
  if (error) throw error;
  return resultadoRpc(data);
}

export async function receberRepassesEmLote(
  operacaoId: string,
  repasseIds: string[],
  dataRecebimento: string,
  client: SupabaseClient = getSupabase(),
): Promise<{ ok: boolean; repetida: boolean; totalRecebidos: number; erros: ErroLoteRepasse[] }> {
  const { data, error } = await client.rpc("receber_repasses_em_lote", {
    p_operacao_id: operacaoId,
    p_repasse_ids: repasseIds,
    p_data_recebimento: dataRecebimento,
  });
  if (error) throw error;
  const valor = (data || {}) as Record<string, unknown>;
  return {
    ok: valor.ok === true,
    repetida: valor.repetida === true,
    totalRecebidos: Number(valor.total_recebidos || (Array.isArray(valor.itens) ? valor.itens.length : 0)),
    erros: Array.isArray(valor.erros)
      ? (valor.erros as Array<Record<string, unknown>>).map((erro) => ({
          imovelId: erro.imovel_id ? String(erro.imovel_id) : undefined,
          rotulo: erro.rotulo ? String(erro.rotulo) : undefined,
          codigo: String(erro.codigo || "erro"),
          mensagem: String(erro.mensagem || "Não foi possível receber o repasse."),
        }))
      : [],
  };
}

export async function carregarRepasses(
  client: SupabaseClient = getSupabase(),
  imovelId?: string,
): Promise<RepasseAngariacao[]> {
  let query = client.from("repasses").select(`
    id, imovel_id, locacao_id, primeiro_vencimento, data_prevista, status,
    valor_previsto, data_recebimento, valor_recebido, politica_snapshot,
    criado_por, recebido_por, created_at,
    locacoes!inner(numero_ciclo, data_locacao),
    imoveis!inner(codigo, endereco)
  `).order("data_prevista", { ascending: false });
  if (imovelId) query = query.eq("imovel_id", imovelId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const locacao = (row.locacoes || {}) as Record<string, unknown>;
    const imovel = (row.imoveis || {}) as Record<string, unknown>;
    const snapshot = (row.politica_snapshot || {}) as Record<string, unknown>;
    return {
      id: String(row.id),
      imovelId: String(row.imovel_id),
      codigo: String(imovel.codigo || ""),
      endereco: String(imovel.endereco || ""),
      locacaoId: String(row.locacao_id),
      numeroCiclo: Number(locacao.numero_ciclo || 1),
      dataLocacao: String(locacao.data_locacao || ""),
      primeiroVencimento: String(row.primeiro_vencimento || ""),
      dataPrevista: String(row.data_prevista || ""),
      status: row.status as RepasseAngariacao["status"],
      valorPrevisto: row.valor_previsto == null ? null : Number(row.valor_previsto),
      dataRecebimento: row.data_recebimento ? String(row.data_recebimento) : null,
      valorRecebido: row.valor_recebido == null ? null : Number(row.valor_recebido),
      politicaNome: String(snapshot.politica_nome || "Política não informada"),
      politicaSnapshot: snapshot,
      criadoPor: String(row.criado_por || ""),
      recebidoPor: row.recebido_por ? String(row.recebido_por) : null,
      createdAt: String(row.created_at || ""),
    };
  });
}
