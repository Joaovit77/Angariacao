import { describe, expect, it } from "vitest";
import {
  classificarRelevanciaRadarOlx,
  normalizarTituloRadar,
} from "@/lib/calculo/relevanciaRadarOlx";

const classe = (titulo: string) => classificarRelevanciaRadarOlx(titulo).classe;

describe("relevância OLX no Radar: quarto individual (shadow R3.2a)", () => {
  describe("marca parece_quarto nos anúncios reais de quarto da auditoria", () => {
    it.each([
      ["QUARTO MOBILIADO CENTRO DE LONDRINA", "quarto-como-produto"],
      ["Alugo quarto mobilado ", "quarto-como-produto"],
      ["Aluguel Quarto ", "quarto-como-produto"],
      ["Quarto Próx. Gleba Palhano", "quarto-como-produto"],
      ["Quarto Suíte Próx. Gleba Palhano", "quarto-como-produto"],
      ["Quartos no jardim colúmbia há 50m da UEL (suíte e quarto indiviual)", "quarto-individual-ou-compartilhado"],
      ["Alugando quartos para pessoas sozinhas ", "quarto-como-produto"],
      ["Pensionato mensal", "pensionato-ou-pensao"],
      ["Vaga para estudante ou trabalhadora", "vaga-para-pessoa"],
      ["2 vagas femininas disponíveis- Próximo ao CATUAI", "vaga-para-pessoa"],
    ])("%s", (titulo, motivo) => {
      expect(classificarRelevanciaRadarOlx(titulo)).toEqual({ classe: "parece_quarto", motivo });
    });
  });

  describe("marca parece_quarto nas variações sintéticas sustentadas pela auditoria", () => {
    it.each([
      "Alugo quarto para estudante",
      "QUARTO INDIVIDUAL",
      "Quarto compartilhado perto da UEL",
      "Vaga masculina perto da UEL",
      "vaga p/ trabalhadora",
      "PENSÃO para rapazes",
      "pensao familiar",
      "Divido aluguel perto da UEL",
      "Procuro alguém para dividir aluguel",
      "  QUÁRTO   mobiliado  ",
    ])("%s", (titulo) => {
      expect(classe(titulo)).toBe("parece_quarto");
    });
  });

  describe("preserva os imóveis inteiros reais da auditoria", () => {
    it.each([
      // imóvel de 1 quarto
      "Apartamento1 quarto ao lado da UEL",
      "Apartamento planejado de 1 quarto com garagem em Londrina, direto com o proprietário",
      "EDIFÍCIO TORRE VALENCIA - GLEBA PALHANO - 01 QUARTO R$ 3.000,00",
      "Apartamento Dois quarto alugo ou vendo",
      "| Casa | Sabará I | para aluguel | 1 quarto | 1 vaga | Londrina",
      "Apartamento com 1 Dormitório para Alugar no Edifício Prince Albert, no Centro de Londrina",
      "Apartamento mobiliado com 1 quarto para alugar, no Edifício Luana na Região Central de Lon",
      // vaga de garagem e suíte dentro do imóvel
      "Apartamento 2 quartos com vaga - Spazio Lille, Zona Norte de Londrina",
      "Wood 84 m2 duas vagas de garagem andar alto sol da manhã ",
      "1º Aluguel | Wood Vanguard | 84m² | 3 Quartos | 2 Vagas",
      "Concept Gleba Palhano - 81m², 3 Qts (1 Suíte), Andar Alto e sol da manhã",
      "Apartamento com 3 quartos sendo uma suíte na Gleba Palhano ",
      "Edifício torres Brasil, planejados, apamento 3 dormit, centro, porcelanato, 1 vaga.",
      // estudante sem produto quarto
      "Alugo apartamento para estudantes ",
      // kitnet e variações
      "KITINET Mobiliada ",
      "Kitinete",
      "KITNET NO BAIRRO BANCARIOS - TUDO INCLUSO",
      "Kitinet térrea s/condomínio R$ 880,00",
      // tipo nulo, mas imóvel inteiro
      "Aluga-se Chácara Fazenda Nata",
      "Spazio louvre com condomínio incluso ",
      "Alugo - Spazio Londres",
      "Alugo apt próximo ao Catuaí shopping ",
      "Ap Centro 139m úteis ",
      // casas pequenas ou baratas
      "Alugo casa direto com proprietário. .",
      "Casa no Jardim Europa - Zona Sul de Londrina",
      "LINDO SOBRADO",
    ])("%s", (titulo) => {
      expect(classe(titulo)).toBe("normal");
    });
  });

  describe("mantém visíveis os casos ambíguos", () => {
    it.each([
      ["Dependência ", "sem-sinal-de-quarto"],
      ["Tudo incluso! Zona leste", "sem-sinal-de-quarto"],
      ["Beraca Home ", "sem-sinal-de-quarto"],
      ["Suíte mobiliada perto da UEL", "sem-sinal-de-quarto"],
      ["Casa para república", "sem-sinal-de-quarto"],
      ["Quarto em casa de família", "imovel-inteiro-preservado"],
      ["Apartamento com quarto para alugar", "imovel-inteiro-preservado"],
      ["Alugo sala e quarto", "imovel-inteiro-preservado"],
      ["Quarto e cozinha nos fundos", "imovel-inteiro-preservado"],
      ["Divido apartamento perto da UEL", "imovel-inteiro-preservado"],
      ["Vaga para estudante em casa", "imovel-inteiro-preservado"],
    ])("%s", (titulo, motivo) => {
      expect(classificarRelevanciaRadarOlx(titulo)).toEqual({ classe: "normal", motivo });
    });
  });

  it("não usa sinais isolados de vaga, suíte ou estudante", () => {
    expect(classe("Apartamento 2 quartos com vaga")).toBe("normal");
    expect(classe("3 quartos sendo uma suíte")).toBe("normal");
    expect(classe("Suíte")).toBe("normal");
    expect(classe("Vaga de garagem coberta")).toBe("normal");
    expect(classe("Estudantes bem-vindos")).toBe("normal");
    expect(classe("Apartamento 1 quarto para locação")).toBe("normal");
    expect(classe("Casa 1 quarto")).toBe("normal");
  });

  it("ignora anúncios que não são quarto nem imóvel residencial (fora do escopo)", () => {
    expect(classe("Salas de locação por hora - Profissionais Estética ")).toBe("normal");
    expect(classe("Cuido do seu Airbnb | Gestão profissional ")).toBe("normal");
    expect(classe("Alugo sala odontológica ")).toBe("normal");
  });

  it("trata título vazio como normal", () => {
    expect(classificarRelevanciaRadarOlx("")).toEqual({ classe: "normal", motivo: "sem-sinal-de-quarto" });
    expect(classificarRelevanciaRadarOlx(null)).toEqual({ classe: "normal", motivo: "sem-sinal-de-quarto" });
  });

  it("normaliza acento, caixa e espaços preservando os números", () => {
    expect(normalizarTituloRadar("  QUÁRTO   Suíte  01 dormitório ")).toBe("quarto suite 01 dormitorio");
  });
});
