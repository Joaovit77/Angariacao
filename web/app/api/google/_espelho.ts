/* ================================================================
   GOOGLE AGENDA — levar UM compromisso para lá

   Não é rota (o `_` o mantém fora do roteamento), pelo mesmo motivo de
   `_comum.ts`: é o miolo que agora tem DOIS chamadores, e uma segunda
   cópia dele divergiria em silêncio.

   Ele nasceu dentro de `sincronizar/route.ts`, que só sabia atender o
   browser: a rota autentica pelo Bearer do corretor e lê o compromisso
   com o token dele, deixando o RLS fazer o escopo. O webhook do WhatsApp
   não tem nada disso — quem o chama é a Evolution, não uma pessoa logada
   — e por isso o compromisso que a agenda inteligente marcava sozinha
   NUNCA chegava ao Google. Era o caso mais valioso de todos: hora que o
   próprio proprietário combinou por escrito, e o celular do corretor não
   tocava.

   Daí a forma da função: ela recebe o cliente do Supabase e o `userId`
   em vez de deduzi-los. O browser passa o cliente do usuário (RLS liga
   sozinho); o webhook passa a service role, que ignora RLS.

   E daí também a regra que a segura: **toda consulta aqui filtra por
   `user_id` explicitamente**, mesmo quando o RLS já faria isso. Sob a
   service role o filtro é a ÚNICA barreira entre um corretor e a agenda
   do outro; sob o token do usuário ele é redundante e inofensivo. Um
   filtro a mais não custa nada, e é o mesmo raciocínio do "o user_id
   nunca vem da requisição" que vale no webhook e na rota de envio.
   ================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  eventoDoCompromisso,
  GOOGLE_API_BASE,
  type FalhaGoogle,
} from "@/lib/calculo/googleAgenda";
import { fromDbAgenda, fromDbImovel } from "@/lib/persistencia/mapeadores";
import { registrarEvento } from "@/lib/servidor/registro";
import { accessToken, admin, contaDoUsuario, type Ambiente } from "./_comum";

export type ResultadoEspelho =
  | { ok: true; eventoId: string }
  | { ok: false; falha: FalhaGoogle };

/**
 * Cria, atualiza ou remove o evento do Google correspondente a um
 * compromisso do painel.
 *
 * O CONTEÚDO DO EVENTO SAI DO BANCO, nunca de quem chamou — a mesma regra
 * do "o destinatário sai do banco" no envio de WhatsApp. Passar título e
 * data por parâmetro transformaria isto num "escreva o que eu quiser na
 * agenda pessoal do corretor", e um bug de UI passaria a corromper a
 * agenda dele em vez de só a tela.
 */
