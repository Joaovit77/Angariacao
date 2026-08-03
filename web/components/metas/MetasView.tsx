"use client";

/* ================================================================
   VIEW: METAS
   Port de viewMetas() + goalCard() + renderMetaHistory() (app.js, 5C).
   "Realizado" de angariações usa a data de entrada em Angariado;
   locados idem para Locado; comissão pela data de recebimento.

   Etapa 5 é somente-leitura: o modal de metas chega na Etapa 6.
   ================================================================ */
import { useState } from "react";
import Contador from "@/components/Contador";
import { useSessao } from "@/components/SessaoProvider";
import {
  comissaoRecebidaNoMes,
  faturamentoContratosNoMes,
  imoveisAngariadosNoMes,
  imoveisLocadosNoMes,
} from "@/lib/calculo/motor";
import {
  ajustarAlvoMeta,
  mesAnteriorComMeta,
  metaDoMes,
  passoDaMeta,
  precisaDefinirMeta,
  resumoMetaCurto,
  temMeta,
} from "@/lib/calculo/metaMes";
import { diasUteisTexto, projetarMeta, textoProjecao, tomProjecao } from "@/lib/calculo/projecao";
import { currentMonthKey, monthLabelLong, todayISO } from "@/lib/datas";
import { fmtMoney } from "@/lib/formatadores";
import { salvarMeta } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import type { Meta } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";
import BadgesConquistas from "./BadgesConquistas";
import ConquistasDoMes from "./ConquistasDoMes";

