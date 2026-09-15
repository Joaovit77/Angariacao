/* Histórico de passagens (C4 → C9.1): a história do imóvel contada por
   passagem, não um log técnico.

   Cada passagem diz, nesta ordem: quando foi e se é a mais recente; o que o
   corretor escreveu; se o texto foi corrigido depois de uma confirmação; se
   a IA analisou ou reaproveitou uma análise igual; o que foi percebido (com
   a marca de cada etiqueta); se estas informações ainda são as atuais. O
   que é auditoria (origem, apoio no texto, revisão, datas da análise) fica
   em "Ver detalhes", fechado por padrão. O que não aparece nem lá (V7 §16):
   nome de modelo, tokens, dólar, ids, contadores e nomes de coluna. */
import { ordenarAvistamentosPorRecencia } from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { AvistamentoLongitudinal, ClassificacaoAvistamento } from "@/lib/prospeccao";

import AvisoRevisaoConflito from "./AvisoRevisaoConflito";
import CapturaFachada from "./CapturaFachada";
import {
  ChipEtiqueta,
  EXPLICACAO_APOIO,
  VerDetalhes,
  apoioNoTexto,
  descreverProveniencia,
  rotuloEtiqueta,
} from "./EtiquetasImovel";
import styles from "./Prospeccao.module.css";
import { mensagemFalhaAnalise } from "./textosAnalise";

/** Estado da análise em linguagem de campo. `indisponivel` também é "não
    analisada": a tentativa não aconteceu, e o botão oferece outra. */
const ROTULOS_ANALISE: Record<AvistamentoLongitudinal["classificacaoEstado"], string> = {
  pendente: "Ainda não analisada",
  concluida: "Analisada",
  indisponivel: "Ainda não analisada",
  nao_aplicavel: "Sem texto para analisar",
};

/** Linguagem de produto: o usuário nunca vê nome de modelo, token ou dólar
    (V7 §16). `modelo` fica na execução para auditoria; aqui só o conceito. */
export const ROTULOS_MODO: Record<ClassificacaoAvistamento["modo"], { titulo: string; subtexto: string }> = {
  modelo: {
    titulo: "Analisado pela IA",
    subtexto: "O sistema leu a observação e identificou estas informações.",
  },
  reuso: {
    titulo: "Já tínhamos analisado uma observação igual",
    subtexto: "O resultado anterior deste imóvel foi reaproveitado.",
  },
};

/** A execução que responde pelo estado atual desta passagem: a mais
    recente concluída. Falhas e abandonos ficam no histórico, não no rótulo. */
function execucaoVigente(avistamento: AvistamentoLongitudinal): ClassificacaoAvistamento | null {
  return avistamento.classificacoes.find((execucao) => execucao.estado === "concluida") ?? null;
}

/** Leitura TEMPORAL da execução. `snapshot_aplicado` é fato histórico: "esta
    execução influenciou o snapshot quando foi concluída", e continua `true`
    no banco depois que outra passagem vira a mais recente. O que ela diz
    sobre as informações ATUAIS depende também de a passagem ainda ser a
    mais recente; por isso o rótulo cruza as duas coisas em vez de ler só a
    coluna (e nunca diz "snapshot" para o usuário). */
export function situacaoTemporalDaExecucao(
  corrente: boolean,
  execucao: Pick<ClassificacaoAvistamento, "snapshotAplicado">,
): string {
  if (!corrente) return "Registro anterior; as informações atuais vêm da passagem mais recente.";
  return execucao.snapshotAplicado
    ? "Estas informações refletem a passagem mais recente."
    : "Esta análise não mudou as informações atuais.";
}

export interface FalhaAnaliseAvistamento {
  avistamentoId: string;
  /** Código fechado devolvido pela rota (`limite-diario`, `ocupado`…). */
  codigo: string;
}

