import { describe, expect, it } from "vitest";
import {
  avaliarOportunidade,
  idDoAnuncio,
  idExternoEhFallback,
  type AnuncioCentralAngariacao,
  type PortalAngariacao,
} from "@/lib/calculo/centralAngariacao";
import {
  CATEGORIAS_LOCALIZACAO_RADAR,
  qualidadeLocalizacaoRadar,
  resumirLocalizacaoRadar,
} from "@/lib/calculo/localizacaoRadar";
import {
  BELA_SUICA_6_QUARTOS,
  EDU_CHAVES_DOM_PEDRO,
  EDU_CHAVES_SANTOS_DUMONT,
  VILA_FUJITA,
} from "./fixtures/radarChavesR41";

/* Casos reais da auditoria R4.2 (Production, 23/09/2026): cards públicos,
   só os campos de localização que o card publicou. */

function anuncio(
  portal: PortalAngariacao,
  idExterno: string,
  campos: Partial<AnuncioCentralAngariacao>,
): AnuncioCentralAngariacao {
  return {
    idExterno,
    portal,
    titulo: "",
    cidade: "Londrina",
    endereco: null,
    bairro: null,
    url: `https://portal.test/${idExterno}`,
    anunciante: "incerto",
    ...campos,
  };
}

const CHAVES_MICHIGAN = anuncio("chaves-na-mao", "40323649", {
  endereco: "Michigan, 610",
  bairro: "Quebec",
  descricao: "Michigan, 610 · Quebec, Londrina/PR · 530m² · 4 · 3 · 4 · R$ 7.500",
});
const CHAVES_BAIRRO_COLINAS = anuncio("chaves-na-mao", "46557200", {
  endereco: "Bairro Colinas, 1",
  bairro: "Colinas",
  descricao: "Bairro Colinas, 1 · Colinas, Londrina/PR · 90m² · 3 · 2 · 2 · R$ 3.000",
});
const CHAVES_INDISPONIVEL = anuncio("chaves-na-mao", "44599035", {
  bairro: "Colina Verde",
  descricao: "Endereço indisponível · Colina Verde, Londrina/PR · 457m² · 4 · 4 · R$ 10.000",
});
const CHAVES_RUA_SEM_NUMERO = anuncio("chaves-na-mao", "46173078", {
  endereco: "Rua Professora Kazuco Ohara",
  bairro: "Colúmbia",
  descricao: "Rua Professora Kazuco Ohara · Colúmbia, Londrina/PR · 110m² · 3 · 3 · 2 · R$ 2.600",
});
const OLX_SO_BAIRRO = anuncio("olx", "1517890225", {
  bairro: "Gleba Fazenda Palhano",
  descricao: "84m² 2 2 2",
});
const WIMOVEIS_SEM_TIPO = anuncio("wimoveis", "3021877241", { endereco: "Chile 656", bairro: "Centro" });
const WIMOVEIS_PLACEHOLDER = anuncio("wimoveis", "3009312078", {
  endereco: "Rua Diamante 1",
  bairro: "Ideal",
  descricao: "6258 m² tot.",
});
const WIMOVEIS_NAO_INFORMADO = anuncio("wimoveis", "2948449674", {
  endereco: "Endereço não informado",
  bairro: "Jardim Higienópolis",
});
const WIMOVEIS_NAO_INFORMADO_1 = anuncio("wimoveis", "3016928900", {
  endereco: "Endereço não informado 1",
  bairro: "Ideal",
});
const WIMOVEIS_SEM_VIRGULA = anuncio("wimoveis", "2944027978", { endereco: "Avenida Europa 1190" });
const WIMOVEIS_MILHAR = anuncio("wimoveis", "3039781136", {
  endereco: "Rua Caracas 1.200",
  bairro: "Gleba Fazenda Palhano",
});
const WIMOVEIS_CEP = anuncio("wimoveis", "3033447474", {
  endereco: "Avenida Jockei Club, 448, Jardim Joquei Club, Londrina - CEP: 86067000",
  bairro: "Jardim Jóquei Club",
});
const WIMOVEIS_CEP_ZERO = anuncio("wimoveis", "3014023460", {
  endereco: "Rua Houston, 0, Jardim Montreal, Londrina - CEP: 86060110",
  bairro: "Jardim Montreal",
});
const WIMOVEIS_JOAO_CANDIDO = anuncio("wimoveis", "3020191415", {
  endereco: "Rua Professor João Cândido 1",
  bairro: "Centro",
});
const VIVA_REAL_RUA = anuncio("viva-real", "2908524307", {
  endereco: "Rua Sônia Maria Marenga Garcia",
  bairro: "Jardim Tarumã",
  descricao: "Rua Sônia Maria Marenga Garcia · R$ 2.500/mês · Cond. isento • IPTU isento",
});
const VIVA_REAL_NAO_INFORMADO = anuncio("viva-real", "2908499822", {
  bairro: "Jardim Continental",
  descricao: "Endereço não informado · R$ 2.250/mês · Cond. isento • IPTU não informado",
});

