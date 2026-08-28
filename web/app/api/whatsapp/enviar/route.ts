/* ================================================================
   API: ENVIO DIRETO DE WHATSAPP (Evolution API)
   A PRIMEIRA rota de servidor do projeto, e ela existe por um motivo
   só: o token da Evolution não pode chegar ao browser. Quem tivesse o
   token mandaria WhatsApp pelo nosso número à vontade — então o
   browser fala com esta rota, e só ela fala com a Evolution.
   (O CLAUDE.md já previa isso: "uma futura API Route pode ter chave
   de servidor; código que chega ao browser, nunca".)

   Contrato: POST { imovelId, mensagem } + Authorization: Bearer
   <access_token do Supabase>. Responde { ok: true } ou
   { ok: false, falha: FalhaEnvio } — os motivos de lib/calculo/whatsapp,
   que a UI traduz para o corretor.

   Por que só o imovelId, e não o telefone: o número sai do BANCO, lido
   com o token de quem chamou (as políticas RLS escopam a busca ao dono).
   Se o browser mandasse o número, esta rota viraria um disparador de
   mensagem para qualquer número — o texto o corretor edita, o
   destinatário não.

   DE QUAL NÚMERO SAI A MENSAGEM: da linha do corretor em
   `whatsapp_instancias`, não de env var. A env var era uma instância só
   para o deploy inteiro — com dois corretores, o segundo mandaria pelo
   número do primeiro, e a resposta do proprietário cairia na caixa
   errada (e, com o webhook de recebimento, seria creditada ao imóvel do
   outro). Sem linha na tabela a rota RECUSA em vez de cair num padrão:
   um padrão aqui é sempre o número de outra pessoa.
   ================================================================ */
import { createClient } from "@supabase/supabase-js";
import { mensagemFalhaEnvio, numeroEvolution, type FalhaEnvio } from "@/lib/calculo/whatsapp";
import { confirmacaoVisitaValida } from "@/lib/calculo/confirmacaoVisita";
import { agoraISOComSegundos, todayISO } from "@/lib/datas";
import { idMensagemEvolution, registrarMensagemEnviada } from "@/lib/servidor/historicoWhatsapp";
import { registrarEvento } from "@/lib/servidor/registro";
import { instanciaWhatsappDoUsuario } from "@/lib/servidor/instanciaWhatsapp";
import { destinoAncoradoDaConversa } from "@/lib/servidor/identidadeWhatsapp";
import type { NotaImovel } from "@/lib/tipos";

/** Corpo de resposta — espelha o que lib/envioWhatsapp espera. */
interface Resposta {
  ok: boolean;
  falha?: FalhaEnvio;
  mensagem?: string;
  historicoPersistido?: boolean;
}

function erro(falha: FalhaEnvio, status: number): Response {
  const corpo: Resposta = { ok: false, falha, mensagem: mensagemFalhaEnvio(falha) };
  return Response.json(corpo, { status });
}

/** Resolve o número no WhatsApp: devolve o jid canônico, ou null se a conta
    não existe. Este passo não é firula — é ele que:

    1. Resolve o "nono dígito". O WhatsApp guarda muitos celulares brasileiros
       SEM o 9 (em Londrina, 5543998024316 e 554398024316 são a MESMA conta, e
       o jid canônico é o sem o 9). Enviar para a forma errada pode não chegar;
       aqui perguntamos e usamos a forma que o WhatsApp reconhece.
    2. Barra o número que não existe — typo do corretor, ou o telefone
       estrangeiro que o telefoneWhatsapp() disfarçou de brasileiro colando um
       55 na frente. Nenhuma regex distingue isso; a consulta distingue.

    Em caso de erro na consulta devolvemos `undefined` (≠ null): não sabemos, e
    aí seguimos para o envio em vez de bloquear por causa de um passo auxiliar. */
