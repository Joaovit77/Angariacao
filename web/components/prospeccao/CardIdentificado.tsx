import type { EtiquetaDoImovel } from "@/lib/calculo/etiquetasProspeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { ImovelIdentificado } from "@/lib/prospeccao";

import EtiquetasImovel from "./EtiquetasImovel";
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

const MARCA_TIPO: Record<NonNullable<ImovelIdentificado["tipoEstado"]>, string> = {
  declarado: "",
  inferido: "IA",
  confirmado: "confirmado",
};

interface Props {
  identificado: ImovelIdentificado;
  selecionado: boolean;
  desabilitado?: boolean;
  etiquetasAtuais?: EtiquetaDoImovel[];
  aoSelecionar: (id: string) => void;
}

export default function CardIdentificado({
  identificado,
  selecionado,
  desabilitado = false,
  etiquetasAtuais = [],
  aoSelecionar,
}: Props) {
  const ultimaObservacao = fmtDataHoraIso(identificado.ultimoAvistamentoEm);
  return (
    <button
      type="button"
      className={`${styles.card}${selecionado ? ` ${styles.cardSelecionado}` : ""}`}
      disabled={desabilitado}
      aria-pressed={selecionado}
      onClick={() => aoSelecionar(identificado.id)}
    >
      <span className={styles.cardTopo}>
        <span className={styles.situacao}>{ROTULOS_SITUACAO[identificado.situacao]}</span>
        {identificado.exclusaoSolicitadaEm ? (
          <span className={styles.exclusaoPendente}>Exclusão pendente</span>
        ) : null}
        <span className={styles.tipo}>
          {identificado.tipo ?? "Tipo não definido"}
          {identificado.tipo && identificado.tipoEstado && MARCA_TIPO[identificado.tipoEstado]
            ? ` · ${MARCA_TIPO[identificado.tipoEstado]}`
            : ""}
        </span>
      </span>
      <strong className={styles.cardEndereco}>{enderecoDoIdentificado(identificado)}</strong>
      <span className={styles.cardMeta}>
        <span>
          {identificado.avistamentosTotal} avistamento
          {identificado.avistamentosTotal === 1 ? "" : "s"}
        </span>
        <span>{ultimaObservacao ? `Último em ${ultimaObservacao}` : "Sem avistamento"}</span>
      </span>
      {/* Só as etiquetas do avistamento corrente (§6.1): a lista chega já
          filtrada por `vigenteNoAvistamentoCorrente`, nunca a união de todos. */}
      <EtiquetasImovel etiquetas={etiquetasAtuais} rotulo="Etiquetas atuais" limite={3} />
    </button>
  );
}
