/* ================================================================
   STORE GLOBAL (Zustand)
   Espelha o STATE do app original: { imoveis, metas, agenda,
   config } com os mesmos valores iniciais. O modelo de dados
   continua o do app antigo — carga total no login (carregarEstado)
   e escritas pontuais nas mutações (lib/mutacoes.ts); nada de
   cache/refetch automático (decisão do MIGRATION_NEXT.md §4).

   Os setters granulares existem para as mutações. Note que o app
   antigo NÃO escreve otimista: ele chama o Supabase primeiro e só
   atualiza o STATE se a escrita deu certo (em falha: toast e nada
   muda). O port mantém essa ordem — é o que garante que a UI nunca
   fique dessincronizada do banco.
   ================================================================ */
import { create } from "zustand";
import type { EstadoApp } from "./persistencia/carregarEstado";
import type { Abordagem, AgendaItem, Imovel, Metas, UserConfig } from "./tipos";

interface AppStore {
  imoveis: Imovel[];
  metas: Metas;
  agenda: AgendaItem[];
  /** Catálogo de roteiros de captação (o QUE se diz), não o canal. */
  abordagens: Abordagem[];
  config: UserConfig;
  /** true depois que carregarEstado() populou o store nesta sessão. */
  carregado: boolean;
  /** O servidor tem OPENAI_API_KEY? Decide se os botões de IA aparecem.
      Começa false: sem confirmação, não oferecemos o que não funciona. */
  iaDisponivel: boolean;
  /** Grava o resultado de carregarEstado() (login/boot). */
  setEstado: (estado: EstadoApp) => void;
  /** Volta ao estado inicial (logout). */
  limparEstado: () => void;

  setImoveis: (imoveis: Imovel[]) => void;
  setAgenda: (agenda: AgendaItem[]) => void;
  setAbordagens: (abordagens: Abordagem[]) => void;
  setIaDisponivel: (disponivel: boolean) => void;
  setMetas: (metas: Metas) => void;
  setConfig: (config: UserConfig) => void;
}

const ESTADO_INICIAL = {
  imoveis: [] as Imovel[],
  metas: {} as Metas,
  agenda: [] as AgendaItem[],
  abordagens: [] as Abordagem[],
  config: { comissaoPercent: 100, agendaTipos: [], whatsappModelos: [] } as UserConfig, // % sobre 1 aluguel (100 = 1 mês)
  carregado: false,
  iaDisponivel: false,
};

export const useAppStore = create<AppStore>((set) => ({
  ...ESTADO_INICIAL,
  setEstado: (estado) => set({ ...estado, carregado: true }),
  limparEstado: () => set({ ...ESTADO_INICIAL }),
  setImoveis: (imoveis) => set({ imoveis }),
  setAgenda: (agenda) => set({ agenda }),
  setAbordagens: (abordagens) => set({ abordagens }),
  setIaDisponivel: (iaDisponivel) => set({ iaDisponivel }),
  setMetas: (metas) => set({ metas }),
  setConfig: (config) => set({ config }),
}));
