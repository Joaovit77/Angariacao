import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function camada(css: string, nome: string) {
  const valor = css.match(new RegExp(`--layer-${nome}:\\s*(\\d+)`))?.[1];
  if (!valor) throw new Error(`Token de camada ausente: ${nome}`);
  return Number(valor);
}

describe("camada visual do assistente", () => {
  it("fica acima do drawer e do modal, abaixo do feedback global", () => {
    const css = readFileSync(join(process.cwd(), "app/style.css"), "utf8");
    expect(camada(css, "assistente")).toBeGreaterThan(camada(css, "pipeline-drawer"));
    expect(camada(css, "assistente")).toBeGreaterThan(camada(css, "modal"));
    expect(camada(css, "assistente")).toBeLessThan(camada(css, "acao-persistente"));
  });

  it("aplica o mesmo token ao painel e acionador, inclusive no layout mobile", () => {
    const componente = readFileSync(join(process.cwd(), "components/assistente/Assistente.tsx"), "utf8");
    expect(componente.match(/zIndex: "var\(--layer-assistente\)"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(componente).toContain("assistente-acionador-com-drawer");
    const css = readFileSync(join(process.cwd(), "app/style.css"), "utf8");
    expect(css).toContain("button.assistente-acionador-com-drawer");
    const mobile = css.slice(css.indexOf("@media (max-width:720px)"));
    expect(mobile).toContain(".assistente-painel-global");
    expect(mobile).toContain("inset:0 !important");
  });

  it("define encaixe controlado e fallback responsivo previsivel", () => {
    const cssGlobal = readFileSync(join(process.cwd(), "app/style.css"), "utf8");
    const cssModulo = readFileSync(join(process.cwd(), "components/assistente/Assistente.module.css"), "utf8");
    expect(cssGlobal).toContain("@media (min-width:960px)");
    expect(cssGlobal).toContain("aside.assistente-com-drawer");
    expect(cssGlobal).toContain("@media (min-width:1024px) and (max-width:1319px)");
    expect(cssGlobal).toContain("width:clamp(320px, calc(100vw - 712px), 410px)");
    expect(cssGlobal).toContain(".app-shell:has(~ aside.assistente-com-modal) + .modal-overlay.open");
    expect(cssGlobal).toContain("justify-content:flex-end");
    expect(cssGlobal).toContain("@media (min-width:1320px)");
    expect(cssGlobal).toContain("aside.assistente-com-modal");
    expect(cssModulo).toContain("height: 100dvh");
    expect(cssModulo).toContain("env(safe-area-inset-bottom)");
    expect(cssModulo).toContain("overscroll-behavior: contain");
  });

  it("nao renderiza a mensagem duplicada de lista vazia", () => {
    const componente = readFileSync(join(process.cwd(), "components/assistente/RespostaEstruturada.tsx"), "utf8");
    expect(componente).toContain("blocosComItens(blocos)");
    expect(componente).not.toContain("Nenhum registro encontrado");
  });
});
