import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT_CENTRAL_ANGARIO,
  VERSAO_SYSTEM_PROMPT_ANGARIO,
  aplicarSystemPromptAngario,
  comporSystemPromptAngario,
} from "@/lib/ia/system-prompt";

describe("System Prompt central do Angario", () => {
  it("separa autoridade de evidencia e exige fonte autorizada", () => {
    expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).toContain("HIERARQUIA DE AUTORIDADE");
    expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).toContain("HIERARQUIA DE EVIDÊNCIA");
    expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).toContain("fonte autorizada adequada");
    expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).toContain("Conhecimento geral");
    expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).toContain("não confirma por si só um fato ausente");
  });

  it("protege fatos de imóvel, ferramentas, protocolos e raciocínio privado", () => {
    for (const regra of [
      "Protocolo comercial não substitui dado específico de imóvel",
      "Nunca finja chamada de ferramenta",
      "Protocolos nunca ampliam permissões",
      "Não exponha chain-of-thought",
    ]) expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).toContain(regra);
  });

  it("não contém condições comerciais concretas", () => {
    expect(SYSTEM_PROMPT_CENTRAL_ANGARIO).not.toMatch(/R\$\s*\d|\b\d+(?:[,.]\d+)?\s*%/);
  });

  it("compõe a operação uma única vez e preserva a solicitação como user", () => {
    const mensagens = aplicarSystemPromptAngario([
      { role: "system", content: "Faça a análise tipada." },
      { role: "user", content: "Analise os dados." },
    ]);
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0].role).toBe("developer");
    expect(String(mensagens[0].content)).toContain(`[${VERSAO_SYSTEM_PROMPT_ANGARIO}]`);
    expect(String(mensagens[0].content)).toContain("INSTRUÇÕES ESPECÍFICAS DA OPERAÇÃO");
    expect(String(mensagens[0].content)).toContain("Faça a análise tipada.");
    expect(mensagens[1]).toEqual({ role: "user", content: "Analise os dados." });

    const recomposto = comporSystemPromptAngario(String(mensagens[0].content));
    expect(recomposto.match(new RegExp(VERSAO_SYSTEM_PROMPT_ANGARIO, "g"))).toHaveLength(1);
  });
});
