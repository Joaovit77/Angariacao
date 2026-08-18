/* ================================================================
   RASCUNHO DIÁRIO DO FOLLOW-UP

   O teto de 20 mensagens é dividido em duas rodadas de dez. O modal
   desmonta entre elas para a fila trabalhar em segundo plano; sem um
   estado fora do modal, isso apagava o roteiro e o texto que o corretor
   acabou de revisar e transformava a segunda rodada em retrabalho.

   O rascunho vive apenas na aba e apenas no dia em que foi montado. Não
   vai ao Supabase nem ao localStorage: amanhã a fila e o contexto podem
   ser outros, então uma edição pontual de hoje não pode virar padrão
   silencioso. O roteiro permanente continua sendo a Abordagem.
   ================================================================ */
import { create } from "zustand";

export interface EscolhaGrupoFollowUp {
  abordagemId: string;
  base: string;
}

interface RascunhoFollowUp {
  dia: string | null;
  escolhas: Record<string, EscolhaGrupoFollowUp>;
  salvarEscolha: (dia: string, grupoId: string, escolha: EscolhaGrupoFollowUp) => void;
  limpar: () => void;
}

export const ESCOLHAS_FOLLOWUP_VAZIAS: Record<string, EscolhaGrupoFollowUp> = {};

export const useRascunhoFollowUp = create<RascunhoFollowUp>((set) => ({
  dia: null,
  escolhas: ESCOLHAS_FOLLOWUP_VAZIAS,

  salvarEscolha: (dia, grupoId, escolha) =>
    set((estado) => ({
      dia,
      escolhas: {
        ...(estado.dia === dia ? estado.escolhas : ESCOLHAS_FOLLOWUP_VAZIAS),
        [grupoId]: escolha,
      },
    })),

  limpar: () => set({ dia: null, escolhas: ESCOLHAS_FOLLOWUP_VAZIAS }),
}));
