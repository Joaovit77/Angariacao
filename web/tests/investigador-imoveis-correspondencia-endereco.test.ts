/* ================================================================
   INVESTIGADOR (B2): endereço na análise de correspondência.

   Antes: "Rua Michigan 610 Londrina" não tinha endereço (sem vírgula),
   "Avenida 7 de Setembro, 3 quartos" virava endereço de número 3,
   "Rua Michigan, 610" × "Rua Michigan nº 610" gerava contradição grave e
   a rua sem vírgula virava "Mesmo condomínio". Aqui o contrato: mesmo
   endereço com qualquer separador aceito é o mesmo endereço, número que
   faz parte do nome da rua ou que conta quartos não é número predial.
   ================================================================ */
import { describe, expect, it, vi } from "vitest";
import {
  analisarCorrespondenciasInvestigacao,
  extrairCamposInvestigacao,
  haEvidenciaSuficiente,
  planejarPesquisasInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { buscarImovelNaWeb } from "@/lib/servidor/investigadorImoveis";

function endereco(texto: string) {
  return extrairCamposInvestigacao(texto).endereco;
}

/** Resultado como o servidor monta: campos extraídos de título + descrição. */
function resultado(titulo: string, descricao = ""): ResultadoWebInvestigacao {
  return {
    titulo,
    url: "https://imobiliaria.test/imovel/1",
    dominio: "imobiliaria.test",
    descricao,
    consultas: ["q"],
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}

function analisar(entrada: string, titulo: string, descricao = "") {
  const [correspondencia] = analisarCorrespondenciasInvestigacao(entrada, [resultado(titulo, descricao)]);
  return correspondencia;
}

const sobreEndereco = (itens: string[]) => itens.filter((item) => item.startsWith("Endereço"));

describe("extração de endereço com número", () => {
  it.each([
    ["Rua Michigan, 610, Londrina", "Rua Michigan, 610"],
    ["Rua Michigan 610 Londrina", "Rua Michigan 610"],
    ["Rua Michigan 610", "Rua Michigan 610"],
    ["Casa na Rua Michigan 610 - Londrina", "Rua Michigan 610"],
    ["Rua Michigan nº 610", "Rua Michigan nº 610"],
    ["Rua 10 de Dezembro, 45, Londrina", "Rua 10 de Dezembro, 45"],
    ["Rua 10 de Dezembro 45 Londrina", "Rua 10 de Dezembro 45"],
    ["Rodovia PR 445, 1200", "Rodovia PR 445, 1200"],
  ])("reconhece %s", (texto, esperado) => {
    expect(endereco(texto)).toBe(esperado);
  });

  it.each([
    ["Casa Rua Michigan 610, 3 quartos, 2 vagas", "Rua Michigan 610"],
    ["Rua Michigan 610 Jardim Presidente Londrina casa 3 quartos 2 vagas", "Rua Michigan 610"],
    ["Casa 3 quartos Rua Michigan 610 80 m² Londrina", "Rua Michigan 610"],
    ["Apartamento Rua Michigan, 610, Jardim Presidente, 2 quartos, 1 vaga", "Rua Michigan, 610"],
  ])("com bairro, tipo, quartos e vagas misturados: %s", (texto, esperado) => {
    expect(endereco(texto)).toBe(esperado);
  });

  it.each([
    ["Rua 10 de Dezembro, Centro, Londrina"],
    ["Rua 10 de Dezembro Centro Londrina"],
    ["Avenida 7 de Setembro, 3 quartos"],
    ["Avenida 7 de Setembro 3 quartos Londrina"],
    ["Rua Michigan 80 m²"],
    ["Rua Michigan 3 quartos Londrina"],
    ["Rodovia PR 445 Londrina"],
  ])("número do nome da rua ou de característica não é número predial: %s", (texto) => {
    expect(endereco(texto)).toBeNull();
  });

  it.each([
    ["Rua Michigan 610A Londrina"],
    ["Rua Michigan, 610A, Londrina"],
  ])("número com letra continua sem suporte, com ou sem vírgula: %s", (texto) => {
    expect(endereco(texto)).toBeNull();
  });

  it.each([
    ["Rua Michigan, Jardim Presidente, Londrina"],
    ["Casa 3 quartos Londrina"],
    ["Apartamento no Jardim Presidente"],
  ])("sem número ou sem endereço: %s", (texto) => {
    expect(endereco(texto)).toBeNull();
  });

  it("com dois endereços, fica o primeiro do texto, qualquer que seja o separador", () => {
    expect(endereco("Rua Michigan 610 Londrina, perto da Rua Sergipe, 10")).toBe("Rua Michigan 610");
  });
});

describe("comparação de endereço na correspondência", () => {
  it.each([
    ["Rua Michigan, 610, Londrina", "Casa na Rua Michigan 610 Londrina"],
    ["Rua Michigan 610 Londrina", "Casa na Rua Michigan, 610 - Londrina"],
    ["Rua Michigan, 610, Londrina", "Casa na Rua Michigan nº 610 Londrina"],
    ["Rua 10 de Dezembro 45 Londrina", "Casa na Rua 10 de Dezembro, 45, Centro"],
  ])("mesmo endereço com outro separador: %s × %s", (entrada, titulo) => {
    const correspondencia = analisar(entrada, titulo);
    expect(sobreEndereco(correspondencia.evidencias)).toHaveLength(1);
    expect(sobreEndereco(correspondencia.evidencias)[0]).toContain("Endereço idêntico");
    expect(correspondencia.contradicoes).toEqual([]);
    expect(correspondencia.confianca).toBe("muito-forte");
  });

  it("endereço sem vírgula + área compatível encerra como antes o fazia com vírgula, sem falso condomínio", () => {
    for (const entrada of ["Rua Michigan 610 Londrina 80 m²", "Rua Michigan, 610, Londrina, 80 m²"]) {
      const correspondencia = analisar(entrada, "Casa Rua Michigan 610 Londrina 80 m²");
      expect(correspondencia.evidencias).toEqual(expect.arrayContaining([
        "Endereço idêntico: " + endereco(entrada),
        "Área compatível: 80 m²",
      ]));
      expect(correspondencia.evidencias.some((item) => item.startsWith("Mesmo condomínio"))).toBe(false);
      expect(correspondencia.contradicoes).toEqual([]);
      expect(haEvidenciaSuficiente([correspondencia])).toBe(true);
    }
  });

  it("número predial diferente continua contradição", () => {
    const correspondencia = analisar("Rua Michigan 610 Londrina", "Casa na Rua Michigan 612 Londrina");
    expect(correspondencia.contradicoes).toEqual(["Endereço diferente: Rua Michigan 612"]);
    expect(correspondencia.confianca).not.toBe("muito-forte");
  });

  it("610 não é idêntico a 6100 só por ser prefixo", () => {
    const correspondencia = analisar("Rua Michigan, 610, Londrina", "Casa na Rua Michigan, 6100, Londrina");
    expect(sobreEndereco(correspondencia.evidencias)).toEqual([]);
    expect(correspondencia.contradicoes).toEqual(["Endereço diferente: Rua Michigan, 6100"]);
  });

  it.each([
    ["Rua 10 de Dezembro, Centro, Londrina", "Casa na Rua 10 de Dezembro 45 Centro"],
    ["Avenida 7 de Setembro, 3 quartos", "Casa na Avenida 7 de Setembro, 3 quartos"],
    ["Rua Michigan 610A Londrina", "Casa na Rua Michigan 610 Londrina"],
    ["Rua Michigan, Jardim Presidente, Londrina", "Casa na Rua Michigan 610 Londrina"],
    ["Casa 3 quartos Londrina", "Casa na Rua Michigan 610 Londrina, 3 quartos"],
  ])("entrada sem número predial não ganha evidência nem contradição de endereço: %s", (entrada, titulo) => {
    const correspondencia = analisar(entrada, titulo);
    expect(sobreEndereco(correspondencia.evidencias)).toEqual([]);
    expect(sobreEndereco(correspondencia.contradicoes)).toEqual([]);
  });

  it("\"3 quartos\" não vira número do endereço de um resultado e não contradiz a entrada", () => {
    const correspondencia = analisar("Rua Michigan, 610, Londrina", "Casa Rua Michigan 610, 3 quartos");
    expect(correspondencia.endereco).toBe("Rua Michigan 610");
    expect(sobreEndereco(correspondencia.evidencias)).toEqual(["Endereço idêntico: Rua Michigan, 610"]);
    expect(correspondencia.contradicoes).toEqual([]);
  });
});

describe("rua sem número não vira condomínio", () => {
  const CASOS = [
    ["Rua Michigan, 3 quartos, 2 vagas, Londrina", "Casa Rua Michigan, 610, Londrina, 3 quartos, 2 vagas"],
    ["Rua Michigan, 80 m², 3 quartos", "Casa Rua Michigan, 610, 80 m², 3 quartos"],
    ["Avenida 7 de Setembro, 3 quartos, Londrina", "Apartamento 3 quartos na Avenida 7 de Setembro, 1200, Londrina"],
    ["Avenida 7 de Setembro, 3 quartos, Londrina", "Avenida 7 de Setembro, 3 quartos, 2 vagas, Londrina"],
    ["Av. Higienópolis, 3 quartos", "Apartamento na Av. Higienópolis, 1000, 3 quartos"],
    ["Alameda Manuel Bandeira, 2 vagas, 90 m²", "Casa na Alameda Manuel Bandeira, 55, 90 m², 2 vagas"],
    ["Travessa Goiás, 3 quartos, 2 vagas", "Casa Travessa Goiás, 12, 3 quartos, 2 vagas"],
  ];

  it.each(CASOS)("%s × %s: sem \"Mesmo condomínio\", sem \"muito forte\", sem evidência suficiente", (entrada, titulo) => {
    const correspondencia = analisar(entrada, titulo);
    expect(correspondencia.evidencias.some((item) => item.startsWith("Mesmo condomínio"))).toBe(false);
    expect(correspondencia.confianca).not.toBe("muito-forte");
    expect(haEvidenciaSuficiente([correspondencia])).toBe(false);
  });

  it("a fila não para antes do fim por coincidência só de nome de rua", async () => {
    const chaveAnterior = process.env.RAPIDAPI_KEY;
    process.env.RAPIDAPI_KEY = "chave-local-simulada";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ organic_results: [{
        title: "Casa Rua Michigan, 610, Londrina, 3 quartos, 2 vagas",
        description: "",
        link: "https://imobiliaria.test/imovel/610",
      }] }), { status: 200 }));
      const busca = await buscarImovelNaWeb("Rua Michigan, 3 quartos, 2 vagas, Londrina", ["etapa 1", "etapa 2"], fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(busca).toMatchObject({ motivoParada: "plano-esgotado", encerramentoAntecipado: false });
    } finally {
      vi.restoreAllMocks();
      if (chaveAnterior === undefined) delete process.env.RAPIDAPI_KEY;
      else process.env.RAPIDAPI_KEY = chaveAnterior;
    }
  });

  it("condomínio sem rótulo e sem logradouro continua reconhecido", () => {
    const correspondencia = analisar("Vivere Palhano 79 m² 3 quartos 2 vagas", "Vivere Palhano com 79 m², 3 quartos e 2 vagas");
    expect(correspondencia.evidencias).toEqual(expect.arrayContaining([
      "Mesmo condomínio ou empreendimento: Vivere Palhano",
      "Área compatível: 79 m²",
    ]));
    expect(correspondencia.confianca).toBe("muito-forte");
    expect(haEvidenciaSuficiente([correspondencia])).toBe(true);
  });

  it("palavra que só começa como tipo de via não bloqueia o condomínio sem rótulo", () => {
    const correspondencia = analisar("Avalon Park 79 m² 3 quartos", "Avalon Park com 79 m² e 3 quartos");
    expect(correspondencia.evidencias).toContain("Mesmo condomínio ou empreendimento: Avalon Park");
  });
});

