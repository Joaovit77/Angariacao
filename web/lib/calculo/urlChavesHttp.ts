import { idDoAnuncio, idExternoEhFallback } from "./centralAngariacao";

const ORIGEM_CHAVES = "https://www.chavesnamao.com.br";

/** Aceita somente o formato de href de card comprovado na amostra HTTP. */
export function urlAbsolutaDoCardChaves(href: string, idExterno: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//") || /[\\\s\u0000-\u001f%?#]/.test(href)) return null;
  if (!/^\/imovel\/.+\/id-\d{6,}\/?(?:[?#].*)?$/.test(href)) return null;
  if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(href.split(/[?#]/, 1)[0])) return null;
  const idDaRota = href.match(/\/id-(\d{6,})\/?$/)?.[1];
  if (!idDaRota || idDaRota !== idExterno || idExternoEhFallback("chaves-na-mao", idExterno)) return null;
  try {
    const url = new URL(href, ORIGEM_CHAVES);
    if (url.protocol !== "https:" || url.origin !== ORIGEM_CHAVES
      || !/^\/imovel\/.+\/id-\d{6,}\/?$/.test(url.pathname)) return null;
    if (idDoAnuncio("chaves-na-mao", href, 0) !== idExterno
      || idDoAnuncio("chaves-na-mao", url.toString(), 0) !== idExterno) return null;
    return url.toString();
  } catch {
    return null;
  }
}
