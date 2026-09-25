import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CATEGORIAS_LOCALIZACAO_RADAR } from "@/lib/calculo/localizacaoRadar";

const RAIZ = resolve(".");
const MONITOR = "lib/servidor/monitorRadarAngariacao.ts";
const SHADOW = "lib/calculo/localizacaoRadar.ts";
const SIMBOLOS_SHADOW = new Set([
  "CATEGORIAS_LOCALIZACAO_RADAR",
  "CategoriaLocalizacaoRadar",
  "QualidadeLocalizacaoRadar",
  "qualidadeLocalizacaoRadar",
  "classificarLocalizacaoRadar",
  "resumirLocalizacaoRadar",
]);
// As categorias de uma palavra também são termos comuns de outros domínios.
const CATEGORIAS_EXCLUSIVAS = new Set<string>(CATEGORIAS_LOCALIZACAO_RADAR.filter((categoria) => categoria.includes("_")));

function arquivosFonte(pasta: string): string[] {
  return readdirSync(resolve(RAIZ, pasta), { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) return arquivosFonte(caminho);
    return /\.tsx?$/.test(entrada.name) && !entrada.name.endsWith(".d.ts") ? [caminho] : [];
  });
}

function fonte(caminho: string): ts.SourceFile {
  const absoluto = resolve(RAIZ, caminho);
  return ts.createSourceFile(caminho, readFileSync(absoluto, "utf8"), ts.ScriptTarget.Latest, true);
}

function visitar(no: ts.Node, acao: (no: ts.Node, ancestrais: ts.Node[]) => void, ancestrais: ts.Node[] = []): void {
  acao(no, ancestrais);
  ts.forEachChild(no, (filho) => visitar(filho, acao, [...ancestrais, no]));
}

describe("fronteira do shadow de localização (R4.2b)", () => {
  it("a classificação e suas categorias só são consumidas pelo monitor de observabilidade", () => {
    const violacoes: string[] = [];
    for (const caminho of ["app", "components", "lib"].flatMap(arquivosFonte)) {
      const relativo = relative(RAIZ, resolve(RAIZ, caminho)).replace(/\\/g, "/");
      if (relativo === SHADOW) continue;
      const arquivo = fonte(caminho);
      visitar(arquivo, (no) => {
        const linha = arquivo.getLineAndCharacterOfPosition(no.getStart(arquivo)).line + 1;
        if (ts.isStringLiteralLike(no) && /(?:^|\/)localizacaoRadar(?:\.[jt]sx?)?$/.test(no.text)) {
          if (relativo !== MONITOR) violacoes.push(`${relativo}:${linha}: importação do shadow`);
        }
        if (ts.isIdentifier(no) && SIMBOLOS_SHADOW.has(no.text)) {
          if (relativo !== MONITOR || no.text !== "resumirLocalizacaoRadar") {
            violacoes.push(`${relativo}:${linha}: ${no.text}`);
          }
        }
        if (ts.isStringLiteralLike(no) && CATEGORIAS_EXCLUSIVAS.has(no.text)) {
          violacoes.push(`${relativo}:${linha}: categoria ${no.text}`);
        }
      });
    }
    expect(violacoes).toEqual([]);
  });

  it("o resumo só entra no evento após a persistência e não decide a seleção", () => {
    const arquivo = fonte(MONITOR);
    const chamadas: Array<{ nome: string; ancestrais: ts.Node[]; posicao: number }> = [];
    visitar(arquivo, (no, ancestrais) => {
      if (ts.isCallExpression(no) && ts.isIdentifier(no.expression)
        && ["resumirLocalizacaoRadar", "detalheLocalizacao"].includes(no.expression.text)) {
        chamadas.push({ nome: no.expression.text, ancestrais, posicao: no.getStart(arquivo) });
      }
    });
    const resumo = chamadas.filter((chamada) => chamada.nome === "resumirLocalizacaoRadar");
    const detalhe = chamadas.filter((chamada) => chamada.nome === "detalheLocalizacao");
    expect(resumo).toHaveLength(1);
    expect(resumo[0].ancestrais.some((no) => ts.isFunctionDeclaration(no) && no.name?.text === "detalheLocalizacao")).toBe(true);
    expect(detalhe).toHaveLength(1);
    expect(detalhe[0].ancestrais.some((no) => ts.isCallExpression(no)
      && ts.isIdentifier(no.expression) && no.expression.text === "detalheOpcional")).toBe(true);
    expect(detalhe[0].ancestrais.some((no) => ts.isCallExpression(no)
      && ts.isIdentifier(no.expression) && no.expression.text === "registrarRadar")).toBe(true);
    expect(detalhe[0].posicao).toBeGreaterThan(arquivo.text.indexOf(".upsert("));
  });

  it("score e shadow compartilham somente a regra neutra do aviso", () => {
    for (const caminho of ["lib/calculo/centralAngariacao.ts", SHADOW]) {
      const arquivo = fonte(caminho);
      const imports = arquivo.statements.filter(ts.isImportDeclaration)
        .map((no) => no.moduleSpecifier)
        .filter(ts.isStringLiteral)
        .map((no) => no.text);
      expect(imports).toContain("./avisoEndereco");
    }
  });
});
