import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CATEGORIAS_LOCALIZACAO_RADAR } from "@/lib/calculo/localizacaoRadar";

const RAIZ = resolve(".");
const MONITOR = "lib/servidor/monitorRadarAngariacao.ts";
const SHADOW = "lib/calculo/localizacaoRadar.ts";
const SCORE = "lib/calculo/centralAngariacao.ts";
const VIEW = "components/central/CentralAngariacaoView.tsx";
const SIMBOLOS_SHADOW = new Set([
  "CATEGORIAS_LOCALIZACAO_RADAR",
  "CategoriaLocalizacaoRadar",
  "QualidadeLocalizacaoRadar",
  "qualidadeLocalizacaoRadar",
  "classificarLocalizacaoRadar",
  "resumirLocalizacaoRadar",
]);
/* Únicos usos autorizados fora do módulo (R4.2i): o monitor resume para a
   telemetria; o score classifica para pontuar. Nada mais. */
const USOS_AUTORIZADOS: Record<string, Set<string>> = {
  [MONITOR]: new Set(["resumirLocalizacaoRadar"]),
  [SCORE]: new Set(["qualidadeLocalizacaoRadar", "CategoriaLocalizacaoRadar"]),
};
// As categorias de uma palavra também são termos comuns de outros domínios.
const CATEGORIAS_EXCLUSIVAS = new Set<string>(CATEGORIAS_LOCALIZACAO_RADAR.filter((categoria) => categoria.includes("_")));
/* O score só pode ser exibido. Chamado dentro destes callbacks, ele passaria
   a selecionar, filtrar ou ordenar anúncios. */
const METODOS_DE_DECISAO = new Set([
  "sort", "toSorted", "filter", "find", "findIndex", "findLast", "findLastIndex", "some", "every", "reduce", "flatMap",
]);
// Arquivos que montam a lista do Radar: a ordem vem do banco, nunca de uma ordenação local.
const LISTA_RADAR = ["lib/radarAngariacao.ts", "lib/calculo/radarAngariacao.ts", MONITOR, VIEW];

function arquivosFonte(pasta: string): string[] {
  return readdirSync(resolve(RAIZ, pasta), { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) return arquivosFonte(caminho);
    return /\.tsx?$/.test(entrada.name) && !entrada.name.endsWith(".d.ts") ? [caminho] : [];
  });
}

const fontes = new Map<string, ts.SourceFile>();
function fonte(caminho: string): ts.SourceFile {
  const relativo = relative(RAIZ, resolve(RAIZ, caminho)).replace(/\\/g, "/");
  let arquivo = fontes.get(relativo);
  if (!arquivo) {
    arquivo = ts.createSourceFile(relativo, readFileSync(resolve(RAIZ, relativo), "utf8"), ts.ScriptTarget.Latest, true);
    fontes.set(relativo, arquivo);
  }
  return arquivo;
}

function visitar(no: ts.Node, acao: (no: ts.Node, ancestrais: ts.Node[]) => void, ancestrais: ts.Node[] = []): void {
  acao(no, ancestrais);
  ts.forEachChild(no, (filho) => visitar(filho, acao, [...ancestrais, no]));
}

const nomeDoMetodo = (no: ts.Node): string | null =>
  ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) ? no.expression.name.text : null;

const dentroDaFuncao = (ancestrais: ts.Node[], nome: string) =>
  ancestrais.some((no) => ts.isFunctionDeclaration(no) && no.name?.text === nome);

