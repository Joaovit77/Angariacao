import type { SupabaseClient } from "@supabase/supabase-js";
import { erroBancoRetomada, resolverContextoMensagem, validarFormularioRetomada, validarImovelRetomada, dataHoraRetomadaParaIso, type ErroRetomada } from "../calculo/retomada";
import { agoraISOString } from "../datas";
import type { DbMensagemAgendada } from "../mensagensAgendadas";

export interface RegistroRetomada extends DbMensagemAgendada { updated_at: string }
export interface ImovelRetomada { id: string; retirado: boolean | null; status: string; proprietario_nome: string | null; proprietario_telefone: string | null; endereco: string | null }
export type ResultadoRetomada<T> = { ok: true; valor: T } | { ok: false; erro: ErroRetomada };
const falha = (erro: ErroRetomada): ResultadoRetomada<never> => ({ ok: false, erro });

/** Cliente autenticado com anon key: RLS permanece ativa em todas as operações. */
export async function carregarContextoRetomada(db: SupabaseClient, userId: string, imovelId: string, mensagemId?: string): Promise<ResultadoRetomada<{ imovel: ImovelRetomada; programacao: RegistroRetomada | null }>> {
  const lido = await db.from("imoveis").select("id, retirado, status, proprietario_nome, proprietario_telefone, endereco").eq("id", imovelId).eq("user_id", userId).maybeSingle();
  if (lido.error) return falha("falha-operacao");
  const imovel: ImovelRetomada | null = lido.data;
  if (!imovel) return falha("imovel-inexistente");
  let consulta = db.from("mensagens_agendadas").select("*").eq("user_id", userId).eq("imovel_id", imovelId).eq("tipo", "retomada-retirado");
  consulta = mensagemId ? consulta.eq("id", mensagemId) : consulta.in("status", ["agendada", "processando"]);
  const mensagens = await consulta;
  if (mensagens.error) return falha("falha-operacao");
  if (mensagens.data?.length > 1) return falha("retomada-conflitante");
  const programacao: RegistroRetomada | null = mensagens.data?.[0] ?? null;
  if (mensagemId && !programacao) return falha("retomada-inexistente");
  return { ok: true, valor: { imovel, programacao } };
}

export async function salvarRetomada(db: SupabaseClient, userId: string, entrada: {
  retomadaImovelId: string; id?: string; versao?: string; data: string; hora: string; texto: string; acao: "salvar" | "cancelar";
}): Promise<ResultadoRetomada<RegistroRetomada>> {
  const contexto = await carregarContextoRetomada(db, userId, entrada.retomadaImovelId, entrada.id);
  if (!contexto.ok) return contexto;
  const { imovel, programacao } = contexto.valor;
  const identidade = resolverContextoMensagem({ retomadaImovelId: entrada.retomadaImovelId, persistida: programacao ? {
    tipo: programacao.tipo, imovelId: programacao.imovel_id, agendaId: programacao.agenda_id ?? null,
  } : undefined });
  if (identidade.modo !== "retomada") return falha("estado-incompativel");
  if (entrada.id && (programacao?.status !== "agendada" || programacao.updated_at !== entrada.versao)) return falha("conflito-edicao");
  if (!entrada.id && programacao) return falha("retomada-conflitante");
  if (entrada.acao === "cancelar" && !entrada.id) return falha("retomada-inexistente");
  // Cancelamento não reativa nem reprograma; só uma linha ainda agendada pode mudar.
  if (entrada.acao === "salvar") {
    const erro = validarImovelRetomada(imovel) || validarFormularioRetomada(entrada.data, entrada.hora, entrada.texto);
    if (erro) return falha(erro);
  }
  const agora = agoraISOString();
  const campos = entrada.acao === "cancelar"
    ? { status: "cancelada", cancelamento_motivo: "usuario", cancelamento_origem: "usuario", cancelada_em: agora, updated_at: agora }
    : { mensagem: entrada.texto.trim(), data_envio: dataHoraRetomadaParaIso(entrada.data, entrada.hora), updated_at: agora };
  const consulta = entrada.id
    ? db.from("mensagens_agendadas").update(campos).eq("id", entrada.id).eq("user_id", userId).eq("tipo", "retomada-retirado").eq("imovel_id", imovel.id).eq("status", "agendada").eq("updated_at", entrada.versao!)
    : db.from("mensagens_agendadas").insert({ ...campos, user_id: userId, imovel_id: imovel.id, tipo: "retomada-retirado", status: "agendada", agenda_id: null, imoveis_consultados: null, nome_proprietario: imovel.proprietario_nome?.trim() || "Proprietário", telefone: imovel.proprietario_telefone });
  const salvo = await consulta.select("*");
  if (salvo.error) return falha(erroBancoRetomada(salvo.error));
  if (!Array.isArray(salvo.data) || salvo.data.length !== 1) return falha("conflito-edicao");
  return { ok: true, valor: salvo.data[0] };
}
