"use client";

/* ================================================================
   VIEW: AGENDA
   Port de viewAgenda() + renderAgendaItemEnhanced() (app.js, 5D).
   Tipos: Retorno ao proprietário, Visita, Pendência, Documentação,
   Follow-up.

   Etapa 5 é somente-leitura: concluir, excluir, abrir o modal do
   compromisso e o fallback "copiar mensagem" (quando o imóvel não
   tem telefone) chegam na Etapa 6. O botão de WhatsApp já abre o
   wa.me quando há telefone, porque não é mutação.
   ================================================================ */
import { useState } from "react";
import {
  agendaTypeIcon,
  agendaVencimentoInfo,
  AGENDA_PENDENTES_JANELA_DIAS,
  isAgendaAngariacaoVencida,
  mensagemRenovacaoAngariacao,
  telefoneWhatsapp,
} from "@/lib/calculo/agenda";
import { AGENDA_TYPES } from "@/lib/constantes";
import { addDaysISO, todayISO } from "@/lib/datas";
import { fmtDateLong } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";
import type { AgendaItem, Imovel } from "@/lib/tipos";

type FiltroAgenda = "pendentes" | "todas" | "atrasadas";

function enviarWhatsappAngariacao(imovel: Imovel) {
  const message = mensagemRenovacaoAngariacao(imovel);
  const phone = telefoneWhatsapp(imovel.proprietarioTelefone);
  if (phone) {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }
  // Sem telefone o app antigo abre um modal com a mensagem para copiar —
  // depende da infraestrutura de modais, que chega na Etapa 6.
}

function ItemAgenda({ a, imovel }: { a: AgendaItem; imovel: Imovel | null }) {
  const hoje = todayISO();
  const overdue = !a.done && a.date < hoje;
  const today = !a.done && a.date === hoje;
  const future = !a.done && a.date > hoje;
  const dueInfo = agendaVencimentoInfo(a);
  const typeIcon = agendaTypeIcon(a.type, a.isVerificacaoDisponibilidade);
  const canSendWhatsapp = imovel && isAgendaAngariacaoVencida(a);

  return (
    <div
      className={`agenda-item agenda-item-enhanced ${a.done ? "done" : ""} ${overdue ? "overdue" : ""} ${today ? "today" : ""} ${future ? "future" : ""}`}
    >
      <div className={`agenda-check ${a.done ? "checked" : ""}`}>{a.done ? "✓" : ""}</div>
      <div className="agenda-item-body" style={{ cursor: "pointer" }}>
        <div className="agenda-item-title">
          <span className="agenda-type-icon">{typeIcon}</span>
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
          {overdue && <span className="agenda-date-state overdue">atrasado</span>}
          {today && <span className="agenda-date-state today">hoje</span>}
          {future && <span className="agenda-date-state future">futuro</span>}
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
              enviarWhatsappAngariacao(imovel);
            }}
          >
            Enviar WhatsApp
          </button>
        )}
        <button type="button" className="icon-btn" title="Excluir" onClick={(e) => e.stopPropagation()}>
          ×
        </button>
      </div>
    </div>
  );
}

export default function AgendaView() {
  const agenda = useAppStore((s) => s.agenda);
  const imoveis = useAppStore((s) => s.imoveis);
  const [filtro, setFiltro] = useState<FiltroAgenda>("pendentes");

  const hoje = todayISO();
  const limitePendentes = addDaysISO(hoje, AGENDA_PENDENTES_JANELA_DIAS) as string;

  const items = agenda
    .filter((a) => {
      if (filtro === "pendentes") return !a.done && a.date <= limitePendentes;
      if (filtro === "atrasadas") return !a.done && a.date < hoje;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const grouped: Record<string, AgendaItem[]> = {};
  items.forEach((a) => {
    (grouped[a.date] = grouped[a.date] || []).push(a);
  });
  const dateKeys = Object.keys(grouped).sort();

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
          <button type="button" className="btn btn-primary">
            + Novo compromisso
          </button>
        </div>
      </div>

      <div className="agenda-layout">
        <div>
          <div className="pipeline-toolbar" style={{ marginBottom: "16px" }}>
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
                className={filtro === "todas" ? "active" : ""}
                onClick={() => setFiltro("todas")}
              >
                Todas
              </button>
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
                      : "cadastrados"}{" "}
                  no momento.
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
