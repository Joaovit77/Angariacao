/* Contrato da abordagem gerada a partir do anúncio do proprietário.

   É o inverso do gerador de anúncio: lá o imóvel já é nosso e o texto vai ao
   portal; aqui ele é de um proprietário anunciando sozinho, e o texto vai para
   o WhatsApp dele. O que se testa são as travas de quem escreve a PRIMEIRA
   mensagem a uma pessoa real — não há segunda chance de primeira impressão, e
   o público é o mais frio que existe. */
import { describe, expect, it } from "vitest";
import {
  ESQUEMA_ABORDAGEM_ANUNCIO,
  MAX_TEXTO_ANUNCIO,
  PONTOS_ANUNCIO_PROPRIETARIO,
  promptAbordagemDoAnuncio,
} from "@/lib/calculo/ia";
import type { Imovel } from "@/lib/tipos";

const base: Imovel = {
  id: "i1",
  endereco: "Rua Ayrton Senna, 150",
  bairro: "Gleba Palhano",
  cidade: "Londrina",
  proprietarioNome: "Fulano de Tal",
  status: "Novo contato",
  textoAnuncio: "Alugo apartamento 3 quartos, 78m2, mobiliado. Tratar com o proprietário.",
  anuncioIdadeDias: 45,
};

describe("promptAbordagemDoAnuncio", () => {
  it("PROÍBE falar das fotos — a IA só recebeu o texto", () => {
    /* É o defeito mais comum de anúncio de proprietário e o mais fácil de
       citar, e é exatamente o que ela não pode saber: o texto colado não traz
       imagem nenhuma. Um palpite ali abre a conversa com uma acusação falsa
       que o dono confere em dois segundos. */
    const prompt = promptAbordagemDoAnuncio(base);
    expect(prompt).toContain("NUNCA fale das FOTOS");
    expect(prompt).toContain("não sabe quantas são");
  });

  it("é oferta, não crítica — sem adjetivo de julgamento", () => {
    // Abrir a primeira conversa dizendo "seu anúncio está ruim" é aposta de
    // tom com o público mais frio da carteira.
    const prompt = promptAbordagemDoAnuncio(base);
    expect(prompt).toContain("NÃO É CRÍTICA, É OFERTA");
    expect(prompt).toContain("seu anúncio está fraco");
    expect(prompt).toContain("no máximo DOIS pontos");
  });

  it("não inventa falta: o que o anúncio diz não vira ponto fraco", () => {
    const prompt = promptAbordagemDoAnuncio(base);
    expect(prompt).toContain("se fala, não invente que falta");
  });

  it("usa a idade do anúncio como FATO do cadastro, não como leitura", () => {
    /* `anuncioIdadeDias` é campo, não interpretação — e é o argumento mais
       forte justamente porque o proprietário confere sozinho. */
    expect(promptAbordagemDoAnuncio(base)).toContain("há 45 dias");
    // Sem o dado, a frase não aparece: melhor não citar do que estimar.
    const semIdade = promptAbordagemDoAnuncio({ ...base, anuncioIdadeDias: null });
    expect(semIdade).not.toContain("dias —");
    expect(semIdade).toContain("NÃO É CRÍTICA, É OFERTA");
  });

  it("não promete resultado nem inventa condição da imobiliária", () => {
    const prompt = promptAbordagemDoAnuncio(base);
    expect(prompt).toContain("alugo em 30 dias");
    expect(prompt).toContain("taxa, prazo, exclusividade");
  });

  it("aqui PODE cumprimentar — ao contrário do rascunho de resposta", () => {
    /* O rascunho proíbe saudação porque a conversa já está aberta. Aqui é a
       primeira mensagem: não cumprimentar é que soaria estranho. */
    const prompt = promptAbordagemDoAnuncio(base);
    expect(prompt).toContain("Pode cumprimentar");
    expect(prompt).toContain("PRIMEIRA mensagem");
  });

  it("trata o proprietário pelo PRIMEIRO nome, dentro da frase", () => {
    const prompt = promptAbordagemDoAnuncio(base);
    expect(prompt).toContain("Ele se chama Fulano");
    expect(prompt).not.toContain("Fulano de Tal —");
  });

  it("trunca o anúncio no teto e sobrevive sem ele", () => {
    const gigante = promptAbordagemDoAnuncio({
      ...base,
      textoAnuncio: "z".repeat(MAX_TEXTO_ANUNCIO + 400),
    });
    expect(gigante).toContain("z".repeat(MAX_TEXTO_ANUNCIO));
    expect(gigante).not.toContain("z".repeat(MAX_TEXTO_ANUNCIO + 1));

    const semTexto = promptAbordagemDoAnuncio({ ...base, textoAnuncio: null });
    expect(semTexto).toContain("não está disponível");
    expect(semTexto).toContain("há 45 dias");
  });
});

describe("ESQUEMA_ABORDAGEM_ANUNCIO", () => {
  it("é fechado: strict exige todo campo em required e nada além deles", () => {
    expect(ESQUEMA_ABORDAGEM_ANUNCIO.additionalProperties).toBe(false);
    const propriedades = Object.keys(ESQUEMA_ABORDAGEM_ANUNCIO.properties);
    expect([...ESQUEMA_ABORDAGEM_ANUNCIO.required].sort()).toEqual(propriedades.sort());
  });

  it("'pontos' é lista fechada e NÃO contém nada sobre foto", () => {
    expect(ESQUEMA_ABORDAGEM_ANUNCIO.properties.pontos.items.enum).toEqual([
      ...PONTOS_ANUNCIO_PROPRIETARIO,
    ]);
    // A trava do prompt não vale nada se o esquema oferecer o rótulo.
    for (const p of PONTOS_ANUNCIO_PROPRIETARIO) {
      expect(p).not.toMatch(/foto|imagem|v[ií]deo/i);
    }
  });
});
