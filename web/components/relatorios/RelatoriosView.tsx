"use client";

/* ================================================================
   VIEW: RELATÓRIOS
   Port de viewRelatorios() + reportDoc() + reportStat() (app.js, 5F).
   Os números vêm de lib/calculo/relatorios.ts.
   ================================================================ */
import { useMemo, useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import RelatorioCompletoDoc from "@/components/relatorios/RelatorioCompletoDoc";
import {
  desempenhoPorAbordagem,
  resumoTentativas,
  MIN_TENTATIVAS,
  type AbordagemDesempenho,
  type ResumoTentativas,
} from "@/lib/calculo/abordagens";
import { desempenhoPorCanal, type CanalDesempenho } from "@/lib/calculo/canais";
import { dateEnteredStatus } from "@/lib/calculo/motor";
import { relatorioCompleto } from "@/lib/calculo/relatorioCompleto";
import { relatorioMensal, relatorioSemanal, weekRangeLabel, type DadosRelatorio } from "@/lib/calculo/relatorios";
import { gerarCsv } from "@/lib/csv";
import {
  currentMonthKey,
  monthLabelLong,
  primeiroDiaDoMes,
  shiftMonthKey,
  todayISO,
  ultimoDiaDoMes,
  weekRange,
} from "@/lib/datas";
import { fmtDate, fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

function ReportStat({
  label,
  value,
  delta,
  isMoney,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  isMoney?: boolean;
}) {
  let cmp: React.ReactNode = null;
  if (delta !== null && delta !== undefined) {
    const color = delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--text-faint)";
    const txt = isMoney ? fmtMoney(Math.abs(delta)) : Math.abs(delta);
    cmp = (
      <div className="report-stat-cmp" style={{ color }}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {txt} vs. período anterior
      </div>
    );
  }
  return (
    <div className="report-stat">
      <div className="report-stat-label">{label}</div>
      <div className="report-stat-value">{value}</div>
      {cmp}
    </div>
  );
}

function ReportDoc({ d, responsavel }: { d: DadosRelatorio; responsavel: string }) {
  const deltaContatos = d.contatosAtual - d.contatosAnterior;
  const deltaTotal = d.totalAtual - d.totalAnterior;
  const deltaLocados = d.locadosAtual - d.locadosAnterior;
  const deltaComissao = d.comissaoRec - d.comissaoRecAnterior;
  const perdasPosCaptacao = d.perdasPosCaptacao;

  return (
    <div className="report-doc">
      <div className="report-print-header">
        <div className="rph-brand">
          Painel de Angariações<span className="rph-brand-sub">Relatório de produtividade</span>
        </div>
        <div className="rph-meta">
          <span>Responsável: {responsavel}</span>
          <span>Emitido em: {fmtDate(todayISO())}</span>
        </div>
      </div>
      <h2>{d.title}</h2>
      <div className="report-period">{d.period}</div>

      <div className="report-stat-row anim-stagger">
        <ReportStat label="Novos contatos" value={d.contatosAtual} delta={deltaContatos} />
        <ReportStat label="Angariações" value={d.totalAtual} delta={deltaTotal} />
        <ReportStat label="Locados" value={d.locadosAtual} delta={deltaLocados} />
        <ReportStat label="Conversão" value={d.conversao.toFixed(0) + "%"} />
        <ReportStat label="Comissão recebida" value={fmtMoney(d.comissaoRec)} delta={deltaComissao} isMoney />
      </div>
      <p className="section-note" style={{ marginBottom: "18px" }}>
        &quot;Angariações&quot; conta apenas imóveis que chegaram na etapa Angariado no período — não
        os contatos ainda em andamento.
      </p>

      {perdasPosCaptacao && (
        <>
          <div className="report-section-title">Perdas pós-angariação</div>
          <div className="grid grid-2" style={{ marginBottom: "10px" }}>
            <ReportStat
              label="Locados fora no período"
              value={perdasPosCaptacao.length}
              delta={perdasPosCaptacao.length - (d.perdasPosCaptacaoAnterior || 0)}
            />
            <ReportStat
              label="Tempo médio anunciado"
              value={perdasPosCaptacao.some((imovel) => imovel.diasAnunciado != null)
                ? `${Math.round(
                    perdasPosCaptacao.reduce((soma, imovel) => soma + (imovel.diasAnunciado || 0), 0) /
                      perdasPosCaptacao.filter((imovel) => imovel.diasAnunciado != null).length,
                  )} dias`
                : "—"}
            />
          </div>
          {perdasPosCaptacao.length === 0 ? (
            <p className="section-note">Nenhuma perda pós-angariação foi encerrada neste mês.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ref. CRM</th>
                    <th>Imóvel</th>
                    <th>Anunciado desde</th>
                    <th>Encerrado em</th>
                    <th>Tempo anunciado</th>
                  </tr>
                </thead>
                <tbody>
                  {perdasPosCaptacao.map((imovel) => (
                    <tr key={imovel.id}>
                      <td className="cell-strong">{imovel.referenciaCrm || "—"}</td>
                      <td>{imovel.endereco}</td>
                      <td className="cell-dim">{fmtDate(imovel.anunciadoDesde) || "—"}</td>
                      <td className="cell-dim">{fmtDate(imovel.encerradoEm) || "—"}</td>
                      <td>{imovel.diasAnunciado != null ? `${imovel.diasAnunciado} dias` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="report-section-title">Comissão</div>
      <div className="grid grid-2" style={{ marginBottom: "10px" }}>
        <div className="report-stat">
          <div className="report-stat-label">Estimada no período</div>
          <div className="report-stat-value">{fmtMoney(d.comissaoEst)}</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-label">Recebida no período</div>
          <div className="report-stat-value">{fmtMoney(d.comissaoRec)}</div>
        </div>
      </div>

      <div className="report-section-title">Imóveis angariados no período</div>
      {d.imoveisAtual.length === 0 ? (
        <p className="section-note">Nenhum imóvel chegou na etapa Angariado neste período.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Ref. CRM</th>
                <th>Endereço</th>
                <th>Tipo</th>
                <th>Status atual</th>
                <th>Aluguel</th>
              </tr>
            </thead>
            <tbody>
              {d.imoveisAtual.map((i) => (
                <tr key={i.id}>
                  <td className="cell-strong">{i.codigo || "—"}</td>
                  <td className="cell-dim">{i.referenciaCrm || "—"}</td>
                  <td>{i.endereco}</td>
                  <td className="cell-dim">{i.tipo}</td>
                  <td>
                    <span className="badge" data-status={i.status}>
                      {i.status}
                    </span>
                  </td>
                  <td>{fmtMoney(i.valorAluguel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DesempenhoCanais({ canais, periodo }: { canais: CanalDesempenho[]; periodo: string }) {
  return (
    <div className="report-doc" style={{ marginTop: "22px" }}>
      <div className="report-section-title" style={{ marginTop: 0 }}>
        Desempenho por canal de captação
      </div>
      <p className="section-note" style={{ marginBottom: "14px" }}>
        Imóveis que chegaram à etapa Angariado em {periodo}. Conversão = locados ÷ angariados do canal.
      </p>
      {canais.length === 0 ? (
        <p className="section-note">Nenhum imóvel angariado ainda para analisar por canal.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Origem</th>
                <th>Angariados</th>
                <th>Locados</th>
                <th>Conversão</th>
                <th>Tempo médio</th>
              </tr>
            </thead>
            <tbody>
              {canais.map((c) => (
                <tr key={c.origem}>
                  <td className="cell-strong">{c.origem}</td>
                  <td>{c.angariados}</td>
                  <td>{c.locados}</td>
                  <td>{c.conversao.toFixed(0)}%</td>
                  <td>{c.tempoMedio != null ? `${Math.round(c.tempoMedio)} dias` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* Ranking de roteiros de captação. Ao contrário da tabela de canais, aqui as
   três medidas ficam lado a lado de propósito: participação numa angariação
   não é o mesmo que tê-la destravado, e um roteiro pode ser ótimo abrindo
   conversa e fraco fechando contrato. Uma coluna só esconderia isso. */
function DesempenhoAbordagens({
  abordagens,
  resumo,
  periodo,
  aoGerenciar,
}: {
  abordagens: AbordagemDesempenho[];
  resumo: ResumoTentativas;
  periodo: string;
  aoGerenciar: () => void;
}) {
  return (
    <div className="report-doc" style={{ marginTop: "22px" }}>
      <div
        className="report-section-title"
        style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}
      >
        <span>Desempenho por abordagem</span>
        <span style={{ display: "flex", gap: "8px" }}>
          <button type="button" className="btn btn-sm" onClick={aoGerenciar}>
            Gerenciar abordagens
          </button>
        </span>
      </div>
      <p className="section-note" style={{ marginBottom: "14px" }}>
        Tentativas realizadas em {periodo}. Roteiro usado no contato — o que se diz —,
        diferente do canal acima. Resposta = o proprietário reagiu (inclui recusa). Angariação = dos
        imóveis que receberam o roteiro, quantos chegaram a Angariado. Destravou = foi a última
        tentativa antes da angariação.
      </p>
      {abordagens.length === 0 ? (
        <p className="section-note">
          Nenhuma tentativa com roteiro registrada ainda. Cadastre suas abordagens e registre as
          tentativas no painel de cada imóvel (Pipeline) para o ranking aparecer aqui.
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Abordagem</th>
                  <th>Tentativas</th>
                  <th>Resposta</th>
                  <th>Imóveis</th>
                  <th>Angariação</th>
                  <th>Destravou</th>
                  <th>Abertura / seguimento</th>
                </tr>
              </thead>
              <tbody>
                {abordagens.map((a) => (
                  <tr key={a.abordagemId}>
                    <td className="cell-strong">
                      {a.nome}
                      {!a.amostraSuficiente && (
                        <span className="section-note"> · amostra baixa</span>
                      )}
                    </td>
                    <td>{a.tentativas}</td>
                    <td>{a.taxaResposta.toFixed(0)}%</td>
                    <td>{a.imoveis}</td>
                    <td>
                      {a.taxaAngariacao.toFixed(0)}% ({a.angariados}/{a.imoveis})
                    </td>
                    <td>{a.destravou}</td>
                    <td>
                      {a.aberturas} / {a.seguimentos}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="section-note" style={{ marginTop: "12px" }}>
            {resumo.total} tentativa(s) em {resumo.imoveisComTentativa} imóvel(is).
            {resumo.semAbordagem > 0 &&
              ` ${resumo.semAbordagem} sem roteiro registrado — essas ficam de fora do ranking.`}
            {resumo.mediaTentativasAteAngariar != null &&
              ` Média de ${resumo.mediaTentativasAteAngariar.toFixed(1)} tentativa(s) até angariar.`}
            {" "}Abordagens com menos de {MIN_TENTATIVAS} tentativas aparecem marcadas como amostra
            baixa e vão para o fim — abaixo disso, uma taxa alta significa só que aconteceu uma vez.
          </p>
        </>
      )}
    </div>
  );
}

// Dispara o download de um CSV no browser (Blob + link temporário).
function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function RelatoriosView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const abordagens = useAppStore((s) => s.abordagens);
  // A agenda entra só pela seção 4 do relatório completo (compromissos de hoje
  // e atrasados são uma das frentes da fila).
  const agenda = useAppStore((s) => s.agenda);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { usuario } = useSessao();

  const [modo, setModo] = useState<"mensal" | "semanal" | "completo">("mensal");
  const [mesKey, setMesKey] = useState(() => currentMonthKey());
  const [semanaOffset, setSemanaOffset] = useState(0);

  // O relatório completo é MENSAL: usa o mesmo seletor de mês, e o "semanal"
  // segue sendo só do documento de desfecho. Semana é recorte curto demais para
  // as coortes da seção 2 — com 5 ou 6 abordados, a taxa de resposta vira ruído.
  const dados =
    modo === "semanal"
      ? relatorioSemanal(imoveis, comissaoPercent, semanaOffset)
      : relatorioMensal(imoveis, comissaoPercent, mesKey);

  const hoje = todayISO();
  const completo = useMemo(
    () =>
      modo === "completo"
        ? relatorioCompleto(
            imoveis,
            agenda,
            abordagens,
            primeiroDiaDoMes(mesKey),
            ultimoDiaDoMes(mesKey),
            hoje,
          )
        : null,
    [modo, imoveis, agenda, abordagens, mesKey, hoje],
  );

  // A tabela mora dentro de um relatório de período e usa a mesma coorte dele:
  // imóveis que chegaram a Angariado no mês/semana selecionado. Usar `imoveis`
  // aqui fazia trocar o mês sem mudar uma linha sequer da tabela.
  const canais = desempenhoPorCanal(dados.imoveisAtual);
  const intervaloAbordagens = modo === "semanal"
    ? weekRange(semanaOffset)
    : { start: primeiroDiaDoMes(mesKey), end: ultimoDiaDoMes(mesKey) };
  const periodoTentativas = { inicio: intervaloAbordagens.start, fim: intervaloAbordagens.end };
  const rankingAbordagens = desempenhoPorAbordagem(imoveis, abordagens, hoje, periodoTentativas);
  const resumo = resumoTentativas(imoveis, periodoTentativas);

  // Exporta os imóveis angariados no período (o que a tabela do relatório
  // mostra), com colunas mais ricas do que a versão de tela — o CSV serve para
  // planilha/backup/prestação de contas.
  function exportarImoveis() {
    const cabecalho = [
      "Código", "Ref. CRM", "Endereço", "Bairro", "Cidade", "Tipo", "Status",
      "Proprietário", "Telefone", "Origem", "Forma de abordagem", "Aluguel", "Angariado em",
    ];
    const linhas = dados.imoveisAtual.map((i) => {
      const angariadoEm = dateEnteredStatus(i, "Angariado");
      return [
        i.codigo, i.referenciaCrm, i.endereco, i.bairro, i.cidade, i.tipo, i.status,
        i.proprietarioNome, i.proprietarioTelefone, i.origemImovel, i.formaAbordagem,
        i.valorAluguel, angariadoEm ? fmtDate(angariadoEm) : "",
      ];
    });
    baixarCsv(`imoveis-angariados-${modo}-${todayISO()}.csv`, gerarCsv(cabecalho, linhas));
  }

  // Exporta exatamente a tabela de desempenho por canal exibida no período.
  function exportarCanais() {
    const cabecalho = ["Origem", "Angariados", "Locados", "Conversão (%)", "Tempo médio (dias)"];
    const linhas = canais.map((c) => [
      c.origem, c.angariados, c.locados, c.conversao.toFixed(0),
      c.tempoMedio != null ? Math.round(c.tempoMedio) : "",
    ]);
    baixarCsv(`desempenho-canais-${todayISO()}.csv`, gerarCsv(cabecalho, linhas));
  }

  // Exporta o ranking de abordagens (carteira completa).
  function exportarAbordagens() {
    const cabecalho = [
      "Abordagem", "Tentativas", "Respostas", "Taxa de resposta (%)", "Imóveis",
      "Angariados", "Taxa de angariação (%)", "Destravou", "Aberturas", "Seguimentos", "Amostra suficiente",
    ];
    const linhas = rankingAbordagens.map((a) => [
      a.nome, a.tentativas, a.respostas, a.taxaResposta.toFixed(0), a.imoveis,
      a.angariados, a.taxaAngariacao.toFixed(0), a.destravou, a.aberturas, a.seguimentos,
      a.amostraSuficiente ? "Sim" : "Não",
    ]);
    baixarCsv(`desempenho-abordagens-${todayISO()}.csv`, gerarCsv(cabecalho, linhas));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">Resumo de produtividade para acompanhamento e prestação de contas</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            onClick={exportarImoveis}
            disabled={dados.imoveisAtual.length === 0}
            title="Baixar os imóveis angariados no período em CSV"
          >
            Exportar imóveis (CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={exportarCanais}
            disabled={canais.length === 0}
            title="Baixar a tabela de desempenho por canal em CSV"
          >
            Exportar canais (CSV)
          </button>
          <button
            type="button"
            className="btn"
            onClick={exportarAbordagens}
            disabled={rankingAbordagens.length === 0}
            title="Baixar o ranking de abordagens em CSV"
          >
            Exportar abordagens (CSV)
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        </div>
      </div>

      <div className="pipeline-toolbar">
        <div className="view-toggle">
          <button type="button" className={modo === "mensal" ? "active" : ""} onClick={() => setModo("mensal")}>
            Mensal
          </button>
          <button type="button" className={modo === "semanal" ? "active" : ""} onClick={() => setModo("semanal")}>
            Semanal
          </button>
          <button type="button" className={modo === "completo" ? "active" : ""} onClick={() => setModo("completo")}>
            Completo
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {modo !== "semanal" ? (
            <>
              <button type="button" className="icon-btn" onClick={() => setMesKey((k) => shiftMonthKey(k, -1))}>
                ‹
              </button>
              <span className="cell-strong" style={{ minWidth: "150px", textAlign: "center" }}>
                {monthLabelLong(mesKey)}
              </span>
              <button type="button" className="icon-btn" onClick={() => setMesKey((k) => shiftMonthKey(k, 1))}>
                ›
              </button>
            </>
          ) : (
            <>
              <button type="button" className="icon-btn" onClick={() => setSemanaOffset((o) => o - 1)}>
                ‹
              </button>
              <span className="cell-strong" style={{ minWidth: "220px", textAlign: "center" }}>
                {weekRangeLabel(semanaOffset)}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSemanaOffset((o) => o + 1)}
                disabled={semanaOffset >= 0}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>

      <div id="report-doc">
        {completo ? (
          <RelatorioCompletoDoc
            r={completo}
            responsavel={rotuloUsuario(usuario) || "-"}
            periodo={monthLabelLong(mesKey)}
            periodoCorrente={mesKey === currentMonthKey()}
            hoje={hoje}
          />
        ) : (
          <ReportDoc d={dados} responsavel={rotuloUsuario(usuario) || "-"} />
        )}
        <DesempenhoCanais canais={canais} periodo={dados.period} />
        <DesempenhoAbordagens
          abordagens={rankingAbordagens}
          resumo={resumo}
          periodo={dados.period}
          aoGerenciar={() => abrirModal("abordagens")}
        />
      </div>
    </>
  );
}
