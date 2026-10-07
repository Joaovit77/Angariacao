/* ================================================================
   AS LARGURAS DA LISTA SÃO POSICIONAIS — E ISSO QUEBRA CALADO

   As colunas do Pipeline têm largura fixada por `nth-child` no
   style.css, porque deixar a tabela distribuir sozinha fazia o selo de
   telefone (curto) receber a mesma faixa larga do Aluguel: o valor
   parecia pertencer à coluna errada, e foi essa a queixa.

   O preço de fixar por posição é que inserir uma coluna no meio
   desloca TODAS as larguras seguintes, sem erro de compilação e sem
   teste vermelho — só a tela torta. Este arquivo é a trava: cabeçalho,
   linha e CSS têm que concordar sobre quantas colunas existem.
   ================================================================ */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const VIEW = readFileSync(new URL("../components/pipeline/PipelineView.tsx", import.meta.url), "utf-8");
const CSS = readFileSync(new URL("../app/style.css", import.meta.url), "utf-8");

/** O corpo da função `Lista` — as outras tabelas do arquivo não contam. */
function blocoLista(): string {
  const inicio = VIEW.indexOf("function Lista(");
  expect(inicio).toBeGreaterThan(-1);
  const fim = VIEW.indexOf("\nfunction ", inicio + 1);
  return VIEW.slice(inicio, fim === -1 ? undefined : fim);
}

describe("colunas da Lista do Pipeline", () => {
  const lista = blocoLista();

  // Três formas de escrever um cabeçalho aqui, e as três contam: o <th>
  // literal, o <ColunaFiltro> (que renderiza um <th> com menu de filtro) e o
  // <HeaderIdentificacao>, que é um <th> com a ordenação pelo identificador escolhido.
  const cabecalhos =
    (lista.match(/<th[\s>]/g) || []).length +
    (lista.match(/<ColunaFiltro\b/g) || []).length +
    (lista.match(/<HeaderIdentificacao\b/g) || []).length;
  const celulas = (lista.match(/<td[\s>]/g) || []).length;

  it("cabeçalho e linha têm o mesmo número de colunas", () => {
    expect(cabecalhos).toBe(celulas);
  });

  it("o CSS fixa largura para todas elas, e não para colunas que não existem", () => {
    const posicoes = [...CSS.matchAll(/\.pipeline-list-card th:nth-child\((\d+)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(posicoes.length).toBeGreaterThan(0);
    // Cobertura completa: 1..N, sem buraco e sem sobra.
    // Regras responsivas podem repetir uma posição para redefinir/ocultar a
    // coluna no mobile; a trava é de COBERTURA das posições, não unicidade.
    expect([...new Set(posicoes)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: cabecalhos }, (_, n) => n + 1),
    );
  });

  it("a coluna de valor é a que o CSS alinha à direita", () => {
    // Se alguém mover a coluna de lugar, a classe vai junto: é ela que
    // manda, não a posição. O teste só garante que a classe existe dos dois
    // lados: no cabeçalho e na célula. O texto passou a "Valor" no IV-3A,
    // porque num imóvel de venda a célula mostra a venda, não o aluguel.
    expect(lista).toContain('<th className="col-aluguel">Valor</th>');
    expect(lista).toContain('className="col-aluguel"');
    expect(CSS).toContain(".pipeline-list-card th.col-aluguel");
  });

  describe("larguras do desktop (IV-3A.2)", () => {
    /* Só as regras fora de @media: são elas que valem no desktop. As do
       celular redefinem posições e não entram na conta. */
    function semMedia(css: string): string {
      let out = "";
      let i = 0;
      while (i < css.length) {
        const m = css.indexOf("@media", i);
        if (m === -1) return out + css.slice(i);
        out += css.slice(i, m);
        let j = css.indexOf("{", m) + 1;
        for (let prof = 1; prof > 0; j++) {
          if (css[j] === "{") prof++;
          else if (css[j] === "}") prof--;
        }
        i = j;
      }
      return out;
    }
    const DESKTOP = semMedia(CSS.replace(/\/\*[\s\S]*?\*\//g, ""));
    const larguras = new Map<number, string>();
    for (const m of DESKTOP.matchAll(
      /\.pipeline-list-card th:nth-child\((\d+)\),\s*\.pipeline-list-card td:nth-child\(\1\)\{\s*width:\s*([^;]+);/g,
    )) {
      larguras.set(Number(m[1]), m[2].trim());
    }
    const minWidth = Number(
      /\.pipeline-list-card table\{[^}]*min-width:\s*(\d+)px/.exec(DESKTOP)?.[1] ?? NaN,
    );
    /* A posição da coluna de valor vem do JSX, não de um número fixo aqui. */
    const posicaoValor = (() => {
      const marcas = [...lista.matchAll(/<th[\s>]|<ColunaFiltro\b|<HeaderIdentificacao\b/g)];
      const alvo = lista.indexOf('<th className="col-aluguel">');
      return marcas.findIndex((m) => m.index === alvo) + 1;
    })();
    /** Mínimo útil do endereço, o texto mais longo da linha. */
    const ENDERECO_MINIMO = 240;
    /** Padding horizontal da célula (12px de cada lado, border-box). */
    const PADDING_CELULA = 24;
    /** "Venda R$ 1.500.000,50" medido em 13px Segoe UI: 129px. */
    const TEXTO_VALOR_MAIS_LONGO = 129;

    it("só o Endereço é auto; as demais têm largura fixa em px", () => {
      expect(larguras.size).toBe(cabecalhos);
      for (const [pos, w] of larguras) {
        if (pos === 3) expect(w).toBe("auto");
        else expect(w).toMatch(/^\d+px$/);
      }
    });

    it("a coluna de valor cabe 'Venda R$ 1.500.000,50' sem cortar", () => {
      expect(posicaoValor).toBeGreaterThan(0);
      const valor = parseInt(larguras.get(posicaoValor) ?? "0", 10);
      expect(valor - PADDING_CELULA).toBeGreaterThanOrEqual(TEXTO_VALOR_MAIS_LONGO);
    });

    it("soma das fixas + mínimo do endereço cabe no min-width da tabela", () => {
      const somaFixas = [...larguras.values()]
        .filter((w) => w !== "auto")
        .reduce((s, w) => s + parseInt(w, 10), 0);
      expect(Number.isFinite(minWidth)).toBe(true);
      expect(somaFixas + ENDERECO_MINIMO).toBeLessThanOrEqual(minWidth);
    });
  });

  it("no mobile preserva espaço para Endereço e mantém Status visível", () => {
    expect(CSS).toContain(".pipeline-list-card table{ min-width:0; width:100%; table-layout:fixed; }");
    expect(CSS).toContain(".pipeline-list-card th:nth-child(3), .pipeline-list-card td:nth-child(3){ width:auto; }");
    expect(CSS).not.toContain(
      ".pipeline-list-card th:nth-child(11), .pipeline-list-card td:nth-child(11){ display:none; }",
    );
    expect(CSS).toContain(".pipeline-list-card th:nth-child(6), .pipeline-list-card td:nth-child(6){ display:none; }");
  });
});
