/* "A observação mudou depois de você confirmar etiquetas — revise." (V7 §8.5)

   Quando o texto de um avistamento é corrigido, a inferência que se apoiava
   nele deixa de ser atual; a confirmação humana, não: confirmar é afirmação
   sobre o mundo, não sobre o texto. Mas se o texto novo contradiz o que foi
   confirmado, o sistema não tem como decidir — ele AVISA e a pessoa resolve.
   O banco registra `revisao_conflito_em`; este componente só o mostra. Não
   há botão para "resolver": nenhuma RPC do contrato zera o conflito, e este
   checkpoint não inventa uma. */
import { fmtDataHoraIso } from "@/lib/datas";

import styles from "./Prospeccao.module.css";

export default function AvisoRevisaoConflito({
  revisaoConflitoEm,
  revisaoObservacao,
  compacto = false,
}: {
  /** `revisao_conflito_em` do avistamento; sem valor, nada é mostrado. */
  revisaoConflitoEm: string | null;
  revisaoObservacao: number;
  /** Na linha do tempo: uma linha só, sem a explicação inteira. */
  compacto?: boolean;
}) {
  if (!revisaoConflitoEm) return null;
  const quando = fmtDataHoraIso(revisaoConflitoEm);
  if (compacto) {
    return (
      <span className={styles.conflitoMarca} data-revisao-conflito>
        Observação alterada após confirmação de etiquetas{quando ? ` (${quando})` : ""}
      </span>
    );
  }
  return (
    <div className={styles.conflito} role="alert" data-revisao-conflito>
      <strong>A observação mudou depois de você confirmar etiquetas.</strong>
      <p>
        O texto deste avistamento foi corrigido{quando ? ` em ${quando}` : ""} (revisão {revisaoObservacao}) e havia
        etiquetas confirmadas por você antes disso. A confirmação continua valendo: o sistema não a desfaz,
        porque só você sabe se o texto novo a contradiz. Revise as etiquetas confirmadas e conteste as que
        deixaram de valer.
      </p>
    </div>
  );
}
