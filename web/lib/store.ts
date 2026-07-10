/* ================================================================
   STORE GLOBAL (Zustand)
   Espelha o STATE do app original: { imoveis, metas, agenda,
   config } com os mesmos valores iniciais. O modelo de dados
   continua o do app antigo — carga total no login (carregarEstado)
   e escritas otimistas pontuais nas mutações (Etapa 6); nada de
   cache/refetch automático (decisão do MIGRATION_NEXT.md §4).
   ================================================================ */
import { create } from "zustand";
import type { EstadoApp } from "./persistencia/carregarEstado";
import type { AgendaItem, Imovel, Metas, UserConfig } from "./tipos";

interface AppStore {
  imoveis: Imovel[];
  metas: Metas;
  agenda: AgendaItem[];
  config: UserConfig;
  /** true depois que carregarEstado() populou o store nesta sessão. */
  carregado: boolean;
  /** Grava o resultado de carregarEstado() (login/boot). */
  setEstado: (estado: EstadoApp) => void;
  /** Volta ao estado inicial (logout). */
  limparEstado: () => void;
}

const ESTADO_INICIAL = {
  imoveis: [] as Imovel[],
  metas: {} as Metas,
  agenda: [] as AgendaItem[],
  config: { comissaoPercent: 100 } as UserConfig, // % sobre 1 aluguel (100 = 1 mês)
  carregado: false,
};

export const useAppStore = create<AppStore>((set) => ({
  ...ESTADO_INICIAL,
  setEstado: (estado) => set({ ...estado, carregado: true }),
  limparEstado: () => set({ ...ESTADO_INICIAL }),
}));
