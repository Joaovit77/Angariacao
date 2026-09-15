/* O card responde rápido: qual imóvel, onde, que tipo, o que sabemos
   agora, quando foi a última passagem e se há algo pedindo atenção. Não é
   painel de IA: proveniência, revisão e histórico ficam no detalhe.

   Limitação real (não resolvida aqui): as etiquetas atuais só estão
   carregadas para o card selecionado (a lista chega já filtrada por
   `vigenteNoAvistamentoCorrente`, nunca a união). O card não promete dado
   que não tem: sem etiquetas recebidas, nenhum indicador de atenção. */
import type { EtiquetaDoImovel } from "@/lib/calculo/etiquetasProspeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { ImovelIdentificado } from "@/lib/prospeccao";

import EtiquetasImovel from "./EtiquetasImovel";
import styles from "./Prospeccao.module.css";

/** Situação em palavras. `identificado` é o caso normal e não aparece. */
export const ROTULOS_SITUACAO: Record<ImovelIdentificado["situacao"], string> = {
  identificado: "",
  investigando: "Em investigação",
  promovendo: "Em promoção",
  promovido: "Promovido",
  descartado: "Descartado",
  fundido: "Unido a outro registro",
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

/** "Casa · sugestão" / "Casa · confirmado" / "Casa" (informado por você). */
export const MARCA_TIPO: Record<NonNullable<ImovelIdentificado["tipoEstado"]>, string> = {
  declarado: "",
  inferido: "sugestão",
  confirmado: "confirmado",
};

export function tipoComMarca(identificado: Pick<ImovelIdentificado, "tipo" | "tipoEstado">): string {
  if (!identificado.tipo) return "Tipo não definido";
  const marca = identificado.tipoEstado ? MARCA_TIPO[identificado.tipoEstado] : "";
  return marca ? `${identificado.tipo} · ${marca}` : identificado.tipo;
}

export function resumoPassagens(identificado: Pick<ImovelIdentificado, "avistamentosTotal" | "ultimoAvistamentoEm">): string {
  const ultima = fmtDataHoraIso(identificado.ultimoAvistamentoEm);
  const total = identificado.avistamentosTotal;
  const contagem = `${total} passage${total === 1 ? "m" : "ns"}`;
  return ultima ? `${contagem} · última em ${ultima}` : total ? contagem : "Sem passagem registrada";
}

/** Indicador de atenção a partir do que o card TEM: sugestões não
    confirmadas entre as etiquetas atuais recebidas. */
export function sugestoesAConfirmar(etiquetas: Pick<EtiquetaDoImovel, "estado" | "origem">[]): number {
  return etiquetas.filter((etiqueta) => etiqueta.estado === "inferida" && etiqueta.origem !== "manual").length;
}

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
  const situacao = ROTULOS_SITUACAO[identificado.situacao];
  const aConfirmar = sugestoesAConfirmar(etiquetasAtuais);
  return (
    <button
      type="button"
      className={`${styles.card}${selecionado ? ` ${styles.cardSelecionado}` : ""}`}
      disabled={desabilitado}
      aria-pressed={selecionado}
      onClick={() => aoSelecionar(identificado.id)}
    >
      <span className={styles.cardTopo}>
        {situacao ? <span className={styles.situacao}>{situacao}</span> : null}
        {identificado.exclusaoSolicitadaEm ? (
          <span className={styles.exclusaoPendente}>Exclusão pendente</span>
        ) : null}
        <span className={styles.tipo}>{tipoComMarca(identificado)}</span>
      </span>
      <strong className={styles.cardEndereco}>{enderecoDoIdentificado(identificado)}</strong>
      <span className={styles.cardMeta}>
        <span>{resumoPassagens(identificado)}</span>
      </span>
      {/* Só as etiquetas da passagem mais recente (§6.1): a lista chega já
          filtrada por `vigenteNoAvistamentoCorrente`, nunca a união de todos. */}
      <EtiquetasImovel etiquetas={etiquetasAtuais} rotulo="O que sabemos agora" limite={3} />
      {aConfirmar > 0 ? (
        <span className={styles.atencaoCurta} data-atencao="sugestoes">
          {aConfirmar === 1 ? "1 sugestão a confirmar" : `${aConfirmar} sugestões a confirmar`}
        </span>
      ) : null}
    </button>
  );
}
