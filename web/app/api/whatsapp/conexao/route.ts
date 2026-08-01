/* ================================================================
   API: ESTADO DA CONEXÃO DO WHATSAPP (e o QR para reconectar)

   Existe pelo mesmo motivo das outras rotas de servidor: o token da
   instância não pode chegar ao browser. Aqui isso é literal — a rota
   USA o token para perguntar à Evolution, e devolve ao cliente apenas
   o estado e, quando for o caso, a imagem do QR. O token nunca sai.

   O QUE ELA NÃO FAZ, de propósito: criar, apagar ou renomear
   instância. Isso exige a *global api key* da Evolution, que dá poder
   sobre as instâncias de TODOS os corretores — um segredo dessa força
   não entra no app por causa de uma tela de conveniência. Perguntar o
   estado da própria instância e pedir o QR dela funciona com o token
   daquela instância, que já vive em `whatsapp_instancias` e já é lido
   pela rota de envio. Nenhum poder novo entra no sistema.

   Contrato: GET + Authorization: Bearer <access_token do Supabase>.
   Responde { estado, qr?, numero? } — ver lib/calculo/conexaoWhatsapp.
   ================================================================ */
import { createClient } from "@supabase/supabase-js";
import {
  qrParaImagem,
  traduzirEstado,
  type Conexao,
  type EstadoConexao,
} from "@/lib/calculo/conexaoWhatsapp";
import { registrarEvento } from "@/lib/servidor/registro";

/** Curto: a tela consulta em laço enquanto está aberta, e uma Evolution
    lenta não pode segurar a aba. Perder uma consulta é irrelevante —
    a próxima vem em segundos. */
const TIMEOUT_MS = 10000;

function responder(estado: EstadoConexao, extra: Partial<Conexao> = {}): Response {
  const corpo: Conexao = { estado, ...extra };
  return Response.json(corpo);
}

/** A instância DESTE corretor. Service role porque `whatsapp_instancias`
    não tem política de leitura — o token é segredo. O `userId` já veio
    de `auth.getUser()`, nunca da requisição. */
async function instanciaDoUsuario(
  supabaseUrl: string,
  userId: string,
): Promise<{ instancia: string; token: string } | null> {
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!servico) return null;
  const admin = createClient(supabaseUrl, servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("whatsapp_instancias")
    .select("instancia, token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Conexão do WhatsApp: falha ao ler a instância:", error.message);
    return null;
  }
  if (!data?.instancia || !data?.token) return null;
  return { instancia: data.instancia as string, token: data.token as string };
}

/**
 * Qual número está pareado, para a tela dizer "conectado como…".
 *
 * Vem de `fetchInstances`, e não de `connectionState`: medido contra a
 * Evolution real em 01/08/2026, aquele devolve só `{instance:{state}}`
 * — sem `owner`, sem número. Confiar no que a documentação sugeria
 * teria deixado o campo eternamente vazio, sem erro nenhum.
 *
 * Só é chamado quando o estado já é "conectado" — é a única hora em
 * que a tela exibe isso, e ali o intervalo de consulta é o longo.
 *
 * ATENÇÃO: a resposta deste endpoint **inclui o token da instância**.
 * Só `ownerJid` sai daqui; nada mais desse objeto pode chegar ao
 * browser. É a razão de esta função devolver uma string, e não o
 * objeto para o chamador escolher o que usar.
 *
 * Devolve null em qualquer problema: mostrar o número é conveniência,
 * e nada aqui pode transformar uma conexão saudável em erro na tela.
 */
async function identidadeConectada(
  base: string,
  cabecalho: Record<string, string>,
  instancia: string,
): Promise<string | null> {
  try {
    const r = await fetch(
      `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`,
      { headers: cabecalho, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" },
    );
    if (!r.ok) return null;
    const corpo = (await r.json().catch(() => null)) as unknown;
    const lista = Array.isArray(corpo) ? corpo : [corpo];
    const primeiro = lista[0] as { instance?: { ownerJid?: string }; ownerJid?: string } | null;
    const jid = primeiro?.instance?.ownerJid ?? primeiro?.ownerJid;
    // "554399xxxxxxx@s.whatsapp.net" -> "554399xxxxxxx"
    return typeof jid === "string" && jid ? jid.split("@")[0] : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!serverUrl || !supabaseUrl || !anonKey) return responder("nao-configurado");

  // 1. Quem está perguntando. Sem sessão a rota não existe — senão
  //    qualquer um sondaria o estado (e pediria o QR!) do número alheio.
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return responder("falha");

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || !sessao.user) return responder("falha");

  const minha = await instanciaDoUsuario(supabaseUrl, sessao.user.id);
  if (!minha) return responder("sem-instancia");

  const base = serverUrl.replace(/\/+$/, "");
  const cabecalho = { apikey: minha.token };
  const alvo = encodeURIComponent(minha.instancia);

  // 2. Estado atual.
  let estado: EstadoConexao;
  let numero: string | null = null;
  try {
    const r = await fetch(`${base}/instance/connectionState/${alvo}`, {
      headers: cabecalho,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A resposta muda a cada segundo enquanto se pareia — cache aqui
      // faria a tela dizer "desconectado" depois de já ter conectado.
      cache: "no-store",
    });
    if (!r.ok) {
      console.error("Conexão do WhatsApp: connectionState respondeu", r.status);
      return responder("falha");
    }
    /* Medido contra a Evolution real em 01/08/2026: a resposta é
       `{ instance: { state } }`. O `?? corpo?.state` cobre versões que
       devolvem o estado na raiz — barato, e a alternativa é a tela
       dizer "desconectado" por causa de uma troca de formato. */
    const corpo = (await r.json().catch(() => null)) as {
      instance?: { state?: string };
      state?: string;
    } | null;
    estado = traduzirEstado(corpo?.instance?.state ?? corpo?.state);
  } catch (e) {
    console.error("Conexão do WhatsApp: a Evolution não respondeu:", e);
    return responder("falha");
  }

  if (estado === "conectado") {
    numero = await identidadeConectada(base, cabecalho, minha.instancia);
  }
  if (estado !== "desconectado") return responder(estado, { numero });

  /* 3. Desconectado: pede o QR.

     Registrado no log do admin — é a informação que faltava para saber
     que o número de alguém caiu sem esperar a reclamação. "aviso" e não
     "erro": o corretor está justamente na tela que resolve isso, e uma
     desconexão que ele reconecta em trinta segundos não é incidente. */
  registrarEvento({
    userId: sessao.user.id,
    categoria: "whatsapp",
    nivel: "aviso",
    evento: "instancia-desconectada",
    detalhe: "consultado na tela de conexão",
  });

  try {
    const r = await fetch(`${base}/instance/connect/${alvo}`, {
      headers: cabecalho,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error("Conexão do WhatsApp: connect respondeu", r.status);
      // Sem QR ainda é resposta útil: a tela diz "desconectado" e
      // oferece tentar de novo, em vez de mentir que está tudo bem.
      return responder("desconectado", { qr: null });
    }
    const corpo = (await r.json().catch(() => null)) as {
      base64?: string;
      code?: string;
      qrcode?: { base64?: string };
    } | null;
    // A Evolution já devolveu o QR em três formatos diferentes entre
    // versões; tentamos os que existem em vez de fixar um.
    const bruto = corpo?.base64 ?? corpo?.qrcode?.base64 ?? corpo?.code ?? null;
    return responder("desconectado", { qr: qrParaImagem(bruto) });
  } catch (e) {
    console.error("Conexão do WhatsApp: falha ao pedir o QR:", e);
    return responder("desconectado", { qr: null });
  }
}
