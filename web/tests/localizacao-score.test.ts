import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avaliarOportunidade,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
  type PortalAngariacao,
} from "@/lib/calculo/centralAngariacao";
import {
  CATEGORIAS_LOCALIZACAO_RADAR,
  qualidadeLocalizacaoRadar,
  type CategoriaLocalizacaoRadar,
} from "@/lib/calculo/localizacaoRadar";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { EDU_CHAVES_SANTOS_DUMONT } from "./fixtures/radarChavesR41";
import { endereco, htmlZap, produto, apartamento } from "./fixtures/zap-listagem-sintetica";

/* R4.2i: a categoria de `qualidadeLocalizacaoRadar` decide os pontos de
   localização do score. Esta tabela é o contrato aprovado, escrita aqui de
   propósito (e não importada), para que o score não possa mudá-la sozinho. */
const PONTOS_APROVADOS: Record<CategoriaLocalizacaoRadar, number> = {
  logradouro_numero: 20,
  logradouro_numero_placeholder: 10,
  logradouro_sem_numero: 10,
  indisponivel: 10,
  bairro: 10,
  cidade: 10,
  sem_localizacao: 0,
};

const MOTIVOS_LOCALIZACAO: Record<CategoriaLocalizacaoRadar, string | null> = {
  logradouro_numero: "endereço com número publicado",
  logradouro_numero_placeholder: "rua publicada, número não confirmado",
  logradouro_sem_numero: "rua publicada, sem número",
  indisponivel: "localização parcial disponível",
  bairro: "bairro informado",
  cidade: "cidade informada",
  sem_localizacao: null,
};

function anuncio(campos: Partial<AnuncioCentralAngariacao> = {}, portal: PortalAngariacao = "wimoveis"): AnuncioCentralAngariacao {
  return {
    idExterno: "1",
    portal,
    titulo: "Casa para alugar",
    cidade: null,
    bairro: null,
    endereco: null,
    url: "https://portal.test/1",
    anunciante: "incerto",
    ...campos,
  };
}

/** Pontos de localização isolados: sem autoria, preço ou recência, a nota
    é a base 20 mais a localização. */
function pontosLocalizacao(item: AnuncioCentralAngariacao): number {
  return avaliarOportunidade({
    ...item,
    anunciante: "imobiliaria",
    preco: null,
    publicadoEm: null,
    publicadoTexto: null,
  }).nota - 20;
}

const RUA_NUMERO = anuncio({ endereco: "Rua Alagoas, 1674", bairro: "Centro", cidade: "Londrina" });
const RUA_SEM_NUMERO = anuncio({ endereco: "Rua Alagoas", bairro: "Centro", cidade: "Londrina" });
const BAIRRO = anuncio({ bairro: "Centro", cidade: "Londrina" });
const CIDADE = anuncio({ cidade: "Londrina" });
const SEM_LOCALIZACAO = anuncio();
const AVISO = anuncio({ endereco: "Endereço indisponível", bairro: "Centro", cidade: "Londrina" });
const comNumero = (numero: string) => anuncio({ endereco: `Rua Alagoas, ${numero}`, bairro: "Centro", cidade: "Londrina" });

describe("R4.2i: pontos de localização em avaliarOportunidade", () => {
  it.each([
    ["A. logradouro + número real", 20, RUA_NUMERO],
    ["B. logradouro sem número", 10, RUA_SEM_NUMERO],
    ["C. logradouro com '--'", 10, comNumero("--")],
    ["D. logradouro com '0'", 10, comNumero("0")],
    ["E. logradouro com '1'", 10, comNumero("1")],
    ["F. logradouro com 's/n'", 10, comNumero("s/n")],
    ["G. bairro somente", 10, BAIRRO],
    ["H. cidade somente", 10, CIDADE],
    ["I. sem localização", 0, SEM_LOCALIZACAO],
    ["J. aviso de endereço indisponível", 10, AVISO],
  ] as const)("%s → +%i", (_nome, pontos, item) => {
    expect(pontosLocalizacao(item)).toBe(pontos);
  });

  it("número placeholder nunca é endereço completo", () => {
    for (const numero of ["--", "0", "00", "000", "1", "sn", "s/n", "S/N"]) {
      const item = comNumero(numero);
      expect(qualidadeLocalizacaoRadar(item).categoria).toBe("logradouro_numero_placeholder");
      expect(pontosLocalizacao(item)).toBe(10);
      expect(avaliarOportunidade(item).motivos).toContain("rua publicada, número não confirmado");
    }
  });

  it("os motivos dizem o que gerou os pontos, sem chamar rua sem número de endereço", () => {
    expect(avaliarOportunidade(RUA_NUMERO).motivos).toContain("endereço com número publicado");
    expect(avaliarOportunidade(RUA_SEM_NUMERO).motivos).toContain("rua publicada, sem número");
    expect(avaliarOportunidade(BAIRRO).motivos).toContain("bairro informado");
    expect(avaliarOportunidade(CIDADE).motivos).toContain("cidade informada");
    expect(avaliarOportunidade(AVISO).motivos).toContain("localização parcial disponível");
    for (const item of [RUA_SEM_NUMERO, comNumero("--"), BAIRRO, CIDADE, AVISO]) {
      expect(avaliarOportunidade(item).motivos.some((motivo) => motivo.includes("endereço"))).toBe(false);
    }
  });

  it("sem localização não ganha motivo de localização", () => {
    expect(avaliarOportunidade({ ...SEM_LOCALIZACAO, anunciante: "imobiliaria" })).toEqual({
      nota: 20,
      faixa: "baixa",
      motivos: ["poucos dados públicos para priorização"],
    });
    expect(avaliarOportunidade(SEM_LOCALIZACAO).motivos).toEqual(["anunciante ainda precisa ser confirmado"]);
  });

  it("bairro e cidade só de espaços não contam como localização", () => {
    expect(pontosLocalizacao(anuncio({ bairro: "  ", cidade: " " }))).toBe(0);
  });
});

