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
import ModalAbordagens from "./ModalAbordagens";
import ModalAgenda from "./ModalAgenda";
import ModalConfig from "./ModalConfig";
import ModalConexaoWhatsapp from "./ModalConexaoWhatsapp";
import ModalImportar from "./ModalImportar";
import ModalConfirmarDisponibilidade from "./ModalConfirmarDisponibilidade";
import ModalDesdobrar from "./ModalDesdobrar";
import ModalGerarAnuncio from "./ModalGerarAnuncio";
import ModalFollowUpLote from "./ModalFollowUpLote";
import ModalImovel from "./ModalImovel";
import ModalMeta from "./ModalMeta";
import ModalNotas from "./ModalNotas";
import ModalPreCadastro from "./ModalPreCadastro";
import ModalResultadosPendentes from "./ModalResultadosPendentes";
import ModalSolicitacaoAngariacao from "./ModalSolicitacaoAngariacao";
import ModalTentativas from "./ModalTentativas";
import ModalVerificacao from "./ModalVerificacao";
import ModalWhatsapp from "./ModalWhatsapp";
import ModalMensagemAgendada from "./ModalMensagemAgendada";
import ModalMensagemDisponibilidadeLote from "./ModalMensagemDisponibilidadeLote";

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
        {modal?.tipo === "preCadastro" && <ModalPreCadastro inicial={modal.preCadastroInicial} />}
        {modal?.tipo === "meta" && <ModalMeta />}
        {modal?.tipo === "agenda" && (
          <ModalAgenda id={modal.id} imovelIdRelacionado={modal.imovelIdRelacionado} />
        )}
        {modal?.tipo === "verificacao" && modal.id && <ModalVerificacao id={modal.id} />}
        {modal?.tipo === "config" && <ModalConfig />}
        {modal?.tipo === "conexaoWhatsapp" && <ModalConexaoWhatsapp />}
        {modal?.tipo === "importar" && <ModalImportar />}
        {modal?.tipo === "whatsapp" && modal.id && (
          <ModalWhatsapp
            imovelId={modal.id}
            modeloInicial={modal.modeloWhatsapp}
            textoInicial={modal.textoWhatsapp}
            abordagemInicial={modal.abordagemWhatsapp}
            protocolosUsados={modal.protocolosWhatsapp}
          />
        )}
        {modal?.tipo === "notas" && modal.id && <ModalNotas imovelId={modal.id} />}
        {modal?.tipo === "tentativas" && modal.id && <ModalTentativas imovelId={modal.id} />}
        {modal?.tipo === "abordagens" && <ModalAbordagens />}
        {modal?.tipo === "followUpLote" && <ModalFollowUpLote />}
        {modal?.tipo === "confirmarDisponibilidade" && <ModalConfirmarDisponibilidade />}
        {modal?.tipo === "resultadosPendentes" && <ModalResultadosPendentes />}
        {modal?.tipo === "desdobrar" && modal.id && <ModalDesdobrar imovelId={modal.id} />}
        {modal?.tipo === "solicitacaoAngariacao" && modal.id && (
          <ModalSolicitacaoAngariacao imovelId={modal.id} />
        )}
        {modal?.tipo === "gerarAnuncio" && modal.id && <ModalGerarAnuncio imovelId={modal.id} />}
        {modal?.tipo === "mensagemAgendada" && (
          <ModalMensagemAgendada
            id={modal.id}
            imovelIdRelacionado={modal.imovelIdRelacionado}
            dataInicial={modal.dataMensagemAgendada}
            mensagemInicial={modal.textoMensagemAgendada}
          />
        )}
        {modal?.tipo === "mensagemDisponibilidadeLote" && <ModalMensagemDisponibilidadeLote />}
      </div>
    </div>
  );
}
