/* Contrato do rascunho de resposta ao proprietário (camada 2 da caixa de
   respostas, lib/calculo/ia). A saída é um objeto FECHADO (um campo só) e a
   trava central do prompt é NÃO inventar fato do imóvel — a IA não sabe se tem
   garagem, qual o valor, se está disponível. Ver o cabeçalho da seção. */
import { describe, expect, it } from "vitest";
import {
  blocoProtocolos,
  ESQUEMA_RASCUNHO,
  MAX_MENSAGENS_CONTEXTO,
  MAX_PROTOCOLOS,
  MAX_PROTOCOLO_CHARS,
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
  it("é fechado: sem extras, e tudo obrigatório (exigência do strict)", () => {
    expect(ESQUEMA_RASCUNHO.additionalProperties).toBe(false);
    expect(ESQUEMA_RASCUNHO.required).toEqual(["mensagem", "protocolosUsados"]);
    expect(Object.keys(ESQUEMA_RASCUNHO.properties)).toEqual(["mensagem", "protocolosUsados"]);
  });
});

/* ==========================================================================
   PROTOCOLOS DA IMOBILIÁRIA no prompt

   A única fonte que autoriza a IA a AFIRMAR alguma coisa. O que os testes
   guardam aqui não é formatação: é (a) que sem protocolo nada muda, (b) que a
   trava contra inventar fato do IMÓVEL sobrevive à chegada deles, e (c) a
   ORDEM, que é dinheiro — o bloco tem que vir antes da parte variável para o
   cache de entrada da OpenAI pegar.
   ========================================================================== */
describe("promptRascunharResposta com protocolos", () => {
  const TAXA = { titulo: "Taxa de administração", conteudo: "10% sobre o valor do aluguel." };
  const PRAZO = { titulo: "Prazo de contrato", conteudo: "Padrão de 30 meses." };

  it("sem protocolo, o prompt sai IDÊNTICO ao de antes da feature", () => {
    const semNada = promptRascunharResposta("Quanto vocês cobram?", "Marta", "Rua A, 1");
    expect(promptRascunharResposta("Quanto vocês cobram?", "Marta", "Rua A, 1", undefined, [])).toBe(semNada);
    expect(semNada).not.toContain("REGRAS DA IMOBILIÁRIA");
  });

  it("inclui título e conteúdo dos protocolos informados", () => {
    const prompt = promptRascunharResposta("Quanto é a taxa?", null, null, undefined, [TAXA, PRAZO]);
    expect(prompt).toContain("Taxa de administração");
    expect(prompt).toContain("10% sobre o valor do aluguel.");
    expect(prompt).toContain("Prazo de contrato");
  });

  it("descarta protocolo sem título ou sem conteúdo", () => {
    const prompt = promptRascunharResposta("Oi", null, null, undefined, [
      { titulo: "Sem resposta escrita", conteudo: "   " },
      { titulo: "  ", conteudo: "órfão de título" },
      TAXA,
    ]);
    expect(prompt).not.toContain("Sem resposta escrita");
    expect(prompt).not.toContain("órfão de título");
    expect(prompt).toContain("Taxa de administração");
  });

  it("trunca por quantidade e por tamanho", () => {
    const muitos = Array.from({ length: MAX_PROTOCOLOS + 3 }, (_, i) => ({
      titulo: `P${i}`,
      conteudo: "x".repeat(MAX_PROTOCOLO_CHARS + 50),
    }));
    const prompt = promptRascunharResposta("Oi", null, null, undefined, muitos);
    expect(prompt).toContain("P0");
    expect(prompt).not.toContain(`P${MAX_PROTOCOLOS}`);
    expect(prompt).not.toContain("x".repeat(MAX_PROTOCOLO_CHARS + 1));
  });

  /* A regra que impede a base de virar licença para inventar. Protocolo é sobre
     a EMPRESA; garagem, pet e o condomínio daquele apartamento continuam fora
     do que a IA pode afirmar, e nada disso é derivável dos protocolos. */
  it("mantém a proibição de inventar fato do imóvel mesmo com protocolos", () => {
    const prompt = promptRascunharResposta("Tem garagem?", null, null, undefined, [TAXA]);
    expect(prompt).toContain("NUNCA invente fato sobre o imóvel");
    expect(prompt).toContain("NÃO DEDUZA e NÃO COMBINE");
  });

  /* Ordem = custo. O começo do prompt precisa ser idêntico em toda chamada
     deste corretor para o cache de entrada valer (a parte cacheada custa dez
     vezes menos). Com o bloco depois da mensagem, que muda sempre, o cache não
     pega e ele vira custo cheio em cada rascunho. */
  it("põe os protocolos ANTES da mensagem do proprietário", () => {
    const prompt = promptRascunharResposta("Quanto é a taxa?", null, null, undefined, [TAXA]);
    expect(prompt.indexOf("REGRAS DA IMOBILIÁRIA")).toBeLessThan(prompt.indexOf("Quanto é a taxa?"));
  });
});

describe("blocoProtocolos", () => {
  it("devolve vazio quando não há nada utilizável", () => {
    expect(blocoProtocolos()).toBe("");
    expect(blocoProtocolos([])).toBe("");
    expect(blocoProtocolos([{ titulo: " ", conteudo: " " }])).toBe("");
  });

  it("manda responder de verdade em vez de empurrar para ligação", () => {
    const bloco = blocoProtocolos([{ titulo: "Exclusividade", conteudo: "Não exigimos." }]);
    expect(bloco).toContain("responda de verdade");
  });

  /* A declaração da fonte precisa estar no PROMPT, não só na descrição do
     esquema. Testado contra a carteira real em 04/08/2026: com a instrução
     apenas no esquema, o modelo devolveu `protocolosUsados` vazio numa resposta
     que citava três protocolos (LD-161) — o corretor via um rascunho afirmando
     "10%" e "sem exclusividade" sem nenhuma fonte na tela, que é pior do que
     não ter atribuição, porque parece invenção da IA. */
  it("manda declarar em protocolosUsados o que foi usado", () => {
    const bloco = blocoProtocolos([{ titulo: "Exclusividade", conteudo: "Não exigimos." }]);
    expect(bloco).toContain("protocolosUsados");
    expect(bloco).toContain("OBRIGATÓRIO");
  });
});
