/* ================================================================
   TOAST (notificações)
   Port do toast() do app original (app.js, seção 3). Lá a função
   criava o nó no #toast-container direto no DOM; aqui ela publica
   num barramento simples que o <Toasts /> (montado no layout raiz)
   consome — mesmas classes CSS (.toast-container / .toast.success /
   .toast.error) e mesmos tempos (2600ms visível + 250ms de fade).
   Continua chamável de fora do React, como no app antigo.
   ================================================================ */

export type TipoToast = "success" | "error" | "warning";

/**
 * O toast em forma de CARTÃO — nasceu para a mensagem que chega do
 * proprietário (ver `calculo/chegadaResposta.ts`).
 *
 * O toast comum é uma frase curta em negrito que confirma o que o corretor
 * ACABOU de fazer ("Imóvel salvo"): ele lê de relance ou nem precisa ler.
 * A mensagem que chega é o contrário — é notícia de fora, com três
 * informações de pesos diferentes (quem falou, de qual imóvel, o que disse)
 * e um próximo passo. Espremer isso numa linha só de negrito, sem largura
 * máxima, produzia uma faixa atravessando a tela em que nada se destaca:
 * é o mesmo texto do aviso do sistema, só que sem a hierarquia que o
 * sistema dá de graça.
 */
export interface ToastCartao {
  /** Linha de cima, em destaque: quem falou. */
  titulo: string;
  /** Linha fina de contexto: de qual imóvel é. */
  detalhe?: string;
  /** O corpo, em citação: o que a pessoa disse. */
  mensagem?: string;
  /** Pílula no canto ("3 mensagens"). */
  selo?: string;
  /** Clique no cartão. Sem isto ele não é clicável. */
  aoClicar?: () => void;
}

export interface ToastItem {
  id: number;
  /** Texto puro. No cartão, é o que os leitores de tela anunciam. */
  msg: string;
  type: TipoToast;
  cartao?: ToastCartao;
  /** Sobrescreve TOAST_DURACAO_MS (o cartão fica mais tempo — ver abaixo). */
  duracaoMs?: number;
}

/** Tempo até começar o fade-out (idêntico ao setTimeout do app antigo). */
export const TOAST_DURACAO_MS = 2600;
/**
 * O cartão fica mais tempo, e não é capricho: 2,6s é o tempo de reconhecer
 * "Imóvel salvo", não o de LER a frase que o proprietário escreveu e decidir
 * se vale largar o que está fazendo. Some com a rajada — chegam três
 * mensagens, o cartão se refaz — e o aviso viraria um piscar de coisa
 * ilegível. Não é infinito porque o que não expira já existe: o badge do
 * menu e a caixa de respostas.
 */
export const TOAST_DURACAO_CARTAO_MS = 8000;
/** Duração do fade-out antes de remover o nó. */
export const TOAST_FADE_MS = 250;

type Ouvinte = (item: ToastItem) => void;

const ouvintes = new Set<Ouvinte>();
let proximoId = 0;

/** Inscreve um ouvinte (usado pelo <Toasts />). Retorna a função de desinscrição. */
export function inscreverToast(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function toast(msg: string, type: TipoToast = "success"): void {
  const item: ToastItem = { id: proximoId++, msg, type };
  ouvintes.forEach((ouvinte) => ouvinte(item));
}

/** O mesmo barramento, em forma de cartão (ver `ToastCartao`). */
export function toastCartao(cartao: ToastCartao, type: TipoToast = "success"): void {
  const partes = [cartao.titulo, cartao.detalhe, cartao.mensagem].filter(Boolean);
  const item: ToastItem = {
    id: proximoId++,
    msg: partes.join(" — "),
    type,
    cartao,
    duracaoMs: TOAST_DURACAO_CARTAO_MS,
  };
  ouvintes.forEach((ouvinte) => ouvinte(item));
}
