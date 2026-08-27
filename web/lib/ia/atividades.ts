import type { AtividadeIa } from "@/lib/calculo/atividadeIa";
import { getSupabase } from "@/lib/persistencia/supabase";

export interface RespostaAtividadesIa {
  ok: boolean;
  atividades: AtividadeIa[];
  mensagem?: string;
}

export async function carregarAtividadesIa(): Promise<RespostaAtividadesIa> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) {
    return { ok: false, atividades: [], mensagem: "Sua sessão expirou. Entre novamente." };
  }

  try {
    const resposta = await fetch("/api/ia/atividades", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const dados = await resposta.json().catch(() => null) as RespostaAtividadesIa | null;
    if (!resposta.ok || !dados?.ok || !Array.isArray(dados.atividades)) {
      return {
        ok: false,
        atividades: [],
        mensagem: dados?.mensagem || "Não foi possível carregar o histórico.",
      };
    }
    return { ok: true, atividades: dados.atividades };
  } catch {
    return { ok: false, atividades: [], mensagem: "Não foi possível carregar o histórico." };
  }
}