const categoria = (item: Parameters<typeof qualidadeLocalizacaoRadar>[0]) => qualidadeLocalizacaoRadar(item).categoria;

describe("qualidadeLocalizacaoRadar: casos reais", () => {
  it.each([
    ["Chaves 45365235 (Rua, Casa, número)", VILA_FUJITA, "logradouro_numero", "378"],
    ["Chaves 40323649 (sem tipo de via)", CHAVES_MICHIGAN, "logradouro_numero", "610"],
    ["Wimoveis 3021877241 (sem tipo, sem vírgula)", WIMOVEIS_SEM_TIPO, "logradouro_numero", "656"],
    ["Wimoveis 2944027978 (número sem vírgula)", WIMOVEIS_SEM_VIRGULA, "logradouro_numero", "1190"],
    ["Wimoveis 3039781136 (número com milhar)", WIMOVEIS_MILHAR, "logradouro_numero", "1200"],
    ["Wimoveis 3033447474 (endereço completo com CEP)", WIMOVEIS_CEP, "logradouro_numero", "448"],
  ] as const)("%s → rua com número", (_nome, item, esperada, numero) => {
    expect(qualidadeLocalizacaoRadar(item)).toEqual({ categoria: esperada, numero });
  });

  it.each([
    ["Chaves 40494125 (--)", EDU_CHAVES_SANTOS_DUMONT],
    ["Chaves 46067136 (00)", BELA_SUICA_6_QUARTOS],
    ["Wimoveis 3009312078 (Rua Diamante 1)", WIMOVEIS_PLACEHOLDER],
    ["Wimoveis 3020191415 (Rua Professor João Cândido 1)", WIMOVEIS_JOAO_CANDIDO],
    ["Wimoveis 3014023460 (0 antes do CEP)", WIMOVEIS_CEP_ZERO],
  ])("%s → rua real, número placeholder", (_nome, item) => {
    expect(qualidadeLocalizacaoRadar(item)).toEqual({ categoria: "logradouro_numero_placeholder", numero: null });
  });

  it("rua sem número é localização útil (Chaves 46173078, Viva Real 2908524307)", () => {
    expect(categoria(CHAVES_RUA_SEM_NUMERO)).toBe("logradouro_sem_numero");
    expect(categoria(VIVA_REAL_RUA)).toBe("logradouro_sem_numero");
  });

  it("aviso do portal é indisponível, esteja no endereço ou só na descrição", () => {
    expect(categoria(CHAVES_INDISPONIVEL)).toBe("indisponivel");
    expect(categoria(WIMOVEIS_NAO_INFORMADO)).toBe("indisponivel");
    expect(categoria(WIMOVEIS_NAO_INFORMADO_1)).toBe("indisponivel");
    expect(categoria(VIVA_REAL_NAO_INFORMADO)).toBe("indisponivel");
  });

  it("OLX 1517890225 sem rua cai em bairro: localização útil, não erro", () => {
    expect(categoria(OLX_SO_BAIRRO)).toBe("bairro");
  });

  it("Chaves 46557200 ('Bairro Colinas, 1') não é rua: vale o bairro", () => {
    expect(categoria(CHAVES_BAIRRO_COLINAS)).toBe("bairro");
  });

  it("rua só no nome da foto não vira endereço (Chaves 31083573)", () => {
    expect(EDU_CHAVES_DOM_PEDRO.imagem).toContain("rua-edu-chaves");
    expect(categoria(EDU_CHAVES_DOM_PEDRO)).toBe("indisponivel");
  });
});

