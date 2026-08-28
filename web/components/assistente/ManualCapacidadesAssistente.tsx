"use client";

import {
  agruparCapacidades,
  DESCRICOES_CATEGORIAS_CAPACIDADES,
  montarManualCapacidades,
  type CapacidadeAssistente,
} from "@/lib/assistente/capacidades";
import styles from "./Assistente.module.css";

const CAPACIDADES_PADRAO = montarManualCapacidades({ podeUsarIa: true });

interface ManualCapacidadesAssistenteProps {
  aoFechar: () => void;
  capacidades?: readonly CapacidadeAssistente[];
}

export default function ManualCapacidadesAssistente({
  aoFechar,
  capacidades = CAPACIDADES_PADRAO,
}: ManualCapacidadesAssistenteProps) {
  const grupos = agruparCapacidades(capacidades);

  return (
    <section className={styles.manualCapacidades} aria-labelledby="manual-capacidades-titulo">
      <header className={styles.manualCabecalho}>
        <span>
          <small>Manual dinâmico</small>
          <strong id="manual-capacidades-titulo">O que posso fazer?</strong>
        </span>
        <button type="button" onClick={aoFechar} aria-label="Fechar manual de capacidades">×</button>
      </header>

      {grupos.length === 0 ? (
        <p className={styles.manualVazio}>Nenhuma capacidade está disponível para esta conta no momento.</p>
      ) : (
        <div className={styles.manualGrupos}>
          {grupos.map((grupo, indice) => (
            <details className={styles.manualGrupo} key={grupo.categoria} open={indice === 0}>
              <summary>
                <span>
                  <strong>{grupo.rotulo}</strong>
                  <small>{DESCRICOES_CATEGORIAS_CAPACIDADES[grupo.categoria]}</small>
                </span>
                <b>{grupo.capacidades.length}</b>
              </summary>
              <div className={styles.manualLista}>
                {grupo.capacidades.map((capacidade) => (
                  <article className={styles.manualItem} key={capacidade.id}>
                    <div className={styles.manualItemCabecalho}>
                      <strong>{capacidade.nome}</strong>
                      <span data-controle={capacidade.controle}>{capacidade.controle}</span>
                    </div>
                    <p>{capacidade.descricao}</p>
                    {capacidade.observacaoDisponibilidade ? <small>{capacidade.observacaoDisponibilidade}</small> : null}
                    {capacidade.exemplos.length > 0 ? (
                      <div className={styles.manualExemplos}>
                        <b>Experimente pedir</b>
                        {capacidade.exemplos.map((exemplo) => <q key={exemplo}>{exemplo}</q>)}
                      </div>
                    ) : null}
                    {capacidade.limitacoes.length > 0 ? (
                      <ul className={styles.manualLimites}>
                        {capacidade.limitacoes.map((limitacao) => <li key={limitacao}>{limitacao}</li>)}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
