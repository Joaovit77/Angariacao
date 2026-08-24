import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DESCRICAO_SITE, URL_SITE } from "@/lib/site";

const PAGINA = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const LAYOUT = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const IMAGEM_SOCIAL = readFileSync(
  new URL("../app/imagem-social.tsx", import.meta.url),
  "utf8",
);
const OPEN_GRAPH = readFileSync(
  new URL("../app/opengraph-image.tsx", import.meta.url),
  "utf8",
);
const TWITTER = readFileSync(new URL("../app/twitter-image.tsx", import.meta.url), "utf8");
const SLIDE = readFileSync(
  new URL("../components/auth/SlideApresentacao.tsx", import.meta.url),
  "utf8",
);
const VITRINE = readFileSync(
  new URL("../components/auth/Vitrine.tsx", import.meta.url),
  "utf8",
);

describe("SEO da página pública", () => {
  it("publica título, descrição, URL canônica e cartões sociais", () => {
    expect(LAYOUT).toContain("metadataBase: new URL(URL_SITE)");
    expect(PAGINA).toContain('alternates: { canonical: "/" }');
    expect(PAGINA).toContain('type: "website"');
    expect(PAGINA).toContain('locale: "pt_BR"');
    expect(PAGINA).toContain('card: "summary_large_image"');
    expect(DESCRICAO_SITE.length).toBeGreaterThanOrEqual(120);
    expect(DESCRICAO_SITE.length).toBeLessThanOrEqual(160);
  });

  it("gera imagens sociais no formato recomendado", () => {
    for (const rota of [OPEN_GRAPH, TWITTER]) {
      expect(rota).toContain("width: 1200");
      expect(rota).toContain("height: 630");
      expect(rota).toContain('contentType = "image/png"');
      expect(rota).toContain("Angario — sua carteira imobiliária em movimento");
    }
    expect(IMAGEM_SOCIAL).toContain("Sua carteira,");
    expect(IMAGEM_SOCIAL).toContain("em movimento.");
  });

  it("mantém uma única hierarquia principal de título", () => {
    expect(SLIDE).toContain("<h1");
    expect(VITRINE).toContain('<h2 className="showcase-headline">');
    expect(VITRINE).not.toContain('<h1 className="showcase-headline">');
  });

  it("expõe somente a página pública no sitemap e protege rotas internas dos robôs", () => {
    expect(sitemap()).toEqual([{ url: URL_SITE, changeFrequency: "weekly", priority: 1 }]);
    const configuracao = robots();
    expect(configuracao.sitemap).toBe(`${URL_SITE}/sitemap.xml`);
    expect(configuracao.host).toBe(URL_SITE);
    expect(configuracao.rules).toEqual(
      expect.objectContaining({
        userAgent: "*",
        allow: "/",
        disallow: expect.arrayContaining(["/api/", "/dashboard", "/pipeline", "/admin"]),
      }),
    );
  });
});
