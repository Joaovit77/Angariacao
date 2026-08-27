import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { todayISO } from "@/lib/datas";
import { selecionarMensagensAtendimento } from "@/lib/ia/atendimento";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import type {
  AcaoAssistente,
  BlocoAssistente,
  ComandoUiAssistente,
  ContextoAssistente,
  EstadoAcaoAssistente,
  ItemHistoricoAssistente,
} from "@/lib/assistente/tipos";
import { executarFerramenta } from "./ferramentas";

export const FERRAMENTA_PREPARAR_AGENDAMENTO_VISITA = "preparar_agendamento_visita";
export const FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE = "abrir_revisao_followup_lote";
export const FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA = "preparar_rascunho_resposta";

export const DEFINICAO_FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE = {
  type: "function" as const,
  name: FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE,
  description: "Abre a revisao segura do follow-up em lote ja existente no Angario. Use somente quando o usuario pedir explicitamente para criar ou enviar follow-ups para varios proprietarios. Esta ferramenta nao envia mensagens: ela consulta a fila atual e abre a tela em que o usuario revisa destinatarios e textos antes de confirmar o envio.",
  strict: true,
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
} as const;

export const DEFINICAO_FERRAMENTA_AGENDAR_VISITA = {
  type: "function" as const,
  name: FERRAMENTA_PREPARAR_AGENDAMENTO_VISITA,
  description: "Prepara, mas nao executa, o agendamento de uma visita. Use somente quando o usuario pedir explicitamente para agendar uma visita e houver imovel, data e horario definidos. O backend valida e devolve um preview que ainda exige confirmacao por botao.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      imovel_codigo: { type: ["string", "null"], description: "Codigo visivel exato, por exemplo LD-152." },
      imovel_id: { type: ["string", "null"], description: "ID interno somente quando veio do contexto visual ou de uma ferramenta anterior." },
      data: { type: "string", description: "Data ISO YYYY-MM-DD ja resolvida." },
      hora: { type: "string", description: "Horario de 24 horas no formato HH:MM." },
    },
    required: ["imovel_codigo", "imovel_id", "data", "hora"],
    additionalProperties: false,
  },
} as const;

export const DEFINICAO_FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA = {
  type: "function" as const,
  name: FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA,
  description: "Prepara um rascunho de resposta personalizado a uma conversa existente e abre a revisao humana. Use somente quando o usuario pedir uma abordagem/resposta para um proprietario especifico, identificado por codigo ou por ID vindo de ferramenta/contexto. Nunca envia a mensagem.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      imovel_codigo: { type: ["string", "null"], description: "Codigo visivel exato, por exemplo LD-152." },
      imovel_id: { type: ["string", "null"], description: "ID interno somente quando veio do contexto visual ou de uma ferramenta anterior." },
    },
    required: ["imovel_codigo", "imovel_id"],
    additionalProperties: false,
  },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ESTADOS = new Set<EstadoAcaoAssistente>([
  "ready_for_confirmation",
  "succeeded",
  "cancelled",
  "expired",
  "failed",
]);

export interface ParametrosAgendarVisita {
  imovelId: string;
  data: string;
  hora: string;
  sessaoId: string;
}

export type ResultadoOperacaoAcao =
  | { ok: true; acao: AcaoAssistente; repetida?: boolean }
  | { ok: false; erro: string; codigo: string };