export default function LinhaDoTempoAvistamentos({
  avistamentos,
  avistamentoCorrenteId,
  aoRemoverFoto,
  aoClassificar,
  classificandoAvistamentoId = null,
  falhaAnalise = null,
}: {
  avistamentos: AvistamentoLongitudinal[];
  avistamentoCorrenteId: string | null;
  /** Ausente = somente leitura (ex.: exclusão pendente). Trocar a foto é
      remover a atual pela rota e reservar outra (§5.1). */
  aoRemoverFoto?: (fotoId: string) => void;
  /** Pede a análise por IA DESTA passagem. Ausente = somente leitura.
      Analisar uma passagem antiga grava as etiquetas dela e não move o
      presente (§8.4). */
  aoClassificar?: (avistamentoId: string) => void;
  classificandoAvistamentoId?: string | null;
  /** Motivo (transitório, de tela) da última tentativa que falhou. Só vale
      para a passagem com o mesmo id; nunca vaza para outra. */
  falhaAnalise?: FalhaAnaliseAvistamento | null;
}) {
  const ordenados = ordenarAvistamentosPorRecencia(avistamentos);
  if (!ordenados.length) {
    return <p className={styles.vazioInterno}>Nenhuma passagem registrada.</p>;
  }
  const primeiroId = ordenados[ordenados.length - 1].id;
  const execucoesPorId = new Map<string, ClassificacaoAvistamento>();
  for (const avistamento of ordenados) {
    for (const execucao of avistamento.classificacoes) execucoesPorId.set(execucao.id, execucao);
  }

  return (
    <ol className={styles.linhaDoTempo} aria-label="Histórico de passagens">
      {ordenados.map((avistamento) => {
        const corrente = avistamento.id === avistamentoCorrenteId;
        const execucao = execucaoVigente(avistamento);
        const classificando = classificandoAvistamentoId === avistamento.id;
        const naoAnalisada = avistamento.classificacaoEstado === "pendente"
          || avistamento.classificacaoEstado === "indisponivel";
        const podeClassificar = Boolean(aoClassificar) && naoAnalisada;
        const falha = falhaAnalise && falhaAnalise.avistamentoId === avistamento.id && naoAnalisada
          ? mensagemFalhaAnalise(falhaAnalise.codigo)
          : null;
        const fonteDoReuso = execucao?.reusadaDeClassificacaoId
          ? execucoesPorId.get(execucao.reusadaDeClassificacaoId) ?? null
          : null;
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
                {corrente ? <span className={styles.corrente}>Passagem mais recente</span> : null}
                <span className={styles.estadoClassificacao}>
                  {classificando ? "Analisando…" : ROTULOS_ANALISE[avistamento.classificacaoEstado]}
                </span>
              </span>
            </div>
            <div className={styles.eventoTitulo}>
              <strong>{avistamento.id === primeiroId ? "Primeira passagem" : "Nova passagem registrada"}</strong>
              {avistamento.observacaoRevisao > 1 ? (
                <span className={styles.marcaTexto} data-texto-corrigido>Texto corrigido</span>
              ) : null}
            </div>
            <p className={avistamento.observacao ? undefined : styles.eventoSemObservacao}>
              {avistamento.observacao || "Sem observação escrita nesta passagem."}
            </p>
            <AvisoRevisaoConflito
              compacto
              revisaoConflitoEm={avistamento.revisaoConflitoEm}
              revisaoObservacao={avistamento.observacaoRevisao}
            />
            {execucao ? (
              <div className={styles.analise} data-modo={execucao.modo} aria-label="Análise desta passagem">
                <strong>{ROTULOS_MODO[execucao.modo].titulo}</strong>
                <span>{ROTULOS_MODO[execucao.modo].subtexto}</span>
              </div>
            ) : null}
            {falha ? (
              <div className={styles.analiseFalhou} role="status">{falha}</div>
            ) : null}
            {/* O que foi percebido NESTA passagem, com a marca de cada
                etiqueta: texto mudou, substituída e incorreta aparecem
                como tais, nunca como informação atual. */}
            {avistamento.etiquetas.length || execucao?.tipoSugerido ? (
              <ul className={styles.percebido} aria-label="Percebido nesta passagem">
                {avistamento.etiquetas.map((etiqueta) => (
                  <li key={etiqueta.id}><ChipEtiqueta etiqueta={etiqueta} /></li>
                ))}
                {execucao?.tipoSugerido ? (
                  <li>
                    <span className={`${styles.chip} ${styles.chipInferida}`} data-tipo-sugerido>
                      Tipo: {execucao.tipoSugerido}
                      <span className={styles.chipMarca}>sugestão</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : execucao ? (
              <p className={styles.eventoSemObservacao}>Nenhuma informação identificada neste texto.</p>
            ) : null}
            {execucao ? (
              <p className={styles.situacaoTemporal}>{situacaoTemporalDaExecucao(corrente, execucao)}</p>
            ) : null}
            {execucao ? (
              <VerDetalhes rotulo="Detalhes da análise desta passagem">
                <ul className={styles.detalhesLista}>
                  <li>
                    {execucao.modo === "reuso"
                      ? `Resultado reaproveitado de uma análise anterior${fonteDoReuso?.concluidaEm ? ` (de ${fmtDataHoraIso(fonteDoReuso.concluidaEm)})` : ""}.`
                      : "Análise nova."}
                  </li>
                  <li>Analisada em {fmtDataHoraIso(execucao.concluidaEm) || "data não registrada"}.</li>
                  <li>
                    {avistamento.observacaoRevisao > 1
                      ? `Revisão ${avistamento.observacaoRevisao} do texto.`
                      : "Texto original, sem correções."}
                  </li>
                  {execucao.tipoSugerido ? (
                    <li>
                      Tipo sugerido: {execucao.tipoSugerido}
                      {execucao.tipoConfianca !== null ? ` · apoio no texto: ${apoioNoTexto(execucao.tipoConfianca)}` : ""}.
                    </li>
                  ) : null}
                  {avistamento.etiquetas.map((etiqueta) => (
                    <li key={etiqueta.id}>{rotuloEtiqueta(etiqueta)}: {descreverProveniencia(etiqueta)}.</li>
                  ))}
                </ul>
                <small className={styles.explicacao}>{EXPLICACAO_APOIO}</small>
              </VerDetalhes>
            ) : null}
            <div className={styles.eventoRodape}>
              {podeClassificar ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={classificando}
                  onClick={() => aoClassificar?.(avistamento.id)}
                >
                  {classificando ? "Analisando…" : falha ? "Tentar de novo" : "Analisar agora"}
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
