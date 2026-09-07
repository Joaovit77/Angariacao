"use client";

import {
  TITULOS_SECOES_ANALISE,
  type RelatorioAnaliseAprofundada,
} from "@/lib/assistente/analiseAprofundada";
import styles from "./Assistente.module.css";

const ROTULOS_NATUREZA = {
  fato: "Fato",
  inferencia: "Inferência",
  lacuna: "Lacuna",
} as const;

export default function RelatorioAnaliseAprofundadaView({
  relatorio,
}: {
  relatorio: RelatorioAnaliseAprofundada;
}) {
  const fontes = new Map(relatorio.fontes.map((fonte) => [fonte.id, fonte]));
  return (
    <div className={styles.relatorioAnalise}>
      <header>
        <span>
          <small>{relatorio.resultado === "parcial" ? "Diagnóstico parcial" : "Diagnóstico completo"}</small>
          <strong>{relatorio.imovel.codigo}</strong>
        </span>
        <small>{relatorio.atendimentoIncluido ? "Atendimento incluído" : "Atendimento não incluído"}</small>
      </header>
      {relatorio.secoes.map((secao) => (
        <section key={secao.id}>
          <h4>{TITULOS_SECOES_ANALISE[secao.id]}</h4>
          <ul>
            {secao.afirmacoes.map((afirmacao, indice) => (
              <li key={`${secao.id}-${indice}`} data-natureza={afirmacao.natureza}>
                <span className={styles.naturezaAnalise}>{ROTULOS_NATUREZA[afirmacao.natureza]}</span>
                <p>{afirmacao.texto}</p>
                <small>
                  Confiança {afirmacao.confianca} · {afirmacao.temporalidade.replaceAll("_", " ")}
                  {afirmacao.fontes.length
                    ? ` · ${afirmacao.fontes.map((id) => fontes.get(id)?.rotulo || id).join("; ")}`
                    : ""}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <details>
        <summary>Fontes e Protocolos aplicados</summary>
        {relatorio.protocolosAplicadosTitulos.length > 0 && (
          <p><b>Protocolos:</b> {relatorio.protocolosAplicadosTitulos.join("; ")}</p>
        )}
        <ul>
          {relatorio.fontes.map((fonte) => (
            <li key={fonte.id}>
              <b>{fonte.rotulo}</b>
              <small>{fonte.origem} · {fonte.temporalidade}{fonte.observadoEm ? ` · ${fonte.observadoEm}` : ""}</small>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
