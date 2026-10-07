/* ================================================================
   PORTÃO DE EFEITOS, EM MODO DE DECISÃO (Fase 1a-C3-A1)

   Depois de a mensagem ser gravada, o webhook executa quatro efeitos
   operacionais no imóvel escolhido: conclui os follow-ups do Assistente,
   anota a tentativa pendente, encerra o imóvel quando a resposta diz que
   acabou e cria ou completa o compromisso na agenda. Hoje todos rodam em
   qualquer atribuição. O contrato do portão (plano aprovado da Fase 1,
   Revisão 3, §R3.1 a §R3.4) diz quando cada um deveria rodar:

   - atribuição segura (único, referência explícita, contexto de
     tentativa, contexto de agendamento) a um imóvel não terminal libera;
   - atribuição pendente e qualquer atribuição a imóvel terminal
     suprimem, e a mensagem continua gravada como histórico;
   - a resposta a uma retomada (Retirados B3) é a exceção: libera tudo
     menos o encerramento, que o B0 já fecha.

   Este módulo só DEVOLVE o veredito. Ninguém o chama ainda: o C3-A2 vai
   registrá-lo ao lado do que o webhook de fato fez, sem mudar efeito
   nenhum, e só o C3-B passa a obedecê-lo. Por isso existe o terceiro
   veredito, `indefinido`: ele marca os casos em que o contrato ainda não
   decidiu (sem contato relacional, falha da resolução, categoria nova) e
   NÃO é comportamento. Não é falhar aberto nem fechado; é "a regra não
   existe".

   Fora do portão, de propósito: a gravação da nota, a transcrição e a
   classificação da IA. O contrato as mantém mesmo na pendência (é a
   classificação que fica guardada para aplicar depois).

   O que NÃO está aqui: onde guardar uma mensagem pendente, quem resolve,
   a tela, a reatribuição e a fila de efeitos pendentes. Isso é C3-C e
   1a-D.

   Terminal chega pronto, como booleano: quem chama traduz o status pela
   régua da atribuição (`ehImovelTerminalParaAtribuicao`: Perdido,
   Cancelado, Locado ou retirado; "Sem resposta" é plausível). Assim a
   lista de status não é copiada aqui.

   Módulo PURO: sem Supabase, sem fetch, sem log, sem relógio, sem
   aleatoriedade e sem env. A saída é JSON simples, só com vocabulário
   fechado: nada de id, telefone, nome, endereço ou texto.
   ================================================================ */
import type { NivelAtribuicao } from "./atribuicaoMensagem";
import type { CategoriaComparacao } from "./resolucaoContato";

export const VERSAO_PORTAO_EFEITOS = 1 as const;

/** Os quatro efeitos que o contrato põe atrás do portão, na ordem em que o
    webhook os executa. */
export const EFEITOS_PORTAO = ["followup", "tentativa", "encerramento", "agenda"] as const;
export type EfeitoPortao = (typeof EFEITOS_PORTAO)[number];

export type VereditoEfeito = "liberaria" | "suprimiria" | "indefinido";

/** Por que o veredito saiu assim. Vocabulário fechado e estável, porque
    vai para telemetria. */
export type MotivoPortao =
  /** Atribuição segura num imóvel vivo. */
  | "autoridade-segura"
  /** O imóvel que receberia o efeito é terminal, ou a mensagem foi
      atribuída a um terminal (referência histórica). */
  | "terminal-historico"
  /** Resposta a uma retomada enviada: o retirado recebe os efeitos. */
  | "retomada-autorizada"
  /** Resposta a uma retomada: o encerramento continua fechado (B0). */
  | "retomada-sem-encerramento"
  /** Vários candidatos plausíveis, nenhum contexto inequívoco. */
  | "atribuicao-pendente"
  /** O contato existe, mas nenhum imóvel plausível vinculado. */
  | "sem-candidatos"
  /** Telefone sem contato relacional: regra ainda não decidida (D5). */
  | "sem-contato-regra-pendente"
  /** Resolução falhou: regra ainda não decidida (D6). */
  | "falha-regra-pendente"
  /** Categoria que este módulo não conhece. */
  | "categoria-desconhecida"
  /** Categoria segura, mas quem ficou com a autoridade não foi o motor. */
  | "autoridade-inconsistente"
  /** Categoria segura com um nível fora da lista dos níveis seguros. */
  | "nivel-nao-seguro"
  /** Não se sabe se o imóvel que receberia o efeito é terminal. */
  | "terminal-desconhecido";

export interface AvaliacaoEfeito {
  decisao: VereditoEfeito;
  motivo: MotivoPortao;
}

/** O mínimo que o portão precisa saber. Tudo vem da atribuição que o
    webhook já calcula; nenhum dado de pessoa ou de conversa. */
export interface EntradaPortaoEfeitos {
  /** Categoria da comparação. `string` e não a união: categoria nova
      vira `indefinido`, nunca liberação por omissão. */
  categoria: string;
  /** Quem ficou com a autoridade: `motor` ou `legado`. */
  autoridade: string;
  /** Nível que resolveu, quando resolveu. */
  nivel: string | null;
  /** O imóvel que receberia os efeitos é terminal para atribuição?
      `null` quando não se sabe. */
  imovelTerminal: boolean | null;
  /** Quantos imóveis o casamento legado por telefone devolveu (a consulta
      lê no máximo 2). Só diagnóstico: não muda veredito nenhum. */
  casamentosLegados: number | null;
}

