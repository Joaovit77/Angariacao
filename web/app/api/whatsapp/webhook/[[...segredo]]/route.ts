/* ================================================================
   API: RECEBIMENTO DE WHATSAPP (Evolution -> nós)

   A TERCEIRA rota de servidor do projeto, e a única que inverte o
   sentido: as outras duas o app chama; esta a Evolution chama quando
   uma mensagem CHEGA no nosso número.

   Ela existe para fechar o buraco que o `aguardandoResultado` tapa
   na marra: hoje o app envia e fica cego, então o desfecho da conversa
   depende de alguém lembrar de anotar. Recebendo o evento, "o
   proprietário respondeu" vira fato observado.

   O QUE ELA ESCREVE, em ordem, e cada coisa com sua própria trava:
   a NOTA da resposta (sempre, e é ela que dá a idempotência), a
   SUGESTÃO na tentativa pendente (quando existe uma), o ENCERRAMENTO
   automático (só com recusa explícita e motivo de lista fechada) e o
   COMPROMISSO na agenda (só com data válida no futuro). As decisões
   são puras e testadas em lib/calculo/webhookWhatsapp.ts; aqui fica
   só o efeito.

   As três últimas são INDEPENDENTES entre si — nenhuma é pré-condição
   da outra. Ver o bloco no passo 5 sobre por que não há `return` ali:
   já houve, e ele derrubava o encerramento e a agenda por um motivo
   que não era deles.

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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  compromissoDaResposta,
  encerramentoPorResposta,
  fecharTentativaPendente,
  interpretarEvento,
  notaDaResposta,
  notaDoEncerramento,
  sugerirNaTentativaPendente,
} from "@/lib/calculo/webhookWhatsapp";
import { after } from "next/server";
import { espelharCompromisso } from "../../../google/_espelho";
import { ambiente as ambienteGoogle } from "../../../google/_comum";
import { transcreverAudio } from "../../_transcricao";
import { ehAudio } from "@/lib/calculo/transcricao";
import { corpoDaResposta, ehNotaDeResposta, ehSoMidia } from "@/lib/calculo/notas";
import { MAX_MENSAGENS_CONTEXTO } from "@/lib/calculo/ia";
import { classificarResposta } from "@/lib/servidor/ia";
import { registrarEvento } from "@/lib/servidor/registro";
import { agoraISOComHora, todayISO } from "@/lib/datas";
import type { NotaImovel, StatusHistoryEntry, Tentativa } from "@/lib/tipos";

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

/**
 * Leva ao Google Agenda o compromisso que a agenda inteligente acabou de criar.
 *
 * Roda em `after()`, depois da resposta ir embora, pelo mesmo contrato do
 * `registrarEvento`: quem está esperando é a **Evolution**, e ela não pode ficar
 * presa numa conversa nossa com o Google. Espelhar é a última coisa da cadeia e
 * a primeira que se pode perder — a nota, a tentativa e o encerramento já estão
 * gravados quando isto começa.
 *
 * Silenciosa pelo mesmo motivo da gêmea no `mutacoes.ts`: `sem-conexao-google` e
 * ambiente ausente são o caso NORMAL de quem nunca conectou, não erro. O que
 * sobra vai para o log de eventos por dentro do `_espelho` (o refresh recusado
 * é justamente o que quebra em silêncio depois de 7 dias em modo Teste).
 */
