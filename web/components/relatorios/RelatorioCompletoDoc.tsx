"use client";

/* ================================================================
   DOCUMENTO: RELATÓRIO COMPLETO
   As quatro seções de lib/calculo/relatorioCompleto.ts. Componente
   só de montagem — nenhuma conta acontece aqui, nem uma soma.

   Fica em arquivo próprio para não engordar a RelatoriosView, e
   principalmente porque o relatório mensal/semanal não muda: quem
   abrir o `ReportDoc` procurando o que mudou não vai achar nada.

   As barras por dia são <div> com largura percentual, não Chart.js.
   O documento é feito para ser impresso (o botão "Imprimir / salvar
   PDF" da view), e canvas some ou sai serrilhado na impressão — fora
   que uma instância a mais de gráfico exigiria o cleanup do
   useEffect para não vazar.
   ================================================================ */
import { fmtDate } from "@/lib/formatadores";
import type { RelatorioCompleto } from "@/lib/calculo/relatorioCompleto";

function Stat({ label, value, nota }: { label: string; value: string | number; nota?: string }) {
  return (
    <div className="report-stat">
      <div className="report-stat-label">{label}</div>
      <div className="report-stat-value">{value}</div>
      {nota && <div className="report-stat-cmp">{nota}</div>}
    </div>
  );
}

/** Barras horizontais simples. `total` fixa a escala para as barras de
    seções diferentes não se compararem por engano. */
