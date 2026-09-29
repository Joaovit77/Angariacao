import type { AtividadeIa } from "@/lib/calculo/atividadeIa";
import { fetchAutenticado } from "@/lib/auth/recuperacaoSessao";

export interface RespostaAtividadesIa {
  ok: boolean;
  atividades: AtividadeIa[];
  mensagem?: string;
}

export async function carregarAtividadesIa(): Promise<RespostaAtividadesIa> {
  try {
    const resposta = await fetchAutenticado("/api/ia/atividades", { cache: "no-store" }, { repetivel: true });
    if (!resposta) {
      return { ok: false, atividades: [], mensagem: "Sua sessão expirou. Entre novamente." };
    }
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
