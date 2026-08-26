"use client";

import { useCallback, useEffect, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import {
  fromDbMensagem,
  type DbMensagemAgendada,
  type MensagemAgendada,
} from "@/lib/mensagensAgendadas";
import { getSupabase } from "@/lib/persistencia/supabase";

const INTERVALO_ATUALIZACAO_MS = 30_000;

/** Fonte compartilhada dos agendamentos. A assinatura reage quando a tabela
 * está publicada no Realtime; foco, evento local e verificação periódica são
 * a rede para ambientes em que somente imoveis está na publicação. */
export function useMensagensAgendadas() {
  const { usuario } = useSessao();
  const usuarioId = usuario?.id ?? null;
  const [itens, setItens] = useState<MensagemAgendada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (silencioso = false): Promise<boolean> => {
    if (!usuarioId) {
      setCarregando(false);
      return false;
    }
    if (!silencioso) setCarregando(true);
    const { data, error } = await getSupabase()
      .from("mensagens_agendadas")
      .select("*")
      .eq("user_id", usuarioId)
      .order("data_envio", { ascending: false });

    if (error) {
      setErro("Não foi possível carregar as mensagens agendadas.");
      setCarregando(false);
      return false;
    }
    setItens(((data || []) as DbMensagemAgendada[]).map(fromDbMensagem));
    setErro("");
    setCarregando(false);
    return true;
  }, [usuarioId]);

  useEffect(() => {
    if (!usuarioId) return;
    const supabase = getSupabase();
    const atualizar = () => void carregar(true);
    const inicial = window.setTimeout(() => void carregar(), 0);
    const intervalo = window.setInterval(atualizar, INTERVALO_ATUALIZACAO_MS);
    window.addEventListener("focus", atualizar);
    window.addEventListener("mensagens-agendadas:alteradas", atualizar);

    const canal = supabase
      .channel(`mensagens-agendadas:${usuarioId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mensagens_agendadas",
          filter: `user_id=eq.${usuarioId}`,
        },
        atualizar,
      )
      .subscribe();

    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(intervalo);
      window.removeEventListener("focus", atualizar);
      window.removeEventListener("mensagens-agendadas:alteradas", atualizar);
      void supabase.removeChannel(canal);
    };
  }, [carregar, usuarioId]);

  return { itens, carregando, erro, recarregar: carregar };
}
