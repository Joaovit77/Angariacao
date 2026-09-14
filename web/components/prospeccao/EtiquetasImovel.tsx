/* Chips de etiqueta em linguagem de campo (C8/C9/C9.1).

   O chip responde "o que percebemos, e isto ainda vale?" com uma marca de
   uma palavra: sugestão (a IA percebeu, ninguém confirmou), confirmado (uma
   pessoa assinou), incorreta (uma pessoa desmentiu), texto mudou (o texto
   que sustentava a sugestão foi corrigido), substituída (outra análise
   trouxe outro resultado) e visto antes (vale, mas para uma passagem que
   não é a mais recente; condição de apresentação, não estado do banco).
   A explicação inteira fica em uma frase ao lado; a proveniência técnica
   (origem, apoio no texto, revisão, datas) fica em "Ver detalhes".

   Apoio no texto é SINAL do classificador ("quanto o texto sustenta a
   etiqueta", 0 a 100), nunca "chance de estar certo": autoconfiança de LLM
   não é probabilidade calibrada, então não vira porcentagem. O que nunca
   aparece (V7 §16): prompt, resposta bruta, tokens, dólar, ids e o NOME do
   modelo; `modelo` fica persistido para auditoria e reuso, não na tela. */
import type { ReactNode } from "react";

import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import type { EtiquetaDoImovel } from "@/lib/calculo/etiquetasProspeccao";
import type {
  EstadoEtiquetaProspeccao,
  OrigemEtiquetaProspeccao,
} from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { EtiquetaIdentificado } from "@/lib/prospeccao";

import styles from "./Prospeccao.module.css";

/** Marca pública de cada estado do banco (uma palavra, minúscula, ao lado
    do rótulo). `historica` sobrepõe inferida/confirmada. */
export const MARCAS_ESTADO_ETIQUETA: Record<EstadoEtiquetaProspeccao, string> = {
  inferida: "sugestão",
  confirmada: "confirmado",
  contestada: "incorreta",
  substituida: "substituída",
  desatualizada: "texto mudou",
};
export const MARCA_HISTORICA = "visto antes";
export const MARCA_MANUAL = "manual";

export const ROTULOS_ORIGEM_ETIQUETA: Record<OrigemEtiquetaProspeccao, string> = {
  manual: "aplicada manualmente",
  "ia-texto": "a partir do texto",
  "ia-visao": "a partir da foto",
};

/** Como o apoio no texto é explicado sempre que um número aparece. */
export const EXPLICACAO_APOIO =
  "Indica o quanto o texto sustenta esta sugestão; não é uma probabilidade de acerto.";

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

/** Faixas de APRESENTAÇÃO do apoio (0 a 100). O piso das etiquetas (70)
    continua no cálculo; aqui só se traduz o número que já foi aceito. Tipo
    não tem piso, então "fraco" existe para ele. */
export type FaixaApoio = "forte" | "moderado" | "fraco";

export function faixaDeApoio(confianca: number): FaixaApoio {
  if (confianca >= 90) return "forte";
  if (confianca >= 70) return "moderado";
  return "fraco";
}

/** "forte (92 de 100)". Sem porcentagem: o número não é probabilidade. */
export function apoioNoTexto(confianca: number | null): string | null {
  if (confianca === null) return null;
  return `${faixaDeApoio(confianca)} (${confianca} de 100)`;
}

