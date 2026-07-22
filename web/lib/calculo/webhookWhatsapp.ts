/* ================================================================
   WEBHOOK DE WHATSAPP — partes puras

   A rota `api/whatsapp/webhook` recebe o evento da Evolution e precisa
   decidir três coisas: isto interessa? de qual imóvel é? o que muda?
   As três decisões moram aqui, sem rede e sem banco, para serem
   testáveis — a rota fica só com o efeito.

   Mesmo papel de `calculo/whatsapp.ts` no envio: o vocabulário comum
   entre cliente e servidor mora no núcleo puro.

   O DESENHO É GOVERNADO POR UM FATO: o número é o da imobiliária. Por
   ele passa conversa com proprietário, mas também com colega, cliente,
   entregador e grupo. O evento não diz quem é quem — quem diz é a
   carteira do corretor. Por isso `interpretarEvento` é deliberadamente
   avarento: devolve `null` para tudo que não é uma mensagem de texto
   recebida de um número individual, e o casamento com o imóvel (feito
   pela rota, no banco) descarta o resto. Mensagem de colega não é
   processada, não é gravada e não é registrada em log.
   ================================================================ */
import { DIAS_COBRANCA_RESULTADO } from "./abordagens";
import { daysBetween } from "../datas";
import type { NotaImovel, Tentativa } from "../tipos";

/* ----------------------------------------------------------------
   TELEFONE EM FORMA CANÔNICA

   ATENÇÃO — ESTA FUNÇÃO É GÊMEA DA `telefone_canonico()` DO BANCO
   (ver supabase-schema.sql). O banco calcula a coluna
   `proprietario_telefone_canonico` com aquela; a rota normaliza o jid
   que chegou com esta, e compara as duas. Se divergirem, o casamento
   falha em silêncio — nenhum erro, nenhum log, só respostas que nunca
   encontram o imóvel. Os testes cobrem a mesma tabela de casos que foi
   rodada no Postgres justamente para prender as duas juntas.

   A regra é o nono dígito: o WhatsApp guarda muitos celulares
   brasileiros SEM ele (em Londrina, 5543998024316 e 554398024316 são a
   MESMA conta). A forma canônica é DDD + assinante sem o 9.
   ---------------------------------------------------------------- */

/** DDD + assinante, sem DDI e sem o nono dígito. `null` quando não é um
    telefone brasileiro plausível — inclusive o estrangeiro que ganhou um
    "55" na frente. `null` nunca casa com nada, que é o certo: melhor não
    achar do que achar o imóvel errado. */
