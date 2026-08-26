import OpenAI from "openai";
import type { FalhaIa } from "@/lib/calculo/ia";
import { registrarUsoDaResposta } from "@/lib/servidor/registro";
import { MAX_TOKENS_IA, MODELO_TEXTO_IA } from "./config";
import type { EsforcoIaPermitido, ModeloIaPermitido } from "@/lib/ia/configuracao";

export interface FormatoEstruturadoOpenAI {
  nome: string;
  esquema: Record<string, unknown>;
}

export interface PedidoExecutorOpenAI {
  tipo: string;
  mensagens: OpenAI.Chat.ChatCompletionMessageParam[];
  reasoningEffort: NonNullable<
    OpenAI.Chat.ChatCompletionCreateParamsNonStreaming["reasoning_effort"]
  >;
  maxCompletionTokens?: number;
  formato?: FormatoEstruturadoOpenAI;
}

export interface ResultadoExecutorOpenAI {
  conclusao: OpenAI.Chat.ChatCompletion;
  texto: string;
}

export interface ExecutorOpenAI {
  executar(pedido: PedidoExecutorOpenAI): Promise<ResultadoExecutorOpenAI>;
}

/** Traduz a falha do SDK para o vocabulário que a UI já conhece. */
export function classificarErroIa(e: unknown): FalhaIa {
  if (e instanceof OpenAI.RateLimitError) return "limite-excedido";
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError)
    return "nao-configurado";
  return "falha-ia";
}

/** Preserva o tratamento existente para recusa e resposta truncada. */
export function textoDaResposta(conclusao: OpenAI.Chat.ChatCompletion): string {
  const escolha = conclusao.choices[0];
  if (!escolha) return "";
  if (escolha.message.refusal) {
    console.error("IA: o modelo recusou responder:", escolha.message.refusal);
    return "";
  }
  if (escolha.finish_reason === "length") {
    console.error("IA: resposta truncada em MAX_TOKENS.");
    return "";
  }
  return (escolha.message.content || "").trim();
}

/**
 * Executor comum das operações OpenAI.
 *
 * Recebe o cliente já criado para que autenticação, ciclo de vida e rollback
 * continuem sob controle do chamador. O uso é registrado antes de qualquer
 * parse, exatamente como na rota original.
 */
export function criarExecutorOpenAI(
  openai: OpenAI,
  userId: string | null,
  rota?: { modelo: ModeloIaPermitido; esforco: EsforcoIaPermitido },
): ExecutorOpenAI {
  return {
    async executar(pedido) {
      const modelo = rota?.modelo || MODELO_TEXTO_IA;
      const conclusao = await openai.chat.completions.create({
        model: modelo,
        max_completion_tokens: pedido.maxCompletionTokens ?? MAX_TOKENS_IA,
        reasoning_effort: rota?.esforco || pedido.reasoningEffort,
        ...(pedido.formato
          ? {
              response_format: {
                type: "json_schema" as const,
                json_schema: {
                  name: pedido.formato.nome,
                  strict: true,
                  schema: pedido.formato.esquema,
                },
              },
            }
          : {}),
        messages: pedido.mensagens,
      });

      registrarUsoDaResposta(userId, pedido.tipo, modelo, conclusao.usage);
      return { conclusao, texto: textoDaResposta(conclusao) };
    },
  };
}
