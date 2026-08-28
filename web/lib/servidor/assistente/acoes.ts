import type { SupabaseClient } from "@supabase/supabase-js";
import { agoraISOComHora, inicioDoDiaOperacionalISO } from "@/lib/datas";
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
export const FERRAMENTA_PREPARAR_CRIACAO_COMPROMISSO = "preparar_criacao_compromisso";
export const FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE = "abrir_revisao_followup_lote";
export const FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA = "preparar_rascunho_resposta";
export const FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA = "preparar_alteracao_status_sem_resposta";

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
  description: "Prepara, mas nao executa, o agendamento de uma visita. Use somente quando o usuario pedir explicitamente para agendar uma visita e houver imovel, data e horario definidos. O backend valida e devolve um preview que ainda exige confirmacao explicita.",
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

export const DEFINICAO_FERRAMENTA_CRIAR_COMPROMISSO = {
  type: "function" as const,
  name: FERRAMENTA_PREPARAR_CRIACAO_COMPROMISSO,
  description: "Prepara, mas nao executa, um compromisso generico na Agenda. Use quando o usuario pedir para criar um compromisso que nao seja uma visita e titulo, tipo e data estiverem definidos. Horario, observacao e imovel sao opcionais. Nunca invente campos ausentes: pergunte somente pelos obrigatorios antes de chamar.",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Titulo literal confirmado pelo usuario." },
      tipo_compromisso: { type: "string", description: "Tipo literal do compromisso, sem inventar uma categoria." },
      data: { type: "string", description: "Data ISO YYYY-MM-DD ja resolvida no fuso America/Sao_Paulo." },
      hora: { type: ["string", "null"], description: "Horario de 24 horas HH:MM, ou null quando nao informado." },
      imovel_codigo: { type: ["string", "null"], description: "Codigo visivel exato, apenas se o usuario vinculou um imovel." },
      imovel_id: { type: ["string", "null"], description: "ID interno somente quando veio do contexto visual ou de ferramenta anterior." },
      observacao: { type: ["string", "null"], description: "Observacao literal do usuario, ou null." },
    },
    required: ["titulo", "tipo_compromisso", "data", "hora", "imovel_codigo", "imovel_id", "observacao"],
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

