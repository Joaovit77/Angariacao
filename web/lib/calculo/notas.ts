/* ================================================================
   NOTAS AUTOMÁTICAS — a convenção de id, num lugar só

   Quem CRIA a nota da resposta do proprietário é o webhook
   (`webhookWhatsapp.ts`): ele grava a mensagem como nota do imóvel com
   id derivado do id da mensagem (`wa:<id>`), e é isso que dá a
   idempotência contra a reentrega da Evolution.

   O que mora AQUI é só a convenção desse id e a leitura dela — porque
   ela passou a ter três leitores, e um deles é o MOTOR. `isStale`
   conta "parado" a partir do último movimento, e resposta do
   proprietário é movimento; só que `webhookWhatsapp.ts` já importa
   `historicoComStatus` do motor, então o motor importar de lá fecharia
   um ciclo. Um módulo sem dependência nenhuma resolve, e mantém a
   convenção num lugar só.

   Reconstruir o `startsWith("wa:")` a dedo em cada leitor é
   exatamente o que este arquivo existe para evitar: `notaDoEncerramento`
   TAMBÉM nasce com o prefixo (ela é `wa:<id>:encerrado`), e o teste
   ingênuo contaria a fala do próprio app como se fosse resposta de
   alguém — promovendo o imóvel por causa de um texto que nós mesmos
   escrevemos.
   ================================================================ */
import type { NotaImovel } from "../tipos";

/** Prefixo do id da nota criada pelo webhook. Também serve para distinguir,
    na tela, o que veio automático do que o corretor escreveu. */
export const PREFIXO_ID_NOTA = "wa:";

/** Sufixo do id da nota que explica um encerramento automático. */
export const SUFIXO_ID_ENCERRAMENTO = ":encerrado";

/** Prefixo do TEXTO da nota criada pelo webhook. Mora aqui, e não em
    `webhookWhatsapp.ts`, pela mesma razão do prefixo de id: quem escreve é o
    webhook, mas quem lê são outros — e uma cópia solta do literal em cada
    leitor é exatamente como duas funções gêmeas divergem em silêncio. */
export const PREFIXO_TEXTO_RESPOSTA = "Resposta pelo WhatsApp: ";

/** O que o proprietário realmente escreveu, sem o prefixo do webhook. */
export function corpoDaResposta(texto: string | null | undefined): string {
  const t = (texto || "").trim();
  return t.startsWith(PREFIXO_TEXTO_RESPOSTA) ? t.slice(PREFIXO_TEXTO_RESPOSTA.length).trim() : t;
}

/**
 * A mensagem é só um marcador de mídia (`[áudio]`, `[imagem]`, `[contato]`…)?
 *
 * Quando não há texto, o webhook grava o TIPO entre colchetes — e faz certo:
 * "(vazio)" faria o corretor achar que o sistema falhou quando o proprietário
 * mandou um áudio. Mas num painel de texto essa nota não tem o que ser lido:
 * o conteúdo está no WhatsApp, e é lá que ele vai ter que abrir de qualquer
 * jeito. Por isso ela aparece na conversa mas não COBRA ação — medido na
 * carteira real em 29/07/2026, marcador de mídia era 27 das 80 pendências,
 * e 18 de um imóvel só.
 *
 * O teste é a forma (`[algo]`), não a lista de tipos: pega os rótulos de hoje,
 * o "[mensagem sem texto]" do caso desconhecido e qualquer tipo novo que a
 * Evolution passe a mandar, sem precisar voltar aqui.
 */
export function ehSoMidia(texto: string | null | undefined): boolean {
  return /^\[[^\]]+\]$/.test(corpoDaResposta(texto));
}

export function idNotaDaMensagem(mensagemId: string): string {
  return `${PREFIXO_ID_NOTA}${mensagemId}`;
}

/** A nota é uma MENSAGEM DO PROPRIETÁRIO (e não algo que o sistema escreveu)? */
export function ehNotaDeResposta(nota: { id?: string | null }): boolean {
  const id = nota.id || "";
  return id.startsWith(PREFIXO_ID_NOTA) && !id.endsWith(SUFIXO_ID_ENCERRAMENTO);
}

/**
 * Datetime (YYYY-MM-DDTHH:mm) da PRIMEIRA mensagem que o proprietário mandou.
 * null quando ele nunca escreveu.
 *
 * Devolve o datetime inteiro, e não o dia como a `dataUltimaResposta` logo
 * abaixo — a diferença não é descuido. Quem pergunta pela ÚLTIMA resposta
 * quer saber "faz quantos dias", e dia basta. Quem pergunta pela primeira
 * está separando o que veio ANTES dela do que veio DEPOIS (ver
 * `tentativasDeAlcance`), e aí o dia não serve: abordar às 10h, o
 * proprietário responder às 11h e o corretor treplicar às 12h é tudo no
 * mesmo dia, e com precisão de dia as três coisas ficariam indistinguíveis.
 */
export function dataPrimeiraResposta(notas: NotaImovel[] | null | undefined): string | null {
  let menor: string | null = null;
  for (const nota of notas || []) {
    if (!ehNotaDeResposta(nota)) continue;
    const quando = nota.data || "";
    if (!quando) continue;
    if (!menor || quando < menor) menor = quando;
  }
  return menor;
}

/** Dia (YYYY-MM-DD) da mensagem mais recente que o PROPRIETÁRIO mandou, lido
    das notas gravadas pelo webhook. null quando ele nunca escreveu.

    Só as notas do webhook contam. A nota escrita à mão pelo corretor fica de
    fora porque ela não distingue "liguei e ele atendeu" de "lembrar de checar
    o IPTU depois": as duas são texto livre, e só uma é sinal do proprietário.
    Quando o corretor age, o que registra isso é a TENTATIVA. */
export function dataUltimaResposta(notas: NotaImovel[] | null | undefined): string | null {
  let maior: string | null = null;
  for (const nota of notas || []) {
    if (!ehNotaDeResposta(nota)) continue;
    const dia = (nota.data || "").slice(0, 10);
    if (!dia) continue;
    if (!maior || dia > maior) maior = dia;
  }
  return maior;
}
