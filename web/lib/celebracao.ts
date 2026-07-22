/* ================================================================
   CELEBRAÇÃO ATIVA (estado de UI)
   Store minúsculo, no mesmo espírito do uiModal.ts: uma celebração
   por vez, publicada pela mutação e consumida pelo <Celebracao />.

   Fica FORA do uiModal de propósito. O salvamento termina com o
   ModalImovel chamando fecharModal(), e se a festa morasse no mesmo
   store esse fechamento a apagaria no mesmo instante em que ela
   nasce — uma corrida silenciosa entre a mutação e o modal. Separada,
   ela sobrevive ao fechamento e à troca de view, como o indicador do
   follow-up em lote.
   ================================================================ */
import { create } from "zustand";
import type { Celebracao } from "./calculo/celebracao";

interface UiCelebracao {
  celebracao: Celebracao | null;
  comemorar: (c: Celebracao) => void;
  encerrar: () => void;
}

export const useCelebracao = create<UiCelebracao>((set) => ({
  celebracao: null,
  comemorar: (c) => set({ celebracao: c }),
  encerrar: () => set({ celebracao: null }),
}));