export const DEFINICAO_FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA = {
  type: "function" as const,
  name: FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA,
  description: "Prepara, sem executar, a alteracao para Sem resposta dos imoveis em Novo contato que possuem pelo menos 3 tentativas registradas e nenhuma resposta observada do proprietario. Use somente para esse pedido operacional especifico. O backend consulta a carteira real, congela os alvos e exige confirmacao explicita antes de qualquer mudanca.",
  strict: true,
  parameters: {
    type: "object",
    properties: {},
    required: [],
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

export interface ParametrosCriarCompromisso {
  titulo: string;
  tipo: string;
  data: string;
  hora: string | null;
  imovelId: string | null;
  observacao: string | null;
  sessaoId: string;
}

export interface ParametrosAlterarStatusSemResposta {
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

export function normalizarAcao(valor: unknown): AcaoAssistente | null {
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
  if (!UUID.test(texto(acao.id)) || !ESTADOS.has(estado)) return null;

  if (acao.tipo === "alterar_status_sem_resposta_em_lote") {
    const imoveisBrutos = Array.isArray(entidade.imoveis) ? entidade.imoveis : [];
    const imoveis = imoveisBrutos.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const imovel = item as Record<string, unknown>;
      const id = texto(imovel.id);
      const tentativas = Number(imovel.tentativas);
      if (!UUID.test(id) || imovel.statusPreparado !== "Novo contato" || !Number.isInteger(tentativas) || tentativas < 3) return [];
      return [{
        id,
        codigo: texto(imovel.codigo) || "Sem código",
        endereco: texto(imovel.endereco) || "Endereço não informado",
        statusPreparado: "Novo contato" as const,
        tentativas,
      }];
    });
    const quantidade = Number(dados.quantidade);
    if (dados.statusDestino !== "Sem resposta" || !Number.isInteger(quantidade) || quantidade !== imoveis.length) return null;

    const alterados = Array.isArray(resultado?.alterados)
      ? resultado.alterados.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const registro = item as Record<string, unknown>;
          const id = texto(registro.id);
          return UUID.test(id) ? [{ id, codigo: texto(registro.codigo) || "Sem código" }] : [];
        })
      : [];
    const motivosIgnorados = new Set(["status_alterado", "nao_elegivel", "imovel_indisponivel"]);
    const ignorados = Array.isArray(resultado?.ignorados)
      ? resultado.ignorados.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const registro = item as Record<string, unknown>;
          const id = texto(registro.id);
          const motivo = texto(registro.motivo);
          return UUID.test(id) && motivosIgnorados.has(motivo)
            ? [{ id, codigo: texto(registro.codigo) || "Sem código", motivo: motivo as "status_alterado" | "nao_elegivel" | "imovel_indisponivel" }]
            : [];
        })
      : [];
    const temResultado = resultado !== null;
    if (temResultado && (
      Number(resultado.totalAlterados) !== alterados.length
      || Number(resultado.totalIgnorados) !== ignorados.length
    )) return null;

    return {
      id: texto(acao.id),
      tipo: "alterar_status_sem_resposta_em_lote",
      estado,
      expiraEm: texto(acao.expiraEm),
      operacao: "Alterar status em lote",
      impacto: texto(acao.impacto) || (quantidade === 1
        ? "1 imóvel terá o status alterado para Sem resposta."
        : `${quantidade} imóveis terão o status alterado para Sem resposta.`),
      entidade: { imoveis },
      dados: { statusDestino: "Sem resposta", quantidade },
      ...(temResultado ? {
        resultado: {
          alterados,
          ignorados,
          totalAlterados: alterados.length,
          totalIgnorados: ignorados.length,
        },
      } : {}),
      ...(texto(acao.erro) ? { erro: texto(acao.erro) } : {}),
    };
  }

  if (!DATA.test(texto(dados.data))) return null;
  const agendaId = texto(resultado?.agendaId);
  if (acao.tipo === "criar_compromisso") {
    const imovelId = texto(entidade.imovelId);
    const hora = texto(dados.hora);
    if (!texto(dados.titulo) || !texto(dados.tipo) || (hora && !HORA.test(hora)) || (imovelId && !UUID.test(imovelId))) return null;
    return {
      id: texto(acao.id),
      tipo: "criar_compromisso",
      estado,
      expiraEm: texto(acao.expiraEm),
      operacao: "Criar compromisso",
      impacto: texto(acao.impacto) || "Será criado um compromisso real na agenda.",
      entidade: {
        imovelId: imovelId || null,
        codigo: texto(entidade.codigo) || null,
        endereco: texto(entidade.endereco) || null,
        responsavel: texto(entidade.responsavel) || null,
      },
      dados: {
        titulo: texto(dados.titulo),
        tipo: texto(dados.tipo),
        data: texto(dados.data),
        hora: hora || null,
        observacao: texto(dados.observacao) || null,
      },
      ...(agendaId && UUID.test(agendaId) ? { resultado: { agendaId } } : {}),
      ...(texto(acao.erro) ? { erro: texto(acao.erro) } : {}),
    };
  }
  if (acao.tipo !== "agendar_visita" || !UUID.test(texto(entidade.imovelId)) || !HORA.test(texto(dados.hora))) return null;
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
  if (!DATA.test(parametros.data) || !inicioDoDiaOperacionalISO(parametros.data) || parametros.data < agoraISOComHora().slice(0, 10)) {
    return { ok: false, erro: "Escolha uma data válida que não esteja no passado.", codigo: "data_invalida" };
  }
  if (!HORA.test(parametros.hora)) return { ok: false, erro: "Informe um horário válido no formato HH:MM.", codigo: "hora_invalida" };
  return { ok: true };
}

