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

/* --- Caixa de nome próprio --------------------------------------------------
   Nome copiado de portal/contrato costuma vir em CAIXA ALTA. Além de gritar na
   tela, ele entra na saudação das mensagens — "Olá, JOÃO DA SILVA!" —, que é
   onde o problema fica visível para o proprietário, não só para o corretor. */

/** Partículas que ficam minúsculas no MEIO do nome: "João da Silva", não
    "João Da Silva". É o que title case ingênuo erra em quase todo nome
    brasileiro. No começo do nome elas são capitalizadas normalmente. */
const PARTICULAS = new Set([
  "de", "da", "do", "das", "dos", "e",
  // Estrangeiras que aparecem em sobrenome brasileiro.
  "di", "du", "del", "della", "la", "le", "van", "von", "y",
]);

/**
 * Ajusta a caixa de um nome próprio.
 *
 * Só age quando a caixa NÃO carrega informação — o texto todo em maiúsculas ou
 * todo em minúsculas. Caixa mista é escolha de quem digitou e fica intocada:
 * "Maria McDonald" e "Imóveis MEI" seriam estragados por uma normalização
 * cega, e não há como distinguir isso de um erro de digitação.
 *
 * Por isso também é idempotente e seguro de rodar de novo: o resultado é misto,
 * então uma segunda passagem não mexe mais nele — e uma correção manual feita
 * depois sobrevive.
 */
export function nomeProprio(valor: string | null | undefined): string {
  const limpo = limpar(valor);
  if (!limpo) return "";

  const temMinuscula = /\p{Ll}/u.test(limpo);
  const temMaiuscula = /\p{Lu}/u.test(limpo);
  if (temMinuscula && temMaiuscula) return limpo;

  return limpo
    .split(" ")
    .map((palavra, i) => {
      const base = palavra.toLocaleLowerCase("pt-BR");
      const semPonto = base.replace(/\.$/, "");

      // Partícula no meio do nome. Vem antes do teste de inicial de propósito:
      // o "e" solto é muito mais comum como partícula ("Silva e Filhos") do que
      // como inicial do meio, e os dois casos são indistinguíveis aqui.
      if (i > 0 && PARTICULAS.has(semPonto)) return base;

      // Inicial isolada ("J", "J.") é abreviação, não palavra — segue maiúscula.
      if (/^\p{L}\.?$/u.test(palavra)) return palavra.toLocaleUpperCase("pt-BR");

      // Capitaliza no início e depois de hífen/apóstrofo, para "Ana-Maria" e
      // "D'Ávila" não saírem como "Ana-maria" e "D'ávila".
      return base.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, letra: string) =>
        sep + letra.toLocaleUpperCase("pt-BR"),
      );
    })
    .join(" ");
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
 * O valor mais usado da lista, já na grafia dominante do seu grupo. Agrupa
 * pela chave normalizada, então "João Vitor" e "joao vitor" contam juntos.
 * Ignora vazios; empate fica com o grupo visto primeiro. Devolve "" quando
 * não há nenhum valor — quem chama decide o que fazer com isso.
 */
export function valorMaisUsado(valores: (string | null | undefined)[]): string {
  const porChave = new Map<string, Map<string, number>>();
  const totalPorChave = new Map<string, number>();
  for (const v of valores) {
    const grafia = limpar(v);
    if (!grafia) continue;
    const chave = chaveNormalizada(grafia);
    const m = porChave.get(chave) ?? new Map<string, number>();
    m.set(grafia, (m.get(grafia) || 0) + 1);
    porChave.set(chave, m);
    totalPorChave.set(chave, (totalPorChave.get(chave) || 0) + 1);
  }

  let melhorChave = "";
  let melhorN = 0;
  for (const [chave, n] of totalPorChave) {
    if (n > melhorN) {
      melhorChave = chave;
      melhorN = n;
    }
  }
  const grupo = porChave.get(melhorChave);
  return grupo ? grafiaDominante(grupo) : "";
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
