"use client";

/* ================================================================
   MODAL: MENSAGEM PARA WHATSAPP
   Port de abrirMensagemWhatsappModal() + copiarMensagemWhatsapp()
   (app.js, 5D). Só aparece quando o imóvel não tem telefone
   cadastrado — com telefone, o app abre o wa.me direto.
   ================================================================ */
import { useRef } from "react";
import { mensagemRenovacaoAngariacao } from "@/lib/calculo/agenda";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalWhatsapp({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!imovel) return null;
  const message = mensagemRenovacaoAngariacao(imovel);

  async function copiar() {
    const el = textareaRef.current;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.value);
      toast("Mensagem copiada.");
    } catch {
      el.focus();
      el.select();
      document.execCommand("copy");
      toast("Mensagem copiada.");
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Mensagem para WhatsApp</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          {`${imovel.codigo || imovel.endereco || "Imóvel sem código"} não tem telefone cadastrado. Copie a mensagem abaixo para enviar manualmente.`}
        </p>
        <textarea ref={textareaRef} readOnly style={{ minHeight: "220px" }} defaultValue={message} />
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={copiar}>
            Copiar mensagem
          </button>
        </div>
      </div>
    </>
  );
}
