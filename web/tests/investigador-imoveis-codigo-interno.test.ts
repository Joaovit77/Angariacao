/* ================================================================
   INVESTIGADOR: o código interno do Angario fica fora da investigação web.

   "LD-###" só existe dentro do Angario; portal nenhum o publica. No smoke
   real do B2 (24/09) o handoff do Pipeline mandava "código LD-146", o
   extrator o tomava por referência, a primeira etapa pesquisava
   `"LD-146" imóvel` e o gate mantinha projeto de lei, peça e roupa com
   "LD 146" porque a "referência" aparecia neles. A separação é pela
   origem do campo: `referenciaCrm` é pública, `codigo` é interno.
   ================================================================ */
import { describe, expect, it } from "vitest";
import { consultaInicialDoImovel, type ImovelParaInvestigacao } from "@/lib/calculo/contextoInvestigador";
import {
  extrairCamposInvestigacao,
  extrairReferenciaInvestigacao,
  planejarPesquisasInvestigacao,
  triarCorrespondenciasInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { ehCodigoInternoAngario, sugerirCodigoImovel } from "@/lib/codigoImovel";

/** Forma do imóvel do smoke: apartamento em condomínio, com código interno. */
function imovel(parcial: Partial<ImovelParaInvestigacao> = {}): ImovelParaInvestigacao {
  return {
    id: "ac0bbb74-279e-487d-9bab-eadf2c512f2f",
    codigo: "LD-146",
    referenciaCrm: null,
    endereco: "Rua Sidrack Silva, 116",
    unidade: "204",
    bloco: "1",
    bairro: "Aeroporto",
    cidade: "Londrina",
    estado: null,
    edificio: "Residencial Aeroporto 2",
    tipo: "Apartamento",
    quartos: null,
    banheiros: null,
    vagas: null,
    ...parcial,
  };
}

function resultado(titulo: string, descricao: string, url: string): ResultadoWebInvestigacao {
  return {
    titulo, url, dominio: new URL(url).hostname, descricao, consultas: ["q"],
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}

describe("handoff do Pipeline: código interno não vira consulta web", () => {
  it("imóvel com codigo = LD-146 e sem referência pública: nenhuma etapa pesquisa LD-146", () => {
    const consulta = consultaInicialDoImovel(imovel());
    expect(consulta).not.toMatch(/LD-?\s?146/i);
    const plano = planejarPesquisasInvestigacao(consulta);
    expect(plano.every((etapa) => !/LD-?\s?146/i.test(etapa.consulta))).toBe(true);
    expect(plano[0].consulta).not.toBe('"LD-146" imóvel');
  });

  it("endereço e condomínio continuam guiando as pesquisas progressivas", () => {
    const plano = planejarPesquisasInvestigacao(consultaInicialDoImovel(imovel()));
    expect(plano).toEqual([
      {
        etapa: "especifica",
        consulta: "Rua Sidrack Silva, 116, unidade 204, bloco 1, Aeroporto, Londrina, Residencial Aeroporto 2, Apartamento imóvel",
      },
      {
        etapa: "nucleo",
        consulta: "Rua Sidrack Silva, 116, Aeroporto, Londrina, Residencial Aeroporto 2, Apartamento imóvel",
      },
      {
        etapa: "logradouro",
        consulta: "Rua Sidrack Silva, Aeroporto, Londrina, Residencial Aeroporto 2, Apartamento imóvel",
      },
    ]);
  });

  it("referência pública verdadeira (referenciaCrm) continua sendo a primeira pesquisa", () => {
    const consulta = consultaInicialDoImovel(imovel({ referenciaCrm: "01860.001" }));
    expect(consulta).toContain("referência 01860.001");
    expect(consulta).not.toContain("LD-146");
    expect(extrairReferenciaInvestigacao(consulta)).toBe("01860.001");
    expect(planejarPesquisasInvestigacao(consulta)[0]).toEqual({ etapa: "especifica", consulta: '"01860.001" imóvel' });
  });
});

describe("extrairReferenciaInvestigacao: código interno não é referência pública", () => {
  it("nesse fluxo, a consulta do Pipeline não tem referência quando só existe o código interno", () => {
    expect(extrairReferenciaInvestigacao(consultaInicialDoImovel(imovel()))).toBeNull();
  });

  it.each([
    "Rua Sidrack Silva, 116, código LD-146",
    "Apartamento Aeroporto, cód. LD146",
    "ref LD 146",
  ])("digitado à mão também não vira referência: %s", (texto) => {
    expect(extrairReferenciaInvestigacao(texto)).toBeNull();
    expect(planejarPesquisasInvestigacao(texto).some((etapa) => /"LD/i.test(etapa.consulta))).toBe(false);
  });

  it("com código interno e referência pública no mesmo texto, fica a pública, em qualquer ordem", () => {
    expect(extrairReferenciaInvestigacao("código LD-146, referência 01860.001")).toBe("01860.001");
    expect(extrairReferenciaInvestigacao("referência 01860.001, código LD-146")).toBe("01860.001");
  });

  it.each([
    ["Cód. AP4471", "AP4471"],
    ["Ref. CA-7781", "CA-7781"],
    ["Código do imóvel 01860.001", "01860.001"],
  ])("referência pública de portal continua funcionando: %s", (texto, esperado) => {
    expect(extrairReferenciaInvestigacao(texto)).toBe(esperado);
  });

  it("o formato recusado é o que o gerador de código do Angario produz", () => {
    const gerado = sugerirCodigoImovel([{ codigo: "LD-146" }]);
    expect(ehCodigoInternoAngario(gerado)).toBe(true);
    for (const valor of ["LD-146", "ld 146", "LD146", "LD-0234"]) expect(ehCodigoInternoAngario(valor)).toBe(true);
    for (const valor of ["AP4471", "CA-7781", "01860.001", "LD-146A"]) expect(ehCodigoInternoAngario(valor)).toBe(false);
  });
});

describe("B2: \"LD 146\" em outro assunto não mantém o resultado", () => {
  const consulta = consultaInicialDoImovel(imovel());

  it.each([
    ["LD 146, SP 82, Text and Status, 132nd - Maine Legislature", "An Act to amend the laws.", "https://legislature.test/ld146"],
    ["Kemeja Linen Big Size LD 146 cm", "Review & Tips Styling", "https://social.test/v/1"],
    ["FW-02-03-LD-146-204 - Flexible Micro Board Stacking", "Connector datasheet.", "https://pecas.test/fw"],
  ])("%s: descartado", (titulo, descricao, url) => {
    const [item] = triarCorrespondenciasInvestigacao(consulta, [resultado(titulo, descricao, url)]).itens;
    expect(item.relevancia).toBe("irrelevante");
  });

  it("o mesmo ruído continua descartado mesmo que alguém digite o código à mão", () => {
    const [item] = triarCorrespondenciasInvestigacao(`${consulta}, código LD-146`, [
      resultado("LD 146, SP 82, Text and Status - Maine Legislature", "", "https://legislature.test/ld146"),
    ]).itens;
    expect(item).toMatchObject({ relevancia: "irrelevante", motivo: "sem-relacao-com-a-entrada" });
  });

  it("o anúncio certo e a página da rua continuam", () => {
    const itens = triarCorrespondenciasInvestigacao(consulta, [
      resultado("Apartamento com 2 quartos na Rua Sidrack Silva, 116", "Aeroporto, Londrina.", "https://portal.test/a/116"),
      resultado("Imóveis para venda na Rua Sidrack Silva - Londrina", "", "https://portal.test/rua"),
    ]).itens;
    expect(itens.map((item) => item.relevancia).sort()).toEqual(["inconclusivo", "relevante"]);
  });
});
