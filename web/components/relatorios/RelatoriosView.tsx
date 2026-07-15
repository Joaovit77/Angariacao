"use client";

/* ================================================================
   VIEW: RELATÓRIOS
   Port de viewRelatorios() + reportDoc() + reportStat() (app.js, 5F).
   Os números vêm de lib/calculo/relatorios.ts.
   ================================================================ */
import { useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import { desempenhoPorCanal, type CanalDesempenho } from "@/lib/calculo/canais";
import { dateEnteredStatus } from "@/lib/calculo/motor";
import { relatorioMensal, relatorioSemanal, weekRangeLabel, type DadosRelatorio } from "@/lib/calculo/relatorios";
import { gerarCsv } from "@/lib/csv";
import { currentMonthKey, monthLabelLong, shiftMonthKey, todayISO } from "@/lib/datas";
import { fmtDate, fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";

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

function DesempenhoCanais({ canais }: { canais: CanalDesempenho[] }) {
  return (
    <div className="report-doc" style={{ marginTop: "22px" }}>
      <div className="report-section-title" style={{ marginTop: 0 }}>
        Desempenho por canal de captação
      </div>
      <p className="section-note" style={{ marginBottom: "14px" }}>
        Carteira completa (não recortada pelo período). Considera apenas imóveis que chegaram na
        etapa Angariado. Conversão = locados ÷ angariados do canal.
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
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const { usuario } = useSessao();

  const [modo, setModo] = useState<"mensal" | "semanal">("mensal");
  const [mesKey, setMesKey] = useState(() => currentMonthKey());
  const [semanaOffset, setSemanaOffset] = useState(0);

  const dados =
    modo === "mensal"
      ? relatorioMensal(imoveis, comissaoPercent, mesKey)
      : relatorioSemanal(imoveis, comissaoPercent, semanaOffset);

  // Análise por canal: carteira inteira, independente do período selecionado.
  const canais = desempenhoPorCanal(imoveis);

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

  // Exporta a tabela de desempenho por canal (carteira completa).
  function exportarCanais() {
    const cabecalho = ["Origem", "Angariados", "Locados", "Conversão (%)", "Tempo médio (dias)"];
    const linhas = canais.map((c) => [
      c.origem, c.angariados, c.locados, c.conversao.toFixed(0),
      c.tempoMedio != null ? Math.round(c.tempoMedio) : "",
    ]);
    baixarCsv(`desempenho-canais-${todayISO()}.csv`, gerarCsv(cabecalho, linhas));
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
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {modo === "mensal" ? (
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
        <ReportDoc d={dados} responsavel={rotuloUsuario(usuario) || "-"} />
        <DesempenhoCanais canais={canais} />
      </div>
    </>
  );
}