interface RespostaRpc {
  ok?: unknown;
  acao?: unknown;
  erro?: unknown;
  codigo?: unknown;
  repetida?: unknown;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarAcao(valor: unknown): AcaoAssistente | null {
  if (!valor || typeof valor !== "object") return null;
  const acao = valor as Record<string, unknown>;
  const entidade = acao.entidade && typeof acao.entidade === "object"
    ? acao.entidade as Record<string, unknown>
    : {};
  const dados = acao.dados && typeof acao.dados === "object"
    ? acao.dados as Record<string, unknown>
    : {};
  const resultado = acao.resultado && typeof acao.resultado === "object"
    ? acao.resultado as Record<string, unknown>
    : null;
  const estado = texto(acao.estado) as EstadoAcaoAssistente;
  if (
    !UUID.test(texto(acao.id))
    || acao.tipo !== "agendar_visita"
    || !ESTADOS.has(estado)
    || !UUID.test(texto(entidade.imovelId))
    || !DATA.test(texto(dados.data))
    || !HORA.test(texto(dados.hora))
  ) return null;
  const agendaId = texto(resultado?.agendaId);
  return {
    id: texto(acao.id),
    tipo: "agendar_visita",
    estado,
    expiraEm: texto(acao.expiraEm),
    operacao: "Agendar visita",
    impacto: texto(acao.impacto) || "Será criado um compromisso real na agenda.",
    entidade: {
      imovelId: texto(entidade.imovelId),
      codigo: texto(entidade.codigo) || "Sem código",
      endereco: texto(entidade.endereco) || "Endereço não informado",
      responsavel: texto(entidade.responsavel) || "Não informado",
    },
    dados: { data: texto(dados.data), hora: texto(dados.hora) },
    ...(agendaId && UUID.test(agendaId) ? { resultado: { agendaId } } : {}),
    ...(texto(acao.erro) ? { erro: texto(acao.erro) } : {}),
  };
}

function resultadoRpc(data: unknown, mensagemPadrao: string): ResultadoOperacaoAcao {
  const resposta = data && typeof data === "object" ? data as RespostaRpc : {};
  if (resposta.ok === true) {
    const acao = normalizarAcao(resposta.acao);
    if (acao) return { ok: true, acao, ...(resposta.repetida === true ? { repetida: true } : {}) };
  }
  return {
    ok: false,
    erro: texto(resposta.erro) || mensagemPadrao,
    codigo: texto(resposta.codigo) || "acao_invalida",
  };
}

export function validarParametrosAgendarVisita(
  parametros: ParametrosAgendarVisita,
): { ok: true } | { ok: false; erro: string; codigo: string } {
  if (!UUID.test(parametros.imovelId)) return { ok: false, erro: "Selecione um imóvel válido.", codigo: "imovel_invalido" };
  if (!UUID.test(parametros.sessaoId)) return { ok: false, erro: "A sessão da conversa é inválida.", codigo: "sessao_invalida" };
  if (!DATA.test(parametros.data) || parametros.data < todayISO()) {
    return { ok: false, erro: "Escolha uma data válida que não esteja no passado.", codigo: "data_invalida" };
  }
  if (!HORA.test(parametros.hora)) return { ok: false, erro: "Informe um horário válido no formato HH:MM.", codigo: "hora_invalida" };
  return { ok: true };
}

export async function prepararAgendamentoVisita(
  supabase: SupabaseClient,
  parametros: ParametrosAgendarVisita,
): Promise<ResultadoOperacaoAcao> {
  const validacao = validarParametrosAgendarVisita(parametros);
  if (!validacao.ok) return validacao;
  const { data, error } = await supabase.rpc("preparar_acao_assistente_agendar_visita", {
    p_imovel_id: parametros.imovelId,
    p_data: parametros.data,
    p_hora: parametros.hora,
    p_sessao_id: parametros.sessaoId,
  });
  if (error) {
    console.error("Assistente: falha ao preparar agendamento:", error.message);
    return { ok: false, erro: "Não foi possível preparar a visita agora.", codigo: "falha_preparacao" };
  }
  return resultadoRpc(data, "Não foi possível preparar a visita.");
}

export async function confirmarAcaoAssistente(
  supabase: SupabaseClient,
  acaoId: string,
): Promise<ResultadoOperacaoAcao> {
  if (!UUID.test(acaoId)) return { ok: false, erro: "A ação informada é inválida.", codigo: "acao_invalida" };
  const { data, error } = await supabase.rpc("confirmar_acao_assistente", { p_acao_id: acaoId });
  if (error) {
    console.error("Assistente: falha ao confirmar ação:", error.message);
    return { ok: false, erro: "Não foi possível concluir a ação. Nenhuma alteração adicional foi realizada.", codigo: "falha_execucao" };
  }
  return resultadoRpc(data, "Não foi possível concluir a ação.");
}

export async function cancelarAcaoAssistente(
  supabase: SupabaseClient,
  acaoId: string,
): Promise<ResultadoOperacaoAcao> {
  if (!UUID.test(acaoId)) return { ok: false, erro: "A ação informada é inválida.", codigo: "acao_invalida" };
  const { data, error } = await supabase.rpc("cancelar_acao_assistente", { p_acao_id: acaoId });
  if (error) {
    console.error("Assistente: falha ao cancelar ação:", error.message);
    return { ok: false, erro: "Não foi possível cancelar a ação agora.", codigo: "falha_cancelamento" };
  }
  return resultadoRpc(data, "Não foi possível cancelar a ação.");
}

export async function executarPreparacaoAgendamentoVisita(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  contexto: ContextoAssistente,
  sessaoId: string = randomUUID(),
): Promise<{ dados: unknown; bloco?: undefined; acao?: AcaoAssistente }> {
  const codigo = texto(args.imovel_codigo);
  const idInformado = texto(args.imovel_id);
  const idContexto = contexto.entidade?.tipo === "imovel" ? contexto.entidade.id : "";
  let imovelId = UUID.test(idInformado) ? idInformado : UUID.test(idContexto) ? idContexto : "";

  if (!imovelId && codigo) {
    const { data, error } = await supabase
      .from("imoveis")
      .select("id")
      .eq("user_id", userId)
      .ilike("codigo", codigo)
      .maybeSingle();
    if (error) {
      return { dados: { preparada: false, motivo: "Não foi possível resolver o imóvel com segurança." } };
    }
    imovelId = texto(data?.id);
  }
  if (!UUID.test(imovelId)) {
    return { dados: { preparada: false, motivo: "Informe o código exato do imóvel antes de preparar a visita." } };
  }

  const resultado = await prepararAgendamentoVisita(supabase, {
    imovelId,
    data: texto(args.data),
    hora: texto(args.hora),
    sessaoId,
  });
  if (!resultado.ok) return { dados: { preparada: false, motivo: resultado.erro, codigo: resultado.codigo } };
  return {
    dados: {
      preparada: true,
      acaoId: resultado.acao.id,
      operacao: resultado.acao.operacao,
      imovel: resultado.acao.entidade.codigo,
      data: resultado.acao.dados.data,
      hora: resultado.acao.dados.hora,
      exigeConfirmacaoVisual: true,
      executada: false,
    },
    acao: resultado.acao,
  };
}

export async function prepararRevisaoFollowUpLote(
  supabase: SupabaseClient,
  userId: string,
  contexto: ContextoAssistente,
  perguntaUsuario: string,
  historico: ItemHistoricoAssistente[],
): Promise<{
  dados: unknown;
  bloco?: BlocoAssistente;
  comandoUi?: ComandoUiAssistente;
}> {
  const consulta = await executarFerramenta(
    "buscar_followups",
    { escopo: "global", limite: 10 },
    supabase,
    userId,
    contexto,
    perguntaUsuario,
    historico,
  );
  const dados = consulta.dados && typeof consulta.dados === "object"
    ? consulta.dados as Record<string, unknown>
    : {};
  const totalFilaHoje = typeof dados.totalFilaHoje === "number" ? dados.totalFilaHoje : 0;

  return {
    dados: {
      ...dados,
      revisaoDisponivel: totalFilaHoje > 0,
      envioExecutado: false,
      exigeConfirmacaoNaRevisao: true,
    },
    bloco: consulta.bloco,
    ...(totalFilaHoje > 0
      ? { comandoUi: { tipo: "abrir_followup_lote" } as const }
      : {}),
  };
}

export async function prepararRascunhoResposta(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  contexto: ContextoAssistente,
): Promise<{
  dados: unknown;
  bloco?: undefined;
  comandoUi?: ComandoUiAssistente;
}> {
  const codigo = texto(args.imovel_codigo);
  const idInformado = texto(args.imovel_id);
  const idContexto = contexto.entidade?.tipo === "imovel" ? contexto.entidade.id : "";
  const id = UUID.test(idInformado) ? idInformado : !codigo && UUID.test(idContexto) ? idContexto : "";
  if (!codigo && !id) {
    return {
      dados: {
        preparada: false,
        motivo: "Informe o código exato do imóvel ou escolha uma conversa identificada antes de preparar a resposta.",
      },
    };
  }

  let consulta = supabase
    .from("imoveis")
    .select("*")
    .eq("user_id", userId);
  consulta = id ? consulta.eq("id", id) : consulta.ilike("codigo", codigo);
  const { data, error } = await consulta.maybeSingle();
  if (error) {
    return { dados: { preparada: false, motivo: "Não foi possível consultar essa conversa com segurança." } };
  }
  if (!data) {
    return { dados: { preparada: false, motivo: "Não encontrei esse imóvel na sua carteira." } };
  }

  const imovel = fromDbImovel(data as DbImovelRow);
  const selecao = selecionarMensagensAtendimento(imovel);
  if (!selecao.mensagemAtual) {
    return {
      dados: {
        preparada: false,
        imovel: imovel.codigo || "Sem código",
        motivo: "A conversa não possui uma resposta textual suficiente para montar um rascunho seguro.",
      },
    };
  }

  return {
    dados: {
      preparada: true,
      imovel: imovel.codigo || "Sem código",
      proprietario: imovel.proprietarioNome || "Proprietário não informado",
      historicoRelidoNoServidor: true,
      envioExecutado: false,
      exigeRevisaoHumana: true,
    },
    comandoUi: {
      tipo: "rascunhar_resposta",
      imovelId: imovel.id,
      codigo: imovel.codigo || "Sem código",
      proprietario: imovel.proprietarioNome || "Proprietário não informado",
    },
  };
}
