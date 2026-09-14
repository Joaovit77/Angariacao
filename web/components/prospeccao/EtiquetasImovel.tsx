/* Chips de etiqueta com a proveniência à vista (C8).

   A marca visual responde "quem afirmou isto?": a IA inferiu, um humano
   confirmou, um humano aplicou. Confiança aparece como SINAL do classificador
   — nunca como "90% de chance de estar certo": autoconfiança de LLM não é
   probabilidade calibrada. O que não aparece: prompt, resposta bruta do
   modelo, tokens. */
import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import type {
  EstadoEtiquetaProspeccao,
  OrigemEtiquetaProspeccao,
} from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { EtiquetaIdentificado } from "@/lib/prospeccao";

import styles from "./Prospeccao.module.css";

export const ROTULOS_ESTADO_ETIQUETA: Record<EstadoEtiquetaProspeccao, string> = {
  inferida: "Inferida pela IA",
  confirmada: "Confirmada",
  contestada: "Contestada",
  substituida: "Substituída",
  desatualizada: "Desatualizada",
};

export const ROTULOS_ORIGEM_ETIQUETA: Record<OrigemEtiquetaProspeccao, string> = {
  manual: "Aplicada manualmente",
  "ia-texto": "IA sobre o texto",
  "ia-visao": "IA sobre a foto",
};

export interface EtiquetaParaChip {
  categoria: string;
  codigo: string;
  origem: OrigemEtiquetaProspeccao;
  estado: EstadoEtiquetaProspeccao;
  confianca: number | null;
}

export function rotuloEtiqueta(etiqueta: Pick<EtiquetaParaChip, "categoria" | "codigo">): string {
  return obterEtiquetaCatalogo(etiqueta.categoria, etiqueta.codigo)?.rotulo ?? etiqueta.codigo;
}

/** A marca curta do chip: o que o olho precisa distinguir de relance. */
export function marcaProveniencia(etiqueta: Pick<EtiquetaParaChip, "origem" | "estado">): string {
  if (etiqueta.estado === "confirmada") return "Confirmada";
  if (etiqueta.estado === "contestada") return "Contestada";
  if (etiqueta.estado === "substituida" || etiqueta.estado === "desatualizada") return "Histórica";
  return etiqueta.origem === "manual" ? "Manual" : "IA";
}

function classeDoChip(etiqueta: Pick<EtiquetaParaChip, "origem" | "estado">): string {
  if (etiqueta.estado === "confirmada") return styles.chipConfirmada;
  if (etiqueta.estado === "inferida") return etiqueta.origem === "manual" ? styles.chipManual : styles.chipInferida;
  return styles.chipHistorica;
}

/** Uma frase de proveniência para quem abre o detalhe. Sem PII, sem prompt. */
export function descreverProveniencia(etiqueta: EtiquetaIdentificado): string {
  const partes: string[] = [];
  if (etiqueta.origem === "manual") {
    partes.push(ROTULOS_ORIGEM_ETIQUETA.manual);
  } else {
    partes.push(
      etiqueta.confianca !== null
        ? `${ROTULOS_ORIGEM_ETIQUETA[etiqueta.origem]} · sinal ${etiqueta.confianca}`
        : ROTULOS_ORIGEM_ETIQUETA[etiqueta.origem],
    );
    if (etiqueta.modelo) partes.push(etiqueta.modelo);
  }
  if (etiqueta.avistamentoId && etiqueta.observadoEm) {
    partes.push(`avistamento de ${fmtDataHoraIso(etiqueta.observadoEm)}`);
  } else if (!etiqueta.avistamentoId) {
    partes.push("sobre o lugar");
  }
  if (etiqueta.estado === "confirmada" && etiqueta.confirmadaEm) {
    partes.push(`confirmada em ${fmtDataHoraIso(etiqueta.confirmadaEm)}`);
  } else if (etiqueta.estado !== "inferida") {
    partes.push(ROTULOS_ESTADO_ETIQUETA[etiqueta.estado].toLowerCase());
  }
  return partes.join(" · ");
}

export function ChipEtiqueta({ etiqueta }: { etiqueta: EtiquetaParaChip }) {
  return (
    <span
      className={`${styles.chip} ${classeDoChip(etiqueta)}`}
      data-origem={etiqueta.origem}
      data-estado={etiqueta.estado}
    >
      {rotuloEtiqueta(etiqueta)}
      <span className={styles.chipMarca}>{marcaProveniencia(etiqueta)}</span>
    </span>
  );
}

export default function EtiquetasImovel({
  etiquetas,
  rotulo,
  limite,
}: {
  etiquetas: EtiquetaParaChip[];
  rotulo: string;
  limite?: number;
}) {
  if (!etiquetas.length) return null;
  const visiveis = limite ? etiquetas.slice(0, limite) : etiquetas;
  const restantes = etiquetas.length - visiveis.length;
  return (
    <span className={styles.chips} aria-label={rotulo}>
      {visiveis.map((etiqueta) => (
        <ChipEtiqueta etiqueta={etiqueta} key={`${etiqueta.categoria}:${etiqueta.codigo}:${etiqueta.estado}`} />
      ))}
      {restantes > 0 ? <span className={styles.chip}>+{restantes}</span> : null}
    </span>
  );
}
