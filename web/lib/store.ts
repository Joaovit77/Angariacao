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
import type { Abordagem, AgendaItem, Imovel, Metas, Protocolo, UserConfig } from "./tipos";

interface AppStore {
  imoveis: Imovel[];
  metas: Metas;
  agenda: AgendaItem[];
  /** Catálogo de roteiros de captação (o QUE se diz), não o canal. */
  abordagens: Abordagem[];
  /** As regras da imobiliária que a IA consulta para poder afirmar algo ao
      responder o proprietário. Aqui só para alimentar a TELA de protocolos: o
      prompt é montado no servidor, que relê do banco (ver calculo/ia.ts). */
  protocolos: Protocolo[];
  config: UserConfig;
  /** true depois que carregarEstado() populou o store nesta sessão. */
  carregado: boolean;
  /** A IA está disponível para ESTA conta? Duas condições somadas: o
      servidor tem OPENAI_API_KEY e o usuário está liberado em
      `ia_permissoes`. Decide se os botões de IA aparecem — é UX, não
      controle de acesso: quem barra de fato é a rota /api/ia.
      Começa false: sem confirmação, não oferecemos o que não funciona. */
  iaDisponivel: boolean;
  /** Esta conta é super admin? Decide se o item "Administração" aparece
      no menu — é UX, não controle de acesso: quem barra de fato é o
      `exigirAdmin` de cada rota /api/admin/*. Começa false pelo mesmo
      motivo do `iaDisponivel`: sem confirmação do servidor, não se
      oferece o que pode não funcionar. */
  ehAdmin: boolean;
  /** Id da sessão cujo cargo já foi confirmado pelo servidor. */
  cargoUsuarioId: string | null;
  /** Esta conta trabalha angariação? Falso só para o admin que apenas
      OPERA o sistema — e aí as dez telas do corretor saem do menu, que
      nele abririam numa parede de zeros. Começa `true`, ao contrário do
      `ehAdmin`. O layout não interpreta este padrão até `cargoUsuarioId`
      confirmar que a resposta pertence à sessão atual. */
  operaCarteira: boolean;
  /** Anúncios ainda não vistos encontrados pelas buscas salvas do Radar. */
  radarNovos: number;
  /** Grava o resultado de carregarEstado() (login/boot). */
  setEstado: (estado: EstadoApp) => void;
  /** Volta ao estado inicial (logout). */
  limparEstado: () => void;

  setImoveis: (imoveis: Imovel[]) => void;
  setAgenda: (agenda: AgendaItem[]) => void;
  setAbordagens: (abordagens: Abordagem[]) => void;
  setProtocolos: (protocolos: Protocolo[]) => void;
  setIaDisponivel: (disponivel: boolean) => void;
  /** Os dois flags do cargo entram JUNTOS de propósito: separados, um
      render pegaria `ehAdmin` já verdadeiro com `operaCarteira` ainda
      no padrão, e o menu do operador nasceria com as dez telas do
      corretor antes de se corrigir sozinho. */
  setCargo: (userId: string, cargo: { admin: boolean; operaCarteira: boolean }) => void;
  setRadarNovos: (quantidade: number) => void;
  setMetas: (metas: Metas) => void;
  setConfig: (config: UserConfig) => void;
}

const ESTADO_INICIAL = {
  imoveis: [] as Imovel[],
  metas: {} as Metas,
  agenda: [] as AgendaItem[],
  abordagens: [] as Abordagem[],
  protocolos: [] as Protocolo[],
  config: { comissaoPercent: 100, agendaTipos: [], whatsappModelos: [], empresa: "", origensExtras: [], dadosPagamento: "" } as UserConfig, // % sobre 1 aluguel (100 = 1 mês)
  carregado: false,
  iaDisponivel: false,
  ehAdmin: false,
  cargoUsuarioId: null,
  operaCarteira: true,
  radarNovos: 0,
};

export const useAppStore = create<AppStore>((set) => ({
  ...ESTADO_INICIAL,
  setEstado: (estado) => set({ ...estado, carregado: true }),
  limparEstado: () => set({ ...ESTADO_INICIAL }),
  setImoveis: (imoveis) => set({ imoveis }),
  setAgenda: (agenda) => set({ agenda }),
  setAbordagens: (abordagens) => set({ abordagens }),
  setProtocolos: (protocolos) => set({ protocolos }),
  setIaDisponivel: (iaDisponivel) => set({ iaDisponivel }),
  setCargo: (cargoUsuarioId, { admin, operaCarteira }) => set({
    cargoUsuarioId,
    ehAdmin: admin,
    operaCarteira,
  }),
  setRadarNovos: (radarNovos) => set({ radarNovos }),
  setMetas: (metas) => set({ metas }),
  setConfig: (config) => set({ config }),
}));