export async function espelharCompromisso(
  env: Ambiente,
  db: SupabaseClient,
  userId: string,
  agendaId: string,
  opcoes: { remover?: boolean } = {},
): Promise<ResultadoEspelho> {
  const remover = opcoes.remover === true;

  const conta = await contaDoUsuario(env, userId);
  if (!conta) return { ok: false, falha: "sem-conexao-google" };

  const { data: linha, error: erroBusca } = await db
    .from("agenda")
    .select("*")
    .eq("id", agendaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (erroBusca) {
    console.error("Google Agenda: falha ao ler o compromisso:", erroBusca.message);
    return { ok: false, falha: "falha-google" };
  }
  if (!linha) return { ok: false, falha: "compromisso-nao-encontrado" };

  const eventoId = (linha.google_event_id as string | null) || "";

  // Nada a remover lá: o compromisso nunca chegou ao Google. Sucesso, não erro
  // — quem chamou só quer garantir que não sobrou evento.
  if (remover && !eventoId) return { ok: true, eventoId: "" };

  const token = await accessToken(env, conta.refreshToken);
  if ("falha" in token) {
    /* A armadilha documentada no CLAUDE.md, e o lugar onde ela aparece:
       enquanto a tela de consentimento estiver em modo "Teste" no Google
       Cloud, o refresh token expira em 7 DIAS. A sincronização funciona a
       semana inteira e quebra sozinha — sem erro visível para quem opera,
       porque o espelhamento é silencioso por design (falhar no Google não
       pode derrubar o salvamento do compromisso).

       É o exemplo perfeito do que o log existe para pegar: quebra em
       silêncio, na conta de um corretor só, e ninguém fica sabendo. */
    registrarEvento({
      userId,
      categoria: "google",
      nivel: "erro",
      evento: token.falha === "autorizacao-expirada" ? "google-expirado" : "google-falhou",
      detalhe: token.falha,
    });
    return { ok: false, falha: token.falha };
  }

  const base = `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(conta.calendarId)}/events`;
  const cabecalho = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token.token}`,
  };

  if (remover) {
    let r: Response;
    try {
      r = await fetch(`${base}/${encodeURIComponent(eventoId)}`, {
        method: "DELETE",
        headers: cabecalho,
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      console.error("Google Agenda: o Google não respondeu à exclusão:", e);
      return { ok: false, falha: "falha-google" };
    }
    // 404/410 = já não existe (o corretor apagou pelo celular). O objetivo
    // era não sobrar evento, e não sobrou — tratar como falha faria a UI
    // reclamar de algo que está exatamente como deveria.
    if (!r.ok && r.status !== 404 && r.status !== 410) {
      console.error("Google Agenda: exclusão recusada:", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return { ok: false, falha: "falha-google" };
    }
    return { ok: true, eventoId: "" };
  }

  // Monta o evento a partir do banco. O imóvel é opcional — compromisso
  // avulso não tem, e o evento continua válido sem endereço.
  const item = fromDbAgenda(linha);
  let imovel = null;
  if (item.imovelId) {
    const { data: linhaImovel } = await db
      .from("imoveis")
      .select("*")
      .eq("id", item.imovelId)
      .eq("user_id", userId)
      .maybeSingle();
    if (linhaImovel) imovel = fromDbImovel(linhaImovel);
  }
  const evento = eventoDoCompromisso(item, imovel);

  // Com id, ATUALIZA; sem id, cria. É esta distinção que impede a visita
  // remarcada três vezes de virar três eventos no celular.
  let r: Response;
  try {
    r = await fetch(eventoId ? `${base}/${encodeURIComponent(eventoId)}` : base, {
      method: eventoId ? "PATCH" : "POST",
      headers: cabecalho,
      body: JSON.stringify(evento),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error("Google Agenda: o Google não respondeu à gravação:", e);
    return { ok: false, falha: "falha-google" };
  }

  // O evento sumiu do lado de lá (apagado pelo celular) — recria em vez de
  // desistir, senão o compromisso ficaria para sempre fora da agenda sem que
  // nada explicasse por quê.
  if ((r.status === 404 || r.status === 410) && eventoId) {
    try {
      r = await fetch(base, {
        method: "POST",
        headers: cabecalho,
        body: JSON.stringify(evento),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      console.error("Google Agenda: falha ao recriar o evento:", e);
      return { ok: false, falha: "falha-google" };
    }
  }

  if (!r.ok) {
    console.error("Google Agenda: gravação recusada:", r.status, (await r.text().catch(() => "")).slice(0, 300));
    return { ok: false, falha: "falha-google" };
  }

  const criado = (await r.json().catch(() => null)) as {
    id?: string;
    creator?: { email?: string };
    organizer?: { email?: string };
  } | null;
  const novoId = criado?.id || "";

  // O rótulo "conectado como fulano@gmail.com", de graça: o evento volta com
  // o e-mail da conta que o criou. É o que evita o corretor com duas contas
  // autorizar uma e procurar a visita na outra — sem pedir o escopo
  // `userinfo.email` só para isso (ver o comentário no callback).
  // Grava uma vez; a cada sincronização seguinte o `email` já tem valor e o
  // filtro `.is("email", null)` não acha linha.
  const emailDaConta = criado?.creator?.email || criado?.organizer?.email || null;
  if (emailDaConta) {
    const { error } = await admin(env)
      .from("google_contas")
      .update({ email: emailDaConta })
      .eq("user_id", userId)
      .is("email", null);
    if (error) console.error("Google Agenda: não foi possível guardar o e-mail da conta:", error.message);
  }

  // Guarda o ponteiro só quando ele mudou.
  if (novoId && novoId !== eventoId) {
    const { error } = await db
      .from("agenda")
      .update({ google_event_id: novoId })
      .eq("id", agendaId)
      .eq("user_id", userId);
    if (error) {
      // O evento existe no Google, mas o painel não sabe o id: o próximo
      // salvamento criaria um DUPLICADO. Vale gritar no log.
      console.error("Google Agenda: evento criado mas o id não foi salvo:", error.message);
    }
  }

  return { ok: true, eventoId: novoId || eventoId };
}
