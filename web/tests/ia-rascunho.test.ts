/* Contrato do rascunho de resposta ao proprietário (camada 2 da caixa de
   respostas, lib/calculo/ia). A saída é um objeto FECHADO (um campo só) e a
   trava central do prompt é NÃO inventar fato do imóvel — a IA não sabe se tem
   garagem, qual o valor, se está disponível. Ver o cabeçalho da seção. */
import { describe, expect, it } from "vitest";
import {
  ESQUEMA_RASCUNHO,
  MAX_MENSAGENS_CONTEXTO,
  MAX_TEXTO_RASCUNHO,
  promptRascunharResposta,
} from "@/lib/calculo/ia";

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

  /* --- A conversa já está aberta ------------------------------------------
     O corretor apontou isto em 03/08/2026: ele já tinha mandado a abordagem,
     o proprietário respondeu, e o rascunho vinha começando com "Olá" e
     reapresentando a imobiliária. Recomeçar do zero apaga o que já foi
     conquistado e faz a mensagem soar a robô. */
  it("proíbe recomeçar a conversa, mesmo sem saber o que foi enviado", () => {
    const prompt = promptRascunharResposta("Tem garagem?");
    expect(prompt).toContain("A CONVERSA JÁ ESTÁ ABERTA");
    expect(prompt).toContain("NÃO comece com saudação");
  });

  it("mostra o roteiro que já foi enviado, para não repetir a oferta", () => {
    const prompt = promptRascunharResposta("Tem garagem?", "Marta", null, {
      enviada: { rotulo: "Avaliação gratuita", texto: "Ofereço uma avaliação gratuita do seu imóvel" },
    });
    expect(prompt).toContain("Avaliação gratuita");
    expect(prompt).toContain("Ofereço uma avaliação gratuita do seu imóvel");
  });

  it("sem o texto do roteiro, o rótulo do modelo já diz que a conversa começou", () => {
    const prompt = promptRascunharResposta("Tem garagem?", null, null, {
      enviada: { rotulo: "Primeiro contato", texto: null },
    });
    expect(prompt).toContain("Primeiro contato");
  });

  it("inclui as mensagens anteriores dele, e só as mais recentes", () => {
    const antigas = Array.from({ length: MAX_MENSAGENS_CONTEXTO + 2 }, (_, i) => `msg ${i}`);
    const prompt = promptRascunharResposta("e o valor?", null, null, { anteriores: antigas });
    expect(prompt).not.toContain("msg 0");
    expect(prompt).toContain(`msg ${MAX_MENSAGENS_CONTEXTO + 1}`);
  });

  it("sem conversa anterior, não inventa bloco vazio", () => {
    const prompt = promptRascunharResposta("Oi", null, null, { anteriores: [], enviada: null });
    expect(prompt).not.toContain("também tinha escrito");
    expect(prompt).not.toContain("roteiro");
  });
});

describe("ESQUEMA_RASCUNHO", () => {
  it("é fechado: um campo só, obrigatório, sem extras", () => {
    expect(ESQUEMA_RASCUNHO.additionalProperties).toBe(false);
    expect(ESQUEMA_RASCUNHO.required).toEqual(["mensagem"]);
    expect(Object.keys(ESQUEMA_RASCUNHO.properties)).toEqual(["mensagem"]);
  });
});