describe("fronteira da qualidade de localização (R4.2a → R4.2i)", () => {
  it("a classificação só é consumida pelo monitor (telemetria) e pelo score", () => {
    const violacoes: string[] = [];
    for (const caminho of ["app", "components", "lib"].flatMap(arquivosFonte)) {
      const arquivo = fonte(caminho);
      const relativo = arquivo.fileName;
      if (relativo === SHADOW) continue;
      const autorizados = USOS_AUTORIZADOS[relativo];
      visitar(arquivo, (no, ancestrais) => {
        const linha = arquivo.getLineAndCharacterOfPosition(no.getStart(arquivo)).line + 1;
        if (ts.isStringLiteralLike(no) && /(?:^|\/)localizacaoRadar(?:\.[jt]sx?)?$/.test(no.text)) {
          if (!autorizados) violacoes.push(`${relativo}:${linha}: importação da classificação`);
        }
        if (ts.isIdentifier(no) && SIMBOLOS_SHADOW.has(no.text)) {
          if (!autorizados?.has(no.text)) violacoes.push(`${relativo}:${linha}: ${no.text}`);
          else if (relativo === SCORE && no.text === "qualidadeLocalizacaoRadar"
            && !ts.isImportSpecifier(no.parent) && !dentroDaFuncao(ancestrais, "avaliarOportunidade")) {
            violacoes.push(`${relativo}:${linha}: classificação fora de avaliarOportunidade`);
          }
        }
        if (ts.isStringLiteralLike(no) && CATEGORIAS_EXCLUSIVAS.has(no.text)) {
          violacoes.push(`${relativo}:${linha}: categoria ${no.text}`);
        }
      });
    }
    expect(violacoes).toEqual([]);
  });

  it("o score é só exibido: nunca seleciona, filtra, deduplica, ordena ou planeja", () => {
    const violacoes: string[] = [];
    for (const caminho of ["app", "components", "lib"].flatMap(arquivosFonte)) {
      const arquivo = fonte(caminho);
      const relativo = arquivo.fileName;
      visitar(arquivo, (no, ancestrais) => {
        if (!ts.isIdentifier(no) || no.text !== "avaliarOportunidade") return;
        if (ts.isFunctionDeclaration(no.parent) || ts.isImportSpecifier(no.parent)) return;
        const linha = arquivo.getLineAndCharacterOfPosition(no.getStart(arquivo)).line + 1;
        if (relativo !== VIEW) {
          violacoes.push(`${relativo}:${linha}: avaliarOportunidade fora da exibição`);
          return;
        }
        const decisao = ancestrais.map(nomeDoMetodo).find((nome) => nome && METODOS_DE_DECISAO.has(nome));
        if (decisao) violacoes.push(`${relativo}:${linha}: avaliarOportunidade dentro de .${decisao}()`);
      });
    }
    expect(violacoes).toEqual([]);
  });

  it("a lista do Radar segue encontrado_em decrescente, sem ordenação local", () => {
    const ordenacoes: string[] = [];
    for (const caminho of LISTA_RADAR) {
      const arquivo = fonte(caminho);
      visitar(arquivo, (no) => {
        const metodo = nomeDoMetodo(no);
        if (metodo === "sort" || metodo === "toSorted") {
          ordenacoes.push(`${caminho}:${arquivo.getLineAndCharacterOfPosition(no.getStart(arquivo)).line + 1}`);
        }
      });
    }
    expect(ordenacoes).toEqual([]);

    const leituras: string[] = [];
    visitar(fonte("lib/radarAngariacao.ts"), (no, ancestrais) => {
      if (nomeDoMetodo(no) !== "order" || !dentroDaFuncao(ancestrais, "carregarRadar")) return;
      const texto = no.getText();
      if (texto.includes('"radar_anuncios"')) leituras.push(texto.slice(texto.lastIndexOf(".order(")));
    });
    expect(leituras).toEqual(['.order("encontrado_em", { ascending: false })']);
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
    expect(dentroDaFuncao(resumo[0].ancestrais, "detalheLocalizacao")).toBe(true);
    expect(detalhe).toHaveLength(1);
    expect(detalhe[0].ancestrais.some((no) => ts.isCallExpression(no)
      && ts.isIdentifier(no.expression) && no.expression.text === "detalheOpcional")).toBe(true);
    expect(detalhe[0].ancestrais.some((no) => ts.isCallExpression(no)
      && ts.isIdentifier(no.expression) && no.expression.text === "registrarRadar")).toBe(true);
    expect(detalhe[0].posicao).toBeGreaterThan(arquivo.text.indexOf(".upsert("));
  });

  it("o score não tem classificação própria: não lê os campos de local nem o aviso", () => {
    const arquivo = fonte(SCORE);
    const imports = arquivo.statements.filter(ts.isImportDeclaration)
      .map((no) => no.moduleSpecifier)
      .filter(ts.isStringLiteral)
      .map((no) => no.text);
    expect(imports).toContain("./localizacaoRadar");
    expect(imports).not.toContain("./avisoEndereco");
    expect(fonte(SHADOW).statements.filter(ts.isImportDeclaration)
      .map((no) => (no.moduleSpecifier as ts.StringLiteral).text)).toContain("./avisoEndereco");

    const CAMPOS_DE_LOCAL = ["endereco", "bairro", "cidade", "descricao"];
    const leituras: string[] = [];
    visitar(arquivo, (no, ancestrais) => {
      if (!dentroDaFuncao(ancestrais, "avaliarOportunidade")) return;
      if (ts.isPropertyAccessExpression(no) && CAMPOS_DE_LOCAL.includes(no.name.text)) leituras.push(no.getText());
      if (ts.isElementAccessExpression(no) && ts.isStringLiteralLike(no.argumentExpression)
        && CAMPOS_DE_LOCAL.includes(no.argumentExpression.text)) {
        leituras.push(no.getText());
      }
      if (ts.isBindingElement(no) && CAMPOS_DE_LOCAL.includes((no.propertyName ?? no.name).getText())) {
        leituras.push(no.getText());
      }
      if (ts.isIdentifier(no) && no.text === "ehAvisoEnderecoIndisponivel") leituras.push(no.text);
    });
    expect(leituras).toEqual([]);
  });
});
