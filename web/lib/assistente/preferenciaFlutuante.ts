"use client";

import { useSyncExternalStore } from "react";

export const CHAVE_ASSISTENTE_FLUTUANTE = "angariacao:assistente:flutuante-ativo";

interface ArmazenamentoPreferencia {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

const ouvintes = new Set<() => void>();
let valorSemArmazenamento = true;

function armazenamentoDoNavegador(): ArmazenamentoPreferencia | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function lerAssistenteFlutuanteAtivo(
  armazenamento: ArmazenamentoPreferencia | null = armazenamentoDoNavegador(),
): boolean {
  try {
    if (!armazenamento) return valorSemArmazenamento;
    return armazenamento.getItem(CHAVE_ASSISTENTE_FLUTUANTE) !== "0";
  } catch {
    return valorSemArmazenamento;
  }
}

export function definirAssistenteFlutuanteAtivo(
  ativo: boolean,
  armazenamento: ArmazenamentoPreferencia | null = armazenamentoDoNavegador(),
) {
  valorSemArmazenamento = ativo;
  try {
    armazenamento?.setItem(CHAVE_ASSISTENTE_FLUTUANTE, ativo ? "1" : "0");
  } catch {
    /* O controle continua funcional na sessão mesmo sem persistência local. */
  }
  ouvintes.forEach((ouvinte) => ouvinte());
}

function assinarAssistenteFlutuante(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  const sincronizarOutraAba = (evento: StorageEvent) => {
    if (evento.key === CHAVE_ASSISTENTE_FLUTUANTE) ouvinte();
  };
  window.addEventListener("storage", sincronizarOutraAba);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", sincronizarOutraAba);
  };
}

export function useAssistenteFlutuanteAtivo(): readonly [boolean, (ativo: boolean) => void] {
  const ativo = useSyncExternalStore(
    assinarAssistenteFlutuante,
    lerAssistenteFlutuanteAtivo,
    () => true,
  );
  return [ativo, definirAssistenteFlutuanteAtivo] as const;
}
