/* ================================================================
   O DESFECHO QUE O APP OBSERVA — e por isso não precisa perguntar
   Feature nova da pós-migração (sem oráculo do app antigo).

   A tentativa criada no envio nasce `"sem-resposta"` marcada com
   `aguardandoResultado`: no instante em que a mensagem sai, ninguém
   sabe no que vai dar. A marca existe porque, sem ela, toda
   `taxaResposta` tenderia a zero e o ranking diria "nenhum roteiro
   funciona" quando o que faltou foi anotação.

   O que nunca foi resolvido é quem responde essa pergunta. A resposta
   era sempre "o corretor, clicando" — e a conta disso apareceu na
   carteira real em 31/07/2026: **77 conversas esperando confirmação.
   Dessas, 73 eram silêncio puro** (nenhuma mensagem do proprietário) e
   só 4 tinham resposta de verdade.

   Setenta e três cliques para o corretor afirmar, um por um, algo que
   o app já sabe: ele está ouvindo o webhook, e nada chegou. Cobrar
   isso é pedir que a pessoa transcreva à mão o que o sistema observou.
   E o custo não é só o tempo — é que ninguém faz, então o dado fica
   eternamente "chute não confirmado" e o ranking segue subestimando a
   resposta de todos os roteiros.

   ## A distinção que sustenta o módulo

   Isto **não** afrouxa a regra "a IA sugere, o corretor confirma". Ela
   continua inteira, porque aqui não há IA nenhuma opinando:

   - **Chegou mensagem do proprietário depois da tentativa?** É FATO
     observado — a nota `wa:` existe, com data. O app pode afirmar
     "respondeu" com a mesma segurança com que exibe a mensagem.
   - **Não chegou nada?** A ausência é igualmente observável, e o
     corretor não tem informação melhor que a do app sobre isso.

   O que continua sendo pergunta é a CATEGORIA fina de quem respondeu —
   agendou, vai retornar, recusou. Isso a conversa diz e o app não vê,
   a IA só sugere, e ali o clique tem valor. São as 4, não as 77.

   ## Por que derivar, e não gravar

   Nada é reescrito no banco. O desfecho é calculado na leitura, a
   partir do histórico que já existe — mesma decisão do `statusHistory`
   e do `formaAbordagem` derivado das tentativas: a verdade mora no
   histórico, não num campo que alguém precisa lembrar de atualizar.

   Três consequências que valem a escolha: as ~200 tentativas antigas
   ficam resolvidas sem migração; um bug aqui se conserta editando uma
   função, não recuperando backup; e a derivação acompanha o tempo
   sozinha — a resposta que chegar amanhã muda o desfecho de ontem sem
   ninguém rodar nada.

   Puro: só tipos, constantes, datas e a convenção de notas. Sem
   React/Next/Supabase/store.
   ================================================================ */
import type { ResultadoTentativa } from "../constantes";
import { daysBetween } from "../datas";
import type { Imovel, Tentativa } from "../tipos";
import { ehNotaDeResposta } from "./notas";

/**
 * Dias após os quais o silêncio deixa de ser provisório.
 *
 * Antes deste prazo "sem resposta" é a leitura corrente (e já vale para o
 * ranking), mas ainda pode virar: o proprietário responde no quinto dia e o
 * desfecho muda sozinho. Depois dele, não muda mais na prática — e é o mesmo
 * raciocínio que já estava no `DIAS_COBRANCA_RESULTADO`.
 */
export const DIAS_SILENCIO_DEFINITIVO = 14;

/** De onde veio o desfecho que está valendo. */
export type OrigemResultado =
  /** O corretor afirmou (tentativa manual, ou confirmada no nudge). */
  | "confirmado"
  /** Chegou mensagem do proprietário depois da tentativa. */
  | "resposta-observada"
  /** Silêncio dentro do prazo — vale, mas ainda pode mudar. */
  | "silencio"
  /** Silêncio passado o prazo: não muda mais. */
  | "silencio-definitivo";

export interface ResultadoEfetivo {
  resultado: ResultadoTentativa;
  origem: OrigemResultado;
  /**
   * Ainda vale perguntar ao corretor?
   *
   * Só quando o proprietário respondeu e a categoria fina não foi afirmada —
   * o único caso em que a pessoa sabe algo que o app não vê. Silêncio nunca é
   * pendência: cobrar confirmação de "não respondeu" foi exatamente o que
   * encheu o nudge de 73 linhas inúteis.
   */
  pendente: boolean;
  /** Dia da mensagem que fechou o desfecho, quando houve uma. */
  respondeuEm?: string;
}

/** Dia da primeira mensagem do proprietário posterior a `quando`.
    Compara datetime com datetime (ambos ordenáveis como string); o empate
    exato cai para "não é posterior", que é o lado conservador. */
function primeiraRespostaDepois(imovel: Imovel, quando: string): string | null {
  let menor: string | null = null;
  for (const nota of imovel.notas || []) {
    if (!ehNotaDeResposta(nota)) continue;
    const data = nota.data || "";
    if (data.length < 10 || data <= quando) continue;
    if (!menor || data < menor) menor = data;
  }
  return menor;
}

/**
 * O desfecho que vale para esta tentativa AGORA.
 *
 * Quem já foi afirmado por gente passa intacto — inclusive "sem-resposta"
 * anotado à mão, que é afirmação do corretor e não chute do sistema.
 */
export function resultadoEfetivo(imovel: Imovel, tentativa: Tentativa, hoje: string): ResultadoEfetivo {
  if (!tentativa.aguardandoResultado) {
    return { resultado: tentativa.resultado, origem: "confirmado", pendente: false };
  }

  const respondeuEm = primeiraRespostaDepois(imovel, tentativa.data || "");
  if (respondeuEm) {
    // O binário é fato; a categoria fina continua sendo pergunta. Note que a
    // sugestão da IA NÃO é aplicada aqui de propósito: ela vive em
    // `tentativa.sugestaoIa` e é o que a UI oferece para o corretor confirmar.
    return { resultado: "respondeu", origem: "resposta-observada", pendente: true, respondeuEm };
  }

  const dias = daysBetween((tentativa.data || "").slice(0, 10), hoje);
  const definitivo = dias !== null && dias > DIAS_SILENCIO_DEFINITIVO;
  return {
    resultado: "sem-resposta",
    origem: definitivo ? "silencio-definitivo" : "silencio",
    pendente: false,
  };
}

/** Atalho para quem só quer o valor (o caso do ranking). */
export function resultadoDaTentativa(
  imovel: Imovel,
  tentativa: Tentativa,
  hoje: string,
): ResultadoTentativa {
  return resultadoEfetivo(imovel, tentativa, hoje).resultado;
}
