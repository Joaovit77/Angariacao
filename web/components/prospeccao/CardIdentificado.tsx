import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import type { EtiquetaDoImovel } from "@/lib/calculo/etiquetasProspeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { ImovelIdentificado } from "@/lib/prospeccao";

import styles from "./Prospeccao.module.css";

const ROTULOS_SITUACAO: Record<ImovelIdentificado["situacao"], string> = {
  identificado: "Identificado",
  investigando: "Investigando",
  promovendo: "Promovendo",
  promovido: "Promovido",
  descartado: "Descartado",
  fundido: "Fundido",
};

function enderecoDoIdentificado(identificado: ImovelIdentificado): string {
  const endereco = [identificado.logradouro, identificado.numero].filter(Boolean).join(", ");
  const local = [identificado.bairro, identificado.cidade, identificado.estado]
    .filter(Boolean)
    .join(" · ");
  return [endereco, local].filter(Boolean).join(" — ")
    || identificado.pontoReferencia
    || "Local ainda sem endereço";
}

function rotuloEtiqueta(etiqueta: EtiquetaDoImovel): string {
  return obterEtiquetaCatalogo(etiqueta.categoria, etiqueta.codigo)?.rotulo ?? etiqueta.codigo;
}

interface Props {
  identificado: ImovelIdentificado;
  selecionado: boolean;
  etiquetasAtuais?: EtiquetaDoImovel[];
  aoSelecionar: (id: string) => void;
}

export default function CardIdentificado({
  identificado,
  selecionado,
  etiquetasAtuais = [],
  aoSelecionar,
}: Props) {
  const ultimaObservacao = fmtDataHoraIso(identificado.ultimoAvistamentoEm);
  return (
    <button
      type="button"
      className={`${styles.card}${selecionado ? ` ${styles.cardSelecionado}` : ""}`}
      aria-pressed={selecionado}
      onClick={() => aoSelecionar(identificado.id)}
    >
      <span className={styles.cardTopo}>
        <span className={styles.situacao}>{ROTULOS_SITUACAO[identificado.situacao]}</span>
        <span className={styles.tipo}>{identificado.tipo ?? "Tipo não definido"}</span>
      </span>
      <strong className={styles.cardEndereco}>{enderecoDoIdentificado(identificado)}</strong>
      <span className={styles.cardMeta}>
        <span>
          {identificado.avistamentosTotal} avistamento
          {identificado.avistamentosTotal === 1 ? "" : "s"}
        </span>
        <span>{ultimaObservacao ? `Último em ${ultimaObservacao}` : "Sem avistamento"}</span>
      </span>
      {etiquetasAtuais.length ? (
        <span className={styles.chips} aria-label="Etiquetas atuais">
          {etiquetasAtuais.slice(0, 3).map((etiqueta) => (
            <span className={styles.chip} key={`${etiqueta.categoria}:${etiqueta.codigo}`}>
              {rotuloEtiqueta(etiqueta)}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