describe("\"Av.\", \"Av\" e \"Avenida\" na comparação de endereço", () => {
  it.each([
    ["Avenida Higienópolis, 1000, Londrina", "Apartamento na Av. Higienópolis, 1000, Londrina"],
    ["Avenida Higienópolis, 1000, Londrina", "Apartamento na Av. Higienópolis 1000 Londrina"],
    ["Avenida Higienópolis 1000 Londrina", "Apartamento na Av Higienópolis, 1000, Londrina"],
    ["Av. Higienópolis 1000 Londrina", "Apartamento na Avenida Higienópolis 1000 Londrina"],
    ["Av Higienópolis, 1000, Londrina", "Apartamento na Avenida Higienópolis, 1000, Londrina"],
  ])("mesmo número: %s × %s → Endereço idêntico", (entrada, titulo) => {
    const correspondencia = analisar(entrada, titulo);
    expect(sobreEndereco(correspondencia.evidencias)).toEqual([`Endereço idêntico: ${endereco(entrada)}`]);
    expect(correspondencia.contradicoes).toEqual([]);
    expect(correspondencia.confianca).toBe("muito-forte");
  });

  it.each([
    ["Avenida Higienópolis, 1000, Londrina", "Apartamento na Av. Higienópolis, 1020, Londrina", "Av. Higienópolis, 1020"],
    ["Av Higienópolis 1000 Londrina", "Apartamento na Avenida Higienópolis 1020 Londrina", "Avenida Higienópolis 1020"],
    ["Avenida Higienópolis, 1000, Londrina", "Galpão na Av. Higienópolis, 10000, Londrina", "Av. Higienópolis, 10000"],
    ["Av. Higienópolis 1000 Londrina", "Galpão na Avenida Higienópolis 10000 Londrina", "Avenida Higienópolis 10000"],
  ])("número diferente continua contradição: %s × %s", (entrada, titulo, enderecoDoResultado) => {
    const correspondencia = analisar(entrada, titulo);
    expect(sobreEndereco(correspondencia.evidencias)).toEqual([]);
    expect(correspondencia.contradicoes).toEqual([`Endereço diferente: ${enderecoDoResultado}`]);
  });

  it("o card continua mostrando o endereço como o anúncio escreveu", () => {
    expect(analisar("Avenida Higienópolis, 1000", "Apartamento na Av. Higienópolis 1000 Londrina").endereco)
      .toBe("Av. Higienópolis 1000");
  });
});

describe("efeito no planejador do B1 (que usa o mesmo extrator primeiro)", () => {
  it("rua sem vírgula seguida de hífen agora é âncora, como com vírgula", () => {
    expect(planejarPesquisasInvestigacao("Rua Michigan 610 - Londrina").map((item) => item.etapa))
      .toEqual(planejarPesquisasInvestigacao("Rua Michigan, 610, Londrina").map((item) => item.etapa));
  });
});
