/* ================================================================
   O CUSTO DA IA — tokens viram dinheiro

   `ia_uso` grava o que foi OBSERVADO: modelo, tokens de entrada e de
   saída, tudo devolvido pela própria API. O preço não entra no banco
   (ver o comentário da tabela em supabase-schema.sql): ele muda por
   decisão da OpenAI, e um preço gravado congelaria as linhas antigas
   em valores de meses atrás. Aqui é onde o fato observado vira conta,
   na LEITURA — mesma disciplina de `resultadoObservado.ts`.

   A consequência boa: corrigir um preço errado é editar a constante
   abaixo, e todo o histórico do painel se corrige junto.

   REGRA QUE DÁ FORMA A ESTE MÓDULO: **modelo sem preço não vira
   número inventado.** `custoDaChamada` devolve null, o painel mostra
   os tokens e diz qual modelo falta cadastrar. É o mesmo princípio que
   fez a busca de endereço por IA ser reprovada: número com cara de
   procedência, e errado, é pior que a ausência do número — aqui ele
   apareceria numa tela de dinheiro, que é onde menos se confere.
   ================================================================ */

/** Preço de um modelo, em dólares por 1 MILHÃO de tokens (a unidade da
    tabela da OpenAI — não converta ao cadastrar). */
export interface PrecoModelo {
  entradaPor1M: number;
  saidaPor1M: number;
  /**
   * Preço do token de entrada que veio do CACHE — dez vezes menor no
   * gpt-5.4-mini ($0,075 contra $0,75).
   *
   * `undefined` quando o modelo não tem preço de cache publicado (é o
   * caso da transcrição). Aí o token cacheado é cobrado como entrada
   * normal: a API não vai reportar cache num modelo que não cacheia, e
   * se reportar, errar para MAIS é a direção segura numa tela de
   * dinheiro.
   */
  entradaCachePor1M?: number;
  /**
   * Data (ISO) em que alguém abriu a página de preços e conferiu, ou
   * null para "ainda não conferido".
   *
   * Existe porque este arquivo tem um jeito específico de envelhecer:
   * ninguém percebe. O painel continua somando, os números continuam
   * plausíveis, e a diferença só aparece na fatura. Com a data, a tela
   * marca o valor como não conferido em vez de exibi-lo com a mesma
   * autoridade de um preço verificado.
   */
  conferidoEm: string | null;
}

/**
 * Os modelos que este app realmente chama. Dois, hoje: o das rotas de
 * texto (`MODELO` em app/api/ia/route.ts, também usado pela
 * classificação em lib/servidor/ia.ts) e o da transcrição de áudio
 * (`MODELO_TRANSCRICAO` em app/api/whatsapp/_transcricao.ts). São
 * exatamente os dois liberados no projeto da OpenAI.
 *
 * Ao trocar de modelo lá, acrescente a linha aqui — o modelo antigo
 * FICA, senão o histórico daquele mês perde o custo.
 *
 * Conferidos em 2026-08-01 na página oficial de preços. O primeiro
 * palpite deste arquivo dizia 0,25 / 2,00 para o gpt-5.4-mini — três
 * vezes menos na entrada e duas vezes e pouco na saída. É a prova de
 * que o `conferidoEm` não é burocracia: sem ele, o painel teria
 * mostrado um terço da conta com toda a autoridade de um número exato.
 *
 * O CACHE DE ENTRADA é cobrado à parte, e não arredondado para o preço
 * cheio: a OpenAI cacheia sozinha prompts longos que se repetem e cobra
 * dez vezes menos por esses tokens. Ignorar isso fazia o painel errar
 * para mais — direção segura, mas errado do mesmo jeito, e numa tela de
 * dinheiro que ninguém confere.
 */
export const PRECOS: Record<string, PrecoModelo> = {
  "gpt-5.4-mini": {
    entradaPor1M: 0.75,
    entradaCachePor1M: 0.075,
    saidaPor1M: 4.5,
    conferidoEm: "2026-08-01",
  },
  // A API de transcrição não publica preço de cache (e não cacheia
  // áudio): sem `entradaCachePor1M`, token cacheado — se algum dia vier —
  // é cobrado como entrada normal.
  "gpt-4o-mini-transcribe-2025-12-15": {
    entradaPor1M: 1.25,
    saidaPor1M: 5.0,
    conferidoEm: "2026-08-01",
  },
};

/** Uma chamada registrada em `ia_uso`. */
export interface UsoIa {
  userId: string | null;
  tipo: string;
  modelo: string;
  /** Total de entrada, do jeito que a API reporta — **já inclui** os
      cacheados. Não é o valor líquido. */
  tokensEntrada: number;
  /** Quantos dos `tokensEntrada` vieram do cache. */
  tokensEntradaCache: number;
  tokensSaida: number;
  criadoEm: string;
}

/**
 * O custo em dólares, ou null quando o modelo não tem preço cadastrado.
 *
 * A sutileza que dá errado se ninguém escrever: `prompt_tokens` da
 * OpenAI **já inclui** os tokens cacheados. Então o cacheado se
 * SUBTRAI da entrada e é cobrado à parte — somar as duas parcelas
 * faturaria o mesmo token duas vezes.
 *
 * A subtração é protegida por `Math.max(0, …)`: se um dia a API
 * reportar mais cache do que entrada (contrato quebrado, campo mal
 * lido), o certo é a parcela cheia ir a zero, e não virar negativa
 * abatendo o custo do resto da conta.
 */
