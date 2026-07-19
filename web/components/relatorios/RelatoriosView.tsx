"use client";

/* ================================================================
   VIEW: RELATÓRIOS
   Port de viewRelatorios() + reportDoc() + reportStat() (app.js, 5F).
   Os números vêm de lib/calculo/relatorios.ts.
   ================================================================ */
import { useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import {
  desempenhoPorAbordagem,
  resumoTentativas,
  MIN_TENTATIVAS,
  type AbordagemDesempenho,
  type ResumoTentativas,
} from "@/lib/calculo/abordagens";
import { desempenhoPorCanal, type CanalDesempenho } from "@/lib/calculo/canais";
import { dateEnteredStatus } from "@/lib/calculo/motor";
import { relatorioMensal, relatorioSemanal, weekRangeLabel, type DadosRelatorio } from "@/lib/calculo/relatorios";
import { gerarCsv } from "@/lib/csv";
import { analisarAbordagens } from "@/lib/ia";
import { toast } from "@/lib/toast";
import { currentMonthKey, monthLabelLong, shiftMonthKey, todayISO } from "@/lib/datas";
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

/* Ranking de roteiros de captação. Ao contrário da tabela de canais, aqui as
   três medidas ficam lado a lado de propósito: participação numa angariação
   não é o mesmo que tê-la destravado, e um roteiro pode ser ótimo abrindo
   conversa e fraco fechando contrato. Uma coluna só esconderia isso. */
function DesempenhoAbordagens({
  abordagens,
  resumo,
  aoGerenciar,
}: {
  abordagens: AbordagemDesempenho[];
  resumo: ResumoTentativas;
  aoGerenciar: () => void;
}) {
  // Leitura por IA: interpreta a tabela acima. Os números NÃO vêm daqui —
  // o servidor os recalcula do banco (ver app/api/ia), então o texto nunca
  // descreve um ranking diferente do que está na tela.
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState("");
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);

  async function lerComIa() {
    if (lendo) return;
    setLendo(true);
    const r = await analisarAbordagens();
    setLendo(false);
    if (!r.ok || !r.texto) {
      toast(r.mensagem || "A IA não respondeu agora.", "error");
      return;
    }
    setLeitura(r.texto);
  }

  return (
    <div className="report-doc" style={{ marginTop: "22px" }}>
      <div
        className="report-section-title"
        style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}
      >
        <span>Desempenho por abordagem</span>
        <span style={{ display: "flex", gap: "8px" }}>
          {/* Precisa das duas coisas: ranking para ler e chave no servidor. */}
          {iaDisponivel && abordagens.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={lerComIa} disabled={lendo}>
              {lendo ? "Lendo..." : "Ler com IA"}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={aoGerenciar}>
            Gerenciar abordagens
          </button>
        </span>
      </div>
      <p className="section-note" style={{ marginBottom: "14px" }}>
        Carteira completa (não recortada pelo período). Roteiro usado no contato — o que se diz —,
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
          {leitura && (
            <div className="card" style={{ padding: "14px", marginTop: "14px" }}>
              <div className="card-title" style={{ marginBottom: "8px" }}>
                Leitura por IA <span className="section-note">interpretação dos números acima</span>
              </div>
              {/* Sem dangerouslySetInnerHTML: o texto vem de fora, e o escape do
                  JSX é a defesa. Quebras de linha viram parágrafos. */}
              {leitura.split(/\n{2,}/).map((paragrafo, i) => (
                <p key={i} className="drawer-notes" style={{ marginBottom: "8px" }}>
                  {paragrafo}
                </p>
              ))}
            </div>
          )}
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
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const abrirModal = useUiModal((s) => s.abrirModal);
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
  // Ranking de roteiros — mesma base (carteira inteira), eixo diferente.
  const rankingAbordagens = desempenhoPorAbordagem(imoveis, abordagens);
  const resumo = resumoTentativas(imoveis);

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
        <DesempenhoAbordagens
          abordagens={rankingAbordagens}
          resumo={resumo}
          aoGerenciar={() => abrirModal("abordagens")}
        />
      </div>
    </>
  );
}
