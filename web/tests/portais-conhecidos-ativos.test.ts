// R4.2g — portal CONHECIDO (representa, lê, persiste) x portal ATIVO (pode ser
// coletado). O ZAP é conhecido e inerte: nenhum caminho de coleta o aceita.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ehPortalAtivo,
  ehPortalConhecido,
  PORTAIS_ATIVOS,
  PORTAIS_CONHECIDOS,
  rotuloPortal,
  type FiltrosCentralAngariacao,
  type PortalAtivoAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { derivarFatosHistoricosComparavel } from "@/lib/calculo/historicoComparaveisMercado";
import { planejarColetaPorZonasLondrina } from "@/lib/calculo/regioesLondrina";
import {
  capacidadeGeograficaPortal,
  extrairJsonLd,
  PortalSemCoberturaGeografica,
  urlDaPesquisa,
} from "@/lib/servidor/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";

const QUATRO = ["olx", "chaves-na-mao", "wimoveis", "viva-real"];
// O valor só atravessa uma API de coleta com cast: é exatamente o uso indevido que ela deve recusar.
const ZAP_FORCADO = "zap" as unknown as PortalAtivoAngariacao;
const LONDRINA = { cidade: "Londrina", estado: "PR" };

describe("R4.2g: invariantes de portal conhecido x ativo", () => {
  it("os quatro portais atuais seguem ativos, na mesma ordem", () => {
    expect(PORTAIS_ATIVOS).toEqual(QUATRO);
  });

  it("zap é conhecido e não é ativo", () => {
    expect(PORTAIS_CONHECIDOS).toContain("zap");
    expect(PORTAIS_ATIVOS).not.toContain("zap");
    expect(ehPortalConhecido("zap")).toBe(true);
    expect(ehPortalAtivo("zap")).toBe(false);
  });

  it("todo portal ativo também é conhecido", () => {
    for (const portal of PORTAIS_ATIVOS) expect(ehPortalConhecido(portal)).toBe(true);
  });

  it("os conhecidos são exatamente os ativos mais o zap: nada arbitrário entra", () => {
    expect(PORTAIS_CONHECIDOS).toEqual([...QUATRO, "zap"]);
    for (const valor of ["portal-inexistente", "ZAP", " zap", "", null, undefined, 1, {}]) {
      expect(ehPortalConhecido(valor), String(valor)).toBe(false);
      expect(ehPortalAtivo(valor), String(valor)).toBe(false);
    }
  });

  it("nenhum conhecido vira ativo por padrão: os inativos são listados explicitamente", () => {
    expect(PORTAIS_CONHECIDOS.filter((portal) => !ehPortalAtivo(portal))).toEqual(["zap"]);
  });

  it("filtro de consulta não aceita zap em tempo de compilação", () => {
    const filtros: FiltrosCentralAngariacao = {
      // @ts-expect-error zap é conhecido, mas não é portal ativo de consulta.
      portal: "zap",
      ...LONDRINA,
    };
    expect(ehPortalAtivo(filtros.portal)).toBe(false);
  });

  it("rótulo representa o valor conhecido sem mudar os quatro atuais", () => {
    expect(rotuloPortal("zap")).toBe("ZAP Imóveis");
    expect(PORTAIS_ATIVOS.map(rotuloPortal)).toEqual(["OLX", "Chaves na Mão", "Wimoveis", "Viva Real"]);
  });
});

describe("R4.2g: toda a coleta continua fechada para o zap", () => {
  it("capacidade geográfica recusa zap e mantém as quatro fronteiras", () => {
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: ZAP_FORCADO })).toMatchObject({ suportado: false });
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: "olx" })).toMatchObject({ suportado: true, nivel: "comprovado" });
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: "viva-real" })).toMatchObject({ suportado: true, nivel: "limitado" });
  });

  it("não existe builder de URL para zap", () => {
    expect(() => urlDaPesquisa({ ...LONDRINA, portal: ZAP_FORCADO })).toThrow(PortalSemCoberturaGeografica);
  });

  it("parser Firecrawl falha fechado para zap em vez de devolver lista vazia", () => {
    const html = "<html><body><li data-testid=\"rp-property-cd\"><a href=\"https://www.zapimoveis.com.br/imovel/x-id-2612345678/\">x</a></li></body></html>";
    expect(() => extrairAnunciosFirecrawl(html, { ...LONDRINA, portal: ZAP_FORCADO })).toThrow(/não ativo/);
  });

  it("fallback JSON-LD falha fechado para zap em vez de cair na regra genérica", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "RealEstateListing", name: "x", url: "https://www.zapimoveis.com.br/imovel/x-id-2612345678/",
    })}</script>`;
    expect(() => extrairJsonLd(html, ZAP_FORCADO, "https://www.zapimoveis.com.br/")).toThrow(PortalSemCoberturaGeografica);
    // Os quatro ativos continuam passando pelo mesmo extrator.
    expect(extrairJsonLd(html.replace(/zapimoveis/g, "vivareal"), "viva-real", "https://www.vivareal.com.br/")).toHaveLength(1);
  });

  it("planejador de mercados gera as mesmas quatro consultas de Londrina, sem zap", () => {
    const plano = planejarColetaMercado({ ...LONDRINA, finalidade: "locacao", segmento: "residencial" });
    expect(plano.consultas.map((consulta) => consulta.filtros.portal)).toEqual(QUATRO);
    expect(plano.consultas.some((consulta) => consulta.url.includes("zapimoveis"))).toBe(false);
  });

  it("coleta por zonas continua só com os portais priorizados atuais", () => {
    const portais = new Set(planejarColetaPorZonasLondrina().map((consulta) => consulta.portal));
    expect([...portais].sort()).toEqual(["chaves-na-mao", "viva-real", "wimoveis"]);
  });
});

describe("R4.2g: nada visível muda", () => {
  it("a Central continua oferecendo exatamente os quatro portais", () => {
    const tela = readFileSync(new URL("../components/central/CentralAngariacaoView.tsx", import.meta.url), "utf8");
    expect(tela).toContain('(["olx", "chaves-na-mao", "wimoveis", "viva-real"] as const).map(');
    expect(tela).not.toMatch(/zap/i);
  });

  it("o proxy de imagem não libera hosts do ZAP (isso é do R4.2h)", () => {
    const proxy = readFileSync(new URL("../app/api/central-angariacao/imagem/route.ts", import.meta.url), "utf8");
    expect(proxy).not.toMatch(/zap/i);
  });
});

describe("R4.2g: leitura de dado salvo reconhece zap", () => {
  const referencia = {
    primeiroVistoEm: "2026-09-01T10:00:00Z",
    ultimoVistoEm: "2026-09-02T10:00:00Z",
    idExterno: "2612345678",
    urlCanonica: null,
    fingerprintForte: false,
    estado: "PR",
    cidadeChave: "londrina",
  };

  it("histórico de comparáveis trata zap como portal conhecido com identidade pública", () => {
    const zap = derivarFatosHistoricosComparavel({ ...referencia, portal: "zap" }, []);
    expect(zap.qualidade).toMatchObject({ portalConhecido: true, identidadeConfiavel: true });
    const arbitrario = derivarFatosHistoricosComparavel({ ...referencia, portal: "portal-inexistente" }, []);
    expect(arbitrario.qualidade).toMatchObject({ portalConhecido: false, identidadeConfiavel: false });
  });
});
