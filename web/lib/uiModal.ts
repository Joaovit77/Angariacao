/* ================================================================
   MODAL ATIVO
   Substitui o par openModal()/closeModal() do app antigo. Lá, o
   closeModal() precisava zerar à mão editingImovelId, editingAgendaId,
   editingMetaKey, miniMap, miniMapMarker e concluirVerificacaoId —
   uma convenção fácil de esquecer. Aqui só existe UM modal ativo por
   vez e cada componente de modal carrega seu próprio estado, que é
   descartado ao desmontar (MIGRATION_NEXT.md §12).
   ================================================================ */
import { create } from "zustand";
import type { ReferenciaSugestaoIa } from "@/lib/ia/feedback";

export type TipoModal =
  | "imovel"
  | "preCadastro"
  | "meta"
  | "agenda"
  | "avistamento"
  | "verificacao"
  | "conexaoWhatsapp"
  | "importar"
  | "whatsapp"
  | "notas"
  | "tentativas"
  | "abordagens"
  | "followUpLote"
  | "confirmarDisponibilidade"
  | "resultadosPendentes"
  | "desdobrar"
  | "locarEmLote"
  | "receberRepassesEmLote"
  | "solicitacaoAngariacao"
  | "gerarAnuncio"
  | "mensagemAgendada"
  | "mensagemDisponibilidadeLote";

/** Dados trazidos por uma fonte externa. São apenas valores iniciais do
    formulário: o corretor continua vendo, corrigindo e salvando tudo. */
export interface PreCadastroInicial {
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  origemImovel?: string;
  valorAluguel?: number | null;
  textoAnuncio?: string;
}

/** Valores iniciais do ModalImovel quando ele é aberto pelo Garimpo em
    Campo para transformar um imóvel visto em campo em oportunidade (V7
    §13). São só valores de formulário: o corretor confere, completa
    proprietário e telefone e salva pelo caminho normal. Nada aqui é dado
    pessoal, foto, etiqueta ou classificação — isso fica do lado do Garimpo. */
export interface PreenchimentoImovelDoGarimpo {
  endereco: string;
  unidade: string;
  bloco: string;
  edificio: string;
  bairro: string;
  cidade: string;
  estado: string;
  /** Tipo já definido no Garimpo; nulo mantém o padrão do modal. */
  tipo: string | null;
  origemImovel: string;
  /** Observação da passagem corrente — nunca o histórico inteiro. */
  observacoes: string;
}

/** A promoção de um registro do Garimpo. O modal continua sendo o mesmo
    cadastro do Pipeline; a única diferença é que, ao salvar, ele devolve o
    id criado a quem pediu — para o Garimpo gravar o vínculo, num passo
    separado, pela sua própria RPC. Promover não é transição de status:
    o `statusHistory` nasce vazio, como na importação. */
export interface PromocaoDoGarimpo {
  imovelIdentificadoId: string;
  inicial: PreenchimentoImovelDoGarimpo;
  /** Chamada UMA vez, depois de `salvarImovel` confirmar a gravação. */
  aoSalvar: (imovelId: string) => void;
}

export interface ModalAtivo {
  tipo: TipoModal;
  /** id do imóvel / compromisso em edição; ausente = criação. */
  id?: string;
  /** Seleção de uma ação transacional em massa. */
  ids?: string[];
  /** Modelo de WhatsApp pré-selecionado ao abrir o modal "whatsapp". */
  modeloWhatsapp?: string;
  /** Texto já preenchido ao abrir o modal "whatsapp" (rascunho da IA). Ao
      contrário do `modeloWhatsapp`, não é um id de modelo: é a mensagem em si,
      livre e editável. Quando presente, o modal não credita tentativa (é
      resposta a uma conversa aberta, não contato de captação). */
  textoWhatsapp?: string;
  /** Títulos dos protocolos da imobiliária em que o rascunho da IA se apoiou.
      Fica na tela, junto do texto, para o corretor conferir a FONTE do que a
      IA afirmou antes de mandar — o que não se confere num olhar deixa de ser
      conferido. Vazio quando o rascunho não usou nenhum. */
  protocolosWhatsapp?: string[];
  /** Identidade imutável do texto gerado, preservada até o envio real. */
  sugestaoWhatsapp?: ReferenciaSugestaoIa;
  /** O modal foi aberto para responder uma mensagem recebida. Só depois do
      envio confirmado essa origem autoriza marcar as respostas como lidas;
      envios comuns do Pipeline e da Agenda não podem limpar a pendência. */
  marcarRespostasLidasAposEnvio?: boolean;
  /** Abordagem do catálogo a CREDITAR no envio, quando o texto foi gerado a
      partir do anúncio do proprietário.

      Existe separada do `textoWhatsapp` porque as duas aberturas com texto
      pronto querem coisas opostas: o rascunho de resposta é mensagem livre e
      NÃO credita ninguém (responder conversa aberta não é contato de
      captação), enquanto esta É primeiro contato e precisa entrar no ranking —
      era o motivo inteiro da feature. Sem este campo, o `textoWhatsapp`
      sozinho zeraria o modelo selecionado e a tentativa nasceria sem crédito. */
  abordagemWhatsapp?: string;
  /** Imóvel pré-vinculado ao abrir o modal "agenda" em modo criação
      (ex.: "agendar próximo passo" na Início). Ignorado ao editar. */
  imovelIdRelacionado?: string;
  /** Valores iniciais ao transformar um compromisso de verificação de
      disponibilidade em uma mensagem automática. */
  dataMensagemAgendada?: string;
  textoMensagemAgendada?: string;
  /** Resultado escolhido na Central de Angariação. */
  preCadastroInicial?: PreCadastroInicial;
  /** ModalImovel aberto pelo Garimpo em Campo para criar a oportunidade. */
  promocaoDoGarimpo?: PromocaoDoGarimpo;
}