export function custoDaChamada(
  uso: Pick<UsoIa, "modelo" | "tokensEntrada" | "tokensSaida"> & { tokensEntradaCache?: number },
): number | null {
  const preco = PRECOS[uso.modelo];
  if (!preco) return null;

  // Sem preço de cache publicado, o cacheado é cobrado como entrada
  // normal — o que equivale a tratar o cache como zero.
  const cache = preco.entradaCachePor1M === undefined ? 0 : uso.tokensEntradaCache ?? 0;
  const cheios = Math.max(0, uso.tokensEntrada - cache);

  return (
    (cheios / 1_000_000) * preco.entradaPor1M +
    (cache / 1_000_000) * (preco.entradaCachePor1M ?? preco.entradaPor1M) +
    (uso.tokensSaida / 1_000_000) * preco.saidaPor1M
  );
}

/** Este modelo tem preço conferido por alguém? Falso também quando nem
    cadastrado está — as duas situações pedem o mesmo aviso na tela. */
export function precoConferido(modelo: string): boolean {
  return !!PRECOS[modelo]?.conferidoEm;
}

/** O gasto de um corretor num período. */
export interface GastoIa {
  userId: string | null;
  chamadas: number;
  tokensEntrada: number;
  /** Quantos dos `tokensEntrada` vieram do cache (cobrados 10x menos). */
  tokensEntradaCache: number;
  tokensSaida: number;
  /** Soma do que deu para calcular. */
  custoUsd: number;
  /** Chamadas cujo modelo não tem preço — o `custoUsd` as ignora. */
  chamadasSemPreco: number;
  /** Modelos sem preço cadastrado, para a tela dizer o que falta. */
  modelosSemPreco: string[];
  /** Algum modelo usado tem preço não conferido (ou nenhum preço). */
  temPrecoNaoConferido: boolean;
  /** Quanto foi gasto em quê — responde "o gasto foi em quê", não só "quanto". */
  porTipo: { tipo: string; chamadas: number; custoUsd: number }[];
}

const ZERO: Omit<GastoIa, "userId"> = {
  chamadas: 0,
  tokensEntrada: 0,
  tokensEntradaCache: 0,
  tokensSaida: 0,
  custoUsd: 0,
  chamadasSemPreco: 0,
  modelosSemPreco: [],
  temPrecoNaoConferido: false,
  porTipo: [],
};

/** O gasto de uma lista de chamadas, já somado. */
export function somarGasto(usos: UsoIa[], userId: string | null = null): GastoIa {
  const gasto: GastoIa = { ...ZERO, userId, modelosSemPreco: [], porTipo: [] };
  const porTipo = new Map<string, { chamadas: number; custoUsd: number }>();

  for (const uso of usos) {
    gasto.chamadas++;
    gasto.tokensEntrada += uso.tokensEntrada;
    gasto.tokensEntradaCache += uso.tokensEntradaCache;
    gasto.tokensSaida += uso.tokensSaida;

    const custo = custoDaChamada(uso);
    if (custo === null) {
      gasto.chamadasSemPreco++;
      if (!gasto.modelosSemPreco.includes(uso.modelo)) gasto.modelosSemPreco.push(uso.modelo);
    } else {
      gasto.custoUsd += custo;
    }
    if (!precoConferido(uso.modelo)) gasto.temPrecoNaoConferido = true;

    const atual = porTipo.get(uso.tipo) || { chamadas: 0, custoUsd: 0 };
    atual.chamadas++;
    atual.custoUsd += custo ?? 0;
    porTipo.set(uso.tipo, atual);
  }

  // Do mais caro para o mais barato: numa tela de custo, a pergunta é
  // sempre "o que está pesando".
  gasto.porTipo = [...porTipo.entries()]
    .map(([tipo, v]) => ({ tipo, ...v }))
    .sort((a, b) => b.custoUsd - a.custoUsd || b.chamadas - a.chamadas);

  return gasto;
}

/** Agrupa por corretor. A chave "" representa as chamadas de contas já
    removidas (`user_id` nulo por `on delete set null`) — que continuam
    valendo dinheiro e por isso não somem do total. */
export function gastoPorCorretor(usos: UsoIa[]): Map<string, GastoIa> {
  const porUsuario = new Map<string, UsoIa[]>();
  for (const uso of usos) {
    const chave = uso.userId ?? "";
    const lista = porUsuario.get(chave);
    if (lista) lista.push(uso);
    else porUsuario.set(chave, [uso]);
  }

  const saida = new Map<string, GastoIa>();
  for (const [chave, lista] of porUsuario) {
    saida.set(chave, somarGasto(lista, chave === "" ? null : chave));
  }
  return saida;
}

/**
 * Dólar com casas suficientes para o valor não virar "US$ 0,00".
 *
 * Uma chamada de IA custa frações de centavo, e é justamente o volume
 * dessas frações que a tela precisa mostrar. Arredondar em 2 casas
 * transformaria "este corretor fez 300 chamadas" em três zeros e a
 * coluna inteira em ruído.
 */
export function fmtUsd(valor: number): string {
  const casas = valor > 0 && valor < 0.01 ? 4 : 2;
  return `US$ ${valor.toFixed(casas).replace(".", ",")}`;
}
