/* ================================================================
   IA — CHAMADA DE SERVIDOR (fora do fluxo do /api/ia)

   ATENÇÃO: este módulo é SÓ DE SERVIDOR. Ele importa o SDK da OpenAI
   e lê `OPENAI_API_KEY`. Nunca importe daqui em componente, store ou
   qualquer coisa que chegue ao browser — a chave iria junto.

   Por que ele existe, se já há `app/api/ia`: aquela rota é o caminho
   do BROWSER até a IA, e por isso exige sessão do Supabase e checa a
   permissão da conta. O webhook do WhatsApp não tem sessão nenhuma —
   quem chama é a Evolution — então não pode passar por lá. O que os
   dois compartilham (prompts, esquema, vocabulário de erro) continua
   em `lib/calculo/ia.ts`, que não conhece provedor nenhum.

   Aqui a IA faz a única coisa que não é escrever texto: lê a resposta
   do proprietário e devolve dado. Ainda assim é SUGESTÃO — quem grava
   o fato é o corretor, no nudge.
   ================================================================ */
import OpenAI from "openai";
import {
  ESQUEMA_CLASSIFICACAO,
  MOTIVOS_PERDA_IA,
  promptClassificarResposta,
  type RespostaClassificada,
} from "../calculo/ia";
import { RESULTADOS_TENTATIVA, type ResultadoTentativa } from "../constantes";

/** Mesmo modelo da rota /api/ia — ver o comentário de MODELO lá. */
const MODELO = "gpt-5.4-mini";

/** Bem menor que o das análises: a saída aqui são três campos curtos, não
    parágrafos. Continua com folga para o raciocínio, que divide o mesmo teto. */
const MAX_TOKENS = 1200;

const VALIDOS: readonly string[] = RESULTADOS_TENTATIVA.map((r) => r.valor);

/** Só aceita data ISO plausível e não passada. O modelo às vezes devolve
    "2025-.." por hábito de treino, e uma data no passado viraria um follow-up
    que já venceu — pior que nenhum. */
function dataValida(valor: unknown, hoje: string): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return valor >= hoje ? valor : null;
}

/**
 * Lê a resposta do proprietário e devolve o desfecho sugerido.
 *
 * `null` quando não há chave configurada, quando a IA falha ou quando ela
 * devolve algo fora do contrato. Nunca lança: o webhook precisa seguir e
 * gravar a nota de qualquer jeito — perder a sugestão é degradação aceitável,
 * perder a resposta do proprietário não é.
 */
export async function classificarResposta(
  texto: string,
  hoje: string,
): Promise<{
  resultado: ResultadoTentativa;
  retomarEm: string | null;
  resumo: string;
  motivoPerda: string | null;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  // Sem texto não há o que ler (áudio, figurinha): a nota já registra o que
  // chegou, e pedir classificação de string vazia só gastaria token.
  if (!texto.trim()) return null;

  try {
    const openai = new OpenAI({ apiKey });
    const conclusao = await openai.chat.completions.create({
      model: MODELO,
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: { name: "classificacao", strict: true, schema: ESQUEMA_CLASSIFICACAO },
      },
      messages: [{ role: "user", content: promptClassificarResposta(texto, hoje) }],
    });

    const escolha = conclusao.choices[0];
    if (!escolha || escolha.message.refusal || escolha.finish_reason === "length") {
      console.error("IA: não classificou a resposta (recusa ou resposta truncada).");
      return null;
    }

    const dados = JSON.parse(escolha.message.content || "{}") as RespostaClassificada;
    // O enum do esquema já restringe, mas a checagem aqui é o que garante que
    // um desfecho desconhecido nunca entre no ranking — nem que o esquema mude
    // e alguém esqueça de olhar este arquivo.
    if (!VALIDOS.includes(dados.resultado)) {
      console.error("IA: desfecho fora do vocabulário:", dados.resultado);
      return null;
    }

    // Encerramento só vale junto de uma recusa. O modelo às vezes preenche o
    // motivo e classifica como "respondeu" ou "vai-retornar" — e aí as duas
    // leituras se contradizem. Diante da contradição, fica a menos destrutiva:
    // o imóvel continua na carteira e o corretor decide.
    const motivo =
      typeof dados.motivoPerda === "string" &&
      (MOTIVOS_PERDA_IA as readonly string[]).includes(dados.motivoPerda) &&
      dados.resultado === "recusou"
        ? dados.motivoPerda
        : null;

    return {
      resultado: dados.resultado as ResultadoTentativa,
      retomarEm: dataValida(dados.retomarEm, hoje),
      resumo: typeof dados.resumo === "string" ? dados.resumo.trim().slice(0, 300) : "",
      motivoPerda: motivo,
    };
  } catch (e) {
    console.error("IA: falha ao classificar a resposta:", e);
    return null;
  }
}
