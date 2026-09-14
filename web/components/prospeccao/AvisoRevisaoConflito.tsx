/* "Vale revisar esta informação." (V7 §8.5, em linguagem de campo)

   Quando o texto de uma passagem é corrigido, a sugestão que se apoiava
   nele deixa de ser atual; a confirmação humana, não: confirmar é afirmação
   sobre o mundo, não sobre o texto. Mas se o texto novo contradiz o que foi
   confirmado, o sistema não tem como decidir; ele AVISA, nomeia o que foi
   confirmado, e a pessoa resolve marcando como incorreta o que deixou de
   valer. O banco registra `revisao_conflito_em`; este componente só o
   mostra. Não há botão para "resolver": nenhuma RPC do contrato zera o
   conflito, e este checkpoint não inventa uma. */
import { fmtDataHoraIso } from "@/lib/datas";

import styles from "./Prospeccao.module.css";

function listarNomes(nomes: string[]): string {
  const entreAspas = nomes.map((nome) => `“${nome}”`);
  if (entreAspas.length <= 1) return entreAspas.join("");
  return `${entreAspas.slice(0, -1).join(", ")} e ${entreAspas[entreAspas.length - 1]}`;
}

export default function AvisoRevisaoConflito({
  revisaoConflitoEm,
  revisaoObservacao,
  etiquetasConfirmadas = [],
  compacto = false,
}: {
  /** `revisao_conflito_em` da passagem; sem valor, nada é mostrado. */
  revisaoConflitoEm: string | null;
  revisaoObservacao: number;
  /** Rótulos das etiquetas confirmadas envolvidas, quando os dados permitem nomeá-las. */
  etiquetasConfirmadas?: string[];
  /** Na linha do tempo: uma marca só, sem a explicação inteira. */
  compacto?: boolean;
}) {
  if (!revisaoConflitoEm) return null;
  const quando = fmtDataHoraIso(revisaoConflitoEm);
  if (compacto) {
    return (
      <span className={styles.conflitoMarca} data-revisao-conflito>
        Texto corrigido depois de uma confirmação{quando ? ` (${quando})` : ""}
      </span>
    );
  }
  const oQue = etiquetasConfirmadas.length ? listarNomes(etiquetasConfirmadas) : "informações desta passagem";
  const plural = etiquetasConfirmadas.length !== 1;
  return (
    <div className={styles.conflito} role="alert" data-revisao-conflito>
      <strong>Vale revisar esta informação.</strong>
      <p>
        Você confirmou {oQue}, mas depois alterou o texto usado naquela análise
        {quando ? ` (correção de ${quando}, revisão ${revisaoObservacao} do texto)` : ` (revisão ${revisaoObservacao} do texto)`}.
        {" "}A confirmação foi mantida. Se o texto novo {plural ? "as" : "a"} contradiz, marque como incorreta.
      </p>
    </div>
  );
}