/** A marca curta do chip: o que o olho precisa distinguir de relance. */
export function marcaProveniencia(
  etiqueta: Pick<EtiquetaParaChip, "origem" | "estado">,
  historica = false,
): string {
  if (historica && (etiqueta.estado === "inferida" || etiqueta.estado === "confirmada")) return MARCA_HISTORICA;
  if (etiqueta.estado === "inferida" && etiqueta.origem === "manual") return MARCA_MANUAL;
  return MARCAS_ESTADO_ETIQUETA[etiqueta.estado];
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

/** Camada 1: uma frase que diz o que a marca significa e se ainda vale.
    Nunca promove sugestão a fato nem "visto antes" a "continua assim". */
export function explicarEtiqueta(
  etiqueta: Pick<EtiquetaIdentificado, "origem" | "estado" | "confirmadaEm" | "desatualizadaEm" | "substituidaEm">,
  opcoes: { historica?: boolean; vistoEm?: string | null } = {},
): string {
  if (opcoes.historica && (etiqueta.estado === "inferida" || etiqueta.estado === "confirmada")) {
    const quando = fmtDataHoraIso(opcoes.vistoEm);
    return `${quando ? `Visto em ${quando}; não` : "Não"} apareceu na passagem mais recente.`;
  }
  switch (etiqueta.estado) {
    case "confirmada": {
      const quando = fmtDataHoraIso(etiqueta.confirmadaEm);
      return `Confirmado por você${quando ? ` em ${quando}` : ""}.`;
    }
    case "contestada":
      return "Você marcou como incorreta; não vale como informação atual.";
    case "desatualizada": {
      const quando = fmtDataHoraIso(etiqueta.desatualizadaEm);
      return `Esta sugestão foi feita sobre um texto que depois foi corrigido${quando ? ` em ${quando}` : ""}.`;
    }
    case "substituida": {
      const quando = fmtDataHoraIso(etiqueta.substituidaEm);
      return `Uma análise mais recente trouxe outro resultado${quando ? ` em ${quando}` : ""}.`;
    }
    default:
      return etiqueta.origem === "manual"
        ? "Aplicada manualmente por você."
        : "Sugestão da IA a partir do texto; ainda não confirmada por uma pessoa.";
  }
}

/** Camada 2 ("Ver detalhes"): origem, apoio no texto, passagem de origem,
    revisão e datas. Sem PII, sem prompt, sem nome de modelo, sem ids. */
export function descreverProveniencia(etiqueta: EtiquetaIdentificado): string {
  const partes: string[] = [];
  if (etiqueta.origem === "manual") {
    partes.push(ROTULOS_ORIGEM_ETIQUETA.manual);
  } else {
    partes.push(ROTULOS_ORIGEM_ETIQUETA[etiqueta.origem]);
    const apoio = apoioNoTexto(etiqueta.confianca);
    if (apoio) partes.push(`apoio no texto: ${apoio}`);
  }
  if (etiqueta.avistamentoId && etiqueta.observadoEm) {
    partes.push(`passagem de ${fmtDataHoraIso(etiqueta.observadoEm)}`);
  } else if (!etiqueta.avistamentoId) {
    partes.push("sobre o lugar");
  }
  if (etiqueta.revisaoObservacao !== null && etiqueta.avistamentoId) {
    partes.push(`revisão ${etiqueta.revisaoObservacao} do texto`);
  }
  switch (etiqueta.estado) {
    case "confirmada":
      if (etiqueta.confirmadaEm) partes.push(`confirmado por você em ${fmtDataHoraIso(etiqueta.confirmadaEm)}`);
      break;
    case "desatualizada":
      partes.push(`o texto foi corrigido${etiqueta.desatualizadaEm ? ` em ${fmtDataHoraIso(etiqueta.desatualizadaEm)}` : ""}`);
      break;
    case "substituida":
      partes.push(`substituída por uma análise mais recente${etiqueta.substituidaEm ? ` em ${fmtDataHoraIso(etiqueta.substituidaEm)}` : ""}`);
      break;
    case "contestada":
      partes.push("marcada como incorreta por você");
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

/** "Ver detalhes": a camada de auditoria, fechada por padrão. Nativo
    (`<details>`), sem estado nosso, funciona com um toque no celular. */
export function VerDetalhes({
  titulo = "Ver detalhes",
  rotulo,
  children,
}: {
  titulo?: string;
  /** Nome acessível do bloco de detalhes. */
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <details className={styles.detalhes} data-detalhes>
      <summary>{titulo}</summary>
      <div className={styles.detalhesCorpo} aria-label={rotulo}>{children}</div>
    </details>
  );
}

/** O histórico derivado (§6.1 da V7): o que já foi percebido neste imóvel
    e não voltou a aparecer na passagem mais recente. Setembro disse "placa
    de aluga-se" e novembro não mencionou placa: a placa não é atual, e
    também não some. Sempre com a data em que foi visto. */
function explicarHistorica(etiqueta: EtiquetaDoImovel): string {
  const base = { ...etiqueta, confirmadaEm: null, desatualizadaEm: null, substituidaEm: null };
  if (etiqueta.estado === "inferida" || etiqueta.estado === "confirmada") {
    return explicarEtiqueta(base, { historica: true, vistoEm: etiqueta.ultimaVezObservado });
  }
  const quando = fmtDataHoraIso(etiqueta.ultimaVezObservado);
  return `${explicarEtiqueta(base)}${quando ? ` Visto em ${quando}.` : ""}`;
}

export function HistoricoEtiquetas({ historico }: { historico: EtiquetaDoImovel[] }) {
  if (!historico.length) return null;
  return (
    <ul className={styles.historicoEtiquetas} aria-label="Visto anteriormente">
      {historico.map((etiqueta) => (
        <li key={`${etiqueta.categoria}:${etiqueta.codigo}`} data-codigo={etiqueta.codigo}>
          <ChipEtiqueta etiqueta={etiqueta} historica />
          <small className={styles.explicacao}>{explicarHistorica(etiqueta)}</small>
        </li>
      ))}
    </ul>
  );
}
