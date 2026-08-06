/* ================================================================
   ADMIN (lado do browser)
   Chama as rotas /api/admin/*, que são quem fala com o banco usando a
   service role — ela nunca chega aqui. Fora de mutacoes.ts pelo mesmo
   motivo de `ia.ts` e `envioWhatsapp.ts`: não é escrita na carteira do
   usuário, é operação do sistema.
   Nunca lança: devolve o resultado ou o motivo da falha.
   ================================================================ */
import type { CorretorAdmin, EventoLog } from "./calculo/admin";
import type { GastoIa } from "./calculo/custoIa";
import { getSupabase } from "./persistencia/supabase";

async function autorizacao(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Esta conta é administradora?
 *
 * Falso em qualquer dúvida (sem sessão, rota fora do ar, resposta
 * estranha). Esconder o menu é conveniência — a trava está no
 * servidor, e toda rota de admin reconfere.
 */
export async function souAdmin(): Promise<boolean> {
  const headers = await autorizacao();
  if (!headers) return false;
  try {
    const r = await fetch("/api/admin/eu", { headers });
    const dados = (await r.json().catch(() => null)) as { admin?: unknown } | null;
    return dados?.admin === true;
  } catch {
    return false;
  }
}

export interface PainelAdmin {
  ok: boolean;
  mensagem?: string;
  corretores?: CorretorAdmin[];
  /** Gasto de contas já removidas — não pertence a ninguém da lista,
      mas saiu da fatura. */
  orfao?: GastoIa | null;
  desde?: string;
  hoje?: string;
}

export async function carregarPainelAdmin(desde?: string): Promise<PainelAdmin> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const q = desde ? `?desde=${encodeURIComponent(desde)}` : "";
    const r = await fetch(`/api/admin/corretores${q}`, { headers });
    const dados = (await r.json().catch(() => null)) as PainelAdmin | null;
    return dados ?? { ok: false, mensagem: "Não foi possível carregar o painel." };
  } catch {
    return { ok: false, mensagem: "Não foi possível carregar o painel." };
  }
}

export interface RespostaLogs {
  ok: boolean;
  mensagem?: string;
  eventos?: EventoLog[];
}

export async function carregarLogs(
  filtro: { nivel?: string; categoria?: string; userId?: string; limite?: number } = {},
): Promise<RespostaLogs> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  const q = new URLSearchParams();
  if (filtro.nivel) q.set("nivel", filtro.nivel);
  if (filtro.categoria) q.set("categoria", filtro.categoria);
  if (filtro.userId) q.set("userId", filtro.userId);
  if (filtro.limite) q.set("limite", String(filtro.limite));
  try {
    const r = await fetch(`/api/admin/logs?${q.toString()}`, { headers });
    const dados = (await r.json().catch(() => null)) as RespostaLogs | null;
    return dados ?? { ok: false, mensagem: "Não foi possível carregar o log." };
  } catch {
    return { ok: false, mensagem: "Não foi possível carregar o log." };
  }
}

interface RespostaAcao {
  ok: boolean;
  mensagem?: string;
}

async function acao(rota: string, corpo: unknown): Promise<RespostaAcao> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch(rota, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = (await r.json().catch(() => null)) as RespostaAcao | null;
    return dados ?? { ok: false, mensagem: "Não foi possível concluir." };
  } catch {
    return { ok: false, mensagem: "Não foi possível concluir." };
  }
}

export function definirIa(userId: string, liberado: boolean): Promise<RespostaAcao> {
  return acao("/api/admin/ia", { userId, liberado });
}

/** Token em branco mantém o que já está gravado (a rota trata isso) —
    é o caso de quem só está corrigindo o nome da instância. */
export function salvarInstancia(userId: string, instancia: string, token: string): Promise<RespostaAcao> {
  return acao("/api/admin/instancia", { userId, instancia, token });
}
