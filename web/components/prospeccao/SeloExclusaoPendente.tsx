"use client";

import { fmtDataHoraIso } from "@/lib/datas";

import styles from "./Prospeccao.module.css";

/**
 * Enquanto `exclusao_solicitada_em` estiver preenchido o registro é
 * retomável, não mutável (§13.4). O selo diz isso em voz alta e oferece as
 * DUAS únicas ações que existem nesse estado — nenhuma terceira.
 */
export default function SeloExclusaoPendente({
  exclusaoSolicitadaEm,
  ocupado,
  aoRetomar,
  aoCancelar,
}: {
  exclusaoSolicitadaEm: string;
  ocupado: boolean;
  aoRetomar: () => void;
  aoCancelar: () => void;
}) {
  const quando = fmtDataHoraIso(exclusaoSolicitadaEm);
  return (
    <div className={styles.seloExclusao} role="status" aria-label="Exclusão pendente">
      <div>
        <strong>Exclusão pendente</strong>
        <span>
          A exclusão foi iniciada{quando ? ` em ${quando}` : ""} e não terminou. Este registro
          está bloqueado: nada pode ser alterado até você retomar ou cancelar a exclusão.
        </span>
      </div>
      <div className={styles.seloExclusaoAcoes}>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={ocupado}
          onClick={aoRetomar}
        >
          Retomar exclusão
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={ocupado}
          onClick={aoCancelar}
        >
          Cancelar exclusão
        </button>
      </div>
    </div>
  );
}
