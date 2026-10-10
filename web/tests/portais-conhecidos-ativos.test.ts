// R4.2g/R4.2h — portal CONHECIDO (representa, lê, persiste) x portal ATIVO (pode
// ser coletado). Desde o R4.2h o ZAP é conhecido E ativo, mas só dentro da
// capacidade restrita (Londrina/PR + Apartamento, sem bairro).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ehPortalAtivo,
  ehPortalConhecido,
  PORTAIS_ATIVOS,
  PORTAIS_CONHECIDOS,
  rotuloPortal,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { derivarFatosHistoricosComparavel } from "@/lib/calculo/historicoComparaveisMercado";
import { planejarColetaPorZonasLondrina } from "@/lib/calculo/regioesLondrina";
import {
  capacidadeGeograficaPortal,
  extrairJsonLd,
  PortalSemCoberturaGeografica,
  urlDaPesquisa,
} from "@/lib/servidor/centralAngariacao";
import { planejarColetaMercadoLegado as planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";

const QUATRO = ["olx", "chaves-na-mao", "wimoveis", "viva-real"];
const LONDRINA = { cidade: "Londrina", estado: "PR" };

describe("invariantes de portal conhecido x ativo", () => {
  it("os quatro portais anteriores seguem ativos, na mesma ordem, e o zap vem depois", () => {
    expect(PORTAIS_ATIVOS).toEqual([...QUATRO, "zap"]);
  });

  it("zap é conhecido e ativo (R4.2h)", () => {
    expect(ehPortalConhecido("zap")).toBe(true);
    expect(ehPortalAtivo("zap")).toBe(true);
  });

  it("todo portal ativo também é conhecido", () => {
    for (const portal of PORTAIS_ATIVOS) expect(ehPortalConhecido(portal)).toBe(true);
  });

  it("nada arbitrário vira conhecido nem ativo", () => {
    expect(PORTAIS_CONHECIDOS).toEqual([...QUATRO, "zap"]);
    for (const valor of ["portal-inexistente", "ZAP", " zap", "", null, undefined, 1, {}]) {
      expect(ehPortalConhecido(valor), String(valor)).toBe(false);
      expect(ehPortalAtivo(valor), String(valor)).toBe(false);
    }
  });

  it("os conhecidos inativos continuam listados explicitamente (hoje nenhum)", () => {
    expect(PORTAIS_CONHECIDOS.filter((portal) => !ehPortalAtivo(portal))).toEqual([]);
  });

  it("filtro de consulta aceita zap e recusa portal arbitrário em tempo de compilação", () => {
    const zap: FiltrosCentralAngariacao = { portal: "zap", ...LONDRINA, tipo: "Apartamento" };
    expect(ehPortalAtivo(zap.portal)).toBe(true);
    const arbitrario: FiltrosCentralAngariacao = {
      // @ts-expect-error portal arbitrário não é portal ativo de consulta.
      portal: "portal-inexistente",
      ...LONDRINA,
    };
    expect(ehPortalAtivo(arbitrario.portal)).toBe(false);
  });

  it("rótulos dos cinco portais ativos", () => {
    expect(PORTAIS_ATIVOS.map(rotuloPortal)).toEqual(["OLX", "Chaves na Mão", "Wimoveis", "Viva Real", "ZAP Imóveis"]);
  });
});

describe("coleta do zap só dentro da capacidade restrita", () => {
  it("capacidade recusa zap sem tipo e mantém as fronteiras anteriores", () => {
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: "zap" })).toMatchObject({ suportado: false });
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: "zap", tipo: "Apartamento" })).toMatchObject({ suportado: true, nivel: "comprovado" });
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: "olx" })).toMatchObject({ suportado: true, nivel: "comprovado" });
    expect(capacidadeGeograficaPortal({ ...LONDRINA, portal: "viva-real" })).toMatchObject({ suportado: true, nivel: "limitado" });
  });

  it("builder recusa zap fora da capacidade", () => {
    expect(() => urlDaPesquisa({ ...LONDRINA, portal: "zap" })).toThrow(PortalSemCoberturaGeografica);
  });

  it("fallback JSON-LD (HTTP direto) continua fechado para zap e aberto para os demais", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "RealEstateListing", name: "x", url: "https://www.zapimoveis.com.br/imovel/x-id-2612345678/",
    })}</script>`;
    expect(() => extrairJsonLd(html, "zap", "https://www.zapimoveis.com.br/")).toThrow(PortalSemCoberturaGeografica);
    expect(extrairJsonLd(html.replace(/zapimoveis/g, "vivareal"), "viva-real", "https://www.vivareal.com.br/")).toHaveLength(1);
  });

  it("planejador de mercados (sem tipo) gera as mesmas quatro consultas de Londrina, sem zap", () => {
    const plano = planejarColetaMercado({ ...LONDRINA, finalidade: "locacao", segmento: "residencial" });
    expect(plano.consultas.map((consulta) => consulta.filtros.portal)).toEqual(QUATRO);
    expect(plano.consultas.some((consulta) => consulta.url.includes("zapimoveis"))).toBe(false);
  });

  it("coleta por zonas continua só com os portais priorizados atuais", () => {
    const portais = new Set(planejarColetaPorZonasLondrina().map((consulta) => consulta.portal));
    expect([...portais].sort()).toEqual(["chaves-na-mao", "viva-real", "wimoveis"]);
  });
});

describe("o que fica visível do zap", () => {
  it("a Central oferece os cinco portais e anuncia o recorte do ZAP", () => {
    const tela = readFileSync(new URL("../components/central/CentralAngariacaoView.tsx", import.meta.url), "utf8");
    expect(tela).toContain('(["olx", "chaves-na-mao", "wimoveis", "viva-real", "zap"] as const).map(');
    expect(tela).toContain("capacidadeFuncionalZap(");
    expect(tela).toContain("COBERTURA_ZAP");
  });

  it("o proxy de imagem libera só o host das fotos do ZAP", () => {
    const proxy = readFileSync(new URL("../app/api/central-angariacao/imagem/route.ts", import.meta.url), "utf8");
    expect(proxy).toContain('"resizedimgs.zapimoveis.com.br"');
    expect(proxy).not.toContain("cdn-zap-ssr-prod");
  });
});

describe("leitura de dado salvo reconhece zap", () => {
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
