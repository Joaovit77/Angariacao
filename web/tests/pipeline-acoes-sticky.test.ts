// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const estilo = document.createElement("style");
estilo.textContent = readFileSync(resolve("app/style.css"), "utf8");
document.head.append(estilo);
afterAll(() => estilo.remove());

// O CSSOM ignora comentários e formatação; cada declaração é consultada
// separadamente, sem copiar o bloco inteiro de CSS para o teste.
const folha = estilo.sheet!;
const desktop = [...folha.cssRules].find(
  (regra): regra is CSSMediaRule => regra instanceof CSSMediaRule
    && regra.conditionText === "screen and (min-width: 721px)",
)!;

function regra(seletor: string, regras: CSSRuleList = desktop.cssRules): CSSStyleDeclaration {
  const encontradas = [...regras].filter(
    (r): r is CSSStyleRule => r instanceof CSSStyleRule
      && r.selectorText.split(",").map((s) => s.trim()).includes(seletor),
  );
  expect(encontradas.length, `Regra ausente: ${seletor}`).toBeGreaterThan(0);
  const declaracoes = document.createElement("div").style;
  for (const encontrada of encontradas) {
    for (let i = 0; i < encontrada.style.length; i++) {
      const propriedade = encontrada.style[i];
      declaracoes.setProperty(propriedade, encontrada.style.getPropertyValue(propriedade));
    }
  }
  return declaracoes;
}

function baseOpaca(fundo: string) {
  // O último plano precisa ser uma cor opaca, inclusive quando a seleção
  // sobrepõe um gradiente translúcido. Confere os tokens nos dois temas.
  const token = /var\((--[\w-]+)\)\s*$/.exec(fundo)?.[1];
  expect(token, "Fundo precisa de uma base opaca por token").toBeDefined();
  for (const raiz of [":root", ':root[data-tema="claro"]']) {
    const estilos = regra(raiz, folha.cssRules);
    let cor = estilos.getPropertyValue(token!).trim();
    const referencia = /^var\((--[\w-]+)\)$/.exec(cor)?.[1];
    if (referencia) cor = regra(":root", folha.cssRules).getPropertyValue(referencia).trim();
    expect(cor, `${token} em ${raiz}`).toMatch(/^#[\da-f]{6}$/i);
  }
}

describe("IV-3A.4: ações acessíveis durante o scroll da Lista", () => {
  it("o sticky só atua no desktop e no container que rola", () => {
    expect(desktop).toBeDefined();
    expect(regra(".table-scroll", folha.cssRules).getPropertyValue("overflow-x")).toBe("auto");
    const view = readFileSync(resolve("components/pipeline/PipelineView.tsx"), "utf8");
    expect(view).toContain('className="card table-scroll pipeline-list-card"');
  });

  it.each(["th", "td"])("%s de ações fica sticky à direita, com fundo opaco", (tag) => {
    const acao = regra(`.pipeline-list-card ${tag}:last-child`);
    expect(acao.getPropertyValue("position")).toBe("sticky");
    expect(acao.getPropertyValue("right")).toMatch(/^0(?:px)?$/);
    baseOpaca(acao.getPropertyValue("background"));
  });

  it("somente a última coluna recebe sticky", () => {
    for (const r of desktop.cssRules) {
      if (!(r instanceof CSSStyleRule) || r.style.getPropertyValue("position") !== "sticky") continue;
      expect(r.selectorText.split(",").map((s) => s.trim())).toEqual([
        ".pipeline-list-card th:last-child", ".pipeline-list-card td:last-child",
      ]);
    }
    const mobile = [...folha.cssRules].find(
      (r): r is CSSMediaRule => r instanceof CSSMediaRule && r.conditionText === "(max-width: 720px)"
        && [...r.cssRules].some((filha) => filha instanceof CSSStyleRule
          && filha.selectorText.includes(".pipeline-list-card th:nth-child(14)")),
    )!;
    for (const tag of ["th", "td"]) {
      expect(regra(`.pipeline-list-card ${tag}:nth-child(14)`, mobile.cssRules).getPropertyValue("display")).toBe("none");
    }
  });

  it("cabeçalho cobre o corpo e ambos ficam abaixo das camadas de interface", () => {
    const corpo = Number(regra(".pipeline-list-card td:last-child").getPropertyValue("z-index"));
    const cabecalho = Number(regra(".pipeline-list-card th:last-child").getPropertyValue("z-index"));
    expect(corpo).toBeGreaterThan(0);
    expect(cabecalho).toBeGreaterThan(corpo);
    const raiz = regra(":root", folha.cssRules);
    for (const token of ["--layer-popover", "--layer-pipeline-drawer", "--layer-modal", "--layer-toast"]) {
      expect(cabecalho).toBeLessThan(Number(raiz.getPropertyValue(token)));
    }
  });

  it("hover e seleção preservam o fundo da linha com uma base opaca", () => {
    const hover = regra(".pipeline-list-card .pipeline-list-row:hover td:last-child").getPropertyValue("background");
    expect(hover).toBe(regra(".pipeline-list-row:hover", folha.cssRules).getPropertyValue("background"));
    baseOpaca(hover);
    for (const estado of [".selected", ".selected:hover"]) {
      const fundo = regra(`.pipeline-list-card .pipeline-list-row${estado} td:last-child`).getPropertyValue("background");
      expect(fundo).toMatch(/linear-gradient\(var\(--accent-soft\),\s*var\(--accent-soft\)\)/);
      baseOpaca(fundo);
    }
  });

  it("preserva 1466px na tabela, 160px no Valor e ao menos 240px no Endereço", () => {
    expect(regra(".pipeline-list-card table", folha.cssRules).getPropertyValue("min-width")).toBe("1466px");
    expect(regra(".pipeline-list-card th:nth-child(10)", folha.cssRules).getPropertyValue("width")).toBe("160px");
    expect(regra(".pipeline-list-card th:nth-child(14)", folha.cssRules).getPropertyValue("width")).toBe("78px");
    expect(regra(".pipeline-list-card th:nth-child(3)", folha.cssRules).getPropertyValue("width")).toBe("auto");
    let fixas = 0;
    for (let coluna = 1; coluna <= 14; coluna++) {
      if (coluna === 3) continue;
      fixas += parseFloat(regra(`.pipeline-list-card th:nth-child(${coluna})`, folha.cssRules).getPropertyValue("width"));
    }
    expect(1466 - fixas).toBeGreaterThanOrEqual(240);
  });
});