function Barras({ itens, total }: { itens: { rotulo: string; n: number }[]; total: number }) {
  const maior = itens.reduce((m, i) => Math.max(m, i.n), 0) || 1;
  return (
    <div className="rc-barras">
      {itens.map((i) => (
        <div className="rc-barra-linha" key={i.rotulo}>
          <span className="rc-barra-rotulo" title={i.rotulo}>
            {i.rotulo}
          </span>
          <span className="rc-barra-trilho">
            <span className="rc-barra-fill" style={{ width: `${(i.n / maior) * 100}%` }} />
          </span>
          <span className="rc-barra-valor">
            {i.n}
            {total > 0 && <span className="rc-barra-pct"> · {Math.round((i.n / total) * 100)}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function RelatorioCompletoDoc({
  r,
  responsavel,
  periodo,
  periodoCorrente,
  hoje,
}: {
  r: RelatorioCompleto;
  responsavel: string;
  periodo: string;
  /** O período selecionado é o mês corrente? Só ele deixa a seção 4 ser lida
      como "o que ficou" — ver a ressalva no cálculo. */
  periodoCorrente: boolean;
  hoje: string;
}) {
  const { esforco, respostas, perdas, fila } = r;

  return (
    // `rc-doc` só ajusta a grade dos stats e o tom das notas: as seções aqui
    // têm 4 ou 5 indicadores conforme a fila do dia, e a grade fixa de 5
    // colunas do relatório de desfecho deixaria buracos.
    <div className="report-doc rc-doc">
      <div className="report-print-header">
        <div className="rph-brand">
          Angario<span className="rph-brand-sub">Relatório completo de captação</span>
        </div>
        <div className="rph-meta">
          <span>Responsável: {responsavel}</span>
          <span>Emitido em: {fmtDate(hoje)}</span>
        </div>
      </div>
      <h2>Relatório Completo</h2>
      <div className="report-period">{periodo}</div>
      <p className="section-note" style={{ marginBottom: "18px" }}>
        Mede o TRABALHO de captação do período — contato, resposta e perda. O relatório mensal e o
        semanal continuam medindo o desfecho (angariações, locados, comissão); os dois recortes se
        complementam e nenhum substitui o outro.
      </p>

      {/* ---------- 1. ESFORÇO ---------- */}
      <div className="report-section-title" style={{ marginTop: 0 }}>
        1. Esforço do período
      </div>
      {esforco.tentativas === 0 ? (
        <p className="section-note">Nenhuma tentativa de contato registrada neste período.</p>
      ) : (
        <>
          <div className="report-stat-row">
            <Stat label="Tentativas" value={esforco.tentativas} />
            <Stat label="Imóveis contatados" value={esforco.imoveis} />
            <Stat
              label="Aberturas"
              value={esforco.aberturas}
              nota={`${esforco.seguimentos} de seguimento`}
            />
            <Stat
              label="Dias ativos"
              value={esforco.diasAtivos}
              nota={
                esforco.mediaPorDiaAtivo != null
                  ? `${esforco.mediaPorDiaAtivo.toFixed(1)} por dia trabalhado`
                  : undefined
              }
            />
            <Stat
              label="Pelo lote"
              value={esforco.viaLote}
              nota={`${esforco.avulsas} uma a uma`}
            />
          </div>
          <p className="section-note" style={{ marginBottom: "14px" }}>
            &quot;Abertura&quot; é a primeira tentativa daquele imóvel; &quot;seguimento&quot;, toda
            retomada depois dela. A média divide pelos dias em que houve contato, não pelos dias do
            período — a prospecção acontece em rajadas, e dividir por todos descreveria um ritmo que
            não existiu em nenhum dia.
          </p>

          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <div>
              <div className="rc-sub">Por canal</div>
              <Barras itens={esforco.porCanal} total={esforco.tentativas} />
            </div>
            <div>
              <div className="rc-sub">Por dia</div>
              <Barras
                itens={esforco.porDia.map((d) => ({ rotulo: fmtDate(d.rotulo), n: d.n }))}
                total={esforco.tentativas}
              />
            </div>
          </div>
        </>
      )}

      {/* ---------- 2. RESPOSTAS ---------- */}
      <div className="report-section-title">2. Respostas e o que virou delas</div>
      <div className="report-stat-row">
        <Stat label="Mensagens recebidas" value={respostas.mensagens} />
        <Stat label="Proprietários que responderam" value={respostas.imoveisQueResponderam} />
        <Stat
          label="Taxa de resposta"
          value={respostas.taxaCoorte != null ? `${respostas.taxaCoorte.toFixed(0)}%` : "—"}
          nota={
            respostas.coorteAbordados > 0
              ? `${respostas.coorteResponderam} de ${respostas.coorteAbordados} abordados no período`
              : "ninguém foi abordado pela 1ª vez no período"
          }
        />
        <Stat
          label="Tempo até responder"
          value={
            respostas.medianaAteResponder == null
              ? "—"
              : // Zero é o caso NORMAL no WhatsApp (metade responde no mesmo
                // dia), mas "0 dias" na tela lê como dado faltando — que é
                // justamente o que o "—" ao lado significa.
                respostas.medianaAteResponder === 0
                ? "No mesmo dia"
                : `${respostas.medianaAteResponder} dia${respostas.medianaAteResponder === 1 ? "" : "s"}`
          }
          nota="mediana"
        />
      </div>
      <p className="section-note" style={{ marginBottom: "14px" }}>
        A taxa é por COORTE: dos imóveis cuja primeira tentativa caiu neste período, quantos já
        responderam alguma vez — inclusive depois do fim dele. Medir &quot;respondeu no período ÷
        abordado no período&quot; misturaria populações, porque quem foi abordado no último dia ainda
        não teve tempo de responder.
      </p>

      {respostas.imoveisQueResponderam === 0 ? (
        <p className="section-note">Nenhum proprietário respondeu neste período.</p>
      ) : (
        <>
          <div className="rc-sub">Situação HOJE de quem respondeu no período</div>
          <Barras
            itens={[
              { rotulo: "Angariado", n: respostas.angariados },
              { rotulo: "Ainda em disputa", n: respostas.emAberto },
              { rotulo: "Encerrado sem captar", n: respostas.encerrados },
            ].filter((i) => i.n > 0)}
            total={respostas.imoveisQueResponderam}
          />
          <p className="section-note" style={{ marginTop: "10px", marginBottom: "14px" }}>
            É a situação de hoje, não a do fim do período: quem está em disputa ainda pode virar
            angariação, e contá-lo como fracasso daria por perdido quem segue em jogo.
          </p>
        </>
      )}

      {/* ---------- 3. ONDE PERDEMOS ---------- */}
      <div className="report-section-title">3. Onde perdemos</div>
      {perdas.decididos === 0 && perdas.semResposta === 0 ? (
        <p className="section-note">Nenhum registro foi encerrado neste período.</p>
      ) : (
        <>
          <div className="report-stat-row">
            <Stat
              label="Perdas decididas"
              value={perdas.decididos}
              nota="alguém disse não"
            />
            <Stat
              label="Chegamos tarde"
              value={perdas.pctChegamosTarde != null ? `${perdas.pctChegamosTarde.toFixed(0)}%` : "—"}
              nota={`${perdas.chegamosTarde} de ${perdas.decididos}`}
            />
            <Stat label="Telefone errado" value={perdas.dadoRuim} nota="problema de cadastro" />
            <Stat
              label="Locação perdida"
              value={perdas.posCaptacao}
              nota="captamos, fechou fora"
            />
            <Stat label="Demais motivos" value={perdas.demais} />
            <Stat
              label="Foram para sem resposta"
              value={perdas.semResposta}
              nota="silêncio — segue na fila"
            />
          </div>
          <p className="section-note" style={{ marginBottom: "14px" }}>
            &quot;Sem resposta&quot; fica FORA das taxas acima enquanto o follow-up ainda o trabalha
            (veja a seção 4): silêncio não é decisão de ninguém, e dá-lo por perdido condenaria quem
            segue em jogo. Quando o proprietário esgota a cadência de tentativas sem retornar, aí sim
            ele entra nas perdas decididas, com o motivo &quot;sem retorno&quot;: é o ponto em que o
            próprio sistema para de insistir.
          </p>
          <p className="section-note" style={{ marginBottom: "14px" }}>
            &quot;Chegamos tarde&quot; soma já alugado por conta própria, já vendido e optou por
            outra imobiliária: o proprietário tinha resolvido a vida antes de a gente aparecer — não
            é recusa ao serviço. &quot;Telefone errado&quot; fica separado porque fala do nosso
            cadastro, não do mercado, e a ação que ele pede é outra.
          </p>
          <p className="section-note" style={{ marginBottom: "14px" }}>
            &quot;Locação perdida&quot; é o imóvel que foi angariado e acabou alugado por outra
            imobiliária ou pelo próprio proprietário. Não entra em &quot;chegamos tarde&quot;: a
            captação foi ganha, e é a locação que se perdeu — somar as duas faria o trabalho que deu
            certo piorar o diagnóstico do garimpo.
          </p>
          {perdas.decididos > 0 && (
            <>
              <div className="rc-sub">Por motivo (só as perdas decididas)</div>
              <Barras itens={perdas.porMotivo} total={perdas.decididos} />
            </>
          )}
        </>
      )}

      {/* ---------- 4. FILA ---------- */}
      <div className="report-section-title">4. O que ficou pendente</div>
      {!periodoCorrente && (
        <p className="section-note" style={{ marginBottom: "10px" }}>
          <strong>Atenção:</strong> esta seção mostra a fila de HOJE, não a do fim do período
          selecionado. A elegibilidade do follow-up é contada a partir da data atual, e reconstruí-la
          para um período passado exigiria o estado do banco naquele dia.
        </p>
      )}
      {fila.vazia ? (
        <p className="section-note">Nada pendente — nenhuma frente com fila no momento. 🎉</p>
      ) : (
        <>
          <div className="report-stat-row">
            {fila.itens.map((i) => (
              <Stat key={i.frente} label={i.rotulo} value={i.quantos} nota={i.detalhe} />
            ))}
          </div>
          {fila.diasParaVazar != null && fila.diasParaVazar > 1 && (
            <p className="section-note">
              No teto diário de mensagens, a fila de follow-up atual leva {fila.diasParaVazar} dias
              de rodadas para vazar — e ela se reabastece a cada dia de prospecção.
            </p>
          )}
        </>
      )}
    </div>
  );
}
