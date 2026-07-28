/* ================================================================
   META DO MÊS — o fallback, a herança e a cobrança (parte pura)

   Na virada do mês o painel ficava mudo. `metas` é um Record por
   "YYYY-MM", e no dia 1º a chave do mês novo simplesmente não existe:
   as views caíam num literal `{ angariacoes: 0, ... }` (repetido em
   três arquivos), `projetarMeta` recebia alvo 0 e devolvia
   `situacao: "sem-meta"`, e o card de meta passava o mês inteiro
   exibindo "0 de 0" sem nada explicar. Nenhuma tela pedia a meta nova.

   O efeito colateral caro era invisível: a medalha "Constância de
   Ferro" exige 3 meses CONSECUTIVOS batidos, e
   `mesesComMetaDeAngariacaoBatida` só percorre as chaves que existem
   em `metas`. Um mês sem meta cadastrada não conta como perdido —
   ele não existe, quebra a sequência, e não há como recuperá-lo
   depois. Perde-se a medalha por esquecimento, não por desempenho.

   Este módulo resolve as três pontas disso:

   - `metaDoMes` — o fallback num lugar só (era literal em três).
   - `metaSugerida` — o que PRÉ-PREENCHER no modal do mês novo.
   - `precisaDefinirMeta` — a cobrança na tela.

   **A herança pré-preenche, não se aplica sozinha.** Um mês novo NÃO
   nasce com a meta do anterior já valendo, e isso é decisão de
   desenho, não limitação: `metas` é o registro do que o corretor
   ESCOLHEU perseguir, e uma meta que se autocriou faria o painel
   afirmar um alvo que ninguém definiu. A medalha de constância viraria
   automática — premiando 3 meses de inércia como se fossem 3 meses de
   decisão. É a mesma regra que o resto do app já segue: a IA sugere e
   o corretor confirma; o follow-up em lote não pré-seleciona a
   abordagem recomendada, para o ranking não se autoconfirmar.

   Puro: só tipos e helpers de data. Sem React/Next/Supabase/store.
   ================================================================ */
import { shiftMonthKey } from "../datas";
import { fmtMoney } from "../formatadores";
import type { Meta, Metas } from "../tipos";

/** Meta "não definida". Todo campo zero — é o mesmo que não existir, e
    `temMeta` trata os dois casos igual. */
export const META_VAZIA: Meta = { angariacoes: 0, locados: 0, comissao: 0, faturamento: 0 };

/** Quantos meses para trás procurar uma meta anterior ao sugerir a herança.
    Um ano cobre o corretor que passou uns meses sem definir meta e voltou;
    mais que isso já não é "o que eu vinha perseguindo", é arqueologia. */
export const MESES_BUSCA_META_ANTERIOR = 12;

/** A meta do mês, com o fallback vazio. Fonte única do literal que estava
    repetido em MetasView, HomeView e ModalMeta. */
export function metaDoMes(metas: Metas, mKey: string): Meta {
  return metas[mKey] || META_VAZIA;
}

/** A meta diz alguma coisa? Zero em tudo é indistinguível de não ter meta —
    e é assim que as telas já se comportavam. */
export function temMeta(meta: Meta | null | undefined): boolean {
  if (!meta) return false;
  return meta.angariacoes > 0 || meta.locados > 0 || meta.comissao > 0 || meta.faturamento > 0;
}

/** O mês mais recente ANTES de `mKey` que tem meta definida, ou null.
    Anda para trás mês a mês em vez de ordenar as chaves porque o que
    interessa é a meta mais próxima no tempo, não a maior chave. */
export function mesAnteriorComMeta(
  metas: Metas,
  mKey: string,
  limite = MESES_BUSCA_META_ANTERIOR,
): string | null {
  let k = mKey;
  for (let i = 0; i < limite; i++) {
    k = shiftMonthKey(k, -1);
    if (temMeta(metas[k])) return k;
  }
  return null;
}

/** De onde veio o pré-preenchimento — a UI mostra isso para o número não
    aparecer do nada no formulário. */
export interface MetaSugerida {
  /** Mês de origem ("YYYY-MM"). */
  mesOrigem: string;
  meta: Meta;
}

/**
 * A meta a PRÉ-PREENCHER quando o mês corrente ainda não tem uma.
 *
 * null quando o mês já tem meta (não há o que sugerir — o modal edita a que
 * existe) ou quando não há nenhuma meta anterior (o corretor nunca usou metas,
 * e inventar números para ele seria pior que o formulário vazio).
 */
export function metaSugerida(metas: Metas, mKey: string): MetaSugerida | null {
  if (temMeta(metas[mKey])) return null;
  const origem = mesAnteriorComMeta(metas, mKey);
  if (!origem) return null;
  return { mesOrigem: origem, meta: metas[origem] };
}

/**
 * A meta em uma linha curta, para lembrar o corretor do que ele vinha
 * perseguindo ("10 angariações", "R$ 1.200 de comissão").
 *
 * Escolhe o PRIMEIRO campo preenchido, na ordem de importância do painel, em
 * vez de assumir angariações: uma meta definida só em comissão renderizaria
 * "0 angariações" — um número que a tela mostraria como se fosse o alvo dele.
 * Devolve "" para meta vazia, e quem chama já testou `temMeta` antes.
 */
export function resumoMetaCurto(meta: Meta): string {
  if (meta.angariacoes > 0) return `${meta.angariacoes} angariações`;
  if (meta.locados > 0) return `${meta.locados} imóveis locados`;
  if (meta.comissao > 0) return `${fmtMoney(meta.comissao)} de comissão`;
  if (meta.faturamento > 0) return `${fmtMoney(meta.faturamento)} de faturamento`;
  return "";
}

/**
 * O mês corrente está sem meta e isso merece cobrança na tela?
 *
 * Só cobra quem JÁ USOU metas antes. Quem nunca definiu nenhuma não está
 * esquecendo nada — não aderiu ao recurso, e transformar isso em alerta
 * permanente seria o app inventando um hábito que o corretor não escolheu.
 * Já quem definiu a meta do mês passado e não definiu a deste tem uma lacuna
 * real, com consequência real (a sequência da medalha).
 *
 * Não há estado de "dispensar" no banco de propósito: o aviso some sozinho no
 * instante em que a meta é salva, que é exatamente a ação pedida.
 */
export function precisaDefinirMeta(metas: Metas, mKey: string): boolean {
  if (temMeta(metas[mKey])) return false;
  return mesAnteriorComMeta(metas, mKey) !== null;
}
