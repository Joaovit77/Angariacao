/* ================================================================
   API: RECEBIMENTO DE WHATSAPP (Evolution -> nós) — PASSO 1

   A TERCEIRA rota de servidor do projeto, e a única que inverte o
   sentido: as outras duas o app chama; esta a Evolution chama quando
   uma mensagem CHEGA no nosso número.

   Ela existe para fechar o buraco que o `aguardandoResultado` tapa
   na marra: hoje o app envia e fica cego, então o desfecho da conversa
   depende de alguém lembrar de anotar. Recebendo o evento, "o
   proprietário respondeu" vira fato observado.

   ---------------------------------------------------------------
   ESTA VERSÃO NÃO ESCREVE NADA. É o passo de descoberta: valida o
   segredo e registra o payload no log, para escrevermos o parser em
   cima do JSON REAL da instância, não de um formato imaginado. A
   escrita (nota + fechamento da tentativa) vem depois, junto da
   tabela `whatsapp_instancias` — sem ela não há como saber de QUAL
   corretor é a conversa, e errar isso escreveria na carteira da
   pessoa errada.
   ---------------------------------------------------------------

   DUAS diferenças que fazem desta rota um caso à parte:

   1. **Ela não tem sessão de usuário.** Quem chama é a Evolution, não
      o corretor logado. O modelo do projeto inteiro é "o RLS escopa
      pelo token de quem chamou" — aqui não existe token. Por isso a
      autenticação é um segredo nosso (EVOLUTION_WEBHOOK_SECRET), e
      por isso a versão que escrever no banco vai precisar da primeira
      service role key do repositório.

   2. **O segredo protege o sentido contrário do usual.** Quem hospeda
      a Evolution já enxerga as conversas — o segredo não esconde nada
      dele. O que ele impede é qualquer um na internet POSTAR aqui e
      forjar "o proprietário respondeu", envenenando o ranking de
      abordagens. Por isso é um segredo próprio, e não o
      EVOLUTION_TOKEN reaproveitado.

   O segredo chega por header (`x-webhook-secret`) OU como último
   segmento da URL — daí o catch-all opcional no nome da pasta. São
   duas formas porque nem toda versão da Evolution deixa configurar
   header no webhook, e descobrir isso custa uma ida e volta com quem
   administra o servidor:

     https://angariacao.vercel.app/api/whatsapp/webhook            (header)
     https://angariacao.vercel.app/api/whatsapp/webhook/<segredo>  (path)
   ================================================================ */
import { createHash, timingSafeEqual } from "node:crypto";

/** Quanto do payload vai para o log. Um evento da Evolution traz base64 de
    mídia e metadados longos; o que interessa aqui é a forma do objeto. */
const MAX_LOG = 4000;

/** Compara em tempo constante. O sha256 antes do timingSafeEqual não é
    zelo estético: a função exige buffers do MESMO tamanho e joga quando
    diferem — comparar os hashes normaliza o comprimento e, de quebra,
    impede que o tempo de resposta entregue o tamanho do segredo. */
function segredoConfere(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** O segredo apresentado na requisição: header primeiro, senão o último
    segmento do caminho. */
function segredoDaRequisicao(request: Request, segmentos: string[] | undefined): string {
  const header = request.headers.get("x-webhook-secret");
  if (header && header.trim()) return header.trim();
  const ultimo = segmentos && segmentos.length > 0 ? segmentos[segmentos.length - 1] : "";
  return (ultimo || "").trim();
}

/** true quando a requisição está autorizada. `null` quando o ambiente nem
    tem segredo configurado — que é erro nosso, não do chamador. */
function autorizar(request: Request, segmentos: string[] | undefined): boolean | null {
  const esperado = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!esperado) {
    console.error("Webhook do WhatsApp: EVOLUTION_WEBHOOK_SECRET ausente (ver web/.env.example).");
    return null;
  }
  return segredoConfere(segredoDaRequisicao(request, segmentos), esperado);
}

/** Teste de vida, para quem administra a Evolution conferir a URL antes de
    apontar o webhook — sem isso a primeira validação vira adivinhação. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/whatsapp/webhook/[[...segredo]]">,
): Promise<Response> {
  const { segredo } = await context.params;
  const ok = autorizar(request, segredo);
  if (ok === null) return Response.json({ ok: false }, { status: 503 });
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, pronto: true });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/whatsapp/webhook/[[...segredo]]">,
): Promise<Response> {
  const { segredo } = await context.params;
  const ok = autorizar(request, segredo);
  if (ok === null) return Response.json({ ok: false }, { status: 503 });
  if (!ok) {
    console.error("Webhook do WhatsApp: segredo inválido — requisição descartada.");
    return Response.json({ ok: false }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    // 200 mesmo assim: ver a nota sobre reentrega no fim do arquivo.
    console.error("Webhook do WhatsApp: corpo não é JSON.");
    return Response.json({ ok: true });
  }

  // ATENÇÃO: este log inclui o TEXTO das mensagens recebidas, que é conversa
  // de uma pessoa real e fica visível em quem tiver acesso aos logs da Vercel.
  // É aceitável enquanto durar a descoberta do formato; sai assim que o parser
  // estiver escrito, junto com o resto deste bloco.
  const evento =
    corpo && typeof corpo === "object" && "event" in corpo ? String((corpo as { event: unknown }).event) : "(sem event)";
  console.log(`Webhook do WhatsApp [${evento}]:`, JSON.stringify(corpo).slice(0, MAX_LOG));

  // Sempre 200 para quem se autenticou. Webhook que responde erro é webhook
  // reentregue em loop — e, em algumas versões da Evolution, desativado depois
  // de tantas falhas. Enquanto não escrevemos nada, não há o que dar errado
  // que justifique pedir reentrega.
  return Response.json({ ok: true });
}
