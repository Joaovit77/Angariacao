// R4.2f (temporário): análise dos CAMPOS do JSON-LD do ZAP sobre JSON-LD SINTÉTICO.
// Prova as regras de evidência, não a estrutura real do portal. Sai junto com o harness.
import { describe, expect, it } from "vitest";
import { analisarJsonLdZap, candidatoComprovaAluguel } from "@/lib/servidor/diagnosticoTemporarioZapJsonLd";
import {
  AGORA_JSONLD,
  HTML_ZAP_SINTETICO,
  HTML_ZAP_SINTETICO_COM_JSONLD,
  SEGREDOS_DO_JSONLD,
} from "./fixtures/zap-diagnostico-sintetico";

describe("JSON-LD temporário do ZAP: campos", () => {
  const r = analisarJsonLdZap(HTML_ZAP_SINTETICO_COM_JSONLD, AGORA_JSONLD);

  it("pareia cards e itens pelo ID e pela URL, mesmo com o JSON-LD em outra ordem", () => {
    expect(r.pareamento).toMatchObject({
      cards: 2,
      idsDeAnuncioNoJsonLd: 4,
      pareaveisPorId: 2,
      pareaveisPorUrl: 2,
      pareaveisPorIdEUrl: 2,
      cardsSemPareamento: 0,
      idsDoJsonLdSemCard: 2,
      nosComIdAmbiguo: 0,
      urlsLigadasAMaisDeUmId: 0,
    });
    expect(r.pareamento.camposQueCarregamId).toEqual([{ padrao: "RealEstateListing.url", quantidade: 4 }]);
  });

  it("comprova aluguel só com vínculo estrutural à locação, e nunca condomínio ou IPTU", () => {
    expect(r.preco).toMatchObject({
      gruposComAluguelComprovado: 2, // A (Offer contém RentAction) e o extra (dentro do RentAction)
      gruposComAluguelAmbiguo: 0,
      gruposComAluguelComprovadoBrlMensal: 2,
      gruposComOfferPriceSemContexto: 2, // B (sem RentAction) e D (RentAction só como irmão)
      rotulos: { condominio: 1, iptu: 1, aluguel: 0 },
      vinculoComRentAction: { dentroDeRentAction: 2, ofertaContemRentAction: 3, apenasNoMesmoAnuncio: 2, nenhum: 2 },
      moeda: { brl: 9, outra: 0, ausente: 0 },
    });
  });

  it("compara o aluguel comprovado com os valores do card sem devolver os valores", () => {
    expect(r.preco.comparacaoComCard).toMatchObject({
      cardsPareados: 2,
      aluguelComprovadoPareado: 1,
      aluguelIgualPrimeiroValorDoCard: 1,
      aluguelIgualOutroValorDoCard: 0,
      aluguelDivergenteDoCard: 0,
      offerPriceIgualPrimeiroValorDoCard: 2,
      cardsSemPareamento: 0,
    });
  });

  it("regra de prova: Offer sem contexto, PriceSpecification sem contexto e rótulos de outra natureza não viram aluguel", () => {
    const base = {
      valor: 2500, origem: "Offer.price" as const, moedaBrl: true, moedaAusente: false, mensal: true,
      rotulo: "sem_rotulo" as const, dentroDeRentAction: false, ofertaComRentAction: false, leaseOut: false,
    };
    expect(candidatoComprovaAluguel(base)).toBe(false);
    expect(candidatoComprovaAluguel({ ...base, origem: "PriceSpecification.price" })).toBe(false);
    expect(candidatoComprovaAluguel({ ...base, dentroDeRentAction: true })).toBe(true);
    expect(candidatoComprovaAluguel({ ...base, ofertaComRentAction: true })).toBe(true);
    expect(candidatoComprovaAluguel({ ...base, leaseOut: true })).toBe(true);
    expect(candidatoComprovaAluguel({ ...base, rotulo: "aluguel" })).toBe(true);
    for (const rotulo of ["condominio", "iptu", "total", "venda", "conflitante"] as const) {
      expect(candidatoComprovaAluguel({ ...base, dentroDeRentAction: true, rotulo })).toBe(false);
    }
  });

  it("conta como endereço do anúncio só o PostalAddress do imóvel ligado a um ID", () => {
    expect(r.localizacao).toMatchObject({
      postalAddress: 4,
      donos: { imovel: 2, anuncio: 0, empresaOuPessoa: 2, indeterminado: 0 },
      atribuiveisAoAnuncio: 2,
      naoAtribuiveis: 2,
      doImovelPareadoComCard: 2,
      campos: { logradouro: 1, numeroNoLogradouro: 1, bairro: 1, cidade: 2, cidadeLondrina: 2, uf: 2, cep: 1 },
      logradouroConfereComCard: 1,
      gruposComEnderecosDivergentes: 0,
    });
    expect(r.localizacao.chavesDeBairro).toEqual([{ padrao: "addressNeighborhood", quantidade: 1 }]);
  });

  it("conta datePosted como do anúncio só quando está ligado a um listing com ID", () => {
    expect(r.data).toMatchObject({
      datePosted: 3,
      formato: { data: 2, dataHora: 1, outro: 0 },
      validas: 3,
      noRealEstateListing: 3,
      ligadasAAnuncio: 2,
      relacionaveisAosCards: 1,
      semAnuncio: 1,
      idade: { ateUmDia: 1, ateSeteDias: 1, ateTrintaDias: 1, ateUmAno: 0, maisDeUmAno: 0, futura: 0 },
    });
  });

  it("conta autoria estrutural só dentro de um anúncio, sem nomes", () => {
    expect(r.autoria).toMatchObject({
      gruposComEstruturaDeAnunciante: 1,
      porChave: [{ padrao: "seller", quantidade: 1 }],
      porTipo: [{ padrao: "RealEstateAgent", quantidade: 1 }],
    });
  });

  it("explica itens além dos cards por classe estrutural", () => {
    expect(r.itensExtras.realEstateListing).toBe(5);
    expect(r.itensExtras.realEstateListingPorClasse).toEqual([
      { padrao: "comCard", quantidade: 2 },
      { padrao: "comIdSemCard", quantidade: 2 },
      { padrao: "semIdDeAnuncio", quantidade: 1 },
    ]);
    expect(r.itensExtras.offerPorClasse).toEqual([
      { padrao: "comCard", quantidade: 2 },
      { padrao: "comIdSemCard", quantidade: 2 },
    ]);
  });

  it("não devolve JSON-LD bruto, valores, endereços, datas, nomes nem URLs individuais", () => {
    const serializado = JSON.stringify(r);
    for (const segredo of SEGREDOS_DO_JSONLD) expect(serializado, segredo).not.toContain(segredo);
    // "@context" pode aparecer como NOME de chave; o bruto teria o valor dele.
    expect(serializado).not.toContain("schema.org");
    expect(serializado.length).toBeLessThan(12_000);
  });

  it("sem JSON-LD de anúncio, nada é pareado nem comprovado", () => {
    const vazio = analisarJsonLdZap(HTML_ZAP_SINTETICO, AGORA_JSONLD);
    expect(vazio.pareamento).toMatchObject({ cards: 2, idsDeAnuncioNoJsonLd: 0, pareaveisPorId: 0, cardsSemPareamento: 2 });
    expect(vazio.preco.gruposComAluguelComprovado).toBe(0);
  });
});
