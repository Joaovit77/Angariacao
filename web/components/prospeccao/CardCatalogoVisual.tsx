"use client";

/* Card do Catálogo Visual (C12): a foto é a protagonista; embaixo, só o
   que basta para reconhecer o imóvel (endereço, tipo, situação quando não
   é a normal, quando foi a foto, quantas passagens). Nenhuma ação além de
   abrir o detalhe do Garimpo, que continua sendo a fonte completa. */
import Image from "next/image";

import { timestampDeIso } from "@/lib/datas";
import type { ItemCatalogoVisual } from "@/lib/prospeccao";

import { ROTULOS_SITUACAO, enderecoDoIdentificado, tipoComMarca } from "./CardIdentificado";
import styles from "./Prospeccao.module.css";

/** A URL já vem assinada; o Next não deve reescrevê-la nem otimizar. */
function manterUrlAssinada({ src }: { src: string }): string {
  return src;
}

export default function CardCatalogoVisual({
  item,
  urlMiniatura,
  aoAbrir,
}: {
  item: ItemCatalogoVisual;
  /** URL assinada da miniatura da capa; ausente = imagem indisponível. */
  urlMiniatura: string | null;
  aoAbrir: (id: string) => void;
}) {
  const { identificado, capa } = item;
  const situacao = ROTULOS_SITUACAO[identificado.situacao];
  // Só a data: no card a hora não ajuda a reconhecer o imóvel.
  const instante = timestampDeIso(capa.observadoEm);
  const quando = instante === null ? "" : new Date(instante).toLocaleDateString("pt-BR");
  const passagens = identificado.avistamentosTotal;

  return (
    <button
      type="button"
      className={styles.cardCatalogo}
      data-catalogo-card={identificado.id}
      data-capa-foto={capa.fotoId}
      data-capa-avistamento={capa.avistamentoId}
      onClick={() => aoAbrir(identificado.id)}
      aria-label={`Abrir ${enderecoDoIdentificado(identificado)}`}
    >
      <span className={styles.cardCatalogoFoto}>
        {urlMiniatura ? (
          <Image
            loader={manterUrlAssinada}
            unoptimized
            src={urlMiniatura}
            alt=""
            width={320}
            height={240}
            loading="lazy"
          />
        ) : (
          <span className={styles.imagemIndisponivel}>Imagem indisponível</span>
        )}
        {situacao ? <span className={styles.cardCatalogoSituacao}>{situacao}</span> : null}
      </span>
      <span className={styles.cardCatalogoTexto}>
        <strong className={styles.cardCatalogoEndereco}>{enderecoDoIdentificado(identificado)}</strong>
        <span className={styles.cardCatalogoMeta}>
          <span>{tipoComMarca(identificado)}</span>
          {quando ? <span data-capa-quando>Foto de {quando}</span> : null}
          {passagens > 1 ? <span>{passagens} passagens</span> : null}
        </span>
      </span>
    </button>
  );
}
