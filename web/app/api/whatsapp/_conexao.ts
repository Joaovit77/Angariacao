/* ================================================================
   PERGUNTAR À EVOLUTION COMO ESTÁ UMA INSTÂNCIA — o miolo

   NÃO é rota (o `_` a mantém fora do roteamento). Mesmo papel de
   `api/google/_espelho.ts`: dois chamadores precisam do MESMO
   comportamento, e a forma de garantir isso é um caminho só, não duas
   cópias que começam iguais.

   Os dois chamadores:

     - `api/whatsapp/conexao` — o corretor perguntando pela PRÓPRIA
       instância, para reconectar lendo o QR;
     - `api/admin/conexao` — quem opera o sistema perguntando pela
       instância de um corretor, ou varrendo todas.

   A duplicação seria especialmente traiçoeira aqui porque as três
   sutilezas deste arquivo foram MEDIDAS contra a Evolution real em
   01/08/2026, não deduzidas da documentação (ver os comentários de
   cada uma). Uma segunda cópia escrita a partir dos docs nasceria com
   o campo "conectado como…" eternamente vazio, sem erro nenhum.

   O que este módulo NÃO faz, de propósito: criar, apagar ou renomear
   instância. Isso exige a *global api key* da Evolution, que dá poder
   sobre as instâncias de todos os corretores — um segredo dessa força
   não entra no app por causa de uma tela de conveniência. Perguntar o
   estado e pedir o QR funcionam com o token DAQUELA instância, que já
   vive em `whatsapp_instancias` e já é lido pela rota de envio.
   ================================================================ */
import {
  qrParaImagem,
  traduzirEstado,
  type Conexao,
  type EstadoConexao,
} from "@/lib/calculo/conexaoWhatsapp";

/** Curto: a tela consulta em laço enquanto está aberta, e uma Evolution
    lenta não pode segurar a aba. Perder uma consulta é irrelevante —
    a próxima vem em segundos. */
export const TIMEOUT_MS = 10000;

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

/**
 * O estado de uma instância, e o QR quando pedido.
 *
 * `pedirQr` é parâmetro e não comportamento fixo porque os dois
 * chamadores querem coisas diferentes, e a diferença tem custo real:
 * pedir o QR é chamar `instance/connect`, que faz a Evolution começar
 * a parear. Faz todo sentido na tela de UM corretor reconectando o
 * próprio número; numa varredura de todas as contas seria disparar
 * pareamento em série pelas instâncias de gente que não pediu nada.
 * Por isso a lista do admin passa `false` e só o detalhe passa `true`.
 *
 * Nunca lança: qualquer problema vira o estado `falha`, que é a
 * resposta honesta ("não consegui falar com a Evolution") e não
 * "desconectado", que mandaria o corretor escanear um QR inexistente.
 */
export async function consultarConexao(
  serverUrl: string,
  instancia: string,
  token: string,
  pedirQr: boolean,
): Promise<Conexao> {
  const base = serverUrl.replace(/\/+$/, "");
  const cabecalho = { apikey: token };
  const alvo = encodeURIComponent(instancia);

  let estado: EstadoConexao;
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
      return { estado: "falha" };
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
    return { estado: "falha" };
  }

  if (estado === "conectado") {
    return { estado, numero: await identidadeConectada(base, cabecalho, instancia) };
  }
  if (estado !== "desconectado" || !pedirQr) return { estado };

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
      return { estado: "desconectado", qr: null };
    }
    const corpo = (await r.json().catch(() => null)) as {
      base64?: string;
      code?: string;
      qrcode?: { base64?: string };
    } | null;
    // A Evolution já devolveu o QR em três formatos diferentes entre
    // versões; tentamos os que existem em vez de fixar um.
    const bruto = corpo?.base64 ?? corpo?.qrcode?.base64 ?? corpo?.code ?? null;
    return { estado: "desconectado", qr: qrParaImagem(bruto) };
  } catch (e) {
    console.error("Conexão do WhatsApp: falha ao pedir o QR:", e);
    return { estado: "desconectado", qr: null };
  }
}
