/* ================================================================
   QUEM DECIDE O IMÓVEL OPERACIONAL (Fase 1a-C2.1a)

   O webhook agora calcula duas respostas para "a qual imóvel esta
   mensagem pertence": a do casamento legado por telefone e a do motor
   relacional da 1a-B. Este módulo decide qual delas vira o imóvel
   operacional, aquele que recebe a nota e os efeitos que já existem.

   A regra é uma só, e é deliberadamente estreita: o motor vence quando
   resolveu (`resolvido`) e o imóvel resolvido NÃO é terminal (com a
   exceção da retomada, descrita abaixo). Em
   qualquer outro estado o legado continua mandando, e o motivo do
   fallback fica escrito. Foi o que a sombra mediu em Production: 51 de
   51 resoluções do motor concordaram com o legado, mas em 29 de 80
   mensagens o motor não resolve (pendente ou só terminal), e tirar o
   legado desses casos sem o portão de efeitos (C3) moveria efeito para
   um imóvel escolhido sem evidência, ou tiraria a mensagem da caixa.

   Três escolhas que não são óbvias:

   - **Estado desconhecido cai no legado.** O estado chega como `string`
     e não como união fechada de propósito: um estado novo do motor que
     ninguém aprovou aqui não ganha autoridade por omissão.
   - **Falha técnica não é "sem candidato".** Cada uma tem seu motivo de
     fallback; misturar as duas transformaria erro de consulta em decisão
     de negócio.
   - **Sem legado, nada é inventado.** No fluxo real o legado nunca é nulo
     neste ponto (sem imóvel pelo telefone a mensagem nem chega aqui);
     se chegar, o resultado é `imovelId: null` e quem chama não grava.

   UMA exceção controlada (Retirados, Fase B / B3): a resposta a uma
   retomada é sobre o imóvel retirado que a recebeu, e ele é terminal por
   desenho. Quando o motor resolveu pelo nível `contexto-retomada` e marcou
   `terminal === true`, ele vence mesmo assim. Nenhum outro terminal ganha
   autoridade: referência explícita a um Perdido continua com o legado.
   O efeito perigoso nesse imóvel (encerrar como Perdido) já está fechado
   pelo B0, e nada aqui reativa imóvel.

   Módulo PURO: sem Supabase, sem fetch, sem log, sem relógio. E sem
   `updated_at`: a escolha do legado já vem pronta (é ela que ainda usa
   a recência), e o motor nunca a vê.
   ================================================================ */
import type { NivelAtribuicao } from "./atribuicaoMensagem";

/** O único nível que dá autoridade a um imóvel terminal. Tipado pelo motor:
    se o nome do nível mudar lá, isto deixa de compilar. */
const NIVEL_TERMINAL_COM_AUTORIDADE: NivelAtribuicao = "contexto-retomada";

/** Os estados da resolução relacional que esta fatia conhece. */
export type EstadoResolucaoAtribuicao =
  | "resolvido"
  | "pendente"
  | "sem-candidatos"
  | "sem-contato-relacional"
  | "falha";

/** Por que o legado continuou mandando. Vocabulário fechado: vai para a
    nota e para o log, nunca uma mensagem de erro crua. */
export type MotivoFallbackLegado =
  | "pendente"
  | "sem-candidatos"
  | "terminal"
  | "sem-contato-relacional"
  | "falha"
  | "estado-desconhecido"
  | "resolucao-incompleta"
  | "carregamento-imovel";

/** O que a decisão precisa saber da resolução relacional — e o que a
    nota guarda dela. Ids técnicos e vocabulário fechado, nada mais. */
export interface ResolucaoRelacional {
  /** `string` e não a união: estado não previsto vira fallback. */
  estado: string;
  /** Imóvel que o motor resolveu; null quando não resolveu. */
  imovelId: string | null;
  /** true quando o imóvel resolvido é terminal (referência histórica). */
  terminal: boolean;
  /** Nível que resolveu, ou o nível do empate quando `pendente`. */
  nivel: string | null;
  contatoId: string | null;
  /** Imóveis plausíveis considerados, ordenados por id. */
  candidatos: readonly string[];
  /** Imóveis terminais vinculados, ordenados por id. */
  terminais: readonly string[];
}

export type DecisaoAutoridade =
  | {
      autoridade: "motor";
      imovelId: string;
      fallbackMotivo: null;
      /** O motor escolheu o mesmo imóvel do legado? */
      concordante: boolean;
    }
  | {
      autoridade: "legado";
      imovelId: string | null;
      fallbackMotivo: MotivoFallbackLegado;
      /** null quando o motor não chegou a apontar imóvel nenhum. */
      concordante: boolean | null;
    };

const FALLBACK_POR_ESTADO: Record<string, MotivoFallbackLegado> = {
  pendente: "pendente",
  "sem-candidatos": "sem-candidatos",
  "sem-contato-relacional": "sem-contato-relacional",
  falha: "falha",
};

