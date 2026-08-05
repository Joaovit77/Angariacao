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
  // <HeaderCodigo>, que é um <th> com a ordenação por código.
  const cabecalhos =
    (lista.match(/<th[\s>]/g) || []).length +
    (lista.match(/<ColunaFiltro\b/g) || []).length +
    (lista.match(/<HeaderCodigo\b/g) || []).length;
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
    expect([...posicoes].sort((a, b) => a - b)).toEqual(
      Array.from({ length: cabecalhos }, (_, n) => n + 1),
    );
  });

  it("a coluna de Aluguel é a que o CSS alinha à direita", () => {
    // Se alguém mover o Aluguel de lugar, a classe vai junto — é ela que
    // manda, não a posição. O teste só garante que a classe existe dos dois
    // lados: no cabeçalho e na célula.
    expect(lista).toContain('<th className="col-aluguel">Aluguel</th>');
    expect(lista).toContain('className="col-aluguel"');
    expect(CSS).toContain(".pipeline-list-card th.col-aluguel");
  });
});
