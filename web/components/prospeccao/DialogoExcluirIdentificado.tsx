"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PreviaExclusaoIdentificado, ResultadoExclusaoProspeccao } from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";

import styles from "./Prospeccao.module.css";

export const AVISO_CANCELAR_EXCLUSAO =
  "As fotos já removidas não voltam. Cancelar a exclusão mesmo assim?";

type Fase = "carregando" | "confirmar" | "executando" | "pendente";

function plural(quantidade: number, singular: string, pluralizado: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralizado}`;
}

/**
 * Hard delete pela rota (§13.3). NÃO é "Descartar": descartar preserva tudo;
 * isto apaga de verdade, objeto primeiro e linha depois. O diálogo mostra o
 * que vai junto, o progresso REAL devolvido pela rota, e nunca declara
 * sucesso enquanto sobrar objeto — nesse caso oferece retomar e cancelar.
 */
export default function DialogoExcluirIdentificado({
  imovelIdentificadoId,
  retomada = false,
  aoFechar,
}: {
  imovelIdentificadoId: string;
  /** Aberto a partir de uma exclusão já pendente: retoma sem pedir confirmação de novo. */
  retomada?: boolean;
  aoFechar: () => void;
}) {
  const previaExclusao = useProspeccao((estado) => estado.previaExclusao);
  const excluir = useProspeccao((estado) => estado.excluir);
  const cancelarExclusao = useProspeccao((estado) => estado.cancelarExclusao);
  const salvando = useProspeccao((estado) => estado.salvando);
  const [fase, setFase] = useState<Fase>(retomada ? "executando" : "carregando");
  const [previa, setPrevia] = useState<PreviaExclusaoIdentificado | null>(null);
  const [resultado, setResultado] = useState<ResultadoExclusaoProspeccao | null>(null);
  const [falhou, setFalhou] = useState(false);

  // O pai pode passar uma arrow nova a cada render; o efeito de montagem
  // não pode depender dela, senão retomaria a exclusão a cada render.
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);
  const iniciou = useRef(false);

  /** O resultado REAL da rota: concluído fecha; qualquer outra coisa fica pendente. */
  const registrarRetorno = useCallback((retorno: ResultadoExclusaoProspeccao | null) => {
    if (retorno?.concluido) {
      aoFecharRef.current();
      return;
    }
    setResultado(retorno);
    setFalhou(!retorno);
    setFase("pendente");
  }, []);

  function iniciar() {
    setFase("executando");
    setFalhou(false);
    void excluir(imovelIdentificadoId).then(registrarRetorno);
  }

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    void (async () => {
      if (retomada) {
        registrarRetorno(await excluir(imovelIdentificadoId));
        return;
      }
      const contagem = await previaExclusao(imovelIdentificadoId);
      setPrevia(contagem);
      setFase("confirmar");
    })();
  }, [retomada, excluir, registrarRetorno, previaExclusao, imovelIdentificadoId]);

  async function cancelar() {
    if (!window.confirm(AVISO_CANCELAR_EXCLUSAO)) return;
    const cancelou = await cancelarExclusao(imovelIdentificadoId);
    if (cancelou) aoFechar();
  }

  const arquivosPrevistos = previa ? previa.fotosTotal * 2 : null;
  const removidos = resultado?.removidos ?? 0;
  const pendentes = resultado?.pendentes ?? 0;

  return (
    <div className={styles.dialogoExclusao} role="dialog" aria-labelledby="dialogo-exclusao-titulo">
      <strong id="dialogo-exclusao-titulo">Excluir permanentemente este registro</strong>
      <p>
        Isto <b>não</b> é descartar. Descartar preserva o histórico; excluir apaga de verdade a
        identidade, todos os avistamentos, etiquetas, classificações e os arquivos de foto no Storage.
      </p>

      {fase === "carregando" ? <p role="status">Contando o que será apagado…</p> : null}

      {fase === "confirmar" ? (
        <>
          {previa ? (
            <ul className={styles.dialogoLista}>
              <li>
                {plural(previa.fotosTotal, "foto", "fotos")} —{" "}
                {plural(arquivosPrevistos ?? 0, "arquivo", "arquivos")} no Storage (original e miniatura,
                incluindo envios não concluídos)
              </li>
              <li>
                {plural(previa.lapidesTotal, "lápide de fusão irá", "lápides de fusão irão")} por cascata
              </li>
            </ul>
          ) : (
            <p role="alert">
              Não foi possível contar os arquivos e lápides agora. A exclusão alcança tudo o que existir
              neste registro, e a rota informa o resultado real ao final.
            </p>
          )}
          <div className={styles.dialogoAcoes}>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={salvando}
              onClick={iniciar}
            >
              Excluir permanentemente
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={salvando} onClick={aoFechar}>
              Voltar
            </button>
          </div>
        </>
      ) : null}

      {fase === "executando" ? (
        <>
          <p role="status">Removendo arquivos do Storage e confirmando cada um…</p>
          <progress aria-label="Exclusão em andamento" />
        </>
      ) : null}

      {fase === "pendente" ? (
        <>
          <p className={styles.dialogoPendente} role="alert">
            {falhou
              ? "A rota de exclusão não respondeu. Nada foi declarado concluído; a exclusão continua pendente."
              : `${removidos} de ${removidos + pendentes} arquivos removidos; a exclusão continua pendente` +
                ` (${plural(pendentes, "arquivo ainda", "arquivos ainda")} no Storage).`}
          </p>
          <div className={styles.dialogoAcoes}>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={salvando}
              onClick={iniciar}
            >
              Retomar exclusão
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={salvando}
              onClick={() => void cancelar()}
            >
              Cancelar exclusão
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={salvando} onClick={aoFechar}>
              Fechar
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
