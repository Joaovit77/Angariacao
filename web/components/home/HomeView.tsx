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
import ItemAgenda from "@/components/agenda/ItemAgenda";
import { AGENDA_PENDENTES_JANELA_DIAS, compararAgenda } from "@/lib/calculo/agenda";
import {
  comissaoRecebidaNoMes,
  daysInCurrentStatus,
  faturamentoContratosNoMes,
  imoveisAngariadosNoMes,
  imoveisLocadosNoMes,
  isStale,
} from "@/lib/calculo/motor";
import { modeloPadraoWhatsapp } from "@/lib/calculo/whatsapp";
import { addDaysISO, currentMonthKey, monthLabelLong, todayISO } from "@/lib/datas";
import { fmtDateLong, fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";
import type { AgendaItem, Meta } from "@/lib/tipos";
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

  // Imóveis em negociação: a etapa mais quente do funil (mais perto de fechar).
  // Mostra todos nesse status, os que estão há mais tempo parados primeiro —
  // para retomar antes que esfriem.
  const emNegociacao = imoveis
    .filter((i) => i.status === "Em negociação")
    .sort((a, b) => (daysInCurrentStatus(b) ?? 0) - (daysInCurrentStatus(a) ?? 0));

  // Metas do mês (mesma leitura da view Metas).
  const mKey = currentMonthKey();
  const meta: Meta = metas[mKey] || { angariacoes: 0, locados: 0, comissao: 0, faturamento: 0 };
  const temMetas = meta.angariacoes > 0 || meta.locados > 0 || meta.comissao > 0 || meta.faturamento > 0;
  const angariacoesMes = imoveisAngariadosNoMes(imoveis, mKey).length;
  const locadosMes = imoveisLocadosNoMes(imoveis, mKey).length;
  const comissaoMes = comissaoRecebidaNoMes(imoveis, mKey, comissaoPercent);
  const faturamentoMes = faturamentoContratosNoMes(imoveis, mKey);

  // Card "Próximos compromissos": mesma janela da aba Pendentes, mas agora com
  // o item rico e acionável da Agenda (concluir, WhatsApp), agrupado por dia.
  // Limita ao total de LIMITE_LISTA e agrupa só o recorte visível.
  const amanha = addDaysISO(hoje, 1) as string;
  const pendentesVisiveis = pendentes.slice(0, LIMITE_LISTA);
  const gruposPendentes: Record<string, AgendaItem[]> = {};
  pendentesVisiveis.forEach((a) => {
    (gruposPendentes[a.date] = gruposPendentes[a.date] || []).push(a);
  });
  const diasPendentes = Object.keys(gruposPendentes).sort();
  const rotuloDia = (date: string) =>
    date === hoje ? "Hoje" : date === amanha ? "Amanhã" : fmtDateLong(date);

  // Cada card de resumo é montado uma vez e posicionado conforme tenha conteúdo:
  // com itens vai para a coluna principal (larga); vazio desce para a lateral,
  // compacto, ao lado das metas — para não desperdiçar o espaço principal.
  const cardCompromissos = (
    <div className="card" key="compromissos">
      <div className="home-card-head">
        <div className="card-title">Próximos compromissos</div>
        <button type="button" className="home-link" onClick={() => router.push("/agenda")}>
          Ver agenda →
        </button>
      </div>
      {pendentes.length === 0 ? (
        <p className="section-note">Nada pendente para os próximos {AGENDA_PENDENTES_JANELA_DIAS} dias. 🎉</p>
      ) : (
        <div className="home-agenda">
          {diasPendentes.map((date) => (
            <div className="agenda-day-group" key={date}>
              <div className={`agenda-day-label ${date === hoje ? "today" : ""}`}>{rotuloDia(date)}</div>
              {gruposPendentes[date].map((a) => (
                <ItemAgenda key={a.id} a={a} imovel={imovelDe(a.imovelId)} />
              ))}
            </div>
          ))}
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
  );

  const cardParados = (
    <div className="card" key="imoveis">
      <div className="home-card-head">
        <div className="card-title">Imóveis parados</div>
        <button type="button" className="home-link" onClick={() => router.push("/pipeline")}>
          Ver pipeline →
        </button>
      </div>
      {parados.length === 0 ? (
        <p className="section-note">Nenhum imóvel parado no funil. 🎉</p>
      ) : (
        <div className="home-list home-list-parados">
          {parados.slice(0, LIMITE_LISTA).map((i) => {
            const dias = daysInCurrentStatus(i);
            return (
              <div
                key={i.id}
                className="home-parado"
                onClick={() => abrirModal("imovel", i.id)}
              >
                {/* Linha 1: código do imóvel + motivo (status/tempo em que travou) */}
                <div className="home-parado-top">
                  <span className="home-parado-codigo" title={i.codigo || i.referenciaCrm || ""}>
                    {i.codigo || i.referenciaCrm || "Sem código"}
                  </span>
                  <span className="home-parado-motivo">
                    <span className="home-list-chip bad">
                      {dias != null ? `${dias} dias` : "parado"}
                    </span>
                    <span className="home-parado-status">{i.status}</span>
                  </span>
                </div>
                {/* Endereço · Proprietário · Telefone */}
                <div className="home-parado-row" title={i.endereco}>
                  <span className="home-parado-ic">📍</span>
                  <span className="home-parado-val">{i.endereco || "Sem endereço"}</span>
                </div>
                <div className="home-parado-row">
                  <span className="home-parado-ic">👤</span>
                  <span className={`home-parado-val${i.proprietarioNome ? "" : " vazio"}`}>
                    {i.proprietarioNome || "Sem proprietário"}
                  </span>
                </div>
                <div className="home-parado-row">
                  <span className="home-parado-ic">📞</span>
                  <span className={`home-parado-val${i.proprietarioTelefone ? "" : " vazio"}`}>
                    {i.proprietarioTelefone || "Sem telefone"}
                  </span>
                  {i.proprietarioTelefone && (
                    <button
                      type="button"
                      className="home-parado-wpp"
                      title="Escrever mensagem no WhatsApp"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirModal("whatsapp", i.id, modeloPadraoWhatsapp(i.status));
                      }}
                    >
                      <span className="home-parado-wpp-ic" aria-hidden>
                        💬
                      </span>
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {parados.length > LIMITE_LISTA && (
            <button type="button" className="home-more" onClick={() => router.push("/pipeline")}>
              + {parados.length - LIMITE_LISTA}{" "}
              {parados.length - LIMITE_LISTA > 1 ? "imóveis parados" : "imóvel parado"}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const cardEmNegociacao = (
    <div className="card" key="em-negociacao">
      <div className="home-card-head">
        <div className="card-title">Em negociação</div>
        <button type="button" className="home-link" onClick={() => router.push("/pipeline")}>
          Ver pipeline →
        </button>
      </div>
      {emNegociacao.length === 0 ? (
        <p className="section-note">Nenhum imóvel em negociação no momento.</p>
      ) : (
        <div className="home-list home-list-parados">
          {emNegociacao.slice(0, LIMITE_LISTA).map((i) => {
            const dias = daysInCurrentStatus(i);
            return (
              <div key={i.id} className="home-parado" onClick={() => abrirModal("imovel", i.id)}>
                <div className="home-parado-top">
                  <span className="home-parado-codigo" title={i.codigo || i.referenciaCrm || ""}>
                    {i.codigo || i.referenciaCrm || "Sem código"}
                  </span>
                  <span className="home-parado-motivo">
                    {dias != null && (
                      <span className="home-list-chip">
                        há {dias} dia{dias === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </div>
                <div className="home-parado-row" title={i.endereco}>
                  <span className="home-parado-ic">📍</span>
                  <span className="home-parado-val">{i.endereco || "Sem endereço"}</span>
                </div>
                <div className="home-parado-row">
                  <span className="home-parado-ic">👤</span>
                  <span className={`home-parado-val${i.proprietarioNome ? "" : " vazio"}`}>
                    {i.proprietarioNome || "Sem proprietário"}
                  </span>
                </div>
                <div className="home-parado-acoes">
                  <button
                    type="button"
                    className="home-parado-agendar"
                    title="Agendar um retorno para este imóvel"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModal("agenda", undefined, undefined, i.id);
                    }}
                  >
                    <span className="home-parado-agendar-ic" aria-hidden>
                      ＋
                    </span>
                    Agendar retorno
                  </button>
                  {i.proprietarioTelefone && (
                    <button
                      type="button"
                      className="home-parado-wpp"
                      title="Escrever mensagem no WhatsApp"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirModal("whatsapp", i.id, modeloPadraoWhatsapp(i.status));
                      }}
                    >
                      <span className="home-parado-wpp-ic" aria-hidden>
                        💬
                      </span>
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {emNegociacao.length > LIMITE_LISTA && (
            <button type="button" className="home-more" onClick={() => router.push("/pipeline")}>
              + {emNegociacao.length - LIMITE_LISTA}{" "}
              {emNegociacao.length - LIMITE_LISTA > 1 ? "imóveis em negociação" : "imóvel em negociação"}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Com conteúdo → coluna principal (larga); vazio → lateral (compacto).
  const cardMetas = (
    <div className="card home-metas" key="metas">
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
  );

  // Com conteúdo → coluna principal (larga); vazio → lateral (compacto).
  const principais: React.ReactNode[] = [];
  const laterais: React.ReactNode[] = [];
  (pendentes.length ? principais : laterais).push(cardCompromissos);
  (parados.length ? principais : laterais).push(cardParados);
  (emNegociacao.length ? principais : laterais).push(cardEmNegociacao);

  // Se algum resumo ficou vazio (desceu para a lateral), a coluna principal fica
  // curta; as metas sobem para ela para equilibrar as colunas. Caso contrário,
  // ficam na lateral, ao lado das ações.
  const metasNaPrincipal = laterais.length > 0;
  if (metasNaPrincipal) principais.push(cardMetas);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">Seu dia em um olhar</p>
        </div>
      </div>

      <div className="home-grid anim-stagger">
        {/* COLUNA PRINCIPAL — o que precisa de ação hoje */}
        <div className="home-main">{principais}</div>

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

          {laterais}

          {/* Metas do mês — só aqui quando não subiram para a coluna principal. */}
          {!metasNaPrincipal && cardMetas}
        </aside>
      </div>
    </>
  );
}
