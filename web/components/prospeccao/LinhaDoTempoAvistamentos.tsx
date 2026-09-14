import { ordenarAvistamentosPorRecencia } from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { AvistamentoLongitudinal, ClassificacaoAvistamento } from "@/lib/prospeccao";

import AvisoRevisaoConflito from "./AvisoRevisaoConflito";
import CapturaFachada from "./CapturaFachada";
import EtiquetasImovel from "./EtiquetasImovel";
import styles from "./Prospeccao.module.css";

const ROTULOS_CLASSIFICACAO: Record<AvistamentoLongitudinal["classificacaoEstado"], string> = {
  pendente: "Aguardando classificação",
  concluida: "Classificado",
  indisponivel: "Aguardando classificação",
  nao_aplicavel: "Sem texto para classificar",
};

/** Linguagem de produto: o usuário nunca vê nome de modelo, token ou dólar
    (V7 §16). `modelo` fica na execução para auditoria; aqui só o conceito. */
const ROTULOS_MODO: Record<ClassificacaoAvistamento["modo"], string> = {
  modelo: "processado pela IA",
  reuso: "resultado reutilizado de classificação anterior (sem nova chamada à IA)",
};

/** A execução que responde pelo estado atual deste avistamento: a mais
    recente concluída. Falhas e abandonos ficam no histórico, não no rótulo. */
function execucaoVigente(avistamento: AvistamentoLongitudinal): ClassificacaoAvistamento | null {
  return avistamento.classificacoes.find((execucao) => execucao.estado === "concluida") ?? null;
}

/** Leitura TEMPORAL da execução. `snapshot_aplicado` é fato histórico: "esta
    execução influenciou o snapshot quando foi concluída" — e continua `true`
    no banco depois que outro avistamento vira o corrente. O que ela diz sobre
    o estado ATUAL depende também de o avistamento ainda ser o corrente; por
    isso o rótulo cruza as duas coisas em vez de ler só a coluna. */
export function situacaoTemporalDaExecucao(
  corrente: boolean,
  execucao: Pick<ClassificacaoAvistamento, "snapshotAplicado">,
): string {
  if (!corrente) return "Histórico: não altera o estado atual";
  return execucao.snapshotAplicado ? "Reflete o avistamento corrente" : "Não alterou o estado atual";
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
            <AvisoRevisaoConflito
              compacto
              revisaoConflitoEm={avistamento.revisaoConflitoEm}
              revisaoObservacao={avistamento.observacaoRevisao}
            />
            {/* Etiquetas DESTE evento, com o estado de cada uma: desatualizada
                (o texto mudou), substituída (outra execução) e contestada
                aparecem como tais, nunca como estado atual. */}
            <EtiquetasImovel etiquetas={avistamento.etiquetas} rotulo="Etiquetas deste avistamento" />
            {execucao ? (
              <div className={styles.classificacaoResumo} aria-label="Classificação deste avistamento" data-modo={execucao.modo}>
                <span>
                  Classificado em {fmtDataHoraIso(execucao.concluidaEm) || "data não registrada"} {ROTULOS_MODO[execucao.modo]}
                </span>
                {execucao.tipoSugerido ? (
                  <span>
                    Tipo sugerido: {execucao.tipoSugerido}
                    {execucao.tipoConfianca !== null ? ` (sinal ${execucao.tipoConfianca})` : ""}
                  </span>
                ) : null}
                <span>{situacaoTemporalDaExecucao(corrente, execucao)}</span>
              </div>
            ) : null}
            <div className={styles.eventoRodape}>
              <span>
                {avistamento.observacaoRevisao > 1
                  ? `Revisão ${avistamento.observacaoRevisao} do texto`
                  : "Texto original"}
              </span>
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
