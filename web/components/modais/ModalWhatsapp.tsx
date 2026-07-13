"use client";

/* ================================================================
   MODAL: MENSAGEM PARA WHATSAPP
   Port de abrirMensagemWhatsappModal() + copiarMensagemWhatsapp()
   (app.js, 5D). Aberto pela Agenda no "Enviar WhatsApp" do retorno
   ao proprietário: mostra a mensagem já preenchida e **editável**.
   Com telefone cadastrado, envia pelo wa.me com o texto revisado;
   sem telefone, é só copiar e mandar à mão.
   ================================================================ */
import { useRef, useState } from "react";
import { mensagemRenovacaoAngariacao, telefoneWhatsapp } from "@/lib/calculo/agenda";
import { linkWhatsapp } from "@/lib/calculo/whatsapp";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalWhatsapp({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mensagem, setMensagem] = useState(() => mensagemRenovacaoAngariacao(imovel));

  if (!imovel) return null;
  const temTelefone = !!telefoneWhatsapp(imovel.proprietarioTelefone);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast("Mensagem copiada.");
    } catch {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.select();
        document.execCommand("copy");
        toast("Mensagem copiada.");
      }
    }
  }

  function enviar() {
    if (!imovel) return;
    const link = linkWhatsapp(imovel, mensagem);
    if (!link) return;
    window.open(link, "_blank", "noopener");
    fecharModal();
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
          {temTelefone
            ? "Revise ou edite a mensagem abaixo e clique em Enviar WhatsApp para abrir a conversa já com o texto."
            : `${imovel.codigo || imovel.endereco || "Imóvel sem código"} não tem telefone cadastrado. Edite e copie a mensagem abaixo para enviar manualmente.`}
        </p>
        <textarea
          ref={textareaRef}
          style={{ minHeight: "220px" }}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn" onClick={copiar}>
            Copiar mensagem
          </button>
          {temTelefone && (
            <button type="button" className="btn btn-primary" onClick={enviar}>
              Enviar WhatsApp
            </button>
          )}
        </div>
      </div>
    </>
  );
}