export interface VereditoPortao {
  versao: typeof VERSAO_PORTAO_EFEITOS;
  efeitos: Record<EfeitoPortao, AvaliacaoEfeito>;
  /** A mensagem tem mais de um imóvel plausível e ninguém decidiu. */
  pendencia: boolean;
  /** Os efeitos suprimidos esperam uma resolução posterior (hoje, só na
      pendência). Não é fila nem formato: só a marca. */
  requerResolucao: boolean;
  /** Fato guardado para a análise das decisões abertas; não decide nada. */
  casamentosLegados: number | null;
}

/** Os níveis que o contrato libera. A retomada fica fora daqui: ela só
    vale como exceção ao terminal, com regra própria. */
const NIVEIS_SEGUROS: readonly NivelAtribuicao[] = [
  "referencia-explicita",
  "contexto-tentativa",
  "contexto-agendamento",
  "unico",
];

const NIVEL_RETOMADA: NivelAtribuicao = "contexto-retomada";

/** As categorias que este módulo conhece. Tipado pela comparação: se uma
    mudar de nome lá, isto deixa de compilar. */
const CATEGORIAS_CONHECIDAS: readonly CategoriaComparacao[] = [
  "concordante",
  "divergente",
  "terminal-historico",
  "novo-pendente",
  "novo-sem-candidatos",
  "sem-contato-relacional",
  "falha",
];

function contem(lista: readonly string[], valor: string | null): boolean {
  return typeof valor === "string" && lista.includes(valor);
}

function todos(decisao: VereditoEfeito, motivo: MotivoPortao): Record<EfeitoPortao, AvaliacaoEfeito> {
  return {
    followup: { decisao, motivo },
    tentativa: { decisao, motivo },
    encerramento: { decisao, motivo },
    agenda: { decisao, motivo },
  };
}

function casamentos(valor: number | null): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : null;
}

function veredito(
  entrada: EntradaPortaoEfeitos,
  efeitos: Record<EfeitoPortao, AvaliacaoEfeito>,
  pendencia = false,
): VereditoPortao {
  return {
    versao: VERSAO_PORTAO_EFEITOS,
    efeitos,
    pendencia,
    requerResolucao: pendencia,
    casamentosLegados: casamentos(entrada.casamentosLegados),
  };
}

/**
 * O que o portão faria com os quatro efeitos desta mensagem.
 *
 * A ordem das regras é a precedência:
 *
 *   1. categoria desconhecida → indefinido (nada se libera por omissão);
 *   2. retomada autorizada → libera, menos o encerramento;
 *   3. pendência → suprime, e marca que a decisão espera resolução;
 *   4. imóvel terminal → suprime, qualquer que seja a categoria;
 *   5. atribuição a terminal ou sem candidatos → suprime;
 *   6. regras não decididas (sem contato, falha) em imóvel vivo →
 *      indefinido;
 *   7. categoria segura → libera, se o motor tem a autoridade, o nível é
 *      seguro e o imóvel é sabidamente vivo; senão indefinido.
 *
 * A pendência vem antes do terminal porque as duas suprimem tudo e só a
 * pendência carrega a marca de resolução: um imóvel legado terminal numa
 * mensagem pendente continua sendo uma mensagem pendente.
 */
export function avaliarPortaoEfeitos(entrada: EntradaPortaoEfeitos): VereditoPortao {
  const { categoria, autoridade, nivel, imovelTerminal } = entrada;

  if (!contem(CATEGORIAS_CONHECIDAS, categoria)) {
    return veredito(entrada, todos("indefinido", "categoria-desconhecida"));
  }

  // A retomada exige as três marcas juntas, como na autoridade: nível da
  // retomada, motor com a autoridade e imóvel terminal. Com qualquer uma
  // faltando, segue as regras comuns.
  if (
    categoria === "terminal-historico" &&
    autoridade === "motor" &&
    nivel === NIVEL_RETOMADA &&
    imovelTerminal === true
  ) {
    return veredito(entrada, {
      followup: { decisao: "liberaria", motivo: "retomada-autorizada" },
      tentativa: { decisao: "liberaria", motivo: "retomada-autorizada" },
      encerramento: { decisao: "suprimiria", motivo: "retomada-sem-encerramento" },
      agenda: { decisao: "liberaria", motivo: "retomada-autorizada" },
    });
  }

  if (categoria === "novo-pendente") {
    return veredito(entrada, todos("suprimiria", "atribuicao-pendente"), true);
  }

  // Terminal é guarda ortogonal à categoria: vem antes das regras ainda
  // abertas (sem contato, D5; falha, D6), que só valem para imóvel vivo.
  if (imovelTerminal === true) {
    return veredito(entrada, todos("suprimiria", "terminal-historico"));
  }

  if (categoria === "terminal-historico") {
    return veredito(entrada, todos("suprimiria", "terminal-historico"));
  }
  if (categoria === "novo-sem-candidatos") {
    return veredito(entrada, todos("suprimiria", "sem-candidatos"));
  }
  if (categoria === "sem-contato-relacional") {
    return veredito(entrada, todos("indefinido", "sem-contato-regra-pendente"));
  }
  if (categoria === "falha") {
    return veredito(entrada, todos("indefinido", "falha-regra-pendente"));
  }

  // Sobram `concordante` e `divergente`: o motor resolveu um imóvel vivo.
  if (autoridade !== "motor") {
    return veredito(entrada, todos("indefinido", "autoridade-inconsistente"));
  }
  if (!contem(NIVEIS_SEGUROS, nivel)) {
    return veredito(entrada, todos("indefinido", "nivel-nao-seguro"));
  }
  if (imovelTerminal !== false) {
    return veredito(entrada, todos("indefinido", "terminal-desconhecido"));
  }
  return veredito(entrada, todos("liberaria", "autoridade-segura"));
}
