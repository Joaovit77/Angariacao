/* ================================================================
   API: RECEBIMENTO DE WHATSAPP (Evolution -> nós)

   A TERCEIRA rota de servidor do projeto, e a única que inverte o
   sentido: as outras duas o app chama; esta a Evolution chama quando
   uma mensagem CHEGA no nosso número.

   Ela existe para fechar o buraco que o `aguardandoResultado` tapa
   na marra: hoje o app envia e fica cego, então o desfecho da conversa
   depende de alguém lembrar de anotar. Recebendo o evento, "o
   proprietário respondeu" vira fato observado.

   ---------------------------------------------------------------
   ESTA VERSÃO AINDA NÃO ESCREVE. Ela já identifica de quem é a
   conversa e a qual imóvel pertence — e DESCARTA todo o resto. A
   gravação (nota + fechamento da tentativa) é o passo seguinte, e a
   decisão do que gravar já está pronta e testada em
   lib/calculo/webhookWhatsapp.ts.
   ---------------------------------------------------------------

   O FILTRO É O CORAÇÃO DESTA ROTA. O número é o da imobiliária: por
   ele passa proprietário, mas também colega, cliente e grupo. O evento
   não diz quem é quem — quem diz é a carteira do corretor. Por isso a
   sequência é sempre a mesma, e cada etapa só existe para descartar:

     segredo -> é mensagem recebida? -> de qual corretor (instância)?
     -> esse telefone é de algum imóvel DELE? -> só então interessa.

   Mensagem que não passa por tudo isso não é processada, não é
   gravada e não vira log com conteúdo.

   TRÊS diferenças que fazem desta rota um caso à parte:

   1. **Ela não tem sessão de usuário.** Quem chama é a Evolution, não
      o corretor logado. O modelo do projeto inteiro é "o RLS escopa
      pelo token de quem chamou" — aqui não existe token. Por isso a
      autenticação é um segredo nosso (EVOLUTION_WEBHOOK_SECRET) e por
      isso ela usa a ÚNICA service role key do repositório.

   2. **A service role ignora a RLS.** É o que permite ler a carteira
      do corretor sem ele estar logado — e é o que torna esta rota o
      lugar mais perigoso do projeto. A regra que a segura: o user_id
      NUNCA vem de fora. Ele é descoberto a partir do nome da instância
      na tabela `whatsapp_instancias`, e toda consulta seguinte é
      filtrada por ele.

   3. **O segredo protege o sentido contrário do usual.** Quem hospeda
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
import { createClient } from "@supabase/supabase-js";
import {
  encerramentoPorResposta,
  fecharTentativaPendente,
  interpretarEvento,
  notaDaResposta,
  notaDoEncerramento,
  sugerirNaTentativaPendente,
} from "@/lib/calculo/webhookWhatsapp";
import { classificarResposta } from "@/lib/servidor/ia";
import { agoraISOComHora, todayISO } from "@/lib/datas";
import type { StatusHistoryEntry, Tentativa } from "@/lib/tipos";

/* --- Log sem conteúdo -------------------------------------------------------
   A primeira versão desta rota registrava o payload inteiro, para descobrirmos
   o formato real da Evolution. Serviu: o formato está conhecido e documentado
   no parser. Agora ele SAI, por dois motivos que só apareceram quando o webhook
   pegou tráfego de verdade:

   - este número é o da imobiliária. Passa por ele conversa com proprietário,
     mas também com colega, cliente e todo mundo mais. Guardar o texto de tudo
     isso no log da Vercel é acumular conversa alheia sem necessidade nenhuma.
   - a Evolution manda o TOKEN DA INSTÂNCIA dentro do corpo (campo `apikey`) a
     cada requisição. Logar o payload cru gravava o segredo junto, a cada
     mensagem.

   O que fica é a forma do evento — o suficiente para saber que chegou, de qual
   instância e de que tipo, sem guardar o que foi dito. O filtro de verdade
   (descartar quem não é proprietário) exige o casamento com o banco e vem com
   o parser; este log já não atrapalha enquanto isso. */

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Uma linha de log que descreve o evento sem citar conteúdo, telefone nem
    segredo. `caracteres` existe só para distinguir "chegou vazio" de "chegou
    texto" ao depurar — o texto em si não é registrado. */
