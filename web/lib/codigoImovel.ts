/* ================================================================
   Sugestão automática de código do imóvel.

   Ao abrir "Nova angariação", o campo "Código do imóvel" já vem
   preenchido com o próximo número no padrão PREFIXO-NÚMERO (ex.:
   LD-0234 → LD-0235), agilizando o cadastro. É só uma sugestão —
   o corretor pode editar ou apagar.

   Núcleo puro: sem React/Next/Supabase (regra do CLAUDE.md).
   ================================================================ */
import type { Imovel } from "./tipos";

/** Prefixo do código interno do Angario. */
export const PREFIXO_CODIGO_INTERNO = "LD-";

/** Letras do prefixo padrão (ex.: "LD-" → "LD"). */
function letrasDoPrefixo(prefixo: string): string {
  return (prefixo.match(/[A-Za-z]+/) || ["LD"])[0].toUpperCase();
}

/** Código no padrão PREFIXO-NÚMERO, com ou sem separador. */
const PADRAO_CODIGO = /^([A-Za-z]+)[-\s]?(\d+)$/;

/**
 * O valor tem o formato do código interno que `sugerirCodigoImovel` gera
 * ("LD-146", "ld 146", "LD146"). Esse código só existe dentro do Angario:
 * nunca é referência pública de anúncio.
 */
export function ehCodigoInternoAngario(valor: string, prefixo = PREFIXO_CODIGO_INTERNO): boolean {
  const m = valor.trim().match(PADRAO_CODIGO);
  return Boolean(m && m[1].toUpperCase() === letrasDoPrefixo(prefixo));
}

/**
 * Sugere o próximo código de imóvel no padrão `PREFIXO-NÚMERO`,
 * inferindo a largura do zero-padding dos códigos já cadastrados.
 * Considera apenas os códigos cujo prefixo (só as letras, sem ligar
 * para maiúsculas/minúsculas ou separador) casa com o prefixo padrão.
 * Sem nenhum código no padrão, começa em `LD-0001`.
 */
export function sugerirCodigoImovel(
  imoveis: Pick<Imovel, "codigo">[],
  prefixoPadrao = PREFIXO_CODIGO_INTERNO,
): string {
  const letras = letrasDoPrefixo(prefixoPadrao);
  let maxNum = 0;
  // Largura padrão de dois dígitos (LD-01, LD-02, ...); se já houver
  // códigos com mais dígitos, preserva a maior largura encontrada.
  let largura = 2;

  for (const im of imoveis) {
    const cod = (im.codigo || "").trim();
    const m = cod.match(PADRAO_CODIGO);
    if (!m || m[1].toUpperCase() !== letras) continue;
    const n = parseInt(m[2], 10);
    if (Number.isNaN(n)) continue;
    if (n > maxNum) maxNum = n;
    largura = Math.max(largura, m[2].length);
  }

  return `${prefixoPadrao}${String(maxNum + 1).padStart(largura, "0")}`;
}
