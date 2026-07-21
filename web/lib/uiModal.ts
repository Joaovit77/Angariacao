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
  | "whatsapp"
  | "notas"
  | "tentativas"
  | "abordagens"
  | "followUpLote"
  | "resultadosPendentes";

export interface ModalAtivo {
  tipo: TipoModal;
  /** id do imóvel / compromisso em edição; ausente = criação. */
  id?: string;
  /** Modelo de WhatsApp pré-selecionado ao abrir o modal "whatsapp". */
  modeloWhatsapp?: string;
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
  fecharModal: () => void;
}

export const useUiModal = create<UiModal>((set) => ({
  modal: null,
  abrirModal: (tipo, id, modeloWhatsapp, imovelIdRelacionado) =>
    set({ modal: { tipo, id, modeloWhatsapp, imovelIdRelacionado } }),
  fecharModal: () => set({ modal: null }),
}));