export function validarParametrosCriarCompromisso(
  parametros: ParametrosCriarCompromisso,
): { ok: true } | { ok: false; erro: string; codigo: string } {
  if (!UUID.test(parametros.sessaoId)) return { ok: false, erro: "A sessão da conversa é inválida.", codigo: "sessao_invalida" };
  if (!parametros.titulo.trim()) return { ok: false, erro: "Informe o título do compromisso.", codigo: "titulo_invalido" };
  if (!parametros.tipo.trim()) return { ok: false, erro: "Informe o tipo do compromisso.", codigo: "tipo_invalido" };
  if (!DATA.test(parametros.data) || !inicioDoDiaOperacionalISO(parametros.data) || parametros.data < agoraISOComHora().slice(0, 10)) return { ok: false, erro: "Escolha uma data válida que não esteja no passado.", codigo: "data_invalida" };
  if (parametros.hora !== null && !HORA.test(parametros.hora)) return { ok: false, erro: "Informe um horário válido no formato HH:MM.", codigo: "hora_invalida" };
  if (parametros.imovelId !== null && !UUID.test(parametros.imovelId)) return { ok: false, erro: "Selecione um imóvel válido.", codigo: "imovel_invalido" };
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

export async function prepararCriacaoCompromisso(
  supabase: SupabaseClient,
  parametros: ParametrosCriarCompromisso,
): Promise<ResultadoOperacaoAcao> {
  const normalizados: ParametrosCriarCompromisso = {
    ...parametros,
    titulo: parametros.titulo.trim(),
    tipo: parametros.tipo.trim(),
    hora: parametros.hora?.trim() || null,
    observacao: parametros.observacao?.trim() || null,
  };
  const validacao = validarParametrosCriarCompromisso(normalizados);
  if (!validacao.ok) return validacao;
  const { data, error } = await supabase.rpc("preparar_acao_assistente_criar_compromisso", {
    p_titulo: normalizados.titulo,
    p_tipo: normalizados.tipo,
    p_data: normalizados.data,
    p_hora: normalizados.hora,
    p_imovel_id: normalizados.imovelId,
    p_observacao: normalizados.observacao,
    p_sessao_id: normalizados.sessaoId,
  });
  if (error) {
    console.error("Assistente: falha ao preparar compromisso:", error.message);
    return { ok: false, erro: "Não foi possível preparar o compromisso agora.", codigo: "falha_preparacao" };
  }
  return resultadoRpc(data, "Não foi possível preparar o compromisso.");
}

export async function prepararAlteracaoStatusSemResposta(
  supabase: SupabaseClient,
  parametros: ParametrosAlterarStatusSemResposta,
): Promise<ResultadoOperacaoAcao> {
  if (!UUID.test(parametros.sessaoId)) {
    return { ok: false, erro: "A sessão da conversa é inválida.", codigo: "sessao_invalida" };
  }
  const { data, error } = await supabase.rpc("preparar_acao_assistente_status_sem_resposta", {
    p_sessao_id: parametros.sessaoId,
  });
  if (error) {
    console.error("Assistente: falha ao preparar alteração de status:", error.message);
    return { ok: false, erro: "Não foi possível preparar a alteração de status agora.", codigo: "falha_preparacao" };
  }
  return resultadoRpc(data, "Não foi possível preparar a alteração de status.");
}

export async function confirmarAcaoAssistente(
  supabase: SupabaseClient,
  acaoId: string,
  sessaoId: string,
): Promise<ResultadoOperacaoAcao> {
  if (!UUID.test(acaoId)) return { ok: false, erro: "A ação informada é inválida.", codigo: "acao_invalida" };
  if (!UUID.test(sessaoId)) return { ok: false, erro: "A sessão da conversa é inválida.", codigo: "sessao_invalida" };
  const { data, error } = await supabase.rpc("confirmar_acao_assistente", { p_acao_id: acaoId, p_sessao_id: sessaoId });
  if (error) {
    console.error("Assistente: falha ao confirmar ação:", error.message);
    return { ok: false, erro: "Não foi possível concluir a ação. Nenhuma alteração adicional foi realizada.", codigo: "falha_execucao" };
  }
  return resultadoRpc(data, "Não foi possível concluir a ação.");
}

export async function cancelarAcaoAssistente(
  supabase: SupabaseClient,
  acaoId: string,
  sessaoId: string,
): Promise<ResultadoOperacaoAcao> {
  if (!UUID.test(acaoId)) return { ok: false, erro: "A ação informada é inválida.", codigo: "acao_invalida" };
  if (!UUID.test(sessaoId)) return { ok: false, erro: "A sessão da conversa é inválida.", codigo: "sessao_invalida" };
  const { data, error } = await supabase.rpc("cancelar_acao_assistente", { p_acao_id: acaoId, p_sessao_id: sessaoId });
  if (error) {
    console.error("Assistente: falha ao cancelar ação:", error.message);
    return { ok: false, erro: "Não foi possível cancelar a ação agora.", codigo: "falha_cancelamento" };
  }
  return resultadoRpc(data, "Não foi possível cancelar a ação.");
}

async function resolverImovelOpcional(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true; imovelId: string | null } | { ok: false; motivo: string }> {
  const codigo = texto(args.imovel_codigo);
  const idInformado = texto(args.imovel_id);
  if (idInformado && !UUID.test(idInformado) && !codigo) {
    return { ok: false, motivo: "O imóvel informado não possui uma identificação válida." };
  }
  let imovelId = UUID.test(idInformado) ? idInformado : "";
  if (!imovelId && codigo) {
    const { data, error } = await supabase.from("imoveis").select("id").eq("user_id", userId).ilike("codigo", codigo).maybeSingle();
    if (error) return { ok: false, motivo: "Não foi possível resolver o imóvel com segurança." };
    imovelId = texto(data?.id);
    if (!UUID.test(imovelId)) return { ok: false, motivo: "Não encontrei o imóvel informado na sua carteira." };
  }
  return { ok: true, imovelId: UUID.test(imovelId) ? imovelId : null };
}

export async function executarPreparacaoCriacaoCompromisso(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  _contexto: ContextoAssistente,
  sessaoId?: string,
): Promise<{ dados: unknown; bloco?: undefined; acao?: AcaoAssistente }> {
  const imovel = await resolverImovelOpcional(args, supabase, userId);
  if (!imovel.ok) return { dados: { preparada: false, motivo: imovel.motivo } };
  const resultado = await prepararCriacaoCompromisso(supabase, {
    titulo: texto(args.titulo),
    tipo: texto(args.tipo_compromisso),
    data: texto(args.data),
    hora: texto(args.hora) || null,
    imovelId: imovel.imovelId,
    observacao: texto(args.observacao) || null,
    sessaoId: sessaoId || "",
  });
  if (!resultado.ok) return { dados: { preparada: false, motivo: resultado.erro, codigo: resultado.codigo } };
  if (resultado.acao.tipo !== "criar_compromisso") return { dados: { preparada: false, motivo: "A ação preparada não corresponde ao compromisso solicitado." } };
  return {
    dados: {
      preparada: true,
      acaoId: resultado.acao.id,
      operacao: resultado.acao.operacao,
      titulo: resultado.acao.dados.titulo,
      tipo: resultado.acao.dados.tipo,
      data: resultado.acao.dados.data,
      hora: resultado.acao.dados.hora,
      exigeConfirmacao: true,
      executada: false,
    },
    acao: resultado.acao,
  };
}

export async function executarPreparacaoAgendamentoVisita(
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string,
  contexto: ContextoAssistente,
  sessaoId?: string,
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
    sessaoId: sessaoId || "",
  });
  if (!resultado.ok) return { dados: { preparada: false, motivo: resultado.erro, codigo: resultado.codigo } };
  if (resultado.acao.tipo !== "agendar_visita") {
    return { dados: { preparada: false, motivo: "A ação preparada não corresponde à visita solicitada." } };
  }
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

