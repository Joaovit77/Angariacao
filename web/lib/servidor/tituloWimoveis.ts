/** Remove somente nomes técnicos de imagem no início do alt dos cards Wimoveis. */
const PREFIXO_ASSET = /^(?:[a-f\d]{24,}|[a-f\d]{8,}(?:-[a-f\d]{4,}){2,})(?:\.(?:jpe?g|png|webp))?\s+·\s+(.+)$/i;

export function tituloWimoveis(alt: string): string {
  const conteudo = alt.match(PREFIXO_ASSET)?.[1]?.trim();
  return conteudo && /[a-zA-ZÀ-ÿ]{3}/.test(conteudo) ? conteudo : alt;
}
