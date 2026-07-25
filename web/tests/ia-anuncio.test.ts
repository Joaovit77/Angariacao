/* Contrato da extração de anúncio/placa (lib/calculo/ia).
   Esta é a única chamada em que o browser manda CONTEÚDO, então o que
   se testa aqui são exatamente as travas que compensam isso: o texto é
   truncado, o esquema é fechado (enums + additionalProperties: false) e
   a imagem é medida antes de sair da nossa máquina. */
import { describe, expect, it } from "vitest";
import {
  bytesDeBase64,
  ESQUEMA_ANUNCIO,
  MAX_IMAGEM_BYTES,
  MAX_TEXTO_ANUNCIO,
  promptExtrairAnuncio,
} from "@/lib/calculo/ia";
import { ORIGENS_IMOVEL, TIPOS_IMOVEL } from "@/lib/constantes";

describe("promptExtrairAnuncio", () => {
  it("trunca o texto colado no teto — anúncio inteiro de portal vem com rodapé e 'parecidos'", () => {
    const gigante = "x".repeat(MAX_TEXTO_ANUNCIO + 500);
    const prompt = promptExtrairAnuncio(gigante);
    expect(prompt).toContain("x".repeat(MAX_TEXTO_ANUNCIO));
    expect(prompt).not.toContain("x".repeat(MAX_TEXTO_ANUNCIO + 1));
  });

  it("sem texto, instrui a ler a imagem enviada", () => {
    const prompt = promptExtrairAnuncio();
    expect(prompt).toContain("imagem");
    expect(prompt).not.toContain('"""');
  });

  it("com texto, delimita o material colado", () => {
    expect(promptExtrairAnuncio("Alugo casa 2 quartos")).toContain('"""');
  });

  it("manda devolver null em vez de inventar — inclusive telefone incompleto", () => {
    const prompt = promptExtrairAnuncio("qualquer coisa");
    expect(prompt).toContain("NÃO INVENTE NADA");
    // O caso que dói: número quase certo vira mensagem para um estranho.
    expect(prompt.toLowerCase()).toContain("quase certo");
  });

  it("ensina a desofuscar o telefone escrito por extenso (o truque do portal)", () => {
    expect(promptExtrairAnuncio("t").toLowerCase()).toContain("extenso");
  });
});

describe("ESQUEMA_ANUNCIO", () => {
  it("é fechado: strict exige todo campo em required e nada além deles", () => {
    expect(ESQUEMA_ANUNCIO.additionalProperties).toBe(false);
    const propriedades = Object.keys(ESQUEMA_ANUNCIO.properties);
    expect([...ESQUEMA_ANUNCIO.required].sort()).toEqual(propriedades.sort());
  });

  it("tipo só aceita valores que os seletores da tela conhecem", () => {
    // Categoria inventada entraria no ranking de canais como fantasma.
    expect(ESQUEMA_ANUNCIO.properties.tipo.enum).toEqual([...TIPOS_IMOVEL, null]);
  });

  it('a IA não pode escolher "Outro" como origem — é pior que null', () => {
    // Observado na conta real: com o mesmo anúncio, o modelo alternou entre
    // null e "Outro". "Outro" não nomeia portal nenhum mas passa por dado
    // preenchido, e viraria balde no ranking de canais e "portal" dividindo o
    // ritmo no Foco do dia. Continua disponível no seletor para a PESSOA.
    const enumOrigem = ESQUEMA_ANUNCIO.properties.origemSugerida.enum;
    expect(enumOrigem).not.toContain("Outro");
    expect(enumOrigem).toContain(null);
    expect(enumOrigem).toEqual([...ORIGENS_IMOVEL.filter((o) => o !== "Outro"), null]);
  });

  it("extrai unidade e bloco — é a identidade do imóvel em prédio", () => {
    // Sem eles, dois apartamentos do mesmo prédio caem na mesma chave de
    // duplicidade e o cadastro acusa falso a cada unidade nova.
    expect(ESQUEMA_ANUNCIO.required).toContain("unidade");
    expect(ESQUEMA_ANUNCIO.required).toContain("bloco");
    expect(promptExtrairAnuncio("x")).toContain("imóveis DIFERENTES");
  });

  it("confianca é obrigatória e fechada — a UI decide se pede conferência", () => {
    expect(ESQUEMA_ANUNCIO.properties.confianca.enum).toEqual(["alta", "media", "baixa"]);
    expect(ESQUEMA_ANUNCIO.required).toContain("confianca");
  });
});

describe("bytesDeBase64", () => {
  it("mede o arquivo por trás da data URI, ignorando o cabeçalho", () => {
    // "AAAA" em base64 = 3 bytes.
    expect(bytesDeBase64("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(bytesDeBase64("AAAA")).toBe(3);
  });

  it("desconta o padding", () => {
    expect(bytesDeBase64("AAA=")).toBe(2);
    expect(bytesDeBase64("AA==")).toBe(1);
  });

  it("vazio é zero — não estoura nem vira NaN", () => {
    expect(bytesDeBase64("")).toBe(0);
    expect(bytesDeBase64("data:image/png;base64,")).toBe(0);
  });

  it("reprova uma imagem acima do teto antes de ela custar na OpenAI", () => {
    const grande = "A".repeat(Math.ceil(((MAX_IMAGEM_BYTES + 1024) * 4) / 3));
    expect(bytesDeBase64(`data:image/jpeg;base64,${grande}`)).toBeGreaterThan(MAX_IMAGEM_BYTES);
  });
});
