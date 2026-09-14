/* Chips de etiqueta com a proveniência e a situação temporal à vista (C8/C9).

   A marca visual responde "quem afirmou isto, e isto ainda vale?": a IA
   inferiu, um humano confirmou ou contestou, o texto que a sustentava mudou
   (`desatualizada`), outra execução a trocou (`substituida`), ou ela vale
   mas para um avistamento anterior (histórica — condição de apresentação,
   não estado do banco). Confiança aparece como SINAL do classificador,
   nunca como "90% de chance de estar certo": autoconfiança de LLM não é
   probabilidade calibrada. O que não aparece (V7 §16): prompt, resposta
   bruta, tokens, dólar e o NOME do modelo — `modelo` fica persistido na
   etiqueta e na execução para auditoria e reuso, nunca na tela. */
import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import type { EtiquetaDoImovel } from "@/lib/calculo/etiquetasProspeccao";
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

/** A marca curta do chip: o que o olho precisa distinguir de relance.
    `historica` é apresentação: a etiqueta vale, mas para um avistamento que
    não é o corrente. Os cinco estados do banco têm marca própria. */
export function marcaProveniencia(
  etiqueta: Pick<EtiquetaParaChip, "origem" | "estado">,
  historica = false,
): string {
  if (historica && (etiqueta.estado === "inferida" || etiqueta.estado === "confirmada")) return "Histórica";
  switch (etiqueta.estado) {
    case "confirmada": return "Confirmada";
    case "contestada": return "Contestada";
    case "desatualizada": return "Desatualizada";
    case "substituida": return "Substituída";
    default: return etiqueta.origem === "manual" ? "Manual" : "IA";
  }
}

function classeDoChip(etiqueta: Pick<EtiquetaParaChip, "origem" | "estado">, historica: boolean): string {
  if (historica && (etiqueta.estado === "inferida" || etiqueta.estado === "confirmada")) return styles.chipHistorica;
  switch (etiqueta.estado) {
    case "confirmada": return styles.chipConfirmada;
    case "contestada": return styles.chipContestada;
    case "desatualizada": return styles.chipDesatualizada;
    case "substituida": return styles.chipSubstituida;
    default: return etiqueta.origem === "manual" ? styles.chipManual : styles.chipInferida;
  }
}

/** Uma frase de proveniência para quem abre o detalhe. Sem PII, sem prompt,
    sem nome de modelo. `desatualizada` e `substituida` dizem coisas
    diferentes, e a frase também. */
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
  }
  if (etiqueta.avistamentoId && etiqueta.observadoEm) {
    partes.push(`avistamento de ${fmtDataHoraIso(etiqueta.observadoEm)}`);
  } else if (!etiqueta.avistamentoId) {
    partes.push("sobre o lugar");
  }
  if (etiqueta.revisaoObservacao !== null && etiqueta.avistamentoId) {
    partes.push(`revisão ${etiqueta.revisaoObservacao} do texto`);
  }
  switch (etiqueta.estado) {
    case "confirmada":
      if (etiqueta.confirmadaEm) partes.push(`confirmada em ${fmtDataHoraIso(etiqueta.confirmadaEm)}`);
      break;
    case "desatualizada":
      partes.push(`o texto da observação mudou${etiqueta.desatualizadaEm ? ` em ${fmtDataHoraIso(etiqueta.desatualizadaEm)}` : ""}`);
      break;
    case "substituida":
      partes.push(`substituída por outra classificação${etiqueta.substituidaEm ? ` em ${fmtDataHoraIso(etiqueta.substituidaEm)}` : ""}`);
      break;
    case "contestada":
      partes.push("contestada");
      break;
  }
  return partes.join(" · ");
}

export function ChipEtiqueta({ etiqueta, historica = false }: { etiqueta: EtiquetaParaChip; historica?: boolean }) {
  return (
    <span
      className={`${styles.chip} ${classeDoChip(etiqueta, historica)}`}
      data-origem={etiqueta.origem}
      data-estado={etiqueta.estado}
      data-historica={historica ? "true" : undefined}
    >
      {rotuloEtiqueta(etiqueta)}
      <span className={styles.chipMarca}>{marcaProveniencia(etiqueta, historica)}</span>
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

/** O histórico derivado (§6.1 da V7): o que já foi afirmado sobre o lugar e
    não vale no avistamento corrente, com a data em que foi visto por último.
    Setembro disse "placa de aluga-se" e novembro não mencionou placa: a placa
    não é atual, e também não some. */
export function HistoricoEtiquetas({ historico }: { historico: EtiquetaDoImovel[] }) {
  if (!historico.length) return null;
  return (
    <ul className={styles.historicoEtiquetas} aria-label="Histórico de etiquetas">
      {historico.map((etiqueta) => (
        <li key={`${etiqueta.categoria}:${etiqueta.codigo}`} data-codigo={etiqueta.codigo}>
          <ChipEtiqueta etiqueta={etiqueta} historica />
          <small className={styles.proveniencia}>
            {`visto por último em ${fmtDataHoraIso(etiqueta.ultimaVezObservado)}`}
          </small>
        </li>
      ))}
    </ul>
  );
}
