/* ================================================================
   API: LEVA UM COMPROMISSO PARA O GOOGLE AGENDA

   POST { agendaId, acao?: "remover" } + Bearer do Supabase.

   O CONTEÚDO DO EVENTO SAI DO BANCO, não do corpo da requisição —
   mesma regra da rota de envio de WhatsApp ("o destinatário sai do
   banco"). Aqui o motivo é outro e igualmente concreto: se o browser
   mandasse título e data, esta rota viraria um "escreva o que eu
   quiser na agenda do usuário", e um bug de UI passaria a corromper a
   agenda pessoal dele em vez de só a tela.

   A leitura usa o token de QUEM CHAMOU (não a service role): o RLS
   escopa ao dono, então pedir o compromisso de outra pessoa volta
   vazio. A service role aparece só onde não há alternativa — ler o
   refresh token, que é o que `contaDoUsuario` faz.

   REMOÇÃO ACONTECE ANTES da exclusão local, com a linha ainda no
   banco: é assim que o `google_event_id` continua saindo do banco em
   vez de vir do browser. Invertida a ordem, o cliente teria que mandar
   o id do evento, e aí ele poderia pedir a exclusão de qualquer evento
   da agenda da pessoa.
   ================================================================ */
import { createClient } from "@supabase/supabase-js";
import { eventoDoCompromisso, GOOGLE_API_BASE, mensagemFalhaGoogle, type FalhaGoogle } from "@/lib/calculo/googleAgenda";
import { fromDbAgenda, fromDbImovel } from "@/lib/persistencia/mapeadores";
import { accessToken, admin, ambiente, contaDoUsuario, usuarioDaRequisicao } from "../_comum";

function erro(falha: FalhaGoogle, status: number): Response {
  return Response.json({ ok: false, falha, mensagem: mensagemFalhaGoogle(falha) }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const env = ambiente();
  if (!env) return erro("nao-configurado", 500);

  const usuario = await usuarioDaRequisicao(request, env);
  if (!usuario) return erro("sessao-expirada", 401);

  const conta = await contaDoUsuario(env, usuario.id);
  if (!conta) return erro("sem-conexao-google", 422);

  let corpo: { agendaId?: unknown; acao?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("compromisso-nao-encontrado", 400);
  }
  const agendaId = typeof corpo.agendaId === "string" ? corpo.agendaId : "";
  const remover = corpo.acao === "remover";
  if (!agendaId) return erro("compromisso-nao-encontrado", 400);

  // Cliente do usuário: o RLS faz o escopo. O compromisso de outro dono
  // simplesmente não aparece.
  const auth = request.headers.get("authorization") || "";
  const doUsuario = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: linha, error: erroBusca } = await doUsuario
    .from("agenda")
    .select("*")
    .eq("id", agendaId)
    .maybeSingle();
  if (erroBusca) {
    console.error("Google Agenda: falha ao ler o compromisso:", erroBusca.message);
    return erro("falha-google", 500);
  }
  if (!linha) return erro("compromisso-nao-encontrado", 404);

  const eventoId = (linha.google_event_id as string | null) || "";

  // Nada a remover lá: o compromisso nunca chegou ao Google. Sucesso, não erro
  // — quem chamou só quer garantir que não sobrou evento.
  if (remover && !eventoId) return Response.json({ ok: true });

  const token = await accessToken(env, conta.refreshToken);
  if ("falha" in token) return erro(token.falha, token.falha === "autorizacao-expirada" ? 422 : 502);

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
      return erro("falha-google", 502);
    }
    // 404/410 = já não existe (o corretor apagou pelo celular). O objetivo
    // era não sobrar evento, e não sobrou — tratar como falha faria a UI
    // reclamar de algo que está exatamente como deveria.
    if (!r.ok && r.status !== 404 && r.status !== 410) {
      console.error("Google Agenda: exclusão recusada:", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return erro("falha-google", 502);
    }
    return Response.json({ ok: true });
  }

  // Monta o evento a partir do banco. O imóvel é opcional — compromisso
  // avulso não tem, e o evento continua válido sem endereço.
  const item = fromDbAgenda(linha);
  let imovel = null;
  if (item.imovelId) {
    const { data: linhaImovel } = await doUsuario
      .from("imoveis")
      .select("*")
      .eq("id", item.imovelId)
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
    return erro("falha-google", 502);
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
      return erro("falha-google", 502);
    }
  }

  if (!r.ok) {
    console.error("Google Agenda: gravação recusada:", r.status, (await r.text().catch(() => "")).slice(0, 300));
    return erro("falha-google", 502);
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
      .eq("user_id", usuario.id)
      .is("email", null);
    if (error) console.error("Google Agenda: não foi possível guardar o e-mail da conta:", error.message);
  }

  // Guarda o ponteiro só quando ele mudou. Escrita com o token do usuário:
  // é dado dele, sob RLS — a service role não tem o que fazer aqui.
  if (novoId && novoId !== eventoId) {
    const { error } = await doUsuario
      .from("agenda")
      .update({ google_event_id: novoId })
      .eq("id", agendaId);
    if (error) {
      // O evento existe no Google, mas o painel não sabe o id: o próximo
      // salvamento criaria um DUPLICADO. Vale gritar no log.
      console.error("Google Agenda: evento criado mas o id não foi salvo:", error.message);
    }
  }

  return Response.json({ ok: true, eventoId: novoId || eventoId });
}
