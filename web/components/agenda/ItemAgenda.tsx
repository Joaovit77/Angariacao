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
import { enderecoComUnidade } from "@/lib/calculo/whatsapp";
import { todayISO } from "@/lib/datas";
import { alternarAgendaDone, excluirAgenda } from "@/lib/mutacoes";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

export default function ItemAgenda({
  a,
  imovel,
  compact = false,
}: {
  a: AgendaItem;
  imovel: Imovel | null;
  compact?: boolean;
}) {
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

  // Quem e onde — o que faltava na linha. "Retomar contato — LD-140" obrigava
  // a abrir o item para saber com quem é e em que endereço; agora o nome do
  // proprietário e o endereço (com ap/bloco) ficam na própria linha.
  const proprietario = imovel?.proprietarioNome?.trim() || "";
  const onde = imovel ? enderecoComUnidade(imovel) : "";

  return (
    <div
      className={`agenda-item agenda-item-enhanced${compact ? " compact" : ""} ${a.done ? "done" : ""} ${overdue ? "overdue" : ""} ${today ? "today" : ""} ${future ? "future" : ""}`}
    >
      {/* Faixa de hora à esquerda: é o que faz a lista se ler como agenda.
          Some quando o compromisso não tem hora, e aí o item ocupa a linha
          inteira — sem buraco de alinhamento. */}
      {a.hora && <div className="agenda-item-hora">{a.hora}</div>}
      <div className={`agenda-check ${a.done ? "checked" : ""}`} onClick={alternarConclusao}>
        {a.done ? "✓" : ""}
      </div>
      <div className="agenda-item-body" style={{ cursor: "pointer" }} onClick={() => abrirModal("agenda", a.id)}>
        <div className="agenda-item-title">
          <span className="agenda-type-icon">{typeIcon}</span>
          {a.title}
        </div>
        {(proprietario || onde) && (
          <div className="agenda-item-quem">
            {proprietario && <span className="agenda-item-nome">{proprietario}</span>}
            {onde && (
              <span className="agenda-item-onde" title={onde}>
                {onde}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Etiquetas à DIREITA, não empilhadas sob o título: à esquerda elas
          disputavam espaço com o nome e o endereço e tudo virava um bloco só.
          Separadas, o lado esquerdo responde "quem/onde" e o direito
          "que tipo/quando" — dois olhares em vez de um amontoado. */}
      <div className="agenda-item-tags">
        <span className="agenda-type-tag" data-type={a.type}>
          {a.type}
        </span>
        {imovel?.codigo && <span className="agenda-item-cod">{imovel.codigo}</span>}
        {dueInfo && (
          <span className={`agenda-due-chip ${dueInfo.tone}`}>
            <span className="agenda-due-dot"></span>
            {dueInfo.label}
          </span>
        )}
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
        {/* Excluir só aparece no hover/foco: é a única ação destrutiva da
            linha e estava com o mesmo peso visual do resto, encostada na
            borda — fácil de acertar sem querer numa lista longa. Continua
            alcançável pelo teclado (:focus-visible no CSS). */}
        <button
          type="button"
          className="icon-btn agenda-del"
          title="Excluir compromisso"
          aria-label={`Excluir compromisso: ${a.title}`}
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
