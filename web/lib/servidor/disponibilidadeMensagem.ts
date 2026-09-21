import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  planejarConsolidacaoContato,
  type MensagemComImovel,
  type PlanoConsolidacao,
} from "@/lib/calculo/consolidacaoContatoDisponibilidade";
import { chaveProprietario } from "@/lib/calculo/contextoProprietario";
import {
  decidirMensagemDisponibilidade,
  diaOperacionalDoEnvio,
  type DecisaoMensagemDisponibilidade,
} from "@/lib/calculo/decisaoMensagemDisponibilidade";
import {
  avaliarEvidenciaTemporalDisponibilidade,
  type AgendaItemComCriacao,
  type AvaliacaoTemporalDisponibilidade,
} from "@/lib/calculo/evidenciaDisponibilidade";
import { addDaysISO, inicioDoDiaOperacionalISO } from "@/lib/datas";
import { fromDbMensagem, type DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import { fromDbAgenda, fromDbImovel, type DbAgendaRow, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import type { Imovel } from "@/lib/tipos";

/* ================================================================
   REVALIDAÇÃO DA VERIFICAÇÃO DE DISPONIBILIDADE ANTES DO ENVIO (M3)

   Módulo SÓ DE SERVIDOR: recebe o cliente com service role do worker e, por
   isso, filtra TODA consulta por `user_id` explicitamente. Ele só carrega
   fatos e aplica transições pelas RPCs do M4; quem decide é o núcleo puro
   (`decisaoMensagemDisponibilidade`, `consolidacaoContatoDisponibilidade`).

   `Agenda.created_at` chega aqui como `criadoEm` (o mapeador central não o
   expõe): é o instante em que uma visita confirmada foi registrada, e sem
   ele o núcleo não cria evidência.
   ================================================================ */

export interface ContextoDisponibilidade {
  imovel: Imovel | null;
  agenda: AgendaItemComCriacao[];
  avaliacao: AvaliacaoTemporalDisponibilidade | null;
}

function agendaComCriacao(row: DbAgendaRow): AgendaItemComCriacao {
  return { ...fromDbAgenda(row), criadoEm: row.created_at ?? null };
}

/** Imóvel e agenda do imóvel, da conta indicada, prontos para o M2. */
export async function carregarContextoDisponibilidade(
  admin: SupabaseClient,
  userId: string,
  imovelId: string,
): Promise<ContextoDisponibilidade> {
  const imovelRes = await admin
    .from("imoveis")
    .select("*")
    .eq("id", imovelId)
    .eq("user_id", userId)
    .maybeSingle();
  if (imovelRes.error) throw new Error(`imovel: ${imovelRes.error.message}`);
  if (!imovelRes.data) return { imovel: null, agenda: [], avaliacao: null };
  const imovel = fromDbImovel(imovelRes.data as DbImovelRow);

  const agendaRes = await admin
    .from("agenda")
    .select("*")
    .eq("imovel_id", imovelId)
    .eq("user_id", userId);
  if (agendaRes.error) throw new Error(`agenda: ${agendaRes.error.message}`);
  const agenda = ((agendaRes.data || []) as DbAgendaRow[]).map(agendaComCriacao);

  return { imovel, agenda, avaliacao: avaliarEvidenciaTemporalDisponibilidade(imovel, agenda) };
}

/** Decisão para uma mensagem reclamada, a partir do estado atual do banco. */
export async function revalidarVerificacaoDisponibilidade(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
): Promise<{ decisao: DecisaoMensagemDisponibilidade; contexto: ContextoDisponibilidade }> {
  const mensagem = fromDbMensagem(item);
  const contexto = mensagem.imovelId
    ? await carregarContextoDisponibilidade(admin, mensagem.userId, mensagem.imovelId)
    : { imovel: null, agenda: [], avaliacao: null };
  return {
    decisao: decidirMensagemDisponibilidade({ mensagem, imovel: contexto.imovel, avaliacao: contexto.avaliacao }),
    contexto,
  };
}

export interface ResultadoTransicao {
  ok: boolean;
  detalhe: Record<string, unknown> | null;
  erro: string | null;
}

/**
 * Aplica a decisão do worker pela RPC do M4, que é a única mutação: a linha
 * `processando` do próprio worker entra na transição por
 * `p_mensagem_processando`, na mesma transação que fecha lembretes e as
 * outras mensagens do imóvel.
 */
export async function aplicarDecisaoNoBanco(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  decisao: DecisaoMensagemDisponibilidade,
): Promise<ResultadoTransicao> {
  if (decisao.acao === "enviar" || !item.imovel_id) {
    return { ok: true, detalhe: null, erro: null };
  }
  const chamada = decisao.acao === "cancelar"
    ? admin.rpc("encerrar_disponibilidade_imovel", {
        p_imovel_id: item.imovel_id,
        p_motivo: decisao.motivo,
        p_mensagem_processando: item.id,
      })
    : admin.rpc("registrar_confirmacao_disponibilidade", {
        p_imovel_id: item.imovel_id,
        p_data_confirmacao: decisao.dataEvidencia.slice(0, 10),
        p_motivo: decisao.motivo,
        p_mensagem_processando: item.id,
      });
  const { data, error } = await chamada;
  if (error) return { ok: false, detalhe: null, erro: error.message };
  const detalhe = (data && typeof data === "object" ? data : null) as Record<string, unknown> | null;
  return { ok: detalhe?.ok === true, detalhe, erro: detalhe?.ok === true ? null : String(detalhe?.motivo ?? "transicao-recusada") };
}

/**
 * Mensagem excluída do imóvel (imóvel não existe mais nesta conta): a RPC
 * não tem linha de imóvel para autorizar, então o próprio worker fecha a
 * sua linha reclamada, com o mesmo vocabulário.
 */
export async function cancelarMensagemSemImovel(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  agora: string,
): Promise<ResultadoTransicao> {
  const { error } = await admin
    .from("mensagens_agendadas")
    .update({
      status: "cancelada",
      cancelamento_motivo: "imovel-excluido",
      cancelamento_origem: "worker",
      cancelada_em: agora,
      updated_at: agora,
    })
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .eq("status", "processando");
  return { ok: !error, detalhe: null, erro: error?.message ?? null };
}

export interface ConsolidacaoAplicada {
  plano: PlanoConsolidacao;
  /** Ids das mensagens efetivamente canceladas como `contato-consolidado`. */
  absorvidasIds: string[];
  /** Transições aplicadas nas candidatas que não podiam ser absorvidas. */
  transicoes: Array<{ mensagemId: string; acao: DecisaoMensagemDisponibilidade["acao"]; ok: boolean }>;
  /** Imóveis pelos quais a mensagem final pergunta (âncora primeiro). */
  imoveisConsultados: Imovel[];
}

/**
 * Um contato só por proprietário no dia. Para a mensagem que vai sair
 * (âncora), procura as outras verificações `agendada` do MESMO proprietário
 * (mesma conta + mesmo telefone canônico) no mesmo dia civil operacional,
 * reavalia cada uma (a que ficou indisponível é cancelada; a que ganhou
 * evidência é reagendada) e absorve as que sobraram, cancelando-as antes de
 * enviar. O cancelamento é condicionado a `status = 'agendada'`: se outro
 * worker reclamou uma delas nesse meio-tempo, ela fica de fora e segue
 * sozinha.
 */
export async function consolidarContatoDoProprietario(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  ancora: Imovel,
  agora: string,
): Promise<ConsolidacaoAplicada> {
  const mensagemAncora = fromDbMensagem(item);
  const vazio: ConsolidacaoAplicada = {
    plano: { imoveisConsultados: [ancora.id], absorvidas: [], recusadas: [], texto: null },
    absorvidasIds: [],
    transicoes: [],
    imoveisConsultados: [ancora],
  };

  const identidade = chaveProprietario(item.user_id, ancora);
  const dia = diaOperacionalDoEnvio(item.data_envio);
  if (identidade.identidade !== "telefone-canonico" || !dia) return vazio;
  const inicio = inicioDoDiaOperacionalISO(dia);
  const diaSeguinte = addDaysISO(dia, 1);
  const fim = diaSeguinte ? inicioDoDiaOperacionalISO(diaSeguinte) : null;
  if (!inicio || !fim) return vazio;

  // Imóveis do mesmo proprietário nesta conta, pela coluna gerada do banco
  // (gêmea de telefoneCanonico); a função pura confere de novo em memória.
  const imoveisRes = await admin
    .from("imoveis")
    .select("*")
    .eq("user_id", item.user_id)
    .eq("proprietario_telefone_canonico", identidade.telefoneCanonico);
  if (imoveisRes.error) throw new Error(`imoveis do proprietario: ${imoveisRes.error.message}`);
  const imoveis = ((imoveisRes.data || []) as DbImovelRow[]).map(fromDbImovel);
  const porId = new Map(imoveis.map((imovel) => [imovel.id, imovel]));
  if (!porId.size) return vazio;

  const mensagensRes = await admin
    .from("mensagens_agendadas")
    .select("*")
    .eq("user_id", item.user_id)
    .eq("tipo", "verificacao-disponibilidade")
    .eq("status", "agendada")
    .in("imovel_id", [...porId.keys()])
    .gte("data_envio", inicio)
    .lt("data_envio", fim)
    .neq("id", item.id);
  if (mensagensRes.error) throw new Error(`mensagens do proprietario: ${mensagensRes.error.message}`);
  const candidatasCruas = (mensagensRes.data || []) as DbMensagemAgendada[];
  if (!candidatasCruas.length) return vazio;

  // Cada candidata passa pela mesma reavaliação da âncora: só quem continua
  // elegível para envio pode ser absorvido.
  const transicoes: ConsolidacaoAplicada["transicoes"] = [];
  const candidatas: MensagemComImovel[] = [];
  for (const cruda of candidatasCruas) {
    const imovel = cruda.imovel_id ? porId.get(cruda.imovel_id) : undefined;
    if (!imovel) continue;
    const { decisao } = await revalidarVerificacaoDisponibilidade(admin, cruda);
    if (decisao.acao !== "enviar") {
      const resultado = await aplicarDecisaoNoBanco(admin, { ...cruda, status: "agendada" }, decisao);
      transicoes.push({ mensagemId: cruda.id, acao: decisao.acao, ok: resultado.ok });
      continue;
    }
    candidatas.push({ mensagem: fromDbMensagem(cruda), imovel });
  }

  let plano = planejarConsolidacaoContato({ mensagem: mensagemAncora, imovel: ancora }, candidatas);
  const absorvidasIds: string[] = [];
  for (const { mensagem } of plano.absorvidas) {
    const cancelamento = await admin
      .from("mensagens_agendadas")
      .update({
        status: "cancelada",
        cancelamento_motivo: "contato-consolidado",
        cancelamento_origem: "worker",
        cancelada_em: agora,
        consolidada_em_mensagem_id: item.id,
        updated_at: agora,
      })
      .eq("id", mensagem.id)
      .eq("user_id", item.user_id)
      .eq("status", "agendada")
      .select("id");
    if (!cancelamento.error && (cancelamento.data?.length ?? 0) > 0) absorvidasIds.push(mensagem.id);
  }

  if (absorvidasIds.length !== plano.absorvidas.length) {
    // Alguém reclamou uma candidata no meio: o texto final só pode citar o
    // que de fato foi absorvido.
    plano = planejarConsolidacaoContato(
      { mensagem: mensagemAncora, imovel: ancora },
      candidatas.filter((candidata) => absorvidasIds.includes(candidata.mensagem.id)),
    );
  }

  const imoveisConsultados = plano.imoveisConsultados
    .map((id) => (id === ancora.id ? ancora : porId.get(id)))
    .filter((imovel): imovel is Imovel => !!imovel);

  return { plano, absorvidasIds, transicoes, imoveisConsultados };
}
