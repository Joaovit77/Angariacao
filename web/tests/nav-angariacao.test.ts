// @vitest-environment jsdom
/* Agrupamento das ferramentas de captação numa entrada "Angariação" do menu:
   a faixa NavAngariacao alterna entre elas, o item do menu acende em todas e
   FERRAMENTAS_ANGARIACAO é a fonte única que barra, faixa e layout leem. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ pathname: "/garimpo-em-campo", radarNovos: 0 }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => cenario.pathname,
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (seletor: (estado: { radarNovos: number }) => unknown) => seletor({ radarNovos: cenario.radarNovos }),
}));

import NavAngariacao from "@/components/painel/NavAngariacao";
import {
  FERRAMENTAS_ANGARIACAO,
  ROTA_ANGARIACAO,
  ferramentaAtiva,
  rotaCorresponde,
} from "@/components/painel/ferramentasAngariacao";

const raiz = resolve(".");
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

afterEach(() => {
  cleanup();
  cenario.pathname = "/garimpo-em-campo";
  cenario.radarNovos = 0;
});

describe("Fonte única das ferramentas de angariação", () => {
  it("lista as quatro ferramentas existentes, nas rotas reais e na ordem do menu antigo", () => {
    expect(FERRAMENTAS_ANGARIACAO.map((f) => [f.rota, f.texto])).toEqual([
      ["/garimpo-em-campo", "Garimpo em Campo"],
      ["/avaliacao", "Avaliação Rápida"],
      ["/central-angariacao", "Central de Angariação"],
      ["/investigador-imoveis", "Investigador de Imóveis"],
    ]);
    expect(ROTA_ANGARIACAO).toBe("/garimpo-em-campo");
    // O contador do Radar pertence à Central, não ao grupo.
    expect(FERRAMENTAS_ANGARIACAO.filter((f) => f.badge).map((f) => f.rota)).toEqual(["/central-angariacao"]);
  });

  it("reconhece subrota (Catálogo do Garimpo) e devolve null fora da área", () => {
    expect(ferramentaAtiva("/garimpo-em-campo/catalogo")?.texto).toBe("Garimpo em Campo");
    expect(ferramentaAtiva("/avaliacao")?.texto).toBe("Avaliação Rápida");
    expect(ferramentaAtiva("/pipeline")).toBeNull();
    expect(ferramentaAtiva("/avaliacoes")).toBeNull();
    expect(rotaCorresponde("/central-angariacao", "/central-angariacao")).toBe(true);
    expect(rotaCorresponde("/central-angariacao-x", "/central-angariacao")).toBe(false);
  });
});

describe("NavAngariacao", () => {
  it("mostra as quatro ferramentas como links para as rotas reais, com a atual marcada", () => {
    cenario.pathname = "/avaliacao";
    render(createElement(NavAngariacao));
    const nav = screen.getByRole("navigation", { name: "Ferramentas de angariação" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(FERRAMENTAS_ANGARIACAO.map((f) => f.rota));
    expect(links.map((l) => l.textContent)).toEqual(FERRAMENTAS_ANGARIACAO.map((f) => f.texto));
    expect(within(nav).getByRole("link", { name: "Avaliação Rápida" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Garimpo em Campo" }).getAttribute("aria-current")).toBeNull();
  });

  it("no Catálogo do Garimpo, o link do Garimpo continua ativo", () => {
    cenario.pathname = "/garimpo-em-campo/catalogo";
    render(createElement(NavAngariacao));
    expect(screen.getByRole("link", { name: "Garimpo em Campo" }).getAttribute("aria-current")).toBe("page");
  });

  it("mostra o contador do Radar apenas no link da Central, e só quando há novos", () => {
    render(createElement(NavAngariacao));
    expect(screen.queryByText("3")).toBeNull();
    cleanup();
    cenario.radarNovos = 3;
    render(createElement(NavAngariacao));
    const central = screen.getByRole("link", { name: /Central de Angariação/ });
    expect(within(central).getByText("3").className).toBe("nav-angariacao-badge");
    expect(within(screen.getByRole("link", { name: /Garimpo em Campo/ })).queryByText("3")).toBeNull();
  });
});

describe("Menu lateral e shell", () => {
  it("a barra tem uma única entrada 'Angariação', sem badge, acesa em todas as rotas da lista", () => {
    const barra = ler("components/painel/BarraLateral.tsx");
    expect(barra.match(/texto: "Angariação"/g)).toHaveLength(1);
    expect(barra.match(/rota: ROTA_ANGARIACAO/g)).toHaveLength(1);
    expect(barra).toContain("rotasAtivas: FERRAMENTAS_ANGARIACAO.map((f) => f.rota)");
    for (const rota of ['"/avaliacao"', '"/central-angariacao"', '"/investigador-imoveis"', '"/garimpo-em-campo"']) {
      expect(barra).not.toContain(`rota: ${rota}`);
    }
    // O item do grupo não carrega o contador do Radar.
    const grupo = barra.slice(barra.indexOf("rota: ROTA_ANGARIACAO"), barra.indexOf('rota: "/repasses"'));
    expect(grupo).not.toContain("badge:");
    expect(barra).toContain("rotaCorresponde(pathname, rota)");
    expect(barra).toContain("item.rotasAtivas ?? []");
  });

  it("o shell monta a faixa só nas rotas da área, fora do div que re-anima por pathname", () => {
    const layout = ler("app/(painel)/layout.tsx");
    expect(layout).toContain('import NavAngariacao from "@/components/painel/NavAngariacao"');
    expect(layout).toMatch(/\{ferramentaAtiva\(pathname\) && <NavAngariacao \/>\}\s*<div key=\{pathname\} className="view-anim">/);
  });

  it("as páginas e rotas das quatro ferramentas continuam as mesmas", () => {
    expect(ler("app/(painel)/garimpo-em-campo/page.tsx")).toContain("return <ProspeccaoView />;");
    expect(ler("app/(painel)/garimpo-em-campo/catalogo/page.tsx")).toContain("return <CatalogoVisualView />;");
    expect(ler("app/(painel)/central-angariacao/page.tsx")).toContain("return <CentralAngariacaoView />;");
    expect(ler("app/(painel)/avaliacao/page.tsx")).toContain("<AvaliacaoRapidaView");
    expect(ler("app/(painel)/investigador-imoveis/page.tsx")).toContain("<InvestigadorImoveisView");
  });
});
