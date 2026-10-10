"use client";

import { useLayoutEffect } from "react";
import { create } from "zustand";

interface SuperficiesBloqueantes {
  registros: ReadonlySet<symbol>;
  registrar: () => () => void;
}

/** Registro transitório: cada origem libera somente o próprio bloqueio. */
export const useSuperficiesBloqueantes = create<SuperficiesBloqueantes>((set) => ({
  registros: new Set(),
  registrar: () => {
    const token = Symbol("superficie-bloqueante");
    set((estado) => ({ registros: new Set(estado.registros).add(token) }));
    return () => set((estado) => {
      if (!estado.registros.has(token)) return estado;
      const registros = new Set(estado.registros);
      registros.delete(token);
      return { registros };
    });
  },
}));

/** Suspende o flutuante antes da pintura; cleanup também cobre Strict Mode. */
export function useRegistrarSuperficieBloqueante(ativa = true) {
  useLayoutEffect(() => {
    if (ativa) return useSuperficiesBloqueantes.getState().registrar();
  }, [ativa]);
}
