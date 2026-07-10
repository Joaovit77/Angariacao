/* ================================================================
   TOAST (notificações)
   Port do toast() do app original (app.js, seção 3). Lá a função
   criava o nó no #toast-container direto no DOM; aqui ela publica
   num barramento simples que o <Toasts /> (montado no layout raiz)
   consome — mesmas classes CSS (.toast-container / .toast.success /
   .toast.error) e mesmos tempos (2600ms visível + 250ms de fade).
   Continua chamável de fora do React, como no app antigo.
   ================================================================ */

export type TipoToast = "success" | "error";

export interface ToastItem {
  id: number;
  msg: string;
  type: TipoToast;
}

/** Tempo até começar o fade-out (idêntico ao setTimeout do app antigo). */
export const TOAST_DURACAO_MS = 2600;
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
