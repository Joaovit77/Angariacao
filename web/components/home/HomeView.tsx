"use client";

/* ================================================================
   VIEW: INÍCIO (Home)
   Tela inicial pós-login: um "cockpit" do dia que junta um RESUMO
   (próximos compromissos, imóveis parados e metas do mês) com as
   AÇÕES RÁPIDAS mais usadas (pré-cadastro, nova angariação, novo
   compromisso).

   Não calcula nada próprio: consome o mesmo núcleo (lib/calculo)
   que Dashboard, Agenda e Metas, então nunca diverge deles. É só
   uma composição/atalho — sem métricas novas.
   ================================================================ */
import { useRouter } from "next/navigation";
import {
  AGENDA_PENDENTES_JANELA_DIAS,
  agendaTypeIcon,
  compararAgenda,
} from "@/lib/calculo/agenda";
import {
  comissaoRecebidaNoMes,
  daysInCurrentStatus,
  faturamentoContratosNoMes,
  imoveisAngariadosNoMes,
  imoveisLocadosNoMes,
  isStale,
} from "@/lib/calculo/motor";
import { addDaysISO, currentMonthKey, monthLabelLong, todayISO } from "@/lib/datas";
import { fmtDateLong, fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";
import type { Meta } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

// Quantos itens de cada lista de resumo mostrar antes do "ver tudo".
const LIMITE_LISTA = 5;

function MiniMeta({
  label,
  atual,
  alvo,
  money,
}: {
  label: string;
  atual: number;
  alvo: number;
  money?: boolean;
}) {
  const pct = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;
  const fmt = (v: number) => (money ? fmtMoney(v) : `${v}`);
  return (
    <div className="home-meta">
      <div className="home-meta-label">{label}</div>
      <div className="home-meta-nums">
        <span className="home-meta-atual">{fmt(atual)}</span>
        <span className="home-meta-alvo">/ {alvo > 0 ? fmt(alvo) : "sem meta"}</span>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill termometro"
          style={{ width: `${pct}%`, "--pct": Math.max(pct, 1) } as React.CSSProperties}
        ></div>
      </div>
    </div>
  );
}

export default function HomeView() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const metas = useAppStore((s) => s.metas);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const abrirModal = useUiModal((s) => s.abrirModal);

  const hoje = todayISO();
  const limitePendentes = addDaysISO(hoje, AGENDA_PENDENTES_JANELA_DIAS) as string;
  const imovelDe = (id: string | null | undefined) =>
    id ? imoveis.find((i) => i.id === id) || null : null;

  // Próximos compromissos: mesma janela da aba "Pendentes" da Agenda.
  const pendentes = agenda
    .filter((a) => !a.done && a.date <= limitePendentes)
    .sort(compararAgenda);
  const atrasados = agenda.filter((a) => !a.done && a.date < hoje).length;

  // Imóveis parados: os que o motor marca como estagnados, os mais antigos
  // no status atual primeiro.
  const parados = imoveis
    .filter(isStale)
    .sort((a, b) => (daysInCurrentStatus(b) ?? 0) - (daysInCurrentStatus(a) ?? 0));

  // Metas do mês (mesma leitura da view Metas).
  const mKey = currentMonthKey();
  const meta: Meta = metas[mKey] || { angariacoes: 0, locados: 0, comissao: 0, faturamento: 0 };
  const temMetas = meta.angariacoes > 0 || meta.locados > 0 || meta.comissao > 0 || meta.faturamento > 0;
  const angariacoesMes = imoveisAngariadosNoMes(imoveis, mKey).length;
  const locadosMes = imoveisLocadosNoMes(imoveis, mKey).length;
  const comissaoMes = comissaoRecebidaNoMes(imoveis, mKey, comissaoPercent);
  const faturamentoMes = faturamentoContratosNoMes(imoveis, mKey);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">Seu dia em um olhar</p>
        </div>
      </div>

      <div className="home-grid anim-stagger">
        {/* COLUNA PRINCIPAL — o que precisa de ação hoje */}
        <div className="home-main">
          {/* Próximos compromissos */}
          <div className="card">
            <div className="home-card-head">
              <div className="card-title">Próximos compromissos</div>
              <button type="button" className="home-link" onClick={() => router.push("/agenda")}>
                Ver agenda →
              </button>
            </div>
            {pendentes.length === 0 ? (
              <p className="section-note">Nada pendente para os próximos {AGENDA_PENDENTES_JANELA_DIAS} dias. 🎉</p>
            ) : (
              <div className="home-list">
                {pendentes.slice(0, LIMITE_LISTA).map((a) => {
                  const imovel = imovelDe(a.imovelId);
                  const overdue = a.date < hoje;
                  const today = a.date === hoje;
                  return (
                    <div
                      key={a.id}
                      className="home-list-item"
                      onClick={() => abrirModal("agenda", a.id)}
                    >
                      <span className="home-list-ic">
                        {agendaTypeIcon(a.type, a.isVerificacaoDisponibilidade)}
                      </span>
                      <span className="home-list-body">
                        <span className="home-list-title" title={a.title}>
                          {a.hora ? `${a.hora} · ` : ""}
                          {a.title}
                        </span>
                        <span className="home-list-sub">
                          {imovel ? `${imovel.codigo || imovel.endereco} · ` : ""}
                          {a.type}
                        </span>
                      </span>
                      <span className={`home-list-chip${overdue ? " bad" : today ? " today" : ""}`}>
                        {overdue ? "Atrasado" : today ? "Hoje" : fmtDateLong(a.date)}
                      </span>
                    </div>
                  );
                })}
                {pendentes.length > LIMITE_LISTA && (
                  <button type="button" className="home-more" onClick={() => router.push("/agenda")}>
                    + {pendentes.length - LIMITE_LISTA} compromisso
                    {pendentes.length - LIMITE_LISTA > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            )}
            {atrasados > 0 && (
              <div className="home-alert" onClick={() => router.push("/agenda")}>
                {atrasados} compromisso{atrasados > 1 ? "s" : ""} atrasado{atrasados > 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Imóveis parados */}
          <div className="card">
            <div className="home-card-head">
              <div className="card-title">Imóveis parados</div>
              <button type="button" className="home-link" onClick={() => router.push("/pipeline")}>
                Ver pipeline →
              </button>
            </div>
            {parados.length === 0 ? (
              <p className="section-note">Nenhum imóvel parado no funil. 🎉</p>
            ) : (
              <div className="home-list">
                {parados.slice(0, LIMITE_LISTA).map((i) => {
                  const dias = daysInCurrentStatus(i);
                  return (
                    <div
                      key={i.id}
                      className="home-list-item"
                      onClick={() => abrirModal("imovel", i.id)}
                    >
                      <span className="home-list-ic">⏳</span>
                      <span className="home-list-body">
                        <span className="home-list-title" title={i.codigo || i.endereco}>
                          {i.codigo || i.endereco}
                        </span>
                        <span className="home-list-sub">
                          {i.status}
                          {i.bairro ? ` · ${i.bairro}` : ""}
                        </span>
                      </span>
                      <span className="home-list-chip bad">
                        {dias != null ? `${dias} dias` : "parado"}
                      </span>
                    </div>
                  );
                })}
                {parados.length > LIMITE_LISTA && (
                  <button type="button" className="home-more" onClick={() => router.push("/pipeline")}>
                    + {parados.length - LIMITE_LISTA} imóvel
                    {parados.length - LIMITE_LISTA > 1 ? "eis" : ""} parado
                    {parados.length - LIMITE_LISTA > 1 ? "s" : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA LATERAL — atalhos de ação e resumo de metas */}
        <aside className="home-aside">
          <div className="home-actions">
            <button type="button" className="home-action" onClick={() => abrirModal("preCadastro")}>
              <span className="home-action-ic">⚡</span>
              <span className="home-action-text">
                <span className="home-action-title">Pré-cadastro rápido</span>
                <span className="home-action-sub">Cadastrar e disparar o WhatsApp de confirmação</span>
              </span>
            </button>
            <button type="button" className="home-action" onClick={() => abrirModal("imovel")}>
              <span className="home-action-ic">⌂</span>
              <span className="home-action-text">
                <span className="home-action-title">Nova angariação</span>
                <span className="home-action-sub">Cadastro completo do imóvel no funil</span>
              </span>
            </button>
            <button type="button" className="home-action" onClick={() => abrirModal("agenda")}>
              <span className="home-action-ic">＋</span>
              <span className="home-action-text">
                <span className="home-action-title">Novo compromisso</span>
                <span className="home-action-sub">Retorno, visita ou follow-up na agenda</span>
              </span>
            </button>
          </div>

          {/* Metas do mês */}
          <div className="card home-metas">
            <div className="home-card-head">
              <div className="home-metas-title">
                <span className="card-title">Metas do mês</span>
                <span className="home-metas-mes">{monthLabelLong(mKey)}</span>
              </div>
              <button type="button" className="home-link" onClick={() => router.push("/metas")}>
                Ver →
              </button>
            </div>
            {!temMetas ? (
              <div className="home-metas-empty">
                <p className="section-note">Nenhuma meta definida para este mês.</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => abrirModal("meta")}>
                  + Definir metas
                </button>
              </div>
            ) : (
              <div className="home-meta-list">
                <MiniMeta label="Angariações" atual={angariacoesMes} alvo={meta.angariacoes} />
                <MiniMeta label="Imóveis locados" atual={locadosMes} alvo={meta.locados} />
                <MiniMeta label="Comissão recebida" atual={comissaoMes} alvo={meta.comissao} money />
                <MiniMeta label="Faturamento" atual={faturamentoMes} alvo={meta.faturamento} money />
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