function legado(
  legadoImovelId: string | null,
  motivo: MotivoFallbackLegado,
  novoImovelId: string | null,
): DecisaoAutoridade {
  return {
    autoridade: "legado",
    imovelId: legadoImovelId,
    fallbackMotivo: motivo,
    concordante: novoImovelId === null ? null : novoImovelId === legadoImovelId,
  };
}

/**
 * O imóvel operacional desta mensagem.
 *
 * `novo` null significa que a resolução nem produziu resultado (falha
 * antes de chegar ao motor): é falha, nunca "sem candidato".
 */
export function decidirImovelOperacional(
  legadoImovelId: string | null,
  novo: ResolucaoRelacional | null,
): DecisaoAutoridade {
  if (!novo) return legado(legadoImovelId, "falha", null);

  if (novo.estado === "resolvido") {
    // `=== false`, não `!terminal`: um valor ausente não prova que o
    // imóvel está vivo. A retomada é a única exceção, e exige `=== true`:
    // o nível sozinho, com a marca ausente ou falsa, segue a regra comum.
    const retomada = novo.nivel === NIVEL_TERMINAL_COM_AUTORIDADE && novo.terminal === true;
    if (novo.terminal !== false && !retomada) return legado(legadoImovelId, "terminal", novo.imovelId);
    if (!novo.imovelId) return legado(legadoImovelId, "resolucao-incompleta", null);
    return {
      autoridade: "motor",
      imovelId: novo.imovelId,
      fallbackMotivo: null,
      concordante: novo.imovelId === legadoImovelId,
    };
  }

  const motivo = Object.prototype.hasOwnProperty.call(FALLBACK_POR_ESTADO, novo.estado)
    ? FALLBACK_POR_ESTADO[novo.estado]
    : "estado-desconhecido";
  return legado(legadoImovelId, motivo, novo.imovelId);
}

/** Devolve a autoridade ao legado depois de decidida — usado quando o
    imóvel do motor não pôde ser carregado. O motor não perde o registro
    do que tinha escolhido: `concordante` continua dizendo se batia. */
export function rebaixarParaLegado(
  decisao: DecisaoAutoridade,
  legadoImovelId: string | null,
  motivo: MotivoFallbackLegado,
): DecisaoAutoridade {
  const escolhidoPeloMotor = decisao.autoridade === "motor" ? decisao.imovelId : null;
  return legado(legadoImovelId, motivo, escolhidoPeloMotor);
}

/* ----------------------------------------------------------------
   O METADADO QUE A NOTA GUARDA

   Opcional, dentro do JSONB da própria nota (`wa:` e `wa-enviada:`),
   sem migration e fora de `tipos.ts`: nota antiga simplesmente não tem
   o campo, e todo leitor atual ignora chave que não conhece. Serve para
   responder depois, nota a nota, quem mandou e por quê.

   Só ids e vocabulário fechado: nada de telefone, nome ou texto.
   ---------------------------------------------------------------- */
export const VERSAO_ATRIBUICAO_NOTA = 1 as const;

export interface AtribuicaoNota {
  versao: typeof VERSAO_ATRIBUICAO_NOTA;
  autoridade: "motor" | "legado";
  /** Estado da resolução relacional, como veio. */
  estado: string;
  /** Nível que resolveu (só quando `resolvido`). */
  nivel: string | null;
  /** Nível em que a busca parou por empate (só quando `pendente`). */
  nivelEmpate: string | null;
  terminal: boolean;
  contatoId: string | null;
  /** Imóvel que o motor apontou, tenha ou não vencido. */
  novoImovelId: string | null;
  /** Imóvel que o casamento legado escolheu. */
  legadoImovelId: string | null;
  candidatos: string[];
  terminais: string[];
  fallbackMotivo: MotivoFallbackLegado | null;
}

export function metadadoDaAtribuicao(
  decisao: DecisaoAutoridade,
  resolucao: ResolucaoRelacional | null,
  legadoImovelId: string | null,
): AtribuicaoNota {
  const estado = resolucao?.estado ?? "falha";
  return {
    versao: VERSAO_ATRIBUICAO_NOTA,
    autoridade: decisao.autoridade,
    estado,
    nivel: estado === "resolvido" ? (resolucao?.nivel ?? null) : null,
    nivelEmpate: estado === "pendente" ? (resolucao?.nivel ?? null) : null,
    terminal: resolucao?.terminal === true,
    contatoId: resolucao?.contatoId ?? null,
    novoImovelId: resolucao?.imovelId ?? null,
    legadoImovelId,
    candidatos: [...(resolucao?.candidatos ?? [])],
    terminais: [...(resolucao?.terminais ?? [])],
    fallbackMotivo: decisao.fallbackMotivo,
  };
}