function espelharCompromissoDoWebhook(
  supabase: SupabaseClient,
  userId: string,
  agendaId: string,
  rotulo: string,
): void {
  const env = ambienteGoogle();
  if (!env) return;
  after(async () => {
    const r = await espelharCompromisso(env, supabase, userId, agendaId);
    if (r.ok) {
      console.log(`Webhook do WhatsApp: compromisso do imóvel ${rotulo} espelhado no Google Agenda.`);
    } else if (r.falha !== "sem-conexao-google") {
      console.warn(
        `Webhook do WhatsApp: compromisso do imóvel ${rotulo} não foi ao Google Agenda —`,
        r.falha,
      );
    }
  });
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
  // `let` por causa do passo 3.5: áudio transcrito substitui o texto vazio.
  let mensagem = interpretarEvento(corpo);
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
    // O `token` entra aqui pela transcrição de áudio (passo 3.5): baixar a
    // mídia é uma chamada à Evolution como qualquer outra, e o token é o da
    // INSTÂNCIA, não uma env var global — mesma regra do envio.
    .select("user_id, token")
    .eq("instancia", mensagem.instancia)
    .maybeSingle();
  if (erroDono) {
    console.error("Webhook do WhatsApp: falha ao resolver a instância:", erroDono.message);
    return Response.json({ ok: true });
  }
  if (!dono) {
    console.log(`Webhook do WhatsApp: instância desconhecida (${mensagem.instancia}) — descartado.`);
    /* Fica sem `user_id` (não há dono a atribuir) — e é justamente por
       isso que precisa existir: uma instância que dispara webhook sem
       estar cadastrada é configuração pela metade, o corretor manda
       mensagem e nenhuma resposta volta para a carteira dele. Não gera
       reclamação, gera silêncio; sem esta linha, ninguém descobre. */
    registrarEvento({
      userId: null,
      categoria: "webhook",
      nivel: "erro",
      evento: "webhook-instancia-desconhecida",
      detalhe: mensagem.instancia,
    });
    return Response.json({ ok: true });
  }
  const userId = dono.user_id as string;

  // 3. Este telefone é de algum imóvel DELE? Este é o filtro que separa
  //    proprietário de todo o resto do WhatsApp da imobiliária. Quem não
  //    está na carteira simplesmente não existe para esta rota.
  const { data: imoveis, error: erroImovel } = await supabase
    .from("imoveis")
    // `notas` entra pelo contexto da classificação (passo 5): esta leitura
    // acontece ANTES de a nota desta mensagem ser gravada, então o que vem
    // aqui é exatamente o que ele já tinha dito antes — que é o recorte certo.
    .select("id, codigo, endereco, tentativas, status, status_history, notas")
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
    endereco: string | null;
    codigo: string | null;
    tentativas: Tentativa[] | null;
    status: string;
    status_history: StatusHistoryEntry[] | null;
    notas: NotaImovel[] | null;
  };
  const ambiguo = imoveis.length > 1 ? " (o proprietário tem mais de um imóvel; usando o mais recente)" : "";
  const rotulo = imovel.codigo || imovel.id;

  /* 3.5. ÁUDIO VIRA TEXTO — e acontece AQUI, antes de tudo o que lê o texto.
     O proprietário responde por áudio o tempo todo: 43 das 149 respostas da
     carteira em 31/07/2026. Até aqui isso virava a nota `[áudio]`, ilegível no
     painel e invisível para a classificação da IA, para o encerramento
     automático e para o compromisso da agenda — os três passos abaixo liam um
     texto vazio.

     Transcrever antes de gravar a nota (e não depois, num `after()`) é o que
     faz o resto da rota enxergar o conteúdo real. O preço é ~1,1 s a mais na
     resposta — medido nos 43 áudios, com 2,7 s no pior caso. É seguro porque a
     demora, no limite, faz a Evolution reentregar o evento, e reentrega já
     esbarra na duplicata de `registrar_nota_whatsapp`. O oposto não é seguro:
     um "já aluguei" gravado em áudio não encerraria o registro.

     Falhar aqui é o comportamento de ANTES, não um erro: a nota sai `[áudio]`
     como sempre saiu. Por isso nada interrompe a rota. */
  if (ehAudio(mensagem.tipo) && !mensagem.texto.trim()) {
    const r = await transcreverAudio({
      serverUrl: process.env.EVOLUTION_SERVER_URL || "",
      instancia: mensagem.instancia,
      token: (dono.token as string) || "",
      mensagemId: mensagem.mensagemId,
      chaveOpenai: process.env.OPENAI_API_KEY || "",
      // Só para o gasto da transcrição ter dono no painel de admin. Sai
      // da instância, como todo o resto desta rota — nunca da requisição.
      userId,
    });
    if (r.ok) {
      mensagem = { ...mensagem, texto: r.texto };
      console.log(`Webhook do WhatsApp: áudio transcrito — imóvel ${rotulo} (${r.texto.length} chars).`);
    } else {
      console.log(`Webhook do WhatsApp: áudio não transcrito (${r.falha}) — imóvel ${rotulo}, segue como [áudio].`);
      // "aviso", não "erro": a nota sai como `[áudio]`, que é exatamente
      // o comportamento de antes desta feature existir. O que interessa
      // no painel é a REPETIÇÃO — uma falha é ruído, vinte são um
      // problema de chave ou de modelo.
      registrarEvento({
        userId,
        categoria: "webhook",
        nivel: "aviso",
        evento: "transcricao-falhou",
        detalhe: r.falha,
      });
    }
  }

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
  //
  //    E ela lê a CONVERSA, não a frase. Cada mensagem do WhatsApp é um evento
  //    separado, então uma classificação por evento é uma classificação por
  //    pedaço de recado — no LD-110 (03/08/2026) o proprietário escreveu "Boa
  //    tarde", "Por hora, não tenho interesse" e "Já está em negociação para
  //    venda" em três mensagens, e nenhuma delas, sozinha, encerra o imóvel.
  //    O imóvel ficou em "Novo contato" com a recusa escrita no histórico.
  //    As anteriores saem das notas lidas no passo 3 — antes, portanto, de a
  //    desta mensagem ser gravada — e só as do PROPRIETÁRIO com texto para ler:
  //    marcador de mídia não desambigua nada e a nota de encerramento é fala
  //    nossa (é o que `ehNotaDeResposta` e `ehSoMidia` separam).
  const hoje = todayISO();
  const anteriores = (imovel.notas || [])
    .filter((n) => ehNotaDeResposta(n) && !ehSoMidia(n.texto))
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
    .map((n) => corpoDaResposta(n.texto))
    .filter(Boolean)
    .slice(-MAX_MENSAGENS_CONTEXTO);
  const sugestao = await classificarResposta(mensagem.texto, hoje, userId, anteriores);
  const fechamento = sugestao
    ? sugerirNaTentativaPendente(imovel.tentativas, sugestao, hoje)
    : fecharTentativaPendente(imovel.tentativas, hoje);

  /* NÃO HÁ RETURN AQUI, e a ausência dele é o conserto de um bug real.
     Antes, "sem tentativa pendente" encerrava a requisição — e levava junto o
     encerramento automático (passo 6) e o compromisso da agenda (passo 7), que
     não dependem de tentativa nenhuma: dependem do que o proprietário
     ESCREVEU. Estavam atrás de uma porta que não era deles.

     Não ter tentativa pendente é comum e não diz nada sobre a conversa:
     - o registro automático de envio nasceu DEPOIS de boa parte dos contatos,
       então imóvel antigo simplesmente não tem tentativa;
     - as tentativas de backfill e as anotadas à mão não levam
       `aguardandoResultado` de propósito (são afirmação, não palpite);
     - e passados DIAS_COBRANCA_RESULTADO dias o palpite deixa de ser cobrado.

     Medido em 28/07/2026: dos 14 imóveis que já haviam respondido, 2 não
     tinham tentativa alguma e somavam 65 das 110 respostas — o LD-156 sozinho
     tinha 64. Todas passaram por aqui e saíram no return, com a chamada da IA
     já paga na linha acima. O caso que abriu a investigação foi o LD-123, em
     que o proprietário marcou hora por escrito e nada foi para a agenda; o
     efeito mais grave, porém, era outro: um "já aluguei" nesses imóveis não
     encerrava o registro. */
  if (fechamento) {
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
      // (o nudge volta a cobrar), e não vale desfazer o que deu certo — nem
      // parar aqui, pela mesma razão do bloco acima.
      console.error("Webhook do WhatsApp: nota gravada, mas falhou ao fechar a tentativa:", erroTentativa.message);
    }
  } else {
    console.log(
      `Webhook do WhatsApp: nota gravada — imóvel ${rotulo}, sem tentativa pendente${ambiguo}; ` +
        `segue para encerramento e agenda.`,
    );
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

  // 7. Agenda inteligente: "pode ser quinta às 10h" É um compromisso. Só roda
  //    quando o imóvel NÃO foi encerrado — marcar retorno para quem acabou de
  //    dizer que já alugou é cobrar uma conversa que terminou.
  // No título do compromisso o endereço serve melhor que o id: `rotulo` cai
  // no id quando o imóvel não tem código, e "Visita — 3f7a…" não diz nada na
  // lista da agenda.
  const rotuloVisivel = imovel.codigo?.trim() || imovel.endereco?.trim() || rotulo;
  const compromisso = encerramento ? null : compromissoDaResposta(sugestao, rotuloVisivel, hoje);
  if (compromisso) {
    // Trava contra a rajada: no WhatsApp as pessoas mandam três mensagens
    // curtas ("pode quinta", "às 10h", "combinado"), e cada uma passaria por
    // aqui com a mesma data. A reentrega do MESMO evento já parou lá em cima
    // (registrar_nota_whatsapp); esta trava é para eventos diferentes que
    // marcam o mesmo dia — um compromisso pendente por imóvel/dia basta.
    const { data: jaTem, error: erroBusca } = await supabase
      .from("agenda")
      .select("id")
      .eq("user_id", userId)
      .eq("imovel_id", imovel.id)
      .eq("date", compromisso.data)
      .eq("done", false)
      .limit(1);

    if (erroBusca) {
      console.error("Webhook do WhatsApp: falha ao checar a agenda:", erroBusca.message);
    } else if (jaTem && jaTem.length > 0) {
      console.log(`Webhook do WhatsApp: imóvel ${rotulo} já tem compromisso em ${compromisso.data}.`);
    } else {
      const agendaId = crypto.randomUUID();
      const { error: erroAgenda } = await supabase.from("agenda").insert({
        id: agendaId,
        user_id: userId,
        title: compromisso.titulo,
        type: compromisso.tipo,
        date: compromisso.data,
        hora: compromisso.hora,
        imovel_id: imovel.id,
        notes: compromisso.notas,
        done: false,
        is_verificacao_disponibilidade: false,
      });
      if (erroAgenda) {
        // A nota e a tentativa já estão gravadas; perder só o compromisso é
        // degradação aceitável — a data segue visível na sugestão da IA.
        console.error("Webhook do WhatsApp: falha ao criar o compromisso:", erroAgenda.message);
      } else {
        console.log(
          `Webhook do WhatsApp: compromisso criado — ${compromisso.tipo} em ${compromisso.data}` +
            `${compromisso.hora ? ` às ${compromisso.hora}` : ""} para o imóvel ${rotulo}.`,
        );
        // E leva para o Google Agenda, que é onde o lembrete toca. Este é o
        // compromisso mais valioso que o app cria — hora que o PRÓPRIO
        // proprietário combinou por escrito — e era o único que nunca chegava
        // lá: `espelharNoGoogle` vive em `mutacoes.ts`, que roda no browser, e
        // aqui não há browser nenhum.
        espelharCompromissoDoWebhook(supabase, userId, agendaId, rotulo);
      }
    }
  }

  console.log(
    `Webhook do WhatsApp: resposta registrada — imóvel ${rotulo}, ` +
      (fechamento
        ? `tentativa marcada como "${fechamento.fechada.resultado}"` +
          `${sugestao ? " (sugestão da IA, aguardando confirmação)" : ""}`
        : "sem tentativa a marcar") +
      `${ambiguo}.`,
  );
  // Sempre 200 para quem se autenticou. Webhook que responde erro é webhook
  // reentregue em loop — e, em algumas versões da Evolution, desativado depois
  // de tantas falhas.
  return Response.json({ ok: true });
}
