"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { todayISO } from "@/lib/datas";
import { fmtDate, fmtMoneyFull } from "@/lib/formatadores";
import { carregarRepasses, type RepasseAngariacao } from "@/lib/repasses";
import { useUiModal } from "@/lib/uiModal";

type Filtro = "todos" | "pendente" | "recebido" | "atrasado";

function statusExibido(repasse: RepasseAngariacao): string {
  if (repasse.status === "pendente" && repasse.dataPrevista < todayISO()) return "Atrasado";
  if (repasse.status === "recebido") return "Recebido";
  if (repasse.status === "cancelado") return "Cancelado";
  return "Pendente";
}

export default function RepassesView() {
  const abrirRecebimento = useUiModal((estado) => estado.abrirRecebimentoEmLote);
  const [repasses, setRepasses] = useState<RepasseAngariacao[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setRepasses(await carregarRepasses());
      setSelecionados(new Set());
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const inicial = window.setTimeout(() => void carregar(), 0);
    const atualizar = () => void carregar();
    window.addEventListener("repasses:atualizados", atualizar);
    return () => {
      window.clearTimeout(inicial);
      window.removeEventListener("repasses:atualizados", atualizar);
    };
  }, [carregar]);

  const filtrados = useMemo(() => repasses.filter((repasse) => {
    if (filtro === "todos") return true;
    if (filtro === "atrasado") return repasse.status === "pendente" && repasse.dataPrevista < todayISO();
    return repasse.status === filtro;
  }), [repasses, filtro]);
  const pendentesVisiveis = filtrados.filter((repasse) => repasse.status === "pendente");
  const todosPendentesMarcados = pendentesVisiveis.length > 0 && pendentesVisiveis.every((repasse) => selecionados.has(repasse.id));
  const totalSelecionado = (() => {
    const itens = repasses.filter((repasse) => selecionados.has(repasse.id));
    if (itens.length === 0 || itens.some((repasse) => repasse.valorPrevisto == null)) return null;
    return itens.reduce((soma, repasse) => soma + (repasse.valorPrevisto || 0), 0);
  })();

  function alternar(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id); else proximos.add(id);
      return proximos;
    });
  }

  function alternarTodos(marcar: boolean) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      pendentesVisiveis.forEach((repasse) => { if (marcar) proximos.add(repasse.id); else proximos.delete(repasse.id); });
      return proximos;
    });
  }

  return (
    <>
      <div className="page-head">
        <div><p className="page-sub">Previsões geradas a partir das locações e recebimentos efetivamente registrados.</p></div>
        <div className="page-actions">
          {selecionados.size > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => abrirRecebimento([...selecionados])}>
              Receber em massa ({selecionados.size})
            </button>
          )}
        </div>
      </div>

      <div className="repasses-resumo">
        <div className="card"><span>Previstos</span><strong>{repasses.length}</strong></div>
        <div className="card"><span>Pendentes</span><strong>{repasses.filter((item) => item.status === "pendente").length}</strong></div>
        <div className="card"><span>Recebidos</span><strong>{repasses.filter((item) => item.status === "recebido").length}</strong></div>
        <div className="card"><span>Atrasados</span><strong>{repasses.filter((item) => item.status === "pendente" && item.dataPrevista < todayISO()).length}</strong></div>
      </div>

      <div className="pipeline-toolbar repasses-toolbar">
        <select className="filter-select" value={filtro} onChange={(evento) => setFiltro(evento.target.value as Filtro)} aria-label="Filtrar repasses">
          <option value="todos">Todos os repasses</option>
          <option value="pendente">Pendentes</option>
          <option value="atrasado">Atrasados</option>
          <option value="recebido">Recebidos</option>
        </select>
        {selecionados.size > 0 && <span>{selecionados.size} selecionado(s){totalSelecionado != null ? ` · ${fmtMoneyFull(totalSelecionado)}` : ""}</span>}
      </div>

      {carregando ? <div className="card empty-state"><p>Carregando repasses…</p></div> : erro ? (
        <div className="card empty-state"><h3>Não foi possível carregar os repasses</h3><p>{erro}</p><button type="button" className="btn" onClick={() => void carregar()}>Tentar novamente</button></div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-state"><h3>Nenhum repasse neste filtro</h3><p>Os repasses aparecem aqui depois que uma locação é confirmada pela ação em massa do Pipeline.</p></div>
      ) : (
        <div className="card table-scroll repasses-tabela">
          <table>
            <thead><tr>
              <th className="pipeline-selecao-col"><input type="checkbox" checked={todosPendentesMarcados} onChange={(evento) => alternarTodos(evento.target.checked)} aria-label="Selecionar todos os repasses pendentes exibidos" /></th>
              <th>Imóvel</th><th>Locação</th><th>Primeiro vencimento</th><th>Previsto</th><th>Recebido</th><th>Política</th><th>Status</th>
            </tr></thead>
            <tbody>{filtrados.map((repasse) => (
              <tr key={repasse.id}>
                <td className="pipeline-selecao-col"><input type="checkbox" disabled={repasse.status !== "pendente"} checked={selecionados.has(repasse.id)} onChange={() => alternar(repasse.id)} aria-label={`Selecionar repasse de ${repasse.codigo || repasse.endereco}`} /></td>
                <td><strong>{repasse.codigo || "Sem código"}</strong><small>{repasse.endereco} · locação {repasse.numeroCiclo}</small></td>
                <td>{fmtDate(repasse.dataLocacao)}</td>
                <td>{fmtDate(repasse.primeiroVencimento)}</td>
                <td>{fmtDate(repasse.dataPrevista)}{repasse.valorPrevisto != null && <small>{fmtMoneyFull(repasse.valorPrevisto)}</small>}</td>
                <td>{repasse.dataRecebimento ? fmtDate(repasse.dataRecebimento) : "—"}{repasse.valorRecebido != null && <small>{fmtMoneyFull(repasse.valorRecebido)}</small>}</td>
                <td>{repasse.politicaNome}</td>
                <td><span className="badge repasse-status" data-repasse-status={statusExibido(repasse).toLowerCase()}>{statusExibido(repasse)}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
