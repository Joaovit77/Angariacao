import { describe, expect, it } from "vitest";
import { avaliarOportunidade, type AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import {
  buscaElegivelParaCron,
  buscaRadarEstaVencida,
  nomePadraoBuscaRadar,
  selecionarAnunciosNovosRadar,
  type BuscaRadar,
} from "@/lib/calculo/radarAngariacao";

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
  it("mantém somente anúncios que ainda não pertencem ao histórico da busca", () => {
    const novo = { ...anuncioBase, idExterno: "novo", url: "https://www.olx.com.br/anuncio-novo" };
    const resultado = selecionarAnunciosNovosRadar(
      [anuncioBase, novo],
      [{ portal: "olx", id_externo: anuncioBase.idExterno }],
    );

    expect(resultado).toEqual([novo]);
  });

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

  it("só vence uma busca ativa após duas horas", () => {
    const agora = Date.parse("2026-08-10T15:00:00.000Z");
    const busca: BuscaRadar = {
      id: "busca-1",
      nome: "Centro",
      filtros: { portal: "olx", cidade: "Londrina", estado: "PR" },
      ativo: true,
      ultimoCheck: "2026-08-10T13:01:00.000Z",
      ultimoCheckAutomatico: null,
      ultimoCheckOrigem: "navegador",
      criadoEm: "2026-08-10T14:00:00.000Z",
    };
    expect(buscaRadarEstaVencida(busca, agora)).toBe(false);
    expect(buscaRadarEstaVencida({ ...busca, ultimoCheck: "2026-08-10T13:00:00.000Z" }, agora)).toBe(true);
    expect(buscaRadarEstaVencida({ ...busca, ativo: false, ultimoCheck: null }, agora)).toBe(false);
  });

  it("separa a janela geral da execução automática diária em São Paulo", () => {
    const busca: BuscaRadar = {
      id: "busca-1",
      nome: "Centro",
      filtros: { portal: "olx", cidade: "Londrina", estado: "PR" },
      ativo: true,
      ultimoCheck: "2026-09-18T02:20:00.000Z",
      ultimoCheckAutomatico: "2026-09-17T12:00:00.000Z",
      ultimoCheckOrigem: "navegador",
      criadoEm: "2026-09-10T12:00:00.000Z",
    };

    // 02:30 UTC ainda é 23:30 de 17/09 em São Paulo.
    expect(buscaElegivelParaCron(busca, Date.parse("2026-09-18T02:30:00.000Z"))).toBe(false);
    // 03:00 UTC já é meia-noite de 18/09 em São Paulo.
    expect(buscaElegivelParaCron(busca, Date.parse("2026-09-18T03:00:00.000Z"))).toBe(true);
    expect(buscaElegivelParaCron({ ...busca, ultimoCheckAutomatico: null })).toBe(true);
    expect(buscaElegivelParaCron({ ...busca, ativo: false, ultimoCheckAutomatico: null })).toBe(false);
  });

  it("uma verificação manual recente não torna o cron inelegível", () => {
    const agora = Date.parse("2026-09-17T12:45:00.000Z");
    const busca: BuscaRadar = {
      id: "busca-1",
      nome: "Centro",
      filtros: { portal: "olx", cidade: "Londrina", estado: "PR" },
      ativo: true,
      ultimoCheck: "2026-09-17T12:40:00.000Z",
      ultimoCheckAutomatico: null,
      ultimoCheckOrigem: "manual",
      criadoEm: "2026-09-10T12:00:00.000Z",
    };

    expect(buscaRadarEstaVencida(busca, agora)).toBe(false);
    expect(buscaElegivelParaCron(busca, agora)).toBe(true);
  });

  it("sugere um nome reconhecível para a busca", () => {
    expect(nomePadraoBuscaRadar({ portal: "viva-real", cidade: "Londrina", estado: "PR", bairro: "Gleba Palhano" }))
      .toBe("Gleba Palhano, Londrina · Viva Real");
  });
});
