/* ================================================================
   QUEM É A PESSOA, DEPOIS DE UMA FUSÃO — e como o novo resultado se
   compara com o legado.

   Duas regras puras que o shadow da atribuição (Fase 1a-C1) precisa e
   que não podem viver dentro de uma consulta: seguir a lápide de fusão
   até o contato sobrevivente, e classificar a comparação entre o imóvel
   que o webhook legado escolheu e o que o motor da 1a-B resolveu.

   A lápide existe no schema desde a 1a-A (`contatos.fundido_em_contato_id`,
   com o contato absorvido virando `arquivado_em` + ponteiro para o
   sobrevivente), mas a operação que a CRIA — a fusão humana — só nasce na
   1b. Em Production hoje há zero lápides. A semântica é reproduzida aqui
   porque o caminho precisa estar testado ANTES de existir dado real, não
   depois: é a diferença entre descobrir um ciclo em teste e descobrir
   numa mensagem de proprietário.

   Não é cópia da função SQL `private.resolver_contato_por_canal`: aquela
   resolve canal e lápide numa consulta só, com acesso ao banco. Aqui está
   só a travessia da cadeia, sobre dados já carregados, com três garantias
   que a versão SQL também tem: profundidade limitada, ciclo detectado e
   tenant nunca atravessado.
   ================================================================ */

/** Uma linha de `contatos`, no mínimo que a travessia precisa. */
export interface ContatoParaResolucao {
  id: string;
  userId: string;
  fundidoEmContatoId?: string | null;
}

export type FalhaResolucaoContato =
  /** A cadeia aponta para um contato que não veio no conjunto carregado. */
  | "contato-ausente"
  /** A cadeia volta a um contato já visitado. */
  | "ciclo"
  /** A cadeia é mais funda que o limite: dado inconsistente, não se adivinha. */
  | "profundidade-excedida"
  /** O sobrevivente é de outra conta. Nunca acontece com as FKs compostas
      da 1a-A; se acontecer, é corrupção e o shadow para. */
  | "tenant-divergente";

export type ResolucaoContato =
  | { ok: true; contatoId: string; saltos: number }
  | { ok: false; falha: FalhaResolucaoContato; saltos: number };

/** Teto da cadeia de fusões. Fusão é ato humano e rara; oito saltos é
    folga de sobra e transforma qualquer dado inconsistente em falha
    explícita em vez de laço infinito. */
export const MAX_SALTOS_FUSAO = 8;

/**
 * O contato sobrevivente a partir de um ponto de entrada.
 *
 * `porId` é o conjunto já carregado (a consulta é de quem chama). A função
 * é total: qualquer anomalia vira `ok: false` com o motivo, e quem chama
 * decide — no shadow, decidir é registrar e sair, deixando o legado seguir.
 */
export function resolverContatoSobrevivente(
  contatoId: string,
  userId: string,
  porId: ReadonlyMap<string, ContatoParaResolucao>,
): ResolucaoContato {
  const visitados = new Set<string>();
  let atual = contatoId;
  let saltos = 0;

  for (;;) {
    const contato = porId.get(atual);
    if (!contato) return { ok: false, falha: "contato-ausente", saltos };
    if (contato.userId !== userId) return { ok: false, falha: "tenant-divergente", saltos };
    if (visitados.has(atual)) return { ok: false, falha: "ciclo", saltos };
    visitados.add(atual);

    const proximo = contato.fundidoEmContatoId;
    if (!proximo) return { ok: true, contatoId: atual, saltos };
    if (saltos >= MAX_SALTOS_FUSAO) return { ok: false, falha: "profundidade-excedida", saltos };
    atual = proximo;
    saltos += 1;
  }
}

/* ----------------------------------------------------------------
   COMPARAÇÃO LEGADO × NOVO

   O shadow existe para produzir esta única palavra por mensagem. Ela é
   calculada aqui, e não montada no meio da rota, porque é o dado que vai
   sustentar a decisão de cutover: precisa ser estável, testada e legível
   depois, no `log_eventos`.
   ---------------------------------------------------------------- */

export type CategoriaComparacao =
  /** Legado e motor apontaram o mesmo imóvel. */
  | "concordante"
  /** Os dois resolveram, em imóveis diferentes. É o caso que o cutover
      mudaria de comportamento — e o que mais interessa medir. */
  | "divergente"
  /** O motor resolveu por referência a um imóvel terminal (histórico). */
  | "terminal-historico"
  /** O motor encontrou candidatos mas não evidência inequívoca. */
  | "novo-pendente"
  /** O contato existe, mas não há imóvel plausível vinculado. */
  | "novo-sem-candidatos"
  /** O telefone não resolveu contato no modelo relacional. */
  | "sem-contato-relacional"
  /** O shadow não pôde concluir (consulta, lápide ou motor falharam). */
  | "falha";

/** O resultado do motor, no mínimo que a comparação lê (evita acoplar
    este módulo ao formato inteiro da 1a-B). */
export interface ResultadoNovoParaComparacao {
  ok: boolean;
  imovelId?: string;
  terminal?: boolean;
  motivo?: "pendente" | "sem-candidatos";
}

export function classificarComparacao(
  legadoImovelId: string | null,
  novo: ResultadoNovoParaComparacao | null,
): CategoriaComparacao {
  if (!novo) return "sem-contato-relacional";
  if (novo.ok) {
    if (novo.terminal) return "terminal-historico";
    if (!legadoImovelId) return "divergente";
    return novo.imovelId === legadoImovelId ? "concordante" : "divergente";
  }
  return novo.motivo === "sem-candidatos" ? "novo-sem-candidatos" : "novo-pendente";
}