describe("qualidadeLocalizacaoRadar: fronteiras", () => {
  const com = (endereco: string | null, extra: Partial<AnuncioCentralAngariacao> = {}) =>
    anuncio("wimoveis", "1", { endereco, bairro: "Centro", ...extra });

  it.each([
    ["Rua Alagoas, 1674", "1674"],
    ["Rua Alagoas 1674", "1674"],
    ["Rua Alagoas, 1674, Centro, Londrina - CEP: 86010-520", "1674"],
    ["  rua   alagoas ,  1674  ", "1674"],
    ["RUA ALAGOAS 1674", "1674"],
    ["Rua Ucrânia, 87.", "87"],
    ["Rua Dom Henrique, 377 b", "377b"],
    ["Do Morango 89 A", "89a"],
    ["Avenida Gil de Abreu e Souza 5000", "5000"],
    ["Rua Gago Coutinho, 002", "2"],
  ])("%s → número %s", (endereco, numero) => {
    expect(qualidadeLocalizacaoRadar(com(endereco))).toEqual({ categoria: "logradouro_numero", numero });
  });

  it.each(["--", "0", "00", "000", "1", "sn", "s/n", "S/N"])("'Rua Alagoas, %s' é placeholder", (numero) => {
    expect(categoria(com(`Rua Alagoas, ${numero}`))).toBe("logradouro_numero_placeholder");
  });

  it.each(["Rua Alagoas 1", "Rua Alagoas 0", "Rua Alagoas sn"])("'%s' sem vírgula também é placeholder", (endereco) => {
    expect(categoria(com(endereco))).toBe("logradouro_numero_placeholder");
  });

  it.each([
    "Rua Alagoas",
    "Rua 10 de Dezembro",
    "AV Madre Leônia Milito",
    "Rua Luiz Lerco, 20 9",
  ])("'%s' é rua sem número confiável", (endereco) => {
    expect(categoria(com(endereco))).toBe("logradouro_sem_numero");
  });

  it.each([
    "Endereço não informado",
    "ENDEREÇO NÃO INFORMADO",
    "Endereco nao informado",
    "Endereço indisponível",
    "Endereço não informado 1",
  ])("'%s' nunca é logradouro", (endereco) => {
    expect(categoria(com(endereco))).toBe("indisponivel");
  });

  it("só o tipo da via, ou o bairro repetido, não é logradouro", () => {
    expect(categoria(com("Rua, 45"))).toBe("bairro");
    expect(categoria(com("Centro, 100"))).toBe("bairro");
  });

  it("sem endereço: bairro, depois cidade, depois nada", () => {
    expect(categoria(com(null))).toBe("bairro");
    expect(categoria(com(null, { bairro: null }))).toBe("cidade");
    expect(categoria(com(null, { bairro: "  ", cidade: " " }))).toBe("sem_localizacao");
    expect(categoria(com(null, { bairro: null, cidade: null }))).toBe("sem_localizacao");
  });

  it("aviso na descrição só conta no início, não no meio do texto", () => {
    expect(categoria(com(null, { descricao: "Casa ampla. Endereço não informado por segurança." }))).toBe("bairro");
  });

  it("é determinística e não altera o anúncio", () => {
    const item = com("Rua Alagoas 1674");
    const copia = structuredClone(item);
    expect(qualidadeLocalizacaoRadar(item)).toEqual(qualidadeLocalizacaoRadar(item));
    expect(item).toEqual(copia);
  });
});

describe("resumirLocalizacaoRadar", () => {
  it("conta todas as categorias, com zeros, e a soma é o total", () => {
    const itens = [VILA_FUJITA, CHAVES_MICHIGAN, EDU_CHAVES_SANTOS_DUMONT, CHAVES_RUA_SEM_NUMERO,
      CHAVES_INDISPONIVEL, OLX_SO_BAIRRO, CHAVES_BAIRRO_COLINAS];
    const resumo = resumirLocalizacaoRadar(itens);
    expect(Object.keys(resumo)).toEqual([...CATEGORIAS_LOCALIZACAO_RADAR]);
    expect(resumo).toEqual({
      logradouro_numero: 2,
      logradouro_numero_placeholder: 1,
      logradouro_sem_numero: 1,
      indisponivel: 1,
      bairro: 2,
      cidade: 0,
      sem_localizacao: 0,
    });
    expect(Object.values(resumo).reduce((soma, valor) => soma + valor, 0)).toBe(itens.length);
  });

  it("lista vazia devolve tudo zerado", () => {
    expect(Object.values(resumirLocalizacaoRadar([])).every((valor) => valor === 0)).toBe(true);
  });
});

describe("idExternoEhFallback", () => {
  it("reconhece o id posicional que idDoAnuncio gera sem número na URL", () => {
    const fallback = idDoAnuncio("viva-real", "https://www.vivareal.com.br/imovel/sem-id/", 3);
    expect(fallback).toMatch(/^viva-real-3-/);
    expect(idExternoEhFallback("viva-real", fallback)).toBe(true);
    expect(idExternoEhFallback("chaves-na-mao", idDoAnuncio("chaves-na-mao", "https://www.chavesnamao.com.br/imovel/x/", 0))).toBe(true);
  });

  it("ids reais dos portais não são fallback", () => {
    expect(idExternoEhFallback("olx", idDoAnuncio("olx", "https://pr.olx.com.br/imoveis/casa-1517890225", 0))).toBe(false);
    expect(idExternoEhFallback("chaves-na-mao", idDoAnuncio("chaves-na-mao", "https://www.chavesnamao.com.br/imovel/casa/id-45365235/", 0))).toBe(false);
    expect(idExternoEhFallback("viva-real", idDoAnuncio("viva-real", "https://www.vivareal.com.br/imovel/casa-id-2908524307/", 0))).toBe(false);
    expect(idExternoEhFallback("wimoveis", "3021877241")).toBe(false);
  });

  it("o prefixo precisa ser do próprio portal", () => {
    expect(idExternoEhFallback("olx", "chaves-na-mao-0-casa")).toBe(false);
  });
});

describe("pontuação atual (R4.2a só observa, não corrige)", () => {
  it("'Endereço não informado' ainda soma como endereço publicado", () => {
    expect(categoria(WIMOVEIS_NAO_INFORMADO)).toBe("indisponivel");
    expect(avaliarOportunidade(WIMOVEIS_NAO_INFORMADO).motivos).toContain("endereço publicado");
  });
});
