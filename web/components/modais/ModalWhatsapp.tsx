"use client";

/* ================================================================
   MODAL: MENSAGEM PARA WHATSAPP
   Aberto pela Agenda no "Enviar WhatsApp" do retorno ao proprietário.
   Mostra a mensagem preenchida e editável, com modelos: o padrão de
   renovação + os modelos criados pelo próprio usuário (config). Dá
   para salvar a mensagem atual como um novo modelo reutilizável — o
   nome do proprietário vira {nome} para a saudação se adaptar depois.
   Com telefone, envia pelo wa.me; sem telefone, é só copiar.
   ================================================================ */
import { useRef, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { mensagemRenovacaoAngariacao, telefoneWhatsapp } from "@/lib/calculo/agenda";
import { aplicarModeloUsuario, linkWhatsapp, tokenizarModeloUsuario } from "@/lib/calculo/whatsapp";
import { adicionarModeloWhatsapp, removerModeloWhatsapp } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

const RENOVACAO = "__renovacao";

export default function ModalWhatsapp({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const config = useAppStore((s) => s.config);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mensagem, setMensagem] = useState(() => mensagemRenovacaoAngariacao(imovel));
  const [modeloSel, setModeloSel] = useState(RENOVACAO);
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");

  if (!imovel) return null;
  const temTelefone = !!telefoneWhatsapp(imovel.proprietarioTelefone);
  const modelos = config.whatsappModelos || [];
  const modeloCustomSel = modelos.find((m) => m.id === modeloSel) || null;

  function trocarModelo(id: string) {
    if (!imovel) return;
    setModeloSel(id);
    if (id === RENOVACAO) {
      setMensagem(mensagemRenovacaoAngariacao(imovel));
      return;
    }
    const m = modelos.find((x) => x.id === id);
    if (m) setMensagem(aplicarModeloUsuario(m.texto, imovel));
  }

  async function salvarModelo() {
    if (!usuario || !imovel) return;
    const nome = nomeNovo.trim();
    if (!nome) {
      toast("Dê um nome ao modelo.", "error");
      return;
    }
    if (modelos.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) {
      toast("Já existe um modelo com esse nome.", "error");
      return;
    }
    const texto = tokenizarModeloUsuario(mensagem, imovel);
    const novo = await adicionarModeloWhatsapp(nome, texto, config, usuario.id);
    if (novo) {
      setModeloSel(novo.id);
      setNomeNovo("");
      setSalvarAberto(false);
    }
  }

  async function excluirModelo() {
    if (!usuario || !modeloCustomSel || !imovel) return;
    const ok = await removerModeloWhatsapp(modeloCustomSel.id, config, usuario.id);
    if (ok) {
      setModeloSel(RENOVACAO);
      setMensagem(mensagemRenovacaoAngariacao(imovel));
    }
  }

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
            ? "Escolha um modelo, ajuste o texto e clique em Enviar WhatsApp para abrir a conversa já com a mensagem."
            : `${imovel.codigo || imovel.endereco || "Imóvel sem código"} não tem telefone cadastrado. Edite e copie a mensagem abaixo para enviar manualmente.`}
        </p>

        <div className="field-group">
          <label>Modelo</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select value={modeloSel} onChange={(e) => trocarModelo(e.target.value)} style={{ flex: 1 }}>
              <option value={RENOVACAO}>Renovação de angariação (padrão)</option>
              {modelos.length > 0 && (
                <optgroup label="Meus modelos">
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {modeloCustomSel && (
              <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={excluirModelo}>
                Excluir modelo
              </button>
            )}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          style={{ minHeight: "200px" }}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />

        {salvarAberto ? (
          <div className="field-group" style={{ marginTop: "10px" }}>
            <label>Nome do novo modelo</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="Ex: Falar mais tarde"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    salvarModelo();
                  }
                }}
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={salvarModelo}>
                Salvar modelo
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setSalvarAberto(false)}>
                Cancelar
              </button>
            </div>
            <div className="field-hint">
              O modelo guarda o texto atual. O nome do proprietário vira um marcador e se adapta
              sozinho quando você usar o modelo em outro contato.
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginTop: "10px" }}
            onClick={() => setSalvarAberto(true)}
          >
            + Salvar como modelo
          </button>
        )}
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
