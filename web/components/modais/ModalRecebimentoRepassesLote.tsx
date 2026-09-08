"use client";

import { useEffect, useMemo, useState } from "react";
import { todayISO } from "@/lib/datas";
import { fmtDate, fmtMoneyFull } from "@/lib/formatadores";
import {
  carregarRepasses,
  receberRepassesEmLote,
  type RepasseAngariacao,
} from "@/lib/repasses";
import { recarregarEstado } from "@/lib/mutacoes";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalRecebimentoRepassesLote({ repasseIds }: { repasseIds: string[] }) {
  const fecharModal = useUiModal((estado) => estado.fecharModal);
  const [repasses, setRepasses] = useState<RepasseAngariacao[]>([]);
  const [dataRecebimento, setDataRecebimento] = useState(todayISO());
  const [carregando, setCarregando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [operacaoId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    let ativo = true;
    void carregarRepasses()
      .then((lista) => {
        if (ativo) setRepasses(lista.filter((repasse) => repasseIds.includes(repasse.id)));
      })
      .catch((falha: Error) => { if (ativo) setErro(falha.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [repasseIds]);

  const total = useMemo(() => {
    if (repasses.length === 0 || repasses.some((repasse) => repasse.valorPrevisto == null)) return null;
    return repasses.reduce((soma, repasse) => soma + (repasse.valorPrevisto || 0), 0);
  }, [repasses]);

  async function confirmar() {
    if (!dataRecebimento || confirmando || repasses.length !== repasseIds.length) return;
    setConfirmando(true);
    setErro("");
    try {
      const resultado = await receberRepassesEmLote(operacaoId, repasseIds, dataRecebimento);
      if (!resultado.ok) {
        setErro(resultado.erros.map((item) => item.mensagem).join(" "));
        return;
      }
      await recarregarEstado();
      window.dispatchEvent(new CustomEvent("repasses:atualizados"));
      toast(`${resultado.totalRecebidos} repasse(s) marcado(s) como recebido(s).`);
      fecharModal();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Receber repasses em massa</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>✕</button>
      </div>
      <div className="modal-body">
        {carregando ? <p className="section-note">Carregando repasses…</p> : (
          <>
            <div className="locacao-resumo">
              <div><span>Quantidade</span><strong>{repasses.length}</strong></div>
              {total != null && <div><span>Total previsto</span><strong>{fmtMoneyFull(total)}</strong></div>}
              <div><span>Estado atual</span><strong>Pendente</strong></div>
            </div>
            <div className="field-group">
              <label>Data de recebimento</label>
              <input type="date" value={dataRecebimento} onChange={(evento) => setDataRecebimento(evento.target.value)} />
              <div className="field-hint">A previsão original continuará visível para comparação.</div>
            </div>
            <div className="table-scroll locacao-previa-tabela">
              <table>
                <thead><tr><th>Imóvel</th><th>Previsto</th><th>Recebido em</th></tr></thead>
                <tbody>{repasses.map((repasse) => (
                  <tr key={repasse.id}>
                    <td><strong>{repasse.codigo || "Sem código"}</strong><small>{repasse.endereco}</small></td>
                    <td>{fmtDate(repasse.dataPrevista)}</td>
                    <td>{fmtDate(dataRecebimento)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {erro && <div className="lote-erros" role="alert"><strong>Não foi possível concluir a operação.</strong><p>{erro}</p><span>Nenhuma alteração foi realizada.</span></div>}
          </>
        )}
      </div>
      <div className="modal-foot">
        <div></div>
        <div className="modal-foot-primary">
          <button type="button" className="btn" onClick={fecharModal}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void confirmar()} disabled={carregando || confirmando || !dataRecebimento || repasses.length !== repasseIds.length}>{confirmando ? "Confirmando…" : "Confirmar recebimento"}</button>
        </div>
      </div>
    </>
  );
}
