import type OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registrarUsoDaResposta = vi.hoisted(() => vi.fn());

vi.mock("@/lib/servidor/registro", () => ({ registrarUsoDaResposta }));

import { MAX_TOKENS_IA, MODELO_TEXTO_IA } from "@/lib/servidor/ia/config";
import {
  criarExecutorOpenAI,
  textoDaResposta,
} from "@/lib/servidor/ia/executor-openai";
import { SYSTEM_PROMPT_CENTRAL_ANGARIO } from "@/lib/ia/system-prompt";

function conclusao(
  content: string,
  finishReason: OpenAI.Chat.ChatCompletion.Choice["finish_reason"] = "stop",
): OpenAI.Chat.ChatCompletion {
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1,
    model: MODELO_TEXTO_IA,
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        logprobs: null,
        message: { role: "assistant", content, refusal: null },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
  };
}

describe("executor OpenAI compartilhado", () => {
  beforeEach(() => registrarUsoDaResposta.mockClear());

  it("mantém modelo, limite, structured output e uma única chamada", async () => {
    const resposta = conclusao('  {"ok":true}  ');
    const create = vi.fn().mockResolvedValue(resposta);
    const openai = { chat: { completions: { create } } } as unknown as OpenAI;
    const executor = criarExecutorOpenAI(openai, "usuario-1");

    const resultado = await executor.executar({
      tipo: "rascunhar-resposta-decisao",
      reasoningEffort: "low",
      formato: { nome: "decisao", esquema: { type: "object" } },
      mensagens: [{ role: "user", content: "teste" }],
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      model: "gpt-5.4-mini",
      max_completion_tokens: 4000,
      reasoning_effort: "low",
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "decisao",
          strict: true,
          schema: { type: "object" },
        },
      },
      messages: [
        { role: "developer", content: SYSTEM_PROMPT_CENTRAL_ANGARIO },
        { role: "user", content: "teste" },
      ],
    });
    expect(resultado.texto).toBe('{"ok":true}');
    expect(registrarUsoDaResposta).toHaveBeenCalledWith(
      "usuario-1",
      "rascunhar-resposta-decisao",
      MODELO_TEXTO_IA,
      resposta.usage,
    );
    expect(MAX_TOKENS_IA).toBe(4000);
  });

  it("mantém recusa e truncamento fora do caminho feliz", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recusada = conclusao("");
    recusada.choices[0].message.refusal = "recusa com conteúdo privado sintético";
    expect(textoDaResposta(recusada)).toBe("");
    expect(textoDaResposta(conclusao("parcial", "length"))).toBe("");
    expect(JSON.stringify(log.mock.calls)).not.toContain("conteúdo privado");
    log.mockRestore();
  });
});
