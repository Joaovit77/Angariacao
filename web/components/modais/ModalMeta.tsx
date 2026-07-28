"use client";

/* ================================================================
   MODAL: METAS DO MÊS
   Port de openMetaModal() + saveMeta() (app.js, 5C).
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { metaDoMes, metaSugerida } from "@/lib/calculo/metaMes";
import { currentMonthKey, monthLabelLong } from "@/lib/datas";
import { numOrNull, salvarMeta } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalMeta() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const metas = useAppStore((s) => s.metas);

  const mKey = currentMonthKey();
  // No mês que ainda não tem meta, os campos abrem com os números do último mês
  // que teve — pré-preenchidos, não aplicados: o mês só passa a ter meta quando
  // o corretor salvar. Ver o cabeçalho de calculo/metaMes.ts.
  const sugestao = metaSugerida(metas, mKey);
  const meta = sugestao ? sugestao.meta : metaDoMes(metas, mKey);

  const [angariacoes, setAngariacoes] = useState(meta.angariacoes ? String(meta.angariacoes) : "");
  const [locados, setLocados] = useState(meta.locados ? String(meta.locados) : "");
  const [comissao, setComissao] = useState(meta.comissao ? String(meta.comissao) : "");
  const [faturamento, setFaturamento] = useState(meta.faturamento ? String(meta.faturamento) : "");
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
        faturamento: numOrNull(faturamento) || 0,
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
        {sugestao && (
          <div className="field-hint" style={{ marginBottom: "14px" }}>
            Pré-preenchido com a meta de {monthLabelLong(sugestao.mesOrigem)}. Confira os números e
            salve para valer em {monthLabelLong(mKey)}.
          </div>
        )}
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
        <div className="field-group">
          <label>Meta de faturamento em contratos (R$)</label>
          <input type="number" min="0" step="0.01" value={faturamento} onChange={(e) => setFaturamento(e.target.value)} />
          <div className="field-hint">
            Soma dos valores de aluguel dos imóveis locados no mês.
          </div>
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