export async function executarPreparacaoStatusSemResposta(
  supabase: SupabaseClient,
  sessaoId?: string,
): Promise<{ dados: unknown; bloco?: undefined; acao?: AcaoAssistente }> {
  const resultado = await prepararAlteracaoStatusSemResposta(supabase, { sessaoId: sessaoId || "" });
  if (!resultado.ok) return { dados: { preparada: false, motivo: resultado.erro, codigo: resultado.codigo } };
  if (resultado.acao.tipo !== "alterar_status_sem_resposta_em_lote") {
    return { dados: { preparada: false, motivo: "A ação preparada não corresponde à alteração solicitada." } };
  }
  if (resultado.acao.dados.quantidade === 0) {
    return {
      dados: {
        preparada: false,
        totalElegiveis: 0,
        motivo: "Não encontrei imóveis elegíveis: é preciso estar em Novo contato, ter pelo menos 3 tentativas registradas e continuar sem resposta do proprietário.",
      },
    };
  }
  return {
    dados: {
      preparada: true,
      acaoId: resultado.acao.id,
      statusDestino: resultado.acao.dados.statusDestino,
      quantidade: resultado.acao.dados.quantidade,
      imoveis: resultado.acao.entidade.imoveis.map((imovel) => ({
        id: imovel.id,
        codigo: imovel.codigo,
        endereco: imovel.endereco,
        tentativas: imovel.tentativas,
      })),
      exigeConfirmacao: true,
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