function resumirEvento(corpo: unknown): string {
  const raiz = objeto(corpo);
  const dados = objeto(raiz.data);
  const chave = objeto(dados.key);
  const conversa = texto(objeto(dados.message).conversation);
  return [
    `evento=${texto(raiz.event) || "?"}`,
    `instancia=${texto(raiz.instance) || "?"}`,
    `fromMe=${typeof chave.fromMe === "boolean" ? String(chave.fromMe) : "?"}`,
    `tipo=${texto(dados.messageType) || "?"}`,
    `caracteres=${conversa.length}`,
  ].join(" ");
}

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

/** Cliente do Supabase com a SERVICE ROLE — a única do projeto.

    Ela ignora a RLS por completo, e é isso que permite ler a carteira do
    corretor numa requisição que não tem sessão de usuário. O que a torna
    aceitável é o escopo: ela é lida SÓ aqui dentro, nunca exportada de um
    módulo compartilhado (de onde vazaria para outra rota por descuido), e
    toda consulta feita com ela é filtrada por um user_id descoberto a partir
    da instância — nunca por algo que veio na requisição.

    `null` quando não está configurada: sem ela não dá para saber de quem é a
    conversa, e o certo aí é não processar em vez de adivinhar. */
function clienteServico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error("Webhook do WhatsApp: SUPABASE_SERVICE_ROLE_KEY ausente — evento ignorado.");
    return null;
  }
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
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

  // A cadeia de descarte. Cada `return` daqui para baixo é uma mensagem que
  // não interessa — e sair cedo é o que garante que conversa de colega não
  // chegue nem perto do banco.

  // 1. É uma mensagem de texto recebida de um número individual? (Descarta
  //    o que nós mesmos enviamos, grupo, status e evento de conexão.)
  const mensagem = interpretarEvento(corpo);
  if (!mensagem) {
    console.log("Webhook do WhatsApp: descartado —", resumirEvento(corpo));
    return Response.json({ ok: true });
  }

  const supabase = clienteServico();
  if (!supabase) return Response.json({ ok: true });

  // 2. De qual corretor é esta instância? É AQUI que nasce o user_id — nunca
  //    de algo que veio na requisição.
  const { data: dono, error: erroDono } = await supabase
    .from("whatsapp_instancias")
    .select("user_id")
    .eq("instancia", mensagem.instancia)
    .maybeSingle();
  if (erroDono) {
    console.error("Webhook do WhatsApp: falha ao resolver a instância:", erroDono.message);
    return Response.json({ ok: true });
  }
  if (!dono) {
    console.log(`Webhook do WhatsApp: instância desconhecida (${mensagem.instancia}) — descartado.`);
    return Response.json({ ok: true });
  }
  const userId = dono.user_id as string;

  // 3. Este telefone é de algum imóvel DELE? Este é o filtro que separa
  //    proprietário de todo o resto do WhatsApp da imobiliária. Quem não
  //    está na carteira simplesmente não existe para esta rota.
  const { data: imoveis, error: erroImovel } = await supabase
    .from("imoveis")
    .select("id, codigo, endereco, tentativas, status, status_history")
    .eq("user_id", userId)
    .eq("proprietario_telefone_canonico", mensagem.telefone)
    // Mais de um imóvel do mesmo proprietário é normal (investidor com vários).
    // O mais recentemente mexido é o da conversa em andamento.
    .order("updated_at", { ascending: false })
    .limit(2);
  if (erroImovel) {
    console.error("Webhook do WhatsApp: falha ao buscar o imóvel:", erroImovel.message);
    return Response.json({ ok: true });
  }
  if (!imoveis || imoveis.length === 0) {
    // O caso mais comum de todos: não é proprietário. Nada de telefone no log.
    console.log(`Webhook do WhatsApp: sem imóvel para o remetente — descartado (tipo=${mensagem.tipo}).`);
    return Response.json({ ok: true });
  }

  const imovel = imoveis[0] as {
    id: string;
    codigo: string | null;
    tentativas: Tentativa[] | null;
    status: string;
    status_history: StatusHistoryEntry[] | null;
  };
  const ambiguo = imoveis.length > 1 ? " (o proprietário tem mais de um imóvel; usando o mais recente)" : "";
  const rotulo = imovel.codigo || imovel.id;

  // 4. Grava a nota. A função do banco faz a verificação de duplicata e a
  //    escrita numa instrução só — ver registrar_nota_whatsapp no schema.
  //    `false` = reentrega do mesmo evento: paramos aqui, senão fecharíamos
  //    a tentativa de novo a cada retentativa da Evolution.
  const { data: gravou, error: erroNota } = await supabase.rpc("registrar_nota_whatsapp", {
    p_imovel_id: imovel.id,
    p_user_id: userId,
    p_nota: notaDaResposta(mensagem, agoraISOComHora()),
  });
  if (erroNota) {
    console.error("Webhook do WhatsApp: falha ao gravar a nota:", erroNota.message);
    return Response.json({ ok: true });
  }
  if (gravou !== true) {
    console.log(`Webhook do WhatsApp: reentrega do mesmo evento — imóvel ${rotulo}, ignorado.`);
    return Response.json({ ok: true });
  }

  // 5. Interpreta a resposta. A IA lê o texto e sugere o desfecho — mas é
  //    SUGESTÃO: a tentativa continua marcada e o corretor confirma no nudge,
  //    agora com a resposta na frente e o provável já escolhido. Sem chave da
  //    OpenAI (ou em qualquer falha) `sugestao` vem null e o comportamento cai
  //    no anterior: fecha como "respondeu", que é o que dá para afirmar sem ler.
  const hoje = todayISO();
  const sugestao = await classificarResposta(mensagem.texto, hoje);
  const fechamento = sugestao
    ? sugerirNaTentativaPendente(imovel.tentativas, sugestao, hoje)
    : fecharTentativaPendente(imovel.tentativas, hoje);
  if (!fechamento) {
    console.log(`Webhook do WhatsApp: nota gravada — imóvel ${rotulo}, sem tentativa pendente${ambiguo}.`);
    return Response.json({ ok: true });
  }

  // Update PARCIAL da coluna: nunca a linha inteira. O upsert do app grava
  // todas as colunas jsonb de uma vez, e usá-lo aqui apagaria uma nota que o
  // corretor tivesse acabado de escrever na tela.
  const { error: erroTentativa } = await supabase
    .from("imoveis")
    .update({ tentativas: fechamento.tentativas })
    .eq("id", imovel.id)
    .eq("user_id", userId);
  if (erroTentativa) {
    // A nota já está gravada; perder só o fechamento é degradação aceitável
    // (o nudge volta a cobrar), e não vale desfazer o que deu certo.
    console.error("Webhook do WhatsApp: nota gravada, mas falhou ao fechar a tentativa:", erroTentativa.message);
    return Response.json({ ok: true });
  }

  // 6. Encerra o imóvel quando a resposta não deixou nada a fazer ("já
  //    aluguei", "já estou com outra imobiliária"). É a ÚNICA coisa aqui que
  //    a IA muda sem confirmação, e o que a segura é o motivo vir de lista
  //    fechada — ver encerramentoPorResposta. Nunca vira "Locado": alugado
  //    por conta própria é perda, e marcá-lo como ganho inflaria a comissão
  //    e a meta do mês com negócio que não houve.
  const encerramento = encerramentoPorResposta(
    { status: imovel.status, statusHistory: imovel.status_history },
    sugestao?.motivoPerda,
    hoje,
  );
  if (encerramento) {
    const { error: erroStatus } = await supabase
      .from("imoveis")
      .update({
        status: encerramento.status,
        status_history: encerramento.statusHistory,
        motivo_perda: encerramento.motivoPerda,
        motivo_perda_outro: null,
      })
      .eq("id", imovel.id)
      .eq("user_id", userId);
    if (erroStatus) {
      console.error("Webhook do WhatsApp: falha ao encerrar o imóvel:", erroStatus.message);
    } else {
      // Deixa na tela por que o status mudou. Sem isto a explicação existiria
      // só no log do servidor, que o corretor não lê.
      await supabase.rpc("registrar_nota_whatsapp", {
        p_imovel_id: imovel.id,
        p_user_id: userId,
        p_nota: notaDoEncerramento(mensagem.mensagemId, encerramento, agoraISOComHora()),
      });
      console.log(
        `Webhook do WhatsApp: imóvel ${rotulo} encerrado como ${encerramento.status} — ` +
          `${encerramento.motivoPerda} (lido da resposta).`,
      );
      return Response.json({ ok: true });
    }
  }

  console.log(
    `Webhook do WhatsApp: resposta registrada — imóvel ${rotulo}, tentativa marcada como ` +
      `"${fechamento.fechada.resultado}"${sugestao ? " (sugestão da IA, aguardando confirmação)" : ""}${ambiguo}.`,
  );
  return Response.json({ ok: true });

  // Sempre 200 para quem se autenticou. Webhook que responde erro é webhook
  // reentregue em loop — e, em algumas versões da Evolution, desativado depois
  // de tantas falhas. Enquanto não escrevemos nada, não há o que dar errado
  // que justifique pedir reentrega.
  return Response.json({ ok: true });
}