export function telefoneCanonico(telefone: string | null | undefined): string | null {
  const digitos = String(telefone || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");

  // DDI 55 na frente (12 ou 13 dígitos): fora.
  const nacional =
    (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")
      ? digitos.slice(2)
      : digitos;

  // 11 = DDD + celular com o nono; tira o 9 para bater com a forma de 10.
  if (nacional.length === 11 && nacional[2] === "9") return nacional.slice(0, 2) + nacional.slice(3);
  if (nacional.length === 10) return nacional;
  return null;
}

/* ----------------------------------------------------------------
   LEITURA DO EVENTO
   ---------------------------------------------------------------- */

/** O que sobra de um evento depois de descartar o que não interessa. */
export interface MensagemRecebida {
  /** Nome da instância na Evolution — é o que diz de QUAL corretor é a
      conversa (ver a tabela `whatsapp_instancias`). */
  instancia: string;
  /** id da mensagem no WhatsApp. A Evolution reentrega evento, então é
      por ele que a rota evita processar duas vezes. */
  mensagemId: string;
  /** Telefone de quem falou, já em forma canônica (bate com a coluna). */
  telefone: string;
  /** Texto da mensagem. Pode ser "" — foto sem legenda, áudio, figurinha:
      chegou resposta, mas não há o que ler. */
  texto: string;
  /** messageType cru da Evolution, para o log e para decisões futuras. */
  tipo: string;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** O texto da mensagem, qualquer que seja o formato.

    Não é só `conversation`: mensagem com link, resposta a outra mensagem e
    texto longo chegam como `extendedTextMessage`, e foto/vídeo trazem o
    texto na legenda. Ler só `conversation` faria a metade das respostas
    reais parecer vazia. */
export function textoDaMensagem(message: unknown): string {
  const m = objeto(message);
  const direto = texto(m.conversation);
  if (direto) return direto;
  const estendida = texto(objeto(m.extendedTextMessage).text);
  if (estendida) return estendida;
  const legendaImagem = texto(objeto(m.imageMessage).caption);
  if (legendaImagem) return legendaImagem;
  const legendaVideo = texto(objeto(m.videoMessage).caption);
  if (legendaVideo) return legendaVideo;
  return "";
}

/** O número de quem está do outro lado da conversa.

    Duas armadilhas do WhatsApp novo:

    - **LID.** Com `addressingMode: "lid"` o `remoteJid` pode vir como um
      identificador interno (`...@lid`) em vez do telefone, e aí o
      casamento falharia sem erro nenhum. O payload traz `remoteJidAlt`
      com o número; preferimos o que for telefone de verdade.
    - **Grupo e status.** `@g.us` é grupo e `status@broadcast` é o "status"
      do WhatsApp. Nenhum dos dois é conversa com proprietário, e o
      remetente de um grupo nem seria o dono do jid. Ficam de fora. */
function telefoneDaConversa(chave: Record<string, unknown>): string | null {
  const candidatos = [texto(chave.remoteJid), texto(chave.remoteJidAlt)];
  for (const jid of candidatos) {
    if (!jid || jid.includes("@g.us") || jid.startsWith("status@")) continue;
    const canonico = telefoneCanonico(jid.split("@")[0]);
    if (canonico) return canonico;
  }
  return null;
}

/** Extrai o que interessa do evento, ou `null` quando não interessa.

    Devolve `null` — sem log, sem processamento — para:
    - evento que não é `messages.upsert`;
    - mensagem enviada por nós (`fromMe`), que é a nossa própria fala;
    - grupo e status;
    - qualquer coisa sem instância, sem id ou sem telefone utilizável. */
export function interpretarEvento(corpo: unknown): MensagemRecebida | null {
  const raiz = objeto(corpo);
  if (texto(raiz.event).toLowerCase() !== "messages.upsert") return null;

  const instancia = texto(raiz.instance).trim();
  if (!instancia) return null;

  const dados = objeto(raiz.data);
  const chave = objeto(dados.key);
  if (chave.fromMe === true) return null;

  const mensagemId = texto(chave.id).trim();
  if (!mensagemId) return null;

  const telefone = telefoneDaConversa(chave);
  if (!telefone) return null;

  return {
    instancia,
    mensagemId,
    telefone,
    texto: textoDaMensagem(dados.message),
    tipo: texto(dados.messageType) || "desconhecido",
  };
}

/* ----------------------------------------------------------------
   O QUE MUDA NO IMÓVEL
   ---------------------------------------------------------------- */

/* --- A nota da resposta ---------------------------------------------------
   A resposta vira uma NOTA no histórico do imóvel, ao lado das que o corretor
   escreve à mão. É o que faz o CRM deixar de ser cego: abrindo o imóvel, ele
   lê o que o proprietário disse sem sair para o WhatsApp.

   O id da nota é `wa:<id da mensagem>` — e isso não é enfeite, é o mecanismo
   de IDEMPOTÊNCIA. A Evolution reentrega evento (por retentativa, ou quando o
   endpoint demora a responder), e sem isso a mesma resposta viraria duas,
   três notas. Derivando o id da mensagem, a segunda entrega tenta gravar uma
   nota com id que já existe e é recusada pelo banco — sem tabela nova, sem
   estado extra, com a garantia visível no próprio dado. */

/** Prefixo do id da nota criada pelo webhook. Também serve para distinguir,
    na tela, o que veio automático do que o corretor escreveu. */
export const PREFIXO_ID_NOTA = "wa:";

export function idNotaDaMensagem(mensagemId: string): string {
  return `${PREFIXO_ID_NOTA}${mensagemId}`;
}

/** Rótulo do que chegou quando não há texto para mostrar. Áudio e foto são
    respostas de verdade — registrar "(vazio)" faria o corretor achar que o
    sistema falhou, quando na verdade o proprietário mandou um áudio. */
const SEM_TEXTO: Record<string, string> = {
  audioMessage: "áudio",
  imageMessage: "imagem",
  videoMessage: "vídeo",
  documentMessage: "documento",
  stickerMessage: "figurinha",
  locationMessage: "localização",
  contactMessage: "contato",
};

/** Teto do texto guardado na nota. Uma mensagem encaminhada pode ter milhares
    de caracteres e viraria uma parede no histórico do imóvel; a conversa
    inteira continua no WhatsApp, que é o lugar dela. */
export const MAX_TEXTO_NOTA = 1000;

/** A nota a gravar no imóvel. `agora` entra por parâmetro (e não de `new Date`)
    para a função ser pura e testável — é a mesma disciplina do resto do núcleo. */
export function notaDaResposta(mensagem: MensagemRecebida, agora: string): NotaImovel {
  const texto = mensagem.texto.trim();
  const corpo = texto
    ? texto.length > MAX_TEXTO_NOTA
      ? `${texto.slice(0, MAX_TEXTO_NOTA)}…`
      : texto
    : `[${SEM_TEXTO[mensagem.tipo] || "mensagem sem texto"}]`;
  return {
    id: idNotaDaMensagem(mensagem.mensagemId),
    texto: `Resposta pelo WhatsApp: ${corpo}`,
    data: agora,
  };
}

/** A tentativa que a resposta fecha, e como fica o histórico depois.
    `null` quando não há nada a fechar — o que é comum e não é erro: o
    proprietário pode responder dias depois, ou sem nunca ter havido
    tentativa registrada. */
export interface FechamentoTentativa {
  /** O histórico inteiro, já com a tentativa atualizada. A gravação é
      update parcial da coluna `tentativas` (ver mutacoes.ts). */
  tentativas: Tentativa[];
  /** A tentativa fechada, para o log e para o resumo. */
  fechada: Tentativa;
}

/**
 * Fecha a tentativa que estava esperando desfecho.
 *
 * A regra central: **a resposta só confirma o que o sistema chutou**. Ao
 * enviar, a tentativa nasce `"sem-resposta"` marcada com
 * `aguardandoResultado` porque naquele instante ninguém sabia o desfecho.
 * Chegou resposta, o palpite virou fato: vira `"respondeu"` e perde a marca,
 * que é exatamente o que o nudge cobraria do corretor à mão.
 *
 * Três delimitações:
 *
 * - **Só tentativa marcada.** A anotada à mão é afirmação do corretor, não
 *   chute do sistema — sobrescrevê-la seria o app dizendo que ele se enganou.
 * - **A mais recente.** Uma resposta responde à última mensagem, não à de
 *   três meses atrás.
 * - **Dentro de `DIAS_COBRANCA_RESULTADO`.** É a mesma janela do nudge:
 *   passado o prazo, aquela tentativa já foi dada por não respondida, e uma
 *   conversa nova não deve ressuscitá-la.
 *
 * `respondeu` é o teto do que dá para afirmar aqui. Distinguir "agendou" de
 * "recusou" exige ler o texto, e isso é a fase 2 (IA) — com confirmação do
 * corretor, nunca gravado direto.
 */
export function fecharTentativaPendente(
  historico: Tentativa[] | null | undefined,
  hoje: string,
): FechamentoTentativa | null {
  const tentativas = historico || [];

  let alvo: Tentativa | null = null;
  for (const t of tentativas) {
    if (!t.aguardandoResultado) continue;
    const dias = daysBetween(t.data.slice(0, 10), hoje);
    if (dias === null || dias > DIAS_COBRANCA_RESULTADO) continue;
    // A mais recente entre as elegíveis.
    if (!alvo || t.data.localeCompare(alvo.data) > 0) alvo = t;
  }
  if (!alvo) return null;

  const fechada: Tentativa = { ...alvo, resultado: "respondeu", aguardandoResultado: undefined };
  return {
    tentativas: tentativas.map((t) => (t.id === fechada.id ? fechada : t)),
    fechada,
  };
}
