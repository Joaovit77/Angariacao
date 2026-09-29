import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { imovelBloqueiaMensagemLivre } from "@/lib/calculo/mensagemLivreImovel";
import type { DbMensagemAgendada } from "@/lib/mensagensAgendadas";

/* ================================================================
   REVALIDAÇÃO DA MENSAGEM LIVRE VINCULADA A IMÓVEL (LD-163)

   Módulo SÓ DE SERVIDOR, chamado pelo worker com service role; por isso
   toda consulta filtra por `user_id` explicitamente. A chave é o
   `imovel_id` da mensagem, nunca o telefone: trocar o telefone do imóvel
   depois do agendamento não tira a mensagem do alcance desta guarda.

   Não toca a verificação de disponibilidade: aquela tem o próprio caminho
   (M2/M4, `disponibilidadeMensagem.ts`).
   ================================================================ */

export type RevalidacaoMensagemLivre =
  | { acao: "enviar" }
  | { acao: "cancelar"; situacao: "retirado" | string };

/**
 * Lê o estado ATUAL do imóvel, imediatamente antes do envio. Falha de
 * leitura ou imóvel ausente lançam: o worker não transforma banco
 * indisponível em permissão para enviar.
 */
export async function revalidarMensagemLivreVinculada(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
): Promise<RevalidacaoMensagemLivre> {
  if (!item.imovel_id) return { acao: "enviar" };
  const { data, error } = await admin
    .from("imoveis")
    .select("status, retirado")
    .eq("id", item.imovel_id)
    .eq("user_id", item.user_id)
    .maybeSingle();
  if (error) throw new Error("leitura-imovel-falhou");
  if (!data) throw new Error("imovel-nao-encontrado");
  const imovel = data as { status: string | null; retirado: boolean | null };
  if (!imovelBloqueiaMensagemLivre(imovel)) return { acao: "enviar" };
  return { acao: "cancelar", situacao: imovel.retirado === true ? "retirado" : String(imovel.status) };
}

/**
 * Fecha a linha que o próprio worker reclamou. Só sai de `processando`:
 * um estado concorrente (outra execução, cancelamento do usuário) não é
 * sobrescrito.
 */
export async function cancelarMensagemLivreImovelIndisponivel(
  admin: SupabaseClient,
  item: DbMensagemAgendada,
  agora: string,
): Promise<{ ok: boolean; erro: string | null }> {
  const { error } = await admin
    .from("mensagens_agendadas")
    .update({
      status: "cancelada",
      cancelamento_motivo: "imovel-indisponivel",
      cancelamento_origem: "worker",
      cancelada_em: agora,
      updated_at: agora,
    })
    .eq("id", item.id)
    .eq("user_id", item.user_id)
    .eq("status", "processando");
  return { ok: !error, erro: error?.message ?? null };
}
