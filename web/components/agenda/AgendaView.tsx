"use client";

/* ================================================================
   VIEW: AGENDA
   Port de viewAgenda() + renderAgendaItemEnhanced() (app.js, 5D).
   Tipos: Retorno ao proprietário, Visita, Pendência, Documentação,
   Follow-up.

   Concluir um lembrete de "verificar disponibilidade" abre o modal
   que registra o novo contato e encadeia o próximo lembrete; os
   demais compromissos alternam done direto.
   ================================================================ */
import { useState } from "react";
import {
  agendaTypeIcon,
  agendaVencimentoInfo,
  AGENDA_PENDENTES_JANELA_DIAS,
  compararAgenda,
  isAgendaAngariacaoVencida,
  mensagemRenovacaoAngariacao,
  telefoneWhatsapp,
} from "@/lib/calculo/agenda";
import { AGENDA_TYPES } from "@/lib/constantes";
import { addDaysISO, todayISO } from "@/lib/datas";
import { fmtDateLong } from "@/lib/formatadores";
import { alternarAgendaDone, excluirAgenda } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

type FiltroAgenda = "pendentes" | "todas" | "atrasadas" | "concluidas";

function ItemAgenda({ a, imovel }: { a: AgendaItem; imovel: Imovel | null }) {
  const abrirModal = useUiModal((s) => s.abrirModal);
  const hoje = todayISO();
  const overdue = !a.done && a.date < hoje;
  const today = !a.done && a.date === hoje;
  const future = !a.done && a.date > hoje;
  const dueInfo = agendaVencimentoInfo(a);
  const typeIcon = agendaTypeIcon(a.type, a.isVerificacaoDisponibilidade);
  const canSendWhatsapp = imovel && isAgendaAngariacaoVencida(a);

  // Concluir uma verificação de disponibilidade não é um simples "done":
  // abre o modal que registra o contato e encadeia o próximo lembrete.
  function alternarConclusao() {
    if (a.isVerificacaoDisponibilidade && !a.done) abrirModal("verificacao", a.id);
    else alternarAgendaDone(a.id);
  }

  function enviarWhatsapp() {
    if (!imovel) return;
    const phone = telefoneWhatsapp(imovel.proprietarioTelefone);
    if (phone) {
      const message = mensagemRenovacaoAngariacao(imovel);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      return;
    }
    abrirModal("whatsapp", imovel.id);
  }

  return (
    <div
      className={`agenda-item agenda-item-enhanced ${a.done ? "done" : ""} ${overdue ? "overdue" : ""} ${today ? "today" : ""} ${future ? "future" : ""}`}
    >
      <div className={`agenda-check ${a.done ? "checked" : ""}`} onClick={alternarConclusao}>
        {a.done ? "✓" : ""}
      </div>
      <div className="agenda-item-body" style={{ cursor: "pointer" }} onClick={() => abrirModal("agenda", a.id)}>
        <div className="agenda-item-title">
          <span className="agenda-type-icon">{typeIcon}</span>
          {a.hora && <span className="agenda-hora">{a.hora}</span>}
          {a.title}
        </div>
        <div className="agenda-item-meta">
          <span className="agenda-type-tag" data-type={a.type}>
            {a.type}
          </span>
          {imovel && <span>{imovel.codigo || imovel.endereco}</span>}
          {dueInfo && (
            <span className={`agenda-due-chip ${dueInfo.tone}`}>
              <span className="agenda-due-dot"></span>
              {dueInfo.label}
            </span>
          )}
        </div>
      </div>
      <div className="agenda-actions">
        {canSendWhatsapp && (
          <button
            type="button"
            className="btn btn-sm btn-ghost agenda-whatsapp-btn"
            title="Enviar WhatsApp"
            onClick={(e) => {
              e.stopPropagation();
              enviarWhatsapp();
            }}
          >
            Enviar WhatsApp
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          title="Excluir"
          onClick={(e) => {
            e.stopPropagation();
            excluirAgenda(a.id);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function AgendaView() {
  const agenda = useAppStore((s) => s.agenda);
  const imoveis = useAppStore((s) => s.imoveis);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [filtro, setFiltro] = useState<FiltroAgenda>("pendentes");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroImovel, setFiltroImovel] = useState("");

  const hoje = todayISO();
  const limitePendentes = addDaysISO(hoje, AGENDA_PENDENTES_JANELA_DIAS) as string;

  // Opções de refino: só os tipos e imóveis que realmente aparecem na agenda.
  const tiposPresentes = Array.from(new Set(agenda.map((a) => a.type).filter(Boolean))).sort();
  const imovelIdsUsados = new Set(agenda.map((a) => a.imovelId).filter(Boolean));
  const imoveisFiltro = imoveis
    .filter((i) => imovelIdsUsados.has(i.id))
    .sort((a, b) => (a.codigo || a.endereco).localeCompare(b.codigo || b.endereco));

  const items = agenda
    .filter((a) => {
      if (filtro === "pendentes") return !a.done && a.date <= limitePendentes;
      if (filtro === "atrasadas") return !a.done && a.date < hoje;
      if (filtro === "concluidas") return a.done;
      return true;
    })
    .filter((a) => (filtroTipo ? a.type === filtroTipo : true))
    .filter((a) => (filtroImovel ? a.imovelId === filtroImovel : true))
    .sort(compararAgenda);

  const grouped: Record<string, AgendaItem[]> = {};
  items.forEach((a) => {
    (grouped[a.date] = grouped[a.date] || []).push(a);
  });
  const dateKeys = Object.keys(grouped).sort();
  // No histórico (Concluídas), mostra os dias mais recentes primeiro.
  if (filtro === "concluidas") dateKeys.reverse();

  const atrasadas = agenda.filter((a) => !a.done && a.date < hoje).length;
  const futurosOcultos =
    filtro === "pendentes" ? agenda.filter((a) => !a.done && a.date > limitePendentes).length : 0;

  const porTipo = AGENDA_TYPES.map((t) => ({
    t,
    count: agenda.filter((a) => a.type === t && !a.done).length,
  }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const imovelDe = (a: AgendaItem) =>
    a.imovelId ? imoveis.find((i) => i.id === a.imovelId) || null : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-sub">Retornos, visitas, pendências e follow-ups</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("agenda")}>
            + Novo compromisso
          </button>
        </div>
      </div>

      <div className="agenda-layout">
        <div>
          <div className="pipeline-toolbar" style={{ marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div className="view-toggle">
              <button
                type="button"
                className={filtro === "pendentes" ? "active" : ""}
                onClick={() => setFiltro("pendentes")}
              >
                Pendentes
              </button>
              <button
                type="button"
                className={filtro === "atrasadas" ? "active" : ""}
                onClick={() => setFiltro("atrasadas")}
              >
                Atrasadas {atrasadas > 0 ? `(${atrasadas})` : ""}
              </button>
              <button
                type="button"
                className={filtro === "concluidas" ? "active" : ""}
                onClick={() => setFiltro("concluidas")}
              >
                Concluídas
              </button>
              <button
                type="button"
                className={filtro === "todas" ? "active" : ""}
                onClick={() => setFiltro("todas")}
              >
                Todas
              </button>
            </div>
            <div style={{ display: "flex", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
              <select
                className="filter-select"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                aria-label="Filtrar por tipo"
              >
                <option value="">Todos os tipos</option>
                {tiposPresentes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={filtroImovel}
                onChange={(e) => setFiltroImovel(e.target.value)}
                aria-label="Filtrar por imóvel"
              >
                <option value="">Todos os imóveis</option>
                {imoveisFiltro.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.codigo || i.endereco}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {dateKeys.length === 0 ? (
            filtro === "pendentes" && futurosOcultos > 0 ? (
              <div className="empty-state card">
                <h3>Nada para os próximos 15 dias</h3>
                <p>
                  {`Você tem ${futurosOcultos} compromisso${futurosOcultos > 1 ? "s" : ""} pendente${futurosOcultos > 1 ? "s" : ""} mais à frente.`}
                </p>
              </div>
            ) : (
              <div className="empty-state card">
                <h3>Nada por aqui</h3>
                <p>
                  Sem compromissos{" "}
                  {filtro === "pendentes"
                    ? "pendentes"
                    : filtro === "atrasadas"
                      ? "atrasados"
                      : filtro === "concluidas"
                        ? "concluídos"
                        : "cadastrados"}
                  {filtroTipo || filtroImovel ? " com esses filtros" : ""} no momento.
                </p>
              </div>
            )
          ) : (
            dateKeys.map((date) => (
              <div className="agenda-day-group" key={date}>
                <div className={`agenda-day-label ${date === hoje ? "today" : ""}`}>
                  {date === hoje ? "Hoje · " : ""}
                  {fmtDateLong(date)}
                </div>
                {grouped[date].map((a) => (
                  <ItemAgenda key={a.id} a={a} imovel={imovelDe(a)} />
                ))}
              </div>
            ))
          )}
          {futurosOcultos > 0 && (
            <div className="agenda-future-hint" onClick={() => setFiltro("todas")}>
              + {futurosOcultos} compromisso{futurosOcultos > 1 ? "s" : ""} futuro
              {futurosOcultos > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Resumo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="agenda-item-meta">
              <strong style={{ color: "var(--text)" }}>{agenda.filter((a) => !a.done).length}</strong>
              &nbsp;compromissos pendentes
            </div>
            <div className="agenda-item-meta">
              <strong style={{ color: "var(--bad)" }}>{atrasadas}</strong>&nbsp;atrasados
            </div>
            <div className="agenda-item-meta">
              <strong style={{ color: "var(--text)" }}>
                {agenda.filter((a) => a.date === hoje && !a.done).length}
              </strong>
              &nbsp;para hoje
            </div>
          </div>
          <div className="divider"></div>
          <div className="card-title">Por tipo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {porTipo.length === 0 ? (
              <div className="agenda-item-meta">Nenhum pendente</div>
            ) : (
              porTipo.map(({ t, count }) => (
                <div
                  className="agenda-item-meta"
                  key={t}
                  style={{ justifyContent: "space-between", display: "flex" }}
                >
                  <span className="agenda-type-tag" data-type={t}>
                    {t}
                  </span>{" "}
                  <span style={{ minWidth: "16px", textAlign: "right" }}>{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