function GoalCard({
  label,
  current,
  target,
  unit,
  note,
  mKey,
  hoje,
  onAjustar,
  ajustando,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  note?: string;
  /** Mês da meta ("YYYY-MM") e o dia de referência — o que dá o eixo do tempo
      à projeção. Sem eles o card volta a ser só divisão e subtração. */
  mKey: string;
  hoje: string;
  /** Sobe ou desce o alvo em um passo. Quem grava é a VIEW, não o card: com um
      estado de salvamento por card, dois cliques em cards diferentes gravariam
      metas concorrentes e o último sobrescreveria o outro. */
  onAjustar: (passo: number) => void;
  ajustando: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  // Termômetro: gradiente laranja→verde de comprimento fixo (o do track),
  // recortado pelo width — a ponta da barra reflete o progresso. Acima de
  // 90% ganha o pulso/brilho discreto (.pulsante).
  const pulsante = pct >= 90;
  const fmt = (v: number) => (unit === "money" ? fmtMoney(v) : `${v}${unit ? " " + unit : ""}`);
  // Totais são inteiros (meio imóvel não existe); taxas mantêm uma decimal,
  // porque arredondar 0,8/dia para 1 diria que o ritmo está em dia.
  //
  // O total usa FLOOR, não round, e isso não é detalhe: uma projeção de 9,6
  // contra meta 10 arredondaria para "o mês fecha em 10" no mesmo card que está
  // marcado em amarelo por não bater a meta — o texto contradizendo a cor. Piso
  // é também a leitura honesta de uma projeção ("você chega a pelo menos N").
  const fmtTotal = (v: number) => (unit === "money" ? fmtMoney(v) : fmt(Math.floor(v)));
  const fmtTaxa = (v: number) =>
    unit === "money" ? fmtMoney(v) : `${v.toFixed(1).replace(".", ",")}${unit ? " " + unit : ""}`;

  // Dinheiro é divisível e aceita alvo diário ("R$ 800/dia útil"); imóvel não —
  // ali o esforço é dito em números inteiros. Ver textoProjecao.
  const divisivel = unit === "money";
  const passo = passoDaMeta(unit);
  const proj = projetarMeta(current, target, mKey, hoje);
  const textoProj = textoProjecao(proj, fmtTotal, fmtTaxa, divisivel);
  const tom = tomProjecao(proj.situacao);

  return (
    <div className="card goal-card">
      <div className="goal-head">
        <div className="goal-title">{label}</div>
        <div className="goal-foot">
          <span className="pct">
            <Contador valor={pct} formatar={(n) => n.toFixed(0) + "%"} />
          </span>
        </div>
      </div>
      <div className="goal-numbers">
        <div className="goal-current">
          <Contador valor={current} formatar={fmt} />
        </div>
        <div className="goal-target">/ {target > 0 ? fmt(target) : "sem meta"}</div>
        {/* Ajuste do alvo sem passar pelo modal. Fica colado no número que ele
            muda, e não no cabeçalho do card, porque é o alvo que se edita e não
            o realizado (aquele é medido, não digitado).
            Desabilitado durante a gravação: dois cliques rápidos leriam o mesmo
            valor do store, que só é atualizado quando a escrita volta, e o
            segundo clique se perderia em silêncio. Botão travado por meio
            segundo é honesto; clique que some, não. */}
        <div className="goal-ajuste">
          <button
            type="button"
            className="goal-ajuste-btn"
            onClick={() => onAjustar(-passo)}
            disabled={ajustando || target <= 0}
            aria-label={`Diminuir a meta de ${label}`}
            title={`Diminuir a meta de ${label}`}
          >
            −
          </button>
          <button
            type="button"
            className="goal-ajuste-btn"
            onClick={() => onAjustar(passo)}
            disabled={ajustando}
            aria-label={`Aumentar a meta de ${label}`}
            title={`Aumentar a meta de ${label}`}
          >
            +
          </button>
        </div>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill termometro${pulsante ? " pulsante" : ""}`}
          style={{ width: `${pct}%`, "--pct": Math.max(pct, 1) } as React.CSSProperties}
        ></div>
      </div>
      <div className="goal-foot">
        <span>{target > 0 ? (pct >= 100 ? "Meta atingida 🎉" : `Faltam ${fmt(remaining)}`) : "—"}</span>
        {/* O prazo do que falta — a leitura que "Faltam 4" não dá sozinho:
            4 no dia 3 do mês e 4 no dia 28 são situações opostas. Em dinheiro
            cabe o alvo diário; em unidades, o que informa é quanto tempo resta
            (0,8 imóvel por dia não é instrução que alguém consiga seguir). */}
        {proj.porDiaUtil != null && (
          <span style={{ color: `var(--${tom === "neutro" ? "text-dim" : tom === "pos" ? "good" : tom})` }}>
            {divisivel ? `${fmtTaxa(proj.porDiaUtil)}/dia útil` : `em ${diasUteisTexto(proj.diasUteisRestantes)}`}
          </span>
        )}
      </div>
      {textoProj && (
        <div className="kpi-desc" style={{ marginTop: "8px" }}>
          {textoProj}
        </div>
      )}
      {note && (
        <div className="kpi-desc" style={{ marginTop: textoProj ? "4px" : "8px" }}>
          {note}
        </div>
      )}
    </div>
  );
}

export default function MetasView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const metas = useAppStore((s) => s.metas);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { usuario } = useSessao();
  const [ajustando, setAjustando] = useState(false);

  const mKey = currentMonthKey();
  const hoje = todayISO();
  const meta = metaDoMes(metas, mKey);
  const thisMonth = imoveisAngariadosNoMes(imoveis, mKey);
  const locadosThisMonth = imoveisLocadosNoMes(imoveis, mKey);
  const comissaoRecMes = comissaoRecebidaNoMes(imoveis, mKey, comissaoPercent);
  const faturamentoMes = faturamentoContratosNoMes(imoveis, mKey);

  const hasGoals = temMeta(meta);

  /* Grava o mês INTEIRO a cada clique, e não só o campo tocado, porque a linha
     de `metas` é uma só — `salvarMeta` faz upsert dos quatro valores. Partir de
     `metaDoMes` (e não de `metas[mKey]`) é o que faz o primeiro clique
     funcionar num mês ainda sem meta: ali a base é a META_VAZIA. */
  async function ajustarMeta(campo: keyof Meta, passo: number) {
    if (ajustando || !usuario) return;
    setAjustando(true);
    const base = metaDoMes(metas, mKey);
    await salvarMeta(mKey, { ...base, [campo]: ajustarAlvoMeta(base[campo], passo) }, usuario.id, true);
    setAjustando(false);
  }
  // Virada de mês: quem já vinha definindo metas e ainda não definiu a deste.
  const mesDaUltimaMeta = precisaDefinirMeta(metas, mKey) ? mesAnteriorComMeta(metas, mKey) : null;
  const historico = Object.keys(metas).sort().reverse().slice(0, 6);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">{monthLabelLong(mKey)}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("meta")}>
            {hasGoals ? "Editar metas do mês" : "+ Definir metas"}
          </button>
        </div>
      </div>

      {!hasGoals ? (
        <div className="empty-state card">
          <h3>
            {mesDaUltimaMeta
              ? `${monthLabelLong(mKey)} ainda está sem meta`
              : "Nenhuma meta definida para este mês"}
          </h3>
          <p>
            {mesDaUltimaMeta ? (
              <>
                Sua última meta foi a de {monthLabelLong(mesDaUltimaMeta)}:{" "}
                {resumoMetaCurto(metas[mesDaUltimaMeta])}. O formulário já abre com esses números —
                confira e salve. Enquanto o mês ficar sem meta, ele não entra na contagem da medalha
                de constância, e isso não dá para acertar depois que o mês fechar.
              </>
            ) : (
              "Defina metas de angariação, locação e comissão para acompanhar seu progresso ao longo do mês."
            )}
          </p>
          <div style={{ marginTop: "16px" }}>
            <button type="button" className="btn btn-primary" onClick={() => abrirModal("meta")}>
              + Definir metas
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-4 anim-stagger">
          <GoalCard
            label="Angariações"
            current={thisMonth.length}
            target={meta.angariacoes}
            unit="un."
            note="Conta ao chegar na etapa Angariado"
            mKey={mKey}
            hoje={hoje}
            onAjustar={(passo) => ajustarMeta("angariacoes", passo)}
            ajustando={ajustando}
          />
          <GoalCard
            label="Imóveis locados"
            current={locadosThisMonth.length}
            target={meta.locados}
            unit="un."
            mKey={mKey}
            hoje={hoje}
            onAjustar={(passo) => ajustarMeta("locados", passo)}
            ajustando={ajustando}
          />
          <GoalCard
            label="Comissão recebida"
            current={comissaoRecMes}
            target={meta.comissao}
            unit="money"
            mKey={mKey}
            hoje={hoje}
            onAjustar={(passo) => ajustarMeta("comissao", passo)}
            ajustando={ajustando}
          />
          <GoalCard
            label="Faturamento em contratos"
            current={faturamentoMes}
            target={meta.faturamento}
            unit="money"
            note="Soma dos aluguéis dos imóveis locados no mês"
            mKey={mKey}
            hoje={hoje}
            onAjustar={(passo) => ajustarMeta("faturamento", passo)}
            ajustando={ajustando}
          />
        </div>
      )}

      <div className="divider"></div>
      <ConquistasDoMes />

      <div className="divider"></div>
      <BadgesConquistas />

      <div className="divider"></div>
      <div className="card-title" style={{ marginBottom: "14px" }}>
        Histórico de metas
      </div>
      {historico.length === 0 ? (
        <p className="section-note">Nenhum histórico ainda.</p>
      ) : (
        <div className="card table-scroll" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Meta angariações</th>
                <th>Realizado</th>
                <th>Meta locados</th>
                <th>Realizado</th>
                <th>Meta comissão</th>
                <th>Recebido</th>
                <th>Meta faturamento</th>
                <th>Realizado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((k) => {
                const m = metas[k];
                const ang = imoveisAngariadosNoMes(imoveis, k).length;
                const loc = imoveisLocadosNoMes(imoveis, k).length;
                const rec = comissaoRecebidaNoMes(imoveis, k, comissaoPercent);
                const fat = faturamentoContratosNoMes(imoveis, k);
                return (
                  <tr key={k}>
                    <td className="cell-strong">{monthLabelLong(k)}</td>
                    <td>{m.angariacoes || "—"}</td>
                    <td className="cell-dim">{ang}</td>
                    <td>{m.locados || "—"}</td>
                    <td className="cell-dim">{loc}</td>
                    <td>{m.comissao ? fmtMoney(m.comissao) : "—"}</td>
                    <td className="cell-dim">{fmtMoney(rec)}</td>
                    {/* Metas de meses anteriores à coluna podem não ter faturamento. */}
                    <td>{m.faturamento ? fmtMoney(m.faturamento) : "—"}</td>
                    <td className="cell-dim">{fmtMoney(fat)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
