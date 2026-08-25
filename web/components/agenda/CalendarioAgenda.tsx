"use client";

import { useMemo, useState } from "react";
import { compararAgenda } from "@/lib/calculo/agenda";
import {
  currentMonthKey,
  gradeCalendarioMes,
  monthLabelLong,
  shiftMonthKey,
  todayISO,
} from "@/lib/datas";
import { fmtDateLong, fmtDiaSemana } from "@/lib/formatadores";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export default function CalendarioAgenda({
  items,
  imoveis,
}: {
  items: AgendaItem[];
  imoveis: Imovel[];
}) {
  const hoje = todayISO();
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [mesKey, setMesKey] = useState(currentMonthKey());
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);

  const grade = useMemo(() => gradeCalendarioMes(mesKey), [mesKey]);
  const itemsPorData = useMemo(() => {
    const agrupados = new Map<string, AgendaItem[]>();
    items.forEach((item) => {
      const grupo = agrupados.get(item.date) || [];
      grupo.push(item);
      agrupados.set(item.date, grupo);
    });
    agrupados.forEach((grupo) => grupo.sort(compararAgenda));
    return agrupados;
  }, [items]);

  const itemsDoDia = itemsPorData.get(diaSelecionado) || [];
  const proximos = items
    .filter((item) => !item.done && item.date > diaSelecionado)
    .sort(compararAgenda)
    .slice(0, 4);

  function mudarMes(delta: number) {
    const novoMes = shiftMonthKey(mesKey, delta);
    setMesKey(novoMes);
    setDiaSelecionado(novoMes === currentMonthKey() ? hoje : `${novoMes}-01`);
  }

  function irParaHoje() {
    setMesKey(currentMonthKey());
    setDiaSelecionado(hoje);
  }

  function detalheImovel(item: AgendaItem): string {
    if (!item.imovelId) return item.type;
    const imovel = imoveis.find((candidato) => candidato.id === item.imovelId);
    return imovel?.codigo || imovel?.endereco || item.type;
  }

  function renderLista(lista: AgendaItem[]) {
    return lista.map((item) => (
      <button
        type="button"
        className={`agenda-calendario-compromisso${item.done ? " concluido" : ""}`}
        key={item.id}
        onClick={() => abrirModal("agenda", item.id)}
      >
        <span className="agenda-calendario-hora">{item.hora || "Dia todo"}</span>
        <span className="agenda-calendario-compromisso-corpo">
          <strong>{item.title}</strong>
          <span>{detalheImovel(item)}</span>
        </span>
      </button>
    ));
  }

  return (
    <div className="agenda-calendario-card">
      <div className="agenda-calendario-principal">
        <div className="agenda-calendario-cabecalho">
          <div>
            <span className="agenda-calendario-eyebrow">Visão mensal</span>
            <h2>{monthLabelLong(mesKey)}</h2>
          </div>
          <div className="agenda-calendario-navegacao">
            {mesKey !== currentMonthKey() && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={irParaHoje}>
                Hoje
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label="Mês anterior"
              title="Mês anterior"
              onClick={() => mudarMes(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Próximo mês"
              title="Próximo mês"
              onClick={() => mudarMes(1)}
            >
              ›
            </button>
          </div>
        </div>

        <div className="agenda-calendario-semana" aria-hidden="true">
          {DIAS_SEMANA.map((dia) => <span key={dia}>{dia}</span>)}
        </div>
        <div className="agenda-calendario-grade" role="grid" aria-label={monthLabelLong(mesKey)}>
          {grade.map((data, indice) => {
            if (!data) return <span className="agenda-calendario-vazio" key={`vazio-${indice}`} />;
            const compromissos = itemsPorData.get(data) || [];
            const pendentes = compromissos.filter((item) => !item.done).length;
            const selecionado = data === diaSelecionado;
            const atual = data === hoje;
            return (
              <button
                type="button"
                role="gridcell"
                aria-selected={selecionado}
                aria-label={`${fmtDateLong(data)}, ${compromissos.length} compromisso${compromissos.length === 1 ? "" : "s"}`}
                className={`agenda-calendario-dia${selecionado ? " selecionado" : ""}${atual ? " hoje" : ""}`}
                key={data}
                onClick={() => setDiaSelecionado(data)}
              >
                <span className="agenda-calendario-numero">{Number(data.slice(8))}</span>
                {compromissos.length > 0 && (
                  <span className="agenda-calendario-marcadores" aria-hidden="true">
                    <span className={pendentes > 0 ? "pendente" : "concluido"} />
                    {compromissos.length > 1 && <small>{compromissos.length}</small>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="agenda-calendario-detalhes">
        <div className="agenda-calendario-detalhes-data">
          <span>{fmtDiaSemana(diaSelecionado)}</span>
          <strong>{fmtDateLong(diaSelecionado)}</strong>
        </div>

        <div className="agenda-calendario-lista">
          <h3>{itemsDoDia.length > 0 ? "Compromissos do dia" : "Nenhum compromisso"}</h3>
          {itemsDoDia.length > 0 ? (
            renderLista(itemsDoDia)
          ) : (
            <p className="agenda-calendario-vazio-texto">Este dia está livre na sua agenda.</p>
          )}

          {itemsDoDia.length === 0 && proximos.length > 0 && (
            <div className="agenda-calendario-proximos">
              <h3>Próximos</h3>
              {renderLista(proximos)}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
