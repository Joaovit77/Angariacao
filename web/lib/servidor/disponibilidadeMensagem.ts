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
import { notaDaMensagemEnviada } from "@/lib/calculo/notas";
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

export interface ConsolidacaoPreparada {
  plano: PlanoConsolidacao;
  /** Ids das candidatas reservadas (`agendada` → `processando`) para sair na
      mensagem única. Só viram `contato-consolidado` depois do POST. */
  reservadasIds: string[];
  /** Transições aplicadas nas candidatas que não podiam ser absorvidas. */
  transicoes: Array<{ mensagemId: string; acao: DecisaoMensagemDisponibilidade["acao"]; ok: boolean }>;
  /** Imóveis pelos quais a mensagem final pergunta (âncora primeiro). */
  imoveisConsultados: Imovel[];
}

/**
 * Um contato só por proprietário no dia: a PREPARAÇÃO, sem efeito visível.
 *
 * Para a mensagem que vai sair (âncora), procura as outras verificações
 * `agendada` do MESMO proprietário (mesma conta + mesmo telefone canônico)
 * no mesmo dia civil operacional, reavalia cada uma (a que ficou
 * indisponível é cancelada; a que ganhou evidência é reagendada: fatos do
 * imóvel dela, independentes deste contato) e RESERVA as que sobraram,
 * movendo-as de `agendada` para `processando` com `reservada_para_mensagem_id`
 * = âncora. `processando` é o estado que o claim usa para "um worker está
 * com esta linha"; a coluna de reserva é o que diz, de forma durável, que
 * esta linha NÃO é um envio individual, e sim parte de uma consolidação. A
 * reserva fecha a janela entre preparar e enviar: outra execução não reclama
 * uma linha `processando`, o trigger de encerramento não a cancela e a
 * varredura de órfãs a trata como `consolidacao-interrompida`, nunca como
 * envio comum.
 *
 * Nada aqui diz que o contato aconteceu. A reserva é condicionada a
 * `status = 'agendada'`: se outro worker reclamou uma candidata nesse
 * meio-tempo, ela fica de fora e o texto é montado só com o que foi
 * reservado de fato. O fechamento como `contato-consolidado` é de
 * `efetivarConsolidacaoContato` (RPC atômica), só depois do POST aceito.
 * Antes de o POST começar, `desfazerConsolidacaoContato` devolve as
 * reservadas a `agendada`; depois de o POST ter começado, sem prova de que
 * não saiu, `marcarConsolidacaoIncerta` as tira da fila como
 * `consolidacao-resultado-incerto`, mantendo o vínculo.
 */
