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

export type TipoModal =
  | "imovel"
  | "preCadastro"
  | "meta"
  | "agenda"
  | "verificacao"
  | "config"
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
  | "solicitacaoAngariacao";

export interface ModalAtivo {
  tipo: TipoModal;
  /** id do imóvel / compromisso em edição; ausente = criação. */
  id?: string;
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
  /** Imóvel pré-vinculado ao abrir o modal "agenda" em modo criação
      (ex.: "agendar próximo passo" na Início). Ignorado ao editar. */
  imovelIdRelacionado?: string;
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
      posicional no `abrirModal` — o texto é whatsapp-específico. */
  abrirWhatsappRascunho: (imovelId: string, texto: string, protocolos?: string[]) => void;
  fecharModal: () => void;
}

export const useUiModal = create<UiModal>((set) => ({
  modal: null,
  abrirModal: (tipo, id, modeloWhatsapp, imovelIdRelacionado) =>
    set({ modal: { tipo, id, modeloWhatsapp, imovelIdRelacionado } }),
  abrirWhatsappRascunho: (imovelId, texto, protocolos) =>
    set({ modal: { tipo: "whatsapp", id: imovelId, textoWhatsapp: texto, protocolosWhatsapp: protocolos } }),
  fecharModal: () => set({ modal: null }),
}));
