/* Contrato do rascunho de resposta ao proprietário (camada 2 da caixa de
   respostas, lib/calculo/ia). A saída é um objeto FECHADO (um campo só) e a
   trava central do prompt é NÃO inventar fato do imóvel — a IA não sabe se tem
   garagem, qual o valor, se está disponível. Ver o cabeçalho da seção. */
import { describe, expect, it } from "vitest";
import { ESQUEMA_RASCUNHO, MAX_TEXTO_RASCUNHO, promptRascunharResposta } from "@/lib/calculo/ia";

describe("promptRascunharResposta", () => {
  it("delimita e inclui a mensagem do proprietário", () => {
    const prompt = promptRascunharResposta("Tem garagem?");
    expect(prompt).toContain('"""');
    expect(prompt).toContain("Tem garagem?");
  });

  it("trunca a mensagem no teto", () => {
    const gigante = "x".repeat(MAX_TEXTO_RASCUNHO + 300);
    const prompt = promptRascunharResposta(gigante);
    expect(prompt).toContain("x".repeat(MAX_TEXTO_RASCUNHO));
    expect(prompt).not.toContain("x".repeat(MAX_TEXTO_RASCUNHO + 1));
  });

  it("proíbe inventar fato do imóvel — a regra que segura a feature", () => {
    const prompt = promptRascunharResposta("Aceita pet?");
    expect(prompt).toContain("NUNCA invente fato sobre o imóvel");
    expect(prompt.toLowerCase()).toContain("próximo passo");
  });

  it("usa só o PRIMEIRO nome do proprietário quando informado", () => {
    const prompt = promptRascunharResposta("Oi", "Antonio Rafael Spolom");
    expect(prompt).toContain("Antonio");
    expect(prompt).not.toContain("Antonio Rafael Spolom");
  });

  it("sem nome, não manda tratar por nome nenhum", () => {
    const prompt = promptRascunharResposta("Oi", null);
    expect(prompt).not.toContain("se chama");
  });

  it("inclui a referência do imóvel quando informada", () => {
    const prompt = promptRascunharResposta("Oi", "Marta", "Rua Haddock Lobo, 55, Cerqueira César");
    expect(prompt).toContain("Rua Haddock Lobo, 55, Cerqueira César");
  });
});

describe("ESQUEMA_RASCUNHO", () => {
  it("é fechado: um campo só, obrigatório, sem extras", () => {
    expect(ESQUEMA_RASCUNHO.additionalProperties).toBe(false);
    expect(ESQUEMA_RASCUNHO.required).toEqual(["mensagem"]);
    expect(Object.keys(ESQUEMA_RASCUNHO.properties)).toEqual(["mensagem"]);
  });
});
