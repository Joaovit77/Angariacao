import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import { ordenarAvistamentosPorRecencia } from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { AvistamentoLongitudinal } from "@/lib/prospeccao";

import CapturaFachada from "./CapturaFachada";
import styles from "./Prospeccao.module.css";

const ROTULOS_CLASSIFICACAO: Record<AvistamentoLongitudinal["classificacaoEstado"], string> = {
  pendente: "Classificação pendente",
  concluida: "Classificado",
  indisponivel: "Classificação indisponível",
  nao_aplicavel: "Classificação não aplicável",
};

export default function LinhaDoTempoAvistamentos({
  avistamentos,
  avistamentoCorrenteId,
  aoRemoverFoto,
}: {
  avistamentos: AvistamentoLongitudinal[];
  avistamentoCorrenteId: string | null;
  /** Ausente = somente leitura (ex.: exclusão pendente). Trocar a foto é
      remover a atual pela rota e reservar outra (§5.1). */
  aoRemoverFoto?: (fotoId: string) => void;
}) {
  const ordenados = ordenarAvistamentosPorRecencia(avistamentos);
  if (!ordenados.length) {
    return <p className={styles.vazioInterno}>Nenhum avistamento registrado.</p>;
  }

  return (
    <ol className={styles.linhaDoTempo} aria-label="Linha do tempo de avistamentos">
      {ordenados.map((avistamento) => {
        const corrente = avistamento.id === avistamentoCorrenteId;
        const classificacaoMaisRecente = avistamento.classificacoes[0] ?? null;
        return (
          <li
            className={`${styles.evento}${corrente ? ` ${styles.eventoCorrente}` : ""}`}
            key={avistamento.id}
            data-avistamento-id={avistamento.id}
          >
            <div className={styles.eventoMeta}>
              <time dateTime={avistamento.observadoEm}>
                {fmtDataHoraIso(avistamento.observadoEm)}
              </time>
              <span className={styles.cardTopo}>
                {corrente ? <span className={styles.corrente}>Avistamento corrente</span> : null}
                <span className={styles.estadoClassificacao}>
                  {ROTULOS_CLASSIFICACAO[avistamento.classificacaoEstado]}
                </span>
              </span>
            </div>
            <p className={avistamento.observacao ? undefined : styles.eventoSemObservacao}>
              {avistamento.observacao || "Sem observação textual."}
            </p>
            {avistamento.etiquetas.length ? (
              <div className={styles.chips} aria-label="Etiquetas deste avistamento">
                {avistamento.etiquetas.map((etiqueta) => (
                  <span className={styles.chip} key={etiqueta.id}>
                    {obterEtiquetaCatalogo(etiqueta.categoria, etiqueta.codigo)?.rotulo
                      ?? etiqueta.codigo}
                    {` · ${etiqueta.origem} · ${etiqueta.estado}`}
                  </span>
                ))}
              </div>
            ) : null}
            <div className={styles.eventoRodape}>
              {avistamento.observacaoRevisao > 1 ? (
                <span>Revisão {avistamento.observacaoRevisao}</span>
              ) : null}
              {classificacaoMaisRecente ? (
                <span className={styles.modo}>Modo: {classificacaoMaisRecente.modo}</span>
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