const FILTROS_ZAP: FiltrosCentralAngariacao = { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" };
const ID_ZAP = "2600000001";
const zap = (html: string) => {
  const [item] = extrairAnunciosFirecrawl(html, FILTROS_ZAP);
  return item;
};
const semRua = { address: endereco({ streetAddress: undefined }) };

/* Casos por portal. ZAP e Viva Real passam pelo parser real com HTML
   sintético; Chaves é caso real do R4.1; Wimoveis e o pseudo-endereço
   reproduzem formatos medidos na auditoria R4.2. */
describe("R4.2i: localização no score por portal", () => {
  it("ZAP: rua + bairro + cidade, sem número → logradouro_sem_numero, +10", () => {
    const item = zap(htmlZap([{ id: ID_ZAP }]));
    expect(item).toMatchObject({ endereco: "Rua Sergipe", bairro: "Centro", cidade: "Londrina", estado: "PR" });
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("logradouro_sem_numero");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("ZAP: bairro + cidade, sem rua → bairro, +10", () => {
    const item = zap(htmlZap([{
      id: ID_ZAP,
      produto: produto(ID_ZAP, semRua),
      apartamento: apartamento(ID_ZAP, semRua),
      folhas: ["Centro, Londrina", "60 m²"],
    }]));
    expect(item).toMatchObject({ endereco: null, bairro: "Centro", cidade: "Londrina" });
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("bairro");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("ZAP: cidade somente → cidade, +10", () => {
    const item = zap(htmlZap([{
      id: ID_ZAP,
      produto: produto(ID_ZAP, semRua),
      apartamento: apartamento(ID_ZAP, semRua),
      folhas: ["60 m²"],
    }]));
    expect(item).toMatchObject({ endereco: null, bairro: null, cidade: "Londrina", estado: "PR" });
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("cidade");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("Viva Real: rua sem número → +10, não +20", () => {
    const html = `<a href="https://www.vivareal.com.br/imovel/casa-2-quartos-jardim-taruma-londrina-id-2908524307/">
      <h2>Casa com 2 quartos para alugar em Jardim Tarumã, Londrina</h2>
      <p>Rua Sônia Maria Marenga Garcia</p><p>R$ 2.500/mês</p></a>`;
    const [item] = extrairAnunciosFirecrawl(html, { portal: "viva-real", cidade: "Londrina", estado: "PR" });
    expect(item).toMatchObject({ endereco: "Rua Sônia Maria Marenga Garcia", bairro: "Jardim Tarumã" });
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("logradouro_sem_numero");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("Chaves: 'Edu Chaves, --' (40494125) → +10", () => {
    expect(qualidadeLocalizacaoRadar(EDU_CHAVES_SANTOS_DUMONT).categoria).toBe("logradouro_numero_placeholder");
    expect(pontosLocalizacao(EDU_CHAVES_SANTOS_DUMONT)).toBe(10);
  });

  it("Wimoveis: 'Rua Diamante 1' → +10", () => {
    const item = anuncio({ endereco: "Rua Diamante 1", bairro: "Ideal", cidade: "Londrina" });
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("logradouro_numero_placeholder");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("pseudo-endereço 'Bairro Colinas, 1' não vira logradouro_numero → +10", () => {
    const item = anuncio({ endereco: "Bairro Colinas, 1", bairro: "Colinas", cidade: "Londrina" }, "chaves-na-mao");
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("bairro");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("OLX: só bairro → +10", () => {
    const item = anuncio({ bairro: "Gleba Fazenda Palhano", cidade: "Londrina" }, "olx");
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("bairro");
    expect(pontosLocalizacao(item)).toBe(10);
  });

  it("caso completo 'Rua Pará, 100' continua +20", () => {
    const item = anuncio({ endereco: "Rua Pará, 100", bairro: "Centro", cidade: "Londrina" }, "olx");
    expect(qualidadeLocalizacaoRadar(item).categoria).toBe("logradouro_numero");
    expect(pontosLocalizacao(item)).toBe(20);
  });
});

describe("R4.2i: concordância entre categoria e score", () => {
  const representantes: AnuncioCentralAngariacao[] = [
    RUA_NUMERO,
    comNumero("--"),
    RUA_SEM_NUMERO,
    AVISO,
    anuncio({ descricao: "Endereço indisponível · Centro, Londrina/PR", bairro: "Centro" }),
    BAIRRO,
    CIDADE,
    SEM_LOCALIZACAO,
    EDU_CHAVES_SANTOS_DUMONT,
    anuncio({ endereco: "Bairro Colinas, 1", bairro: "Colinas" }),
    anuncio({ endereco: "Centro, 100", bairro: "Centro" }),
    anuncio({ endereco: "Avenida Jockei Club, 448, Jardim Joquei Club, Londrina - CEP: 86067000" }),
    anuncio({ endereco: "Rua Houston, 0, Jardim Montreal, Londrina - CEP: 86060110" }),
    anuncio({ endereco: "Rua Caracas 1.200" }),
    anuncio({ endereco: "   ", bairro: "Centro" }),
  ];

  it("as sete categorias têm representante", () => {
    const cobertas = new Set(representantes.map((item) => qualidadeLocalizacaoRadar(item).categoria));
    expect([...cobertas].sort()).toEqual([...CATEGORIAS_LOCALIZACAO_RADAR].sort());
  });

  it.each(representantes.map((item) => [item.endereco ?? item.bairro ?? item.cidade ?? "(vazio)", item] as const))(
    "'%s': pontos e motivo do score seguem a categoria",
    (_nome, item) => {
      const categoria = qualidadeLocalizacaoRadar(item).categoria;
      expect(pontosLocalizacao(item)).toBe(PONTOS_APROVADOS[categoria]);
      const motivos = avaliarOportunidade(item).motivos;
      for (const [outra, motivo] of Object.entries(MOTIVOS_LOCALIZACAO)) {
        if (motivo) expect(motivos.includes(motivo)).toBe(outra === categoria);
      }
    },
  );
});

describe("R4.2i: pesos fora da localização não mudam", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const neutro = anuncio({ anunciante: "imobiliaria" });

  it("autoria: proprietário +30, incerto +8, imobiliária 0", () => {
    expect(avaliarOportunidade(neutro).nota).toBe(20);
    expect(avaliarOportunidade({ ...neutro, anunciante: "incerto" }).nota).toBe(28);
    expect(avaliarOportunidade({ ...neutro, anunciante: "proprietario" }).nota).toBe(50);
  });

  it("preço informado +10", () => {
    expect(avaliarOportunidade({ ...neutro, preco: 1800 })).toMatchObject({ nota: 30, motivos: ["valor do aluguel informado"] });
    expect(avaliarOportunidade({ ...neutro, preco: 0 }).nota).toBe(20);
  });

  it("recência: 24 horas +20, 7 dias +12, só texto +4", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
    expect(avaliarOportunidade({ ...neutro, publicadoEm: "2026-09-28T02:00:00.000Z" }).nota).toBe(40);
    expect(avaliarOportunidade({ ...neutro, publicadoEm: "2026-09-24T12:00:00.000Z" }).nota).toBe(32);
    expect(avaliarOportunidade({ ...neutro, publicadoEm: "2026-08-01T12:00:00.000Z" }).nota).toBe(20);
    expect(avaliarOportunidade({ ...neutro, publicadoTexto: "Hoje" }).nota).toBe(24);
  });

  it("faixas: alta ≥ 75, média ≥ 50, baixa abaixo, com teto 100", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
    const completo = { ...RUA_NUMERO, anunciante: "proprietario" as const, preco: 1800 };
    expect(avaliarOportunidade(completo)).toMatchObject({ nota: 80, faixa: "alta" });
    expect(avaliarOportunidade({ ...completo, publicadoEm: "2026-09-28T10:00:00.000Z" }).nota).toBe(100);
    expect(avaliarOportunidade({ ...RUA_NUMERO, preco: 1800 })).toMatchObject({ nota: 58, faixa: "media" });
    expect(avaliarOportunidade({ ...RUA_SEM_NUMERO, preco: 1800 })).toMatchObject({ nota: 48, faixa: "baixa" });
  });
});
