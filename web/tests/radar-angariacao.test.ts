import { describe, expect, it } from "vitest";
import { avaliarOportunidade, type AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { buscaRadarEstaVencida, nomePadraoBuscaRadar, type BuscaRadar } from "@/lib/calculo/radarAngariacao";

const anuncioBase: AnuncioCentralAngariacao = {
  idExterno: "123",
  portal: "olx",
  titulo: "Apartamento para alugar",
  preco: 1800,
  cidade: "Londrina",
  bairro: "Centro",
  endereco: "Rua Pará, 100",
  imagem: null,
  url: "https://www.olx.com.br/anuncio-123",
  anunciante: "proprietario",
};

describe("Radar de Angariação", () => {
  it("prioriza anúncio direto, com endereço e valor sem inventar sinais", () => {
    const avaliacao = avaliarOportunidade(anuncioBase);
    expect(avaliacao.nota).toBe(80);
    expect(avaliacao.faixa).toBe("alta");
    expect(avaliacao.motivos).toContain("anúncio direto com o proprietário");
    expect(avaliacao.motivos).toContain("endereço publicado");
  });

  it("mantém baixa a nota quando há poucos dados públicos", () => {
    const avaliacao = avaliarOportunidade({
      ...anuncioBase,
      preco: null,
      cidade: null,
      bairro: null,
      endereco: null,
      anunciante: "imobiliaria",
    });
    expect(avaliacao.nota).toBe(20);
    expect(avaliacao.faixa).toBe("baixa");
  });

  it("só vence uma busca ativa após trinta minutos", () => {
    const agora = Date.parse("2026-08-10T15:00:00.000Z");
    const busca: BuscaRadar = {
      id: "busca-1",
      nome: "Centro",
      filtros: { portal: "olx", cidade: "Londrina", estado: "PR" },
      ativo: true,
      ultimoCheck: "2026-08-10T14:31:00.000Z",
      criadoEm: "2026-08-10T14:00:00.000Z",
    };
    expect(buscaRadarEstaVencida(busca, agora)).toBe(false);
    expect(buscaRadarEstaVencida({ ...busca, ultimoCheck: "2026-08-10T14:30:00.000Z" }, agora)).toBe(true);
    expect(buscaRadarEstaVencida({ ...busca, ativo: false, ultimoCheck: null }, agora)).toBe(false);
  });

  it("sugere um nome reconhecível para a busca", () => {
    expect(nomePadraoBuscaRadar({ portal: "viva-real", cidade: "Londrina", estado: "PR", bairro: "Gleba Palhano" }))
      .toBe("Gleba Palhano, Londrina · Viva Real");
  });
});
