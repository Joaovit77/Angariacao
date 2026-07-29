/* ================================================================
   GOOGLE AGENDA (lado do browser)
   Fala só com /api/google/* — o client secret e o refresh token nunca
   chegam aqui. Mesmo desenho de `envioWhatsapp.ts`: fora de
   mutacoes.ts porque não é escrita no Supabase, é efeito externo, e
   nunca lança — devolve o motivo para a UI decidir.

   A REGRA QUE GOVERNA ESTE ARQUIVO: falhar no Google NÃO pode
   derrubar o salvamento no painel. O compromisso é do corretor; a
   cópia na agenda do Google é conveniência. Por isso `sincronizar`
   é chamada DEPOIS da escrita no Supabase ter dado certo, e o seu
   erro vira um aviso — nunca um rollback.
   ================================================================ */
import type { FalhaGoogle } from "./calculo/googleAgenda";
import { getSupabase } from "./persistencia/supabase";

export interface ResultadoGoogle {
  ok: boolean;
  falha?: FalhaGoogle;
  mensagem?: string;
}

export interface EstadoConexaoGoogle {
  /** O servidor tem as variáveis do Google configuradas. */
  configurado: boolean;
  conectado: boolean;
  email: string | null;
}

async function comSessao(): Promise<string | null> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  return session?.access_token || null;
}

/** Estado da conexão, para a tela de Configurações. */
export async function estadoConexaoGoogle(): Promise<EstadoConexaoGoogle> {
  const token = await comSessao();
  if (!token) return { configurado: false, conectado: false, email: null };
  try {
    const r = await fetch("/api/google/conta", { headers: { Authorization: `Bearer ${token}` } });
    const corpo = (await r.json().catch(() => null)) as
      | { configurado?: boolean; conectado?: boolean; email?: string | null }
      | null;
    return {
      configurado: !!corpo?.configurado,
      conectado: !!corpo?.conectado,
      email: corpo?.email || null,
    };
  } catch {
    return { configurado: false, conectado: false, email: null };
  }
}

/** Manda o browser para a tela de consentimento do Google.

    A URL é montada no servidor (leva o `state` assinado), e a navegação é
    de página inteira de propósito: OAuth em popup ou iframe é bloqueado
    pelo próprio Google. Ao voltar, o callback redireciona para
    /agenda?google=..., e é a Agenda que traduz o resultado. */
export async function conectarGoogle(): Promise<ResultadoGoogle> {
  const token = await comSessao();
  if (!token) return { ok: false, falha: "sessao-expirada" };
  try {
    const r = await fetch("/api/google/conectar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const corpo = (await r.json().catch(() => null)) as (ResultadoGoogle & { url?: string }) | null;
    if (!corpo?.ok || !corpo.url) return corpo || { ok: false, falha: "falha-google" };
    window.location.href = corpo.url;
    return { ok: true };
  } catch {
    return { ok: false, falha: "falha-google" };
  }
}

export async function desconectarGoogle(): Promise<ResultadoGoogle> {
  const token = await comSessao();
  if (!token) return { ok: false, falha: "sessao-expirada" };
  try {
    const r = await fetch("/api/google/conta", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return ((await r.json().catch(() => null)) as ResultadoGoogle | null) || { ok: false, falha: "falha-google" };
  } catch {
    return { ok: false, falha: "falha-google" };
  }
}

/**
 * Leva um compromisso para o Google (criar/atualizar, ou remover).
 *
 * SILENCIOSA por natureza: devolve o resultado e não dá toast. Quem chama
 * são as mutações da agenda, e um "não consegui falar com o Google" a cada
 * salvamento — num corretor que sequer conectou a conta — seria ruído puro.
 * A tela de Configurações é onde o estado da conexão se resolve.
 *
 * Só o `agendaId` viaja: o conteúdo do evento a rota lê do banco.
 */
export async function sincronizarCompromisso(
  agendaId: string,
  acao?: "remover",
): Promise<ResultadoGoogle> {
  const token = await comSessao();
  if (!token) return { ok: false, falha: "sessao-expirada" };
  try {
    const r = await fetch("/api/google/sincronizar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(acao ? { agendaId, acao } : { agendaId }),
    });
    return ((await r.json().catch(() => null)) as ResultadoGoogle | null) || { ok: false, falha: "falha-google" };
  } catch {
    return { ok: false, falha: "falha-google" };
  }
}
