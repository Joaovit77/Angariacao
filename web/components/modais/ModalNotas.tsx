"use client";

/* ================================================================
   MODAL: HISTÓRICO DE INTERAÇÕES (NOTAS)
   Registro cronológico de conversas com o proprietário do imóvel.
   As notas moram na coluna jsonb `notas` da tabela imoveis (mesmo
   padrão do status_history). O modal fica aberto após adicionar —
   só o campo é limpo — para permitir registrar várias em sequência.
   ================================================================ */
import { useState } from "react";
import { fmtDataHora } from "@/lib/formatadores";
import { adicionarNotaImovel, excluirNotaImovel } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalNotas({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imovel = useAppStore((s) => s.imoveis.find((i) => i.id === imovelId));
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!imovel) return null;

  const notas = [...(imovel.notas || [])].sort((a, b) => b.data.localeCompare(a.data));

  async function adicionar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    const ok = await adicionarNotaImovel(imovelId, texto);
    setSalvando(false);
    if (ok) setTexto("");
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Histórico de interações — {imovel.codigo || imovel.endereco}</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <div className="field-group">
          <label>Nova nota</label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Liguei para o proprietário, ficou de responder até sexta..."
            style={{ width: "100%", minHeight: "80px" }}
          />
          <div className="field-hint">
            Registre aqui cada contato com o proprietário para manter o histórico da negociação.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={adicionar}
            disabled={!texto.trim() || salvando}
          >
            Adicionar nota
          </button>
        </div>
        {notas.length === 0 ? (
          <p className="section-note">Nenhuma nota registrada ainda.</p>
        ) : (
          <div className="notas-lista">
            {notas.map((n) => (
              <div className="nota-item" key={n.id}>
                <div className="nota-data">
                  <span>{fmtDataHora(n.data)}</span>
                  <button
                    type="button"
                    className="icon-btn btn-danger"
                    title="Excluir nota"
                    onClick={() => excluirNotaImovel(imovelId, n.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="nota-texto">{n.texto}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <div></div>
        <button type="button" className="btn" onClick={fecharModal}>
          Fechar
        </button>
      </div>
    </>
  );
}
