"use client";

/* ================================================================
   MODAL: MENSAGEM PARA WHATSAPP
   Aberto pela Agenda ("Enviar WhatsApp" do retorno ao proprietário)
   e pelo pré-cadastro rápido (confirmação de endereço). Mostra a
   mensagem preenchida e EDITÁVEL, com seletor de modelos: os modelos
   prontos por etapa do funil + os criados pelo usuário. Dá para
   salvar a mensagem atual como um novo modelo reutilizável — o nome
   do proprietário vira {nome} para a saudação se adaptar depois.
   Com telefone, envia pelo wa.me; sem telefone, é só copiar.
   ================================================================ */
import { useRef, useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import { telefoneWhatsapp } from "@/lib/calculo/agenda";
import {
  aplicarModeloUsuario,
  linkWhatsapp,
  MARCADORES_MODELO,
  mensagemWhatsapp,
  MODELOS_WHATSAPP,
  tokenizarModeloUsuario,
} from "@/lib/calculo/whatsapp";
import { adicionarModeloWhatsapp, removerModeloWhatsapp } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

const MODELO_PADRAO = "renovacao-angariacao";

export default function ModalWhatsapp({ imovelId, modeloInicial }: { imovelId: string; modeloInicial?: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const config = useAppStore((s) => s.config);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const nomeCaptador = rotuloUsuario(usuario);
  const modelosUsuario = config.whatsappModelos || [];

  // Modelo inicial: o pedido pela abertura (ex.: confirmação de endereço no
  // pré-cadastro), desde que exista; senão, a renovação de angariação.
  const padraoInicial =
    modeloInicial && MODELOS_WHATSAPP.some((m) => m.id === modeloInicial) ? modeloInicial : MODELO_PADRAO;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modeloId, setModeloId] = useState(padraoInicial);
  const [mensagem, setMensagem] = useState(() =>
    imovel ? mensagemWhatsapp(padraoInicial, imovel, nomeCaptador) : "",
  );
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");

  if (!imovel) return null;
  const temTelefone = !!telefoneWhatsapp(imovel.proprietarioTelefone);
  const modeloCustomSel = modelosUsuario.find((m) => m.id === modeloId) || null;

  function trocarModelo(id: string) {
    if (!imovel) return;
    setModeloId(id);
    const custom = modelosUsuario.find((m) => m.id === id);
    setMensagem(custom ? aplicarModeloUsuario(custom.texto, imovel) : mensagemWhatsapp(id, imovel, nomeCaptador));
  }

  async function salvarModelo() {
    if (!usuario || !imovel) return;
    const nome = nomeNovo.trim();
    if (!nome) {
      toast("Dê um nome ao modelo.", "error");
      return;
    }
    if (modelosUsuario.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) {
      toast("Já existe um modelo com esse nome.", "error");
      return;
    }
    const texto = tokenizarModeloUsuario(mensagem, imovel);
    const novo = await adicionarModeloWhatsapp(nome, texto, config, usuario.id);
    if (novo) {
      setModeloId(novo.id);
      setNomeNovo("");
      setSalvarAberto(false);
    }
  }

  async function excluirModelo() {
    if (!usuario || !modeloCustomSel || !imovel) return;
    const ok = await removerModeloWhatsapp(modeloCustomSel.id, config, usuario.id);
    if (ok) {
      setModeloId(padraoInicial);
      setMensagem(mensagemWhatsapp(padraoInicial, imovel, nomeCaptador));
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

  /** Insere um marcador ({nome}/{endereco}) na posição do cursor do textarea. */
  function inserirMarcador(token: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? mensagem.length;
    const end = el?.selectionEnd ?? mensagem.length;
    setMensagem(mensagem.slice(0, start) + token + mensagem.slice(end));
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
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
          {temTelefone
            ? "Escolha um modelo, ajuste o texto e clique em Enviar WhatsApp para abrir a conversa já com a mensagem."
            : `${imovel.codigo || imovel.endereco || "Imóvel sem código"} não tem telefone cadastrado. Edite e copie a mensagem abaixo para enviar manualmente.`}
        </p>

        <div className="field-group">
          <label>Modelo</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <select value={modeloId} onChange={(e) => trocarModelo(e.target.value)} style={{ flex: 1 }}>
              {MODELOS_WHATSAPP.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
              {modelosUsuario.length > 0 && (
                <optgroup label="Meus modelos">
                  {modelosUsuario.map((m) => (
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
        <div className="marcadores-modelo">
          <span>Inserir marcador:</span>
          {MARCADORES_MODELO.map((m) => (
            <button
              key={m.token}
              type="button"
              className="chip-marcador"
              title={`${m.rotulo} — adapta-se a cada imóvel`}
              onClick={() => inserirMarcador(m.token)}
            >
              {m.token}
            </button>
          ))}
        </div>

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
              O modelo guarda o texto atual. O nome e o endereço do imóvel viram os marcadores{" "}
              <strong>{"{nome}"}</strong> e <strong>{"{endereco}"}</strong>, que se adaptam sozinhos
              quando você usar o modelo em outro contato.
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