interface UiModal {
  modal: ModalAtivo | null;
  abrirModal: (
    tipo: TipoModal,
    id?: string,
    modeloWhatsapp?: string,
    imovelIdRelacionado?: string,
  ) => void;
  /** Abre o modal de WhatsApp já com um rascunho (ex.: a resposta sugerida
      pela IA na caixa de respostas). Ação própria em vez de mais um parâmetro
      posicional no `abrirModal` — além do texto, ela preserva que este envio
      trata uma resposta recebida. */
  abrirWhatsappRascunho: (
    imovelId: string,
    texto: string,
    protocolos?: string[],
    sugestao?: ReferenciaSugestaoIa,
  ) => void;
  /** Abre uma resposta pronta do sistema mantendo a mesma semântica de
      leitura dos rascunhos: a pendência só some após o envio confirmado. */
  abrirWhatsappModeloResposta: (imovelId: string, modeloId: string) => void;
  /** Abre o WhatsApp com a mensagem gerada a partir do anúncio do proprietário,
      já creditando a abordagem do catálogo — é o que põe a estratégia no
      ranking. Separada do rascunho porque aquele, de propósito, não credita. */
  abrirWhatsappAbordagem: (
    imovelId: string,
    texto: string,
    abordagemId: string,
    sugestao?: ReferenciaSugestaoIa,
  ) => void;
  abrirMensagemAgendadaDisponibilidade: (imovelId: string, data: string, texto: string) => void;
  abrirPreCadastro: (inicial: PreCadastroInicial) => void;
  /** Abre o ModalImovel (criação) pré-preenchido pelo Garimpo em Campo. É o
      único caminho pelo qual uma oportunidade nasce de um imóvel visto em
      campo — e é um clique humano que chega aqui, nunca um fluxo automático. */
  abrirImovelDoGarimpo: (promocao: PromocaoDoGarimpo) => void;
  abrirLocacaoEmLote: (imovelIds: string[]) => void;
  abrirRecebimentoEmLote: (repasseIds: string[]) => void;
  fecharModal: () => void;
}

export const useUiModal = create<UiModal>((set) => ({
  modal: null,
  abrirModal: (tipo, id, modeloWhatsapp, imovelIdRelacionado) =>
    set({ modal: { tipo, id, modeloWhatsapp, imovelIdRelacionado } }),
  abrirWhatsappRascunho: (imovelId, texto, protocolos, sugestao) =>
    set({
      modal: {
        tipo: "whatsapp",
        id: imovelId,
        textoWhatsapp: texto,
        protocolosWhatsapp: protocolos,
        sugestaoWhatsapp: sugestao,
        marcarRespostasLidasAposEnvio: true,
      },
    }),
  abrirWhatsappModeloResposta: (imovelId, modeloId) =>
    set({
      modal: {
        tipo: "whatsapp",
        id: imovelId,
        modeloWhatsapp: modeloId,
        marcarRespostasLidasAposEnvio: true,
      },
    }),
  abrirWhatsappAbordagem: (imovelId, texto, abordagemId, sugestao) =>
    set({
      modal: {
        tipo: "whatsapp",
        id: imovelId,
        textoWhatsapp: texto,
        abordagemWhatsapp: abordagemId,
        sugestaoWhatsapp: sugestao,
      },
    }),
  abrirMensagemAgendadaDisponibilidade: (imovelId, data, texto) =>
    set({
      modal: {
        tipo: "mensagemAgendada",
        imovelIdRelacionado: imovelId,
        dataMensagemAgendada: data,
        textoMensagemAgendada: texto,
      },
    }),
  abrirPreCadastro: (preCadastroInicial) =>
    set({ modal: { tipo: "preCadastro", preCadastroInicial } }),
  abrirImovelDoGarimpo: (promocaoDoGarimpo) =>
    set({ modal: { tipo: "imovel", promocaoDoGarimpo } }),
  abrirLocacaoEmLote: (ids) => set({ modal: { tipo: "locarEmLote", ids: [...new Set(ids)] } }),
  abrirRecebimentoEmLote: (ids) => set({ modal: { tipo: "receberRepassesEmLote", ids: [...new Set(ids)] } }),
  fecharModal: () => set({ modal: null }),
}));
