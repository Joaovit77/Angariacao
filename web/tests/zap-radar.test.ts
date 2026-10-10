// R4.2h — ZAP ativo com capacidade restrita. HTML SINTÉTICO (ver a fixture).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  capacidadeFuncionalZap,
  PORTAIS_ATIVOS,
  PORTAIS_CONHECIDOS,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { planejarColetaPorZonasLondrina } from "@/lib/calculo/regioesLondrina";
import {
  capacidadeGeograficaPortal,
  extrairJsonLd,
  PortalSemCoberturaGeografica,
  URL_ZAP_LONDRINA_APARTAMENTOS,
  urlDaPesquisa,
} from "@/lib/servidor/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { planejarColetaMercadoLegado as planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";
import { buscarComNavegador } from "@/lib/servidor/scraperCentralAngariacao";
import { apartamento, endereco, htmlZap, produto, urlAnuncio } from "./fixtures/zap-listagem-sintetica";

const URL_DISCOVERY = "https://www.zapimoveis.com.br/aluguel/apartamentos/pr+londrina/?onde=%2CParan%C3%A1%2CLondrina%2C%2C%2C%2C%2Ccity%2CBR%3EParana%3ENULL%3ELondrina%2C-23.319731%2C-51.166201%2C&tipos=apartamento_residencial";
const ZAP: FiltrosCentralAngariacao = { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" };
const A = "2612345678";
const B = "2612345699";

function extrair(html: string, filtros: Partial<FiltrosCentralAngariacao> = {}) {
  return extrairAnunciosFirecrawl(html, { ...ZAP, ...filtros });
}

describe("R4.2h: capacidade e builder do ZAP", () => {
  it("aceita somente Londrina/PR + Apartamento sem bairro e devolve a URL real do discovery", () => {
    expect(capacidadeGeograficaPortal(ZAP)).toMatchObject({ suportado: true, nivel: "comprovado" });
    expect(urlDaPesquisa(ZAP)).toBe(URL_DISCOVERY);
    expect(URL_ZAP_LONDRINA_APARTAMENTOS).toBe(URL_DISCOVERY);
    expect(capacidadeFuncionalZap({ ...ZAP, tipo: "apartamentos", cidade: " LONDRINA ", estado: "pr" }).suportado).toBe(true);
  });

  it.each([
    ["outra cidade", { cidade: "Maringá" }],
    ["outra UF", { estado: "SP" }],
    ["sem tipo", { tipo: undefined }],
    ["tipo vazio", { tipo: " " }],
    ["casa", { tipo: "Casa" }],
    ["comercial", { tipo: "Sala comercial" }],
    ["apartamento ou casa", { tipo: "Apartamento ou casa" }],
    ["bairro", { bairro: "Centro" }],
  ])("recusa %s na capacidade, antes do builder", (_nome, parcial) => {
    const filtros = { ...ZAP, ...parcial } as FiltrosCentralAngariacao;
    expect(capacidadeGeograficaPortal(filtros).suportado).toBe(false);
    expect(() => urlDaPesquisa(filtros)).toThrow(PortalSemCoberturaGeografica);
  });

  it("não acrescenta preço, quartos, bairro nem proprietário à URL", () => {
    expect(urlDaPesquisa({ ...ZAP, valorMin: 1000, valorMax: 3000, dormitorios: 2, somenteProprietario: true })).toBe(URL_DISCOVERY);
  });

  it("os quatro portais anteriores continuam decididos só por cidade e UF", () => {
    for (const tipo of [undefined, "Casa", "Apartamento"]) {
      expect(capacidadeGeograficaPortal({ portal: "chaves-na-mao", cidade: "Maringá", estado: "PR", tipo, bairro: "Zona 7" }).suportado).toBe(true);
      expect(capacidadeGeograficaPortal({ portal: "olx", cidade: "Londrina", estado: "PR", tipo }).suportado).toBe(true);
      expect(capacidadeGeograficaPortal({ portal: "viva-real", cidade: "Londrina", estado: "SP", tipo }).suportado).toBe(false);
    }
  });
});

describe("R4.2h: parser do ZAP (card + JSON-LD pelo ID)", () => {
  const html = htmlZap([{ id: A }, {
    id: B,
    produto: produto(B, { numberOfBedrooms: 3 }),
    apartamento: apartamento(B, { numberOfBedrooms: 3 }),
    folhas: ["Rua Pará, 100", "Gleba Palhano, Londrina", "3 quartos", "2 vagas"],
  }]);
  const [a, b] = extrair(html);

  it("parte dos cards reais, na ordem dos cards, com JSON-LD em outra ordem", () => {
    expect(extrair(html).map((x) => x.idExterno)).toEqual([A, B]);
    expect(a).toMatchObject({ portal: "zap", idExterno: A, url: urlAnuncio(A) });
  });

  it("URL persistida sem query e ID estável do link, nunca da posição", () => {
    expect(a.url).toBe(`https://www.zapimoveis.com.br/imovel/aluguel-apartamento-2-quartos-centro-londrina-pr-60m2-id-${A}/`);
    expect(a.url).not.toContain("?");
  });

  it("ignora o item do JSON-LD sem card", () => {
    const comExtra = htmlZap([{ id: A }, { id: "2699999999", semCard: true }]);
    expect(extrair(comExtra).map((x) => x.idExterno)).toEqual([A]);
  });

  it("card sem link de anúncio ou com dois anúncios não entra", () => {
    const html2 = htmlZap([{ id: A, hrefExtra: urlAnuncio("2600000001") }, { id: B }]);
    expect(extrair(html2).map((x) => x.idExterno)).toEqual([B]);
  });

  it("título do JSON-LD, com o do card como reserva", () => {
    expect(a.titulo).toBe("Apartamento com 2 quartos para alugar, 60 m² em Centro");
    const semNome = htmlZap([{ id: A, produto: produto(A, { name: undefined }), apartamento: apartamento(A, { name: undefined }) }]);
    expect(extrair(semNome)[0].titulo).toBe("Título do card");
  });

  it("preço vem do RentAction, nunca do primeiro R$ do card", () => {
    expect(a.preco).toBe(2500);
    expect(a.descricao).toContain("R$ 9.999");
  });

  it.each([
    ["Offer.price corroborando", { ofertaPreco: "2500.00" }, 2500],
    ["Offer.price divergente", { ofertaPreco: 2400 }, null],
    ["sem RentAction (só Offer.price)", { semRentAction: true, ofertaPreco: 2500 }, null],
    ["sem BRL", { moeda: "USD" }, null],
    ["moeda ausente", { moeda: undefined }, null],
    ["preço não numérico", { aluguel: "a combinar" }, null],
    ["preço zero", { aluguel: 0, ofertaPreco: undefined }, null],
  ])("preço: %s", (_nome, preco, esperado) => {
    const html2 = htmlZap([{ id: A, produto: produto(A, {}, preco) }]);
    expect(extrair(html2)[0].preco).toBe(esperado);
  });

  it("sem Product do mesmo ID, o preço é nulo (nunca pela posição)", () => {
    const html2 = htmlZap([{ id: A, produto: null }, { id: B }]);
    const [semProduto, comProduto] = extrair(html2);
    expect(semProduto.preco).toBeNull();
    expect(comProduto.preco).toBe(2500);
  });

  it("endereço, bairro, cidade e UF publicados, sem inventar número", () => {
    expect(a).toMatchObject({ endereco: "Rua Sergipe", bairro: "Centro", cidade: "Londrina", estado: "PR" });
    expect(b).toMatchObject({ endereco: "Rua Sergipe", bairro: "Gleba Palhano" });
  });

  it("endereço divergente entre Apartment e Product fica nulo", () => {
    const html2 = htmlZap([{ id: A, apartamento: apartamento(A, { address: endereco({ streetAddress: "Rua Outra" }) }) }]);
    expect(extrair(html2)[0].endereco).toBeNull();
  });

  it("sem JSON-LD, logradouro e cidade só do texto do card", () => {
    const html2 = htmlZap([{ id: A, produto: null, apartamento: null }]);
    expect(extrair(html2)[0]).toMatchObject({ endereco: "Rua Sergipe", bairro: "Centro", cidade: "Londrina", estado: null });
  });

  it("cidade e UF nunca vêm do filtro da busca", () => {
    const semLocal = htmlZap([{
      id: A,
      produto: produto(A, { address: { "@type": "PostalAddress", streetAddress: "Rua Sergipe" } }),
      apartamento: apartamento(A, { address: { "@type": "PostalAddress", streetAddress: "Rua Sergipe" } }),
      folhas: ["Rua Sergipe", "60 m²"],
    }]);
    expect(extrair(semLocal)[0]).toMatchObject({ cidade: null, estado: null, bairro: null });
    const ufPorExtenso = htmlZap([{ id: A, produto: produto(A, { address: endereco({ addressRegion: "Paraná" }) }), apartamento: null }]);
    expect(extrair(ufPorExtenso)[0].estado).toBe("PR");
  });

  it("características do JSON-LD, com vagas do card", () => {
    expect(a).toMatchObject({ quartos: 2, banheiros: 1, areaM2: 60, vagas: 1, tipo: "Apartamento" });
    expect(b.vagas).toBe(2);
    const semCaracteristicas = htmlZap([{
      id: A, apartamento: null,
      produto: produto(A, { numberOfBedrooms: undefined, numberOfBathroomsTotal: undefined, floorSize: undefined }),
      folhas: ["Centro, Londrina", "3 quartos", "2 banheiros", "75 m²"],
    }]);
    expect(extrair(semCaracteristicas)[0]).toMatchObject({ quartos: 3, banheiros: 2, areaM2: 75, vagas: null });
  });

  it("imagem do card, com a do JSON-LD como reserva", () => {
    expect(a.imagem).toBe(`https://resizedimgs.zapimoveis.com.br/img/${A}.jpg`);
    expect(extrair(htmlZap([{ id: A, imagem: null }]))[0].imagem).toBe("https://resizedimgs.zapimoveis.com.br/img/json-ld.jpg");
  });

  it("autoria sempre incerta e datePosted ignorado", () => {
    const recente = htmlZap([{ id: A, datePosted: new Date().toISOString() }]);
    expect(extrair(recente)[0]).toMatchObject({ anunciante: "incerto", publicadoEm: null, publicadoTexto: null });
  });

  it("filtros locais: faixa de valor e dormitórios sobre a primeira página", () => {
    expect(extrair(html, { valorMin: 2600 }).map((x) => x.idExterno)).toEqual([]);
    expect(extrair(html, { valorMax: 2400 }).map((x) => x.idExterno)).toEqual([]);
    expect(extrair(html, { valorMin: 2000, valorMax: 3000 })).toHaveLength(2);
    expect(extrair(html, { dormitorios: 3 }).map((x) => x.idExterno)).toEqual([B]);
    const semPreco = htmlZap([{ id: A, produto: produto(A, {}, { semRentAction: true }) }]);
    expect(extrair(semPreco, { valorMax: 5000 })).toEqual([]);
    expect(extrair(semPreco)).toHaveLength(1);
  });
});

describe("R4.2h: caminhos locais falham fechado para o ZAP", () => {
  it("Playwright recusa o ZAP antes de abrir navegador", async () => {
    await expect(buscarComNavegador(ZAP, URL_DISCOVERY)).rejects.toThrow(/Coleta local não suportada/);
  });

  it("HTTP direto (extrairJsonLd) recusa o ZAP e não usa a regra genérica /imovel/", () => {
    expect(() => extrairJsonLd(htmlZap([{ id: A }]), "zap", "https://www.zapimoveis.com.br/")).toThrow(PortalSemCoberturaGeografica);
  });

  it("fallback HTTP continua exclusivo do Chaves", () => {
    const fonte = readFileSync(new URL("../lib/servidor/fallbackHttpChaves.ts", import.meta.url), "utf8");
    expect(fonte).toContain('if (filtros.portal !== "chaves-na-mao" || urlPesquisa !== urlDaPesquisa(filtros)) {');
  });
});

describe("R4.2h: infraestrutura", () => {
  it("cinco portais ativos, todos conhecidos", () => {
    expect(PORTAIS_ATIVOS).toEqual(["olx", "chaves-na-mao", "wimoveis", "viva-real", "zap"]);
    expect(PORTAIS_CONHECIDOS).toEqual(PORTAIS_ATIVOS);
  });

  it("planejador de mercados (sem tipo) continua com as mesmas quatro consultas", () => {
    const plano = planejarColetaMercado({ cidade: "Londrina", estado: "PR", finalidade: "locacao", segmento: "residencial" });
    expect(plano.consultas.map((c) => c.filtros.portal)).toEqual(["olx", "chaves-na-mao", "wimoveis", "viva-real"]);
  });

  it("coleta por zonas continua sem ZAP, mesmo no maior teto válido por zona", () => {
    // O teto padrão (25) corta o último portal da lista; no maior teto aceito
    // todos os portais priorizados aparecem, então um ZAP ali seria visto.
    let maiorTeto = 1;
    while (maiorTeto < 1000) {
      try { planejarColetaPorZonasLondrina(maiorTeto + 1); maiorTeto += 1; } catch { break; }
    }
    const portais = new Set(planejarColetaPorZonasLondrina(maiorTeto).map((c) => c.portal));
    expect([...portais].sort()).toEqual(["chaves-na-mao", "viva-real", "wimoveis"]);
  });
});
