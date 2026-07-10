"use client";

/* ================================================================
   MODAL: METAS DO MÊS
   Port de openMetaModal() + saveMeta() (app.js, 5C).
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { currentMonthKey, monthLabelLong } from "@/lib/datas";
import { numOrNull, salvarMeta } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalMeta() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const metas = useAppStore((s) => s.metas);

  const mKey = currentMonthKey();
  const meta = metas[mKey] || { angariacoes: 0, locados: 0, comissao: 0 };

  const [angariacoes, setAngariacoes] = useState(meta.angariacoes ? String(meta.angariacoes) : "");
  const [locados, setLocados] = useState(meta.locados ? String(meta.locados) : "");
  const [comissao, setComissao] = useState(meta.comissao ? String(meta.comissao) : "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!usuario) return;
    setSalvando(true);
    const ok = await salvarMeta(
      mKey,
      {
        angariacoes: numOrNull(angariacoes) || 0,
        locados: numOrNull(locados) || 0,
        comissao: numOrNull(comissao) || 0,
      },
      usuario.id,
    );
    setSalvando(false);
    if (ok) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Metas de {monthLabelLong(mKey)}</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <div className="field-group">
          <label>Meta mensal de angariações</label>
          <input type="number" min="0" value={angariacoes} onChange={(e) => setAngariacoes(e.target.value)} />
          <div className="field-hint">
            Considera imóveis que chegaram na etapa &quot;Angariado&quot; no mês, não apenas contatos
            iniciados.
          </div>
        </div>
        <div className="field-group">
          <label>Meta de imóveis locados</label>
          <input type="number" min="0" value={locados} onChange={(e) => setLocados(e.target.value)} />
        </div>
        <div className="field-group">
          <label>Meta financeira de comissão (R$)</label>
          <input type="number" min="0" step="0.01" value={comissao} onChange={(e) => setComissao(e.target.value)} />
        </div>
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
            Salvar metas
          </button>
        </div>
      </div>
    </>
  );
}
