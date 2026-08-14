import { Fragment, type ReactNode } from "react";
import styles from "./Assistente.module.css";

const TOKEN_INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
const ITEM_NAO_ORDENADO = /^\s*[-*]\s+(.+)$/;
const ITEM_ORDENADO = /^\s*\d+[.)]\s+(.+)$/;

function renderizarInline(texto: string): ReactNode[] {
  return texto.split(TOKEN_INLINE).filter(Boolean).map((trecho, indice) => {
    if (trecho.startsWith("**") && trecho.endsWith("**")) return <strong key={indice}>{trecho.slice(2, -2)}</strong>;
    if (trecho.startsWith("`") && trecho.endsWith("`")) return <code key={indice}>{trecho.slice(1, -1)}</code>;
    if ((trecho.startsWith("*") && trecho.endsWith("*")) || (trecho.startsWith("_") && trecho.endsWith("_"))) {
      return <em key={indice}>{trecho.slice(1, -1)}</em>;
    }
    return <Fragment key={indice}>{trecho}</Fragment>;
  });
}

function paragrafo(linhas: string[], chave: string) {
  return <p key={chave}>{linhas.map((linha, indice) => <Fragment key={indice}>{indice > 0 && <br />}{renderizarInline(linha)}</Fragment>)}</p>;
}

/** Markdown deliberadamente pequeno: cria somente elementos React conhecidos. */
export default function TextoMarkdownSeguro({ texto }: { texto: string }) {
  const linhas = texto.replaceAll("\r\n", "\n").split("\n");
  const blocos: ReactNode[] = [];
  let indice = 0;
  while (indice < linhas.length) {
    if (!linhas[indice].trim()) { indice += 1; continue; }

    const itemNaoOrdenado = linhas[indice].match(ITEM_NAO_ORDENADO);
    if (itemNaoOrdenado) {
      const itens: string[] = [];
      while (indice < linhas.length) {
        const item = linhas[indice].match(ITEM_NAO_ORDENADO);
        if (!item) break;
        itens.push(item[1]);
        indice += 1;
      }
      blocos.push(<ul key={`ul-${indice}`}>{itens.map((item, itemIndice) => <li key={itemIndice}>{renderizarInline(item)}</li>)}</ul>);
      continue;
    }

    const itemOrdenado = linhas[indice].match(ITEM_ORDENADO);
    if (itemOrdenado) {
      const itens: string[] = [];
      while (indice < linhas.length) {
        const item = linhas[indice].match(ITEM_ORDENADO);
        if (!item) break;
        itens.push(item[1]);
        indice += 1;
      }
      blocos.push(<ol key={`ol-${indice}`}>{itens.map((item, itemIndice) => <li key={itemIndice}>{renderizarInline(item)}</li>)}</ol>);
      continue;
    }

    const paragrafoLinhas: string[] = [];
    while (indice < linhas.length && linhas[indice].trim() && !ITEM_NAO_ORDENADO.test(linhas[indice]) && !ITEM_ORDENADO.test(linhas[indice])) {
      paragrafoLinhas.push(linhas[indice]);
      indice += 1;
    }
    blocos.push(paragrafo(paragrafoLinhas, `p-${indice}`));
  }

  return <div className={styles.markdown}>{blocos}</div>;
}