async function resolverJid(
  serverUrl: string,
  instancia: string,
  token: string,
  numero: string,
): Promise<string | null | undefined> {
  try {
    const r = await fetch(`${serverUrl}/chat/whatsappNumbers/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify({ numbers: [numero] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return undefined;
    const lista = (await r.json()) as Array<{ jid?: string; exists?: boolean }> | null;
    const achado = Array.isArray(lista) ? lista[0] : null;
    if (!achado) return undefined;
    if (!achado.exists) return null;
    // "554398024316@s.whatsapp.net" -> "554398024316"
    const jid = typeof achado.jid === "string" ? achado.jid.split("@")[0] : "";
    return jid || numero;
  } catch {
    return undefined;
  }
}

/** Traduz a recusa da Evolution para os nossos motivos.
    Ela responde 400 tanto para "número não tem WhatsApp" quanto para
    "instância desconectada", então o código HTTP sozinho não basta — o
    texto do corpo é o que separa os dois. */
function classificarErroEvolution(status: number, corpo: string): FalhaEnvio {
  const texto = corpo.toLowerCase();
  if (status === 401 || status === 403) return "sem-permissao";
  if (status === 404) return "nao-configurado";
  if (texto.includes("not") && texto.includes("whatsapp")) return "sem-whatsapp";
  if (texto.includes("exists") && texto.includes("false")) return "sem-whatsapp";
  if (texto.includes("connection") || texto.includes("closed") || texto.includes("disconnected"))
    return "instancia-desconectada";
  return "falha-evolution";
}

/** Instância de WhatsApp DESTE corretor.

    Antes vinha de env var — uma só para o deploy inteiro, o que significava
    que um segundo corretor mandaria mensagem pelo número do primeiro, e a
    resposta do proprietário voltaria para a caixa errada. Agora sai da
    tabela `whatsapp_instancias`, uma linha por conta.

    Precisa da service role porque aquela tabela não tem política nenhuma de
    leitura: o `token` é segredo e uma política de select o entregaria ao
    browser com a anon key. A disciplina que torna isso seguro é a mesma do
    webhook — o `userId` já foi verificado por `auth.getUser()` e nunca veio
    do corpo da requisição. */
async function instanciaDoUsuario(
  supabaseUrl: string,
  userId: string,
): Promise<Awaited<ReturnType<typeof instanciaWhatsappDoUsuario>>> {
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!servico) {
    console.error("Envio de WhatsApp: SUPABASE_SERVICE_ROLE_KEY ausente (ver web/.env.example).");
    return { ok: false, falha: "persistencia" };
  }
  const admin = createClient(supabaseUrl, servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return instanciaWhatsappDoUsuario(admin, userId);
}

export async function POST(request: Request): Promise<Response> {
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!serverUrl || !supabaseUrl || !anonKey) {
    console.error("Envio de WhatsApp: variáveis de ambiente da Evolution ausentes (ver web/.env.example).");
    return erro("nao-configurado", 500);
  }

  // 1. Quem está chamando? Sem sessão do Supabase, a rota não existe —
  //    senão qualquer um na internet mandaria WhatsApp pelo nosso número.
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return erro("sessao-expirada", 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || !sessao.user) return erro("sessao-expirada", 401);

  // 2. Corpo da requisição. Validamos antes de consultar a integração para um
  //    payload ruim nunca aparecer como falha de instância.
  let corpo: { imovelId?: unknown; mensagem?: unknown; confirmacaoVisita?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("mensagem-invalida", 400);
  }
  const imovelId = typeof corpo.imovelId === "string" ? corpo.imovelId.trim() : "";
  const mensagem = typeof corpo.mensagem === "string" ? corpo.mensagem.trim() : "";
  if (!imovelId) return erro("imovel-nao-encontrado", 400);
  if (!mensagem) return erro("mensagem-invalida", 422);
  const confirmacaoVisita =
    corpo.confirmacaoVisita === undefined
      ? undefined
      : confirmacaoVisitaValida(corpo.confirmacaoVisita, todayISO()) || null;
  if (confirmacaoVisita === null) {
    return Response.json(
      { ok: false, falha: "falha-evolution", mensagem: "Informe uma data e um horário válidos para a visita." } satisfies Resposta,
      { status: 400 },
    );
  }

  // 3. Qual número é o DESTE corretor? Sem linha na tabela não há por onde
  //    enviar — e o certo é recusar, nunca cair num número padrão: com vários
  //    corretores, o padrão seria mandar pelo número de outra pessoa.
  const minha = await instanciaDoUsuario(supabaseUrl, sessao.user.id);
  if (!minha.ok) {
    // O evento que mais importa no painel de admin: alguém tentando
    // trabalhar numa conta que ninguém terminou de configurar. Sem isto,
    // o único sinal é o corretor reclamando — se ele reclamar.
    registrarEvento({
      userId: sessao.user.id,
      categoria: "whatsapp",
      nivel: "erro",
      evento: minha.falha === "sem-instancia" ? "sem-instancia" : "recuperacao-instancia-falhou",
      detalhe: minha.falha === "sem-instancia" ? null : minha.falha,
    });
    return minha.falha === "sem-instancia"
      ? erro("sem-instancia", 422)
      : minha.falha === "nao-configurado"
        ? erro("nao-configurado", 503)
        : erro("falha-evolution", 502);
  }
  const { instancia, token } = minha;

  // 4. O telefone vem do banco, nunca do browser. O RLS garante que o
  //    imóvel é de quem chamou — de outro dono, isto volta vazio.
  const { data: imovel, error: erroBusca } = await supabase
    .from("imoveis")
    .select("proprietario_telefone, notas")
    .eq("id", imovelId)
    .maybeSingle();
  if (erroBusca) {
    console.error("Envio de WhatsApp: falha ao buscar o imóvel:", erroBusca.message);
    return erro("falha-evolution", 500);
  }
  if (!imovel) return erro("imovel-nao-encontrado", 404);

  const telefone = (imovel.proprietario_telefone as string | null) || "";
  const notas = Array.isArray(imovel.notas) ? (imovel.notas as NotaImovel[]) : [];
  if (!telefone.trim()) return erro("sem-telefone", 422);
  const numero = numeroEvolution(telefone);
  if (!numero) return erro("numero-invalido", 422);

  // 5. O número existe no WhatsApp? Também é aqui que o nono dígito se resolve.
  const base = serverUrl.replace(/\/+$/, "");
  const jid = await resolverJid(base, instancia, token, numero);
  const destinoAncorado =
    jid === null
      ? await destinoAncoradoDaConversa(base, instancia, token, telefone, notas)
      : null;
  if (jid === null && !destinoAncorado) {
    // "aviso", não "erro": é um fato sobre o contato (telefone fixo,
    // número errado no cadastro), não sobre o sistema. É também o que
    // explica, no painel, uma taxa de falha alta num lote sem nada
    // quebrado — e o dono da carteira vê isso no relatório do lote.
    registrarEvento({
      userId: sessao.user.id,
      categoria: "whatsapp",
      nivel: "aviso",
      evento: "sem-whatsapp",
      detalhe: null,
    });
    return erro("sem-whatsapp", 422);
  }
  const destino = jid ?? destinoAncorado ?? numero;

  // 6. Envia. Usamos o token DA INSTÂNCIA (não a global key): ele basta para
  //    mandar mensagem e não dá poder de criar/apagar instâncias.
  let resposta: globalThis.Response;
  try {
    resposta = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify({ number: destino, text: mensagem }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error("Envio de WhatsApp: a Evolution não respondeu:", e);
    return erro("falha-evolution", 502);
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    // O detalhe fica no log do servidor (pode citar número/instância) — o
    // browser recebe só o motivo classificado.
    console.error(`Envio de WhatsApp: Evolution respondeu ${resposta.status}:`, detalhe.slice(0, 500));
    const falha = classificarErroEvolution(resposta.status, detalhe);
    /* No log do admin vai só o motivo CLASSIFICADO, nunca o corpo da
       resposta da Evolution — ele cita número de proprietário, e o log é
       lido por quem opera o sistema, que não é o dono daquela carteira
       (a regra 3 de `_registro.ts`).

       Instância caída é "erro" (alguém precisa reler o QR); número sem
       WhatsApp é "aviso", porque é um fato sobre o contato e não sobre o
       sistema — misturar os dois faria o painel acusar problema técnico
       toda vez que um proprietário tivesse telefone fixo. */
    registrarEvento({
      userId: sessao.user.id,
      categoria: "whatsapp",
      nivel: falha === "sem-whatsapp" || falha === "numero-invalido" ? "aviso" : "erro",
      evento: falha === "instancia-desconectada" ? "instancia-desconectada" : "envio-falhou",
      detalhe: falha,
    });
    return erro(falha, 502);
  }

  const respostaEvolution = await resposta.json().catch(() => null);
  const mensagemId = idMensagemEvolution(respostaEvolution) || `api:${crypto.randomUUID()}`;
  const historico = await registrarMensagemEnviada(supabase, {
    imovelId,
    userId: sessao.user.id,
    mensagemId,
    texto: mensagem,
    data: agoraISOComSegundos(),
    origem: "api-evolution",
    confirmacaoVisita,
  });
  if (historico.erro) {
    // A Evolution já aceitou a mensagem: responder falha faria a interface
    // sugerir reenvio e poderia duplicá-la. O webhook `fromMe` ainda pode
    // recuperar o histórico; registramos apenas metadados, nunca o texto.
    console.error("Envio de WhatsApp: mensagem enviada, mas histórico não foi persistido:", historico.erro);
    registrarEvento({
      userId: sessao.user.id,
      categoria: "whatsapp",
      nivel: "erro",
      evento: "historico-envio-falhou",
      detalhe: "api-evolution",
    });
  }

  registrarEvento({
    userId: sessao.user.id,
    categoria: "whatsapp",
    nivel: "info",
    evento: "envio-ok",
    detalhe: null,
  });

  const okCorpo: Resposta = { ok: true, historicoPersistido: !historico.erro };
  return Response.json(okCorpo);
}
