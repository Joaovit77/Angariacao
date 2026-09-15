"use client";

/* Card do Catálogo Visual (C12): a foto é a protagonista; embaixo, só o
   que basta para reconhecer o imóvel (endereço, tipo, situação quando não
   é a normal, quando foi a foto, quantas passagens). Nenhuma ação além de
   abrir o detalhe do Garimpo, que continua sendo a fonte completa. */
import Image from "next/image";
import { useState } from "react";

import { timestampDeIso } from "@/lib/datas";
import type { ItemCatalogoVisual } from "@/lib/prospeccao";

import { ROTULOS_SITUACAO, enderecoDoIdentificado, tipoComMarca } from "./CardIdentificado";
import styles from "./Prospeccao.module.css";

/** A URL já vem assinada; o Next não deve reescrevê-la nem otimizar. */
function manterUrlAssinada({ src }: { src: string }): string {
  return src;
}

/** O que o card mostra, nesta ordem: o original assinado (nítido em
    qualquer DPR), a miniatura assinada se o original falhar, e por fim
    "Imagem indisponível". Trocar a fonte não troca a capa: a foto é a
    mesma, escolhida pela passagem. */
export function fonteDaImagemDoCard(
  urlOriginal: string | null,
  urlMiniatura: string | null,
  originalFalhou: boolean,
): { src: string; fonte: "original" | "miniatura" } | null {
  if (urlOriginal && !originalFalhou) return { src: urlOriginal, fonte: "original" };
  if (urlMiniatura) return { src: urlMiniatura, fonte: "miniatura" };
  return null;
}

export default function CardCatalogoVisual({
  item,
  urlOriginal,
  urlMiniatura,
  aoAbrir,
}: {
  item: ItemCatalogoVisual;
  /** URL assinada do original da capa; é a imagem principal do card. */
  urlOriginal: string | null;
  /** URL assinada da miniatura da capa; fallback quando o original falha. */
  urlMiniatura: string | null;
  aoAbrir: (id: string) => void;
}) {
  const { identificado, capa } = item;
  const [originalFalhou, setOriginalFalhou] = useState(false);
  const [miniaturaFalhou, setMiniaturaFalhou] = useState(false);
  const imagem = fonteDaImagemDoCard(urlOriginal, urlMiniatura, originalFalhou);
  const mostrarImagem = imagem && !(imagem.fonte === "miniatura" && miniaturaFalhou);
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
        {mostrarImagem ? (
          <Image
            key={imagem.fonte}
            loader={manterUrlAssinada}
            unoptimized
            src={imagem.src}
            alt=""
            width={1600}
            height={1200}
            loading="lazy"
            data-fonte-imagem={imagem.fonte}
            onError={() => {
              if (imagem.fonte === "original") setOriginalFalhou(true);
              else setMiniaturaFalhou(true);
            }}
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
