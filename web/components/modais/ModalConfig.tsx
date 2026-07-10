"use client";

/* ================================================================
   MODAL: CONFIGURAÇÕES
   Port de openConfigModal() + saveConfig() + carregarDadosDemo() +
   resetAllData() (app.js, seções 7 e 8).
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { apagarTodosOsDados, carregarDadosDemo, numOrNull, salvarConfig } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalConfig() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const config = useAppStore((s) => s.config);

  const [comissao, setComissao] = useState(String(config.comissaoPercent));
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await salvarConfig(numOrNull(comissao) || 100, usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  async function demo() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await carregarDadosDemo(usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  async function apagar() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await apagarTodosOsDados(usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Configurações</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <div className="field-group">
          <label>Percentual de comissão sobre o aluguel</label>
          <input type="number" min="0" step="1" value={comissao} onChange={(e) => setComissao(e.target.value)} />
          <div className="field-hint">
            100% equivale a 1 mês de aluguel. Usado para calcular a comissão estimada de cada imóvel
            automaticamente.
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Conta</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Logado como <strong>{usuario?.email}</strong>
          </div>
        </div>
        <div className="field-group">
          <label>Dados</label>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", marginBottom: "8px" }}
            onClick={demo}
            disabled={ocupado}
          >
            Carregar dados de exemplo
          </button>
          <div className="field-hint" style={{ marginBottom: "14px" }}>
            Adiciona imóveis, metas e compromissos fictícios para você explorar o sistema.
          </div>
          <button type="button" className="btn btn-danger" style={{ width: "100%" }} onClick={apagar} disabled={ocupado}>
            Apagar todos os meus dados
          </button>
          <div className="field-hint">Remove permanentemente todos os imóveis, metas e compromissos desta conta.</div>
        </div>
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={ocupado}>
            Salvar
          </button>
        </div>
      </div>
    </>
  );
}
