/* ================================================================
   Normalização de nomes livres (imobiliária concorrente, captador).

   Campos digitados à mão viram duplicata por bobagem: acento, caixa,
   espaço a mais ("Imob Silva" vs "imob  silva" vs "Imób Sílva"). Isso
   suja os agrupamentos — fonte do garimpo nos Insights, filtro de
   captador no Pipeline. Aqui mora a regra única de comparação: dois
   valores são "o mesmo" quando têm a mesma CHAVE normalizada.

   Núcleo puro: sem React/Next/Supabase (regra do CLAUDE.md).
   ================================================================ */

/** Colapsa espaços internos e apara as pontas, sem mexer no resto. */
function limpar(valor: string | null | undefined): string {
  return (valor || "").replace(/\s+/g, " ").trim();
}

/**
 * Chave de comparação: minúsculas, sem acento e com espaços colapsados.
 * "  Imóbiliária  Silva " e "imobiliaria silva" caem na mesma chave.
 * Preserva a grafia real em outro lugar — isto é só para comparar.
 */
export function chaveNormalizada(valor: string | null | undefined): string {
  return limpar(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove os acentos separados pelo NFD
    .toLowerCase();
}

/** Grafia mais frequente em `m` (mapa grafia→contagem); empate mantém a 1ª. */
function grafiaDominante(m: Map<string, number>): string {
  let melhor = "";
  let melhorN = -1;
  for (const [grafia, n] of m) {
    if (n > melhorN) {
      melhor = grafia;
      melhorN = n;
    }
  }
  return melhor;
}

/**
 * Devolve a grafia "oficial" para `valor`: se ele casar (pela chave) com
 * valores já existentes, usa a grafia mais usada entre eles; senão, devolve
 * o próprio valor apenas limpo (espaços colapsados/aparados). É o que evita
 * criar um novo jeito de escrever a mesma imobiliária/captador.
 */
export function canonizarValor(
  valor: string | null | undefined,
  existentes: (string | null | undefined)[],
): string {
  const limpo = limpar(valor);
  const chave = chaveNormalizada(limpo);
  if (!chave) return limpo;

  const contagem = new Map<string, number>();
  for (const e of existentes) {
    const grafia = limpar(e);
    if (!grafia || chaveNormalizada(grafia) !== chave) continue;
    contagem.set(grafia, (contagem.get(grafia) || 0) + 1);
  }
  return contagem.size ? grafiaDominante(contagem) : limpo;
}

/**
 * Lista de sugestões sem duplicatas por chave: para cada grupo de variações,
 * mantém a grafia dominante. Ordena em pt-BR. Serve para datalists.
 */
export function distintosCanonizados(valores: (string | null | undefined)[]): string[] {
  const porChave = new Map<string, Map<string, number>>();
  for (const v of valores) {
    const grafia = limpar(v);
    if (!grafia) continue;
    const chave = chaveNormalizada(grafia);
    const m = porChave.get(chave) ?? new Map<string, number>();
    m.set(grafia, (m.get(grafia) || 0) + 1);
    porChave.set(chave, m);
  }
  return [...porChave.values()]
    .map(grafiaDominante)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