export async function prepararConsolidacaoContato(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  ancora: Imovel,
  agora: string,
): Promise<ConsolidacaoPreparada> {
  const mensagemAncora = fromDbMensagem(item);
  const vazio: ConsolidacaoPreparada = {
    plano: { imoveisConsultados: [ancora.id], absorvidas: [], recusadas: [], texto: null },
    reservadasIds: [],
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
  const transicoes: ConsolidacaoPreparada["transicoes"] = [];
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
  const reservadasIds: string[] = [];
  try {
    for (const { mensagem } of plano.absorvidas) {
      const reserva = await admin
        .from("mensagens_agendadas")
        .update({ status: "processando", reservada_para_mensagem_id: item.id, updated_at: agora })
        .eq("id", mensagem.id)
        .eq("user_id", item.user_id)
        .eq("status", "agendada")
        .select("id");
      if (!reserva.error && (reserva.data?.length ?? 0) > 0) reservadasIds.push(mensagem.id);
    }
  } catch (erro) {
    // Falha (rede) no meio das reservas, antes de qualquer POST: o que já
    // foi reservado volta a `agendada` aqui mesmo, porque o chamador ainda
    // não conhece estas reservas. Depois a falha segue para ele.
    if (reservadasIds.length) await desfazerConsolidacaoContato(admin, item, { reservadasIds }, agora).catch(() => undefined);
    throw erro;
  }

  if (reservadasIds.length !== plano.absorvidas.length) {
    // Alguém reclamou uma candidata no meio: o texto só pode citar o que
    // está reservado para esta mensagem.
    plano = planejarConsolidacaoContato(
      { mensagem: mensagemAncora, imovel: ancora },
      candidatas.filter((candidata) => reservadasIds.includes(candidata.mensagem.id)),
    );
  }

  const imoveisConsultados = plano.imoveisConsultados
    .map((id) => (id === ancora.id ? ancora : porId.get(id)))
    .filter((imovel): imovel is Imovel => !!imovel);

  return { plano, reservadasIds, transicoes, imoveisConsultados };
}

export interface NotaConsolidacao {
  imovel_id: string;
  nota: ReturnType<typeof notaDaMensagemEnviada>;
}

export interface EntradaEfetivacao {
  /** Texto que de fato saiu (original ou consolidado). */
  texto: string;
  /** Imóveis pelos quais a mensagem perguntou, âncora primeiro. */
  imoveisConsultados: string[];
  /** Id externo devolvido pela Evolution; dá idempotência às notas `wa:`. */
  mensagemExternaId: string;
  /** ISO com fuso: `enviado_em`, `cancelada_em` das absorvidas e data das notas. */
  enviadoEm: string;
  /** Data civil das notas (`agoraISOComSegundos`), como o caminho sem reserva. */
  dataNota: string;
}

export interface ConsolidacaoEfetivada {
  ok: boolean;
  /** Ids das reservadas que viraram `cancelada`/`contato-consolidado`. */
  absorvidasIds: string[];
  notasGravadas: number;
  /** Notas que não puderam ser gravadas (imóvel + sqlstate); o envio já aconteceu. */
  notasFalhas: Array<{ imovel_id: string; erro: string }>;
  erro: string | null;
}

/** As notas `wa:` da mensagem enviada, uma por imóvel consultado, no formato
    que já pertence ao TypeScript (`notaDaMensagemEnviada`). */
export function notasDaConsolidacao(entrada: EntradaEfetivacao): NotaConsolidacao[] {
  return entrada.imoveisConsultados.map((imovelId) => ({
    imovel_id: imovelId,
    nota: notaDaMensagemEnviada(entrada.mensagemExternaId, entrada.texto, entrada.dataNota, "agendamento"),
  }));
}

/**
 * A EFETIVAÇÃO: só depois de o POST ter sido aceito, e numa transação só
 * (RPC `efetivar_consolidacao_contato`): âncora `processando` → `enviada`
 * com o texto que saiu e `imoveis_consultados`; reservadas da âncora →
 * `cancelada`/`contato-consolidado` com a reserva limpa; notas `wa:` em
 * cada imóvel. Ou tudo, ou nada. Repetir não duplica: a âncora já não está
 * `processando` e a RPC recusa sem escrever.
 */
export async function efetivarConsolidacaoContato(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  entrada: EntradaEfetivacao,
): Promise<ConsolidacaoEfetivada> {
  const { data, error } = await admin.rpc("efetivar_consolidacao_contato", {
    p_mensagem_id: item.id,
    p_user_id: item.user_id,
    p_texto: entrada.texto,
    p_imoveis_consultados: entrada.imoveisConsultados,
    p_notas: notasDaConsolidacao(entrada),
    p_enviado_em: entrada.enviadoEm,
  });
  if (error) return { ok: false, absorvidasIds: [], notasGravadas: 0, notasFalhas: [], erro: error.message };
  const detalhe = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (detalhe.ok !== true) {
    return { ok: false, absorvidasIds: [], notasGravadas: 0, notasFalhas: [], erro: String(detalhe.motivo ?? "efetivacao-recusada") };
  }
  const absorvidas = Array.isArray(detalhe.absorvidas) ? detalhe.absorvidas.filter((id): id is string => typeof id === "string") : [];
  const falhas = Array.isArray(detalhe.notas_falhas)
    ? (detalhe.notas_falhas as Array<{ imovel_id?: string; erro?: string }>).map((f) => ({ imovel_id: String(f.imovel_id ?? ""), erro: String(f.erro ?? "") }))
    : [];
  return {
    ok: true,
    absorvidasIds: absorvidas,
    notasGravadas: typeof detalhe.notas_gravadas === "number" ? detalhe.notas_gravadas : 0,
    notasFalhas: falhas,
    erro: null,
  };
}

/**
 * O DESFAZER, só ANTES de o POST começar: nada foi para fora, então as
 * reservadas voltam a `agendada` com a reserva limpa e seguem o fluxo de
 * sempre, cada uma na sua hora. Condicionado a `processando` + reserva para
 * esta âncora: uma linha que já saiu da reserva não é tocada.
 */
export async function desfazerConsolidacaoContato(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  preparacao: Pick<ConsolidacaoPreparada, "reservadasIds">,
  agora: string,
): Promise<{ liberadasIds: string[]; erro: string | null }> {
  const liberadasIds: string[] = [];
  let erro: string | null = null;
  for (const id of preparacao.reservadasIds) {
    const liberacao = await admin
      .from("mensagens_agendadas")
      .update({ status: "agendada", reservada_para_mensagem_id: null, updated_at: agora })
      .eq("id", id)
      .eq("user_id", item.user_id)
      .eq("status", "processando")
      .eq("reservada_para_mensagem_id", item.id)
      .select("id");
    if (!liberacao.error && (liberacao.data?.length ?? 0) > 0) liberadasIds.push(id);
    else erro = erro ?? liberacao.error?.message ?? "reserva-nao-encontrada";
  }
  return { liberadasIds, erro };
}

/**
 * O RESULTADO INCERTO, DEPOIS de o POST ter começado: timeout, conexão,
 * resposta perdida, exceção durante ou depois do request, efetivação
 * recusada. Não há prova de que a mensagem única não saiu, então as
 * reservadas NÃO voltam à fila (seria contato duplicado) e também não viram
 * `contato-consolidado` (não há prova de que saiu): ficam `erro` com
 * `consolidacao-resultado-incerto`, mantendo `reservada_para_mensagem_id`
 * como vínculo de auditoria com a âncora.
 */
export async function marcarConsolidacaoIncerta(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  preparacao: Pick<ConsolidacaoPreparada, "reservadasIds">,
  agora: string,
): Promise<{ marcadasIds: string[]; erro: string | null }> {
  const marcadasIds: string[] = [];
  let erro: string | null = null;
  for (const id of preparacao.reservadasIds) {
    const marca = await admin
      .from("mensagens_agendadas")
      .update({ status: "erro", erro: "consolidacao-resultado-incerto", updated_at: agora })
      .eq("id", id)
      .eq("user_id", item.user_id)
      .eq("status", "processando")
      .eq("reservada_para_mensagem_id", item.id)
      .select("id");
    if (!marca.error && (marca.data?.length ?? 0) > 0) marcadasIds.push(id);
    else erro = erro ?? marca.error?.message ?? "reserva-nao-encontrada";
  }
  return { marcadasIds, erro };
}
