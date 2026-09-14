import { ordenarAvistamentosPorRecencia } from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { AvistamentoLongitudinal, ClassificacaoAvistamento } from "@/lib/prospeccao";

import CapturaFachada from "./CapturaFachada";
import EtiquetasImovel from "./EtiquetasImovel";
import styles from "./Prospeccao.module.css";

const ROTULOS_CLASSIFICACAO: Record<AvistamentoLongitudinal["classificacaoEstado"], string> = {
  pendente: "Aguardando classificação",
  concluida: "Classificado",
  indisponivel: "Aguardando classificação",
  nao_aplicavel: "Sem texto para classificar",
};

const ROTULOS_MODO: Record<ClassificacaoAvistamento["modo"], string> = {
  modelo: "pelo modelo",
  reuso: "resultado reutilizado",
};

/** A execução que responde pelo estado atual deste avistamento: a mais
    recente concluída. Falhas e abandonos ficam no histórico, não no rótulo. */
function execucaoVigente(avistamento: AvistamentoLongitudinal): ClassificacaoAvistamento | null {
  return avistamento.classificacoes.find((execucao) => execucao.estado === "concluida") ?? null;
}

export default function LinhaDoTempoAvistamentos({
  avistamentos,
  avistamentoCorrenteId,
  aoRemoverFoto,
  aoClassificar,
  classificandoAvistamentoId = null,
}: {
  avistamentos: AvistamentoLongitudinal[];
  avistamentoCorrenteId: string | null;
  /** Ausente = somente leitura (ex.: exclusão pendente). Trocar a foto é
      remover a atual pela rota e reservar outra (§5.1). */
  aoRemoverFoto?: (fotoId: string) => void;
  /** Pede a classificação por IA DESTE avistamento. Ausente = somente
      leitura. Classificar um avistamento antigo grava as etiquetas dele e
      não move o presente (§8.4). */
  aoClassificar?: (avistamentoId: string) => void;
  classificandoAvistamentoId?: string | null;
}) {
  const ordenados = ordenarAvistamentosPorRecencia(avistamentos);
  if (!ordenados.length) {
    return <p className={styles.vazioInterno}>Nenhum avistamento registrado.</p>;
  }

  return (
    <ol className={styles.linhaDoTempo} aria-label="Linha do tempo de avistamentos">
      {ordenados.map((avistamento) => {
        const corrente = avistamento.id === avistamentoCorrenteId;
        const execucao = execucaoVigente(avistamento);
        const classificando = classificandoAvistamentoId === avistamento.id;
        const podeClassificar = Boolean(aoClassificar)
          && (avistamento.classificacaoEstado === "pendente"
            || avistamento.classificacaoEstado === "indisponivel");
        return (
          <li
            className={`${styles.evento}${corrente ? ` ${styles.eventoCorrente}` : ""}`}
            key={avistamento.id}
            data-avistamento-id={avistamento.id}
            data-classificacao-estado={avistamento.classificacaoEstado}
          >
            <div className={styles.eventoMeta}>
              <time dateTime={avistamento.observadoEm}>
                {fmtDataHoraIso(avistamento.observadoEm)}
              </time>
              <span className={styles.cardTopo}>
                {corrente ? <span className={styles.corrente}>Avistamento corrente</span> : null}
                <span className={styles.estadoClassificacao}>
                  {classificando ? "Classificando…" : ROTULOS_CLASSIFICACAO[avistamento.classificacaoEstado]}
                </span>
              </span>
            </div>
            <p className={avistamento.observacao ? undefined : styles.eventoSemObservacao}>
              {avistamento.observacao || "Sem observação textual."}
            </p>
            {/* Etiquetas DESTE evento, com o estado de cada uma: o que foi
                substituído ou desatualizado aparece como histórico, nunca
                como estado atual. */}
            <EtiquetasImovel etiquetas={avistamento.etiquetas} rotulo="Etiquetas deste avistamento" />
            {execucao ? (
              <div className={styles.classificacaoResumo} aria-label="Classificação deste avistamento">
                <span>
                  Classificado em {fmtDataHoraIso(execucao.concluidaEm) || "data não registrada"} {ROTULOS_MODO[execucao.modo]}
                </span>
                {execucao.modelo ? <span>{execucao.modelo}</span> : null}
                {execucao.tipoSugerido ? (
                  <span>
                    Tipo sugerido: {execucao.tipoSugerido}
                    {execucao.tipoConfianca !== null ? ` (sinal ${execucao.tipoConfianca})` : ""}
                  </span>
                ) : null}
                <span>{execucao.snapshotAplicado ? "Reflete o avistamento corrente" : "Histórico: não altera o estado atual"}</span>
              </div>
            ) : null}
            <div className={styles.eventoRodape}>
              {avistamento.observacaoRevisao > 1 ? (
                <span>Revisão {avistamento.observacaoRevisao}</span>
              ) : null}
              {podeClassificar ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={classificando}
                  onClick={() => aoClassificar?.(avistamento.id)}
                >
                  {classificando ? "Classificando…" : "Classificar observação"}
                </button>
              ) : null}
            </div>
            {avistamento.fotos.map((foto) => (
              <div key={foto.id} data-foto-id={foto.id}>
                <CapturaFachada
                  foto={foto}
                  imovelIdentificadoId={avistamento.imovelIdentificadoId}
                  avistamentoId={avistamento.id}
                />
                {aoRemoverFoto ? (
                  <div className={styles.fotoAcoes}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost btn-danger"
                      onClick={() => aoRemoverFoto(foto.id)}
                    >
                      Remover foto
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </li>
        );
      })}
    </ol>
  );
}
