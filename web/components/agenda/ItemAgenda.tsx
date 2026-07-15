"use client";

/* ================================================================
   ITEM DA AGENDA (compartilhado)
   O cartão rico de um compromisso — círculo para concluir, tag de
   tipo, chip de vencimento e ação de WhatsApp para angariações
   vencidas. Extraído de AgendaView para ser reusado também no card
   "Próximos compromissos" da Início, garantindo que os dois nunca
   divirjam (mesma aparência e mesmas ações).

   Concluir um lembrete de "verificar disponibilidade" não é um
   simples "done": abre o modal que registra o contato e encadeia o
   próximo lembrete; os demais alternam done direto.
   ================================================================ */
import { agendaTypeIcon, agendaVencimentoInfo, isAgendaAngariacaoVencida } from "@/lib/calculo/agenda";
import { todayISO } from "@/lib/datas";
import { alternarAgendaDone, excluirAgenda } from "@/lib/mutacoes";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

export default function ItemAgenda({ a, imovel }: { a: AgendaItem; imovel: Imovel | null }) {
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

  // Sempre passa pelo modal para o corretor revisar/editar a mensagem
  // antes de enviar (o envio pelo wa.me acontece lá dentro, se houver
  // telefone; senão, é só copiar e mandar à mão).
  function enviarWhatsapp() {
    if (!imovel) return;
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
