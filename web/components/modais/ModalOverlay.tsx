"use client";

/* ================================================================
   OVERLAY DE MODAL
   Port de openModal()/closeModal() e do handler global de Escape
   (app.js, 6B): Esc fecha o modal e também o drawer do Pipeline.
   Clicar no fundo NÃO fecha — só o X ou o Esc — para não perder o
   preenchimento por um clique fora (ex.: ao copiar algo do modal).
   ================================================================ */
import { useEffect } from "react";
import { usePipelineUi } from "@/lib/uiPipeline";
import { useUiModal } from "@/lib/uiModal";
import ModalAgenda from "./ModalAgenda";
import ModalConfig from "./ModalConfig";
import ModalImovel from "./ModalImovel";
import ModalMeta from "./ModalMeta";
import ModalNotas from "./ModalNotas";
import ModalPreCadastro from "./ModalPreCadastro";
import ModalVerificacao from "./ModalVerificacao";
import ModalWhatsapp from "./ModalWhatsapp";

export default function ModalOverlay() {
  const { modal, fecharModal } = useUiModal();
  const drawerImovelId = usePipelineUi((s) => s.drawerImovelId);
  const fecharDrawer = usePipelineUi((s) => s.fecharDrawer);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      fecharModal();
      if (drawerImovelId) fecharDrawer();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [fecharModal, drawerImovelId, fecharDrawer]);

  return (
    <div className={`modal-overlay${modal ? " open" : ""}`} id="modal-overlay">
      <div className="modal" id="modal-box">
        {modal?.tipo === "imovel" && <ModalImovel id={modal.id} />}
        {modal?.tipo === "preCadastro" && <ModalPreCadastro />}
        {modal?.tipo === "meta" && <ModalMeta />}
        {modal?.tipo === "agenda" && <ModalAgenda id={modal.id} />}
        {modal?.tipo === "verificacao" && modal.id && <ModalVerificacao id={modal.id} />}
        {modal?.tipo === "config" && <ModalConfig />}
        {modal?.tipo === "whatsapp" && modal.id && (
          <ModalWhatsapp imovelId={modal.id} modeloInicial={modal.modeloWhatsapp} />
        )}
        {modal?.tipo === "notas" && modal.id && <ModalNotas imovelId={modal.id} />}
      </div>
    </div>
  );
}
