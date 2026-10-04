/** A fronteira é uma lista permitida, verificada pela AST e por toda a pasta. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PASTA = fileURLToPath(new URL("../lib/vendas/", import.meta.url));
const DATAS = fileURLToPath(new URL("../lib/datas.ts", import.meta.url));
function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = resolve(pasta, item.name);
    return item.isDirectory() ? arquivos(caminho) : [caminho];
  });
}
const FONTES = arquivos(PASTA);
function problemas(nome: string, texto: string): string[] {
  const erros: string[] = [];
  const fonte = ts.createSourceFile(nome, texto, ts.ScriptTarget.Latest, true);
  const importPermitido = (origem: string) => {
    if (!origem.startsWith(".")) return false;
    const destino = resolve(dirname(nome), origem + ".ts");
    return destino.startsWith(resolve(PASTA) + sep) || destino === DATAS;
  };
  function visitar(no: ts.Node) {
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) {
      if (no.moduleSpecifier) {
        if (!ts.isStringLiteral(no.moduleSpecifier) || !importPermitido(no.moduleSpecifier.text)) {
          erros.push("Dependência fora do domínio: " + no.moduleSpecifier.getText(fonte));
        } else if (resolve(dirname(nome), no.moduleSpecifier.text + ".ts") === DATAS) {
          const clausula = ts.isImportDeclaration(no) ? no.importClause : undefined;
          const vinculos = clausula?.namedBindings;
          const permitidos = ["dataOperacionalDeTimestamp", "inicioDoDiaOperacionalISO", "isoDeTimestamp", "timestampDeIso"];
          if (!vinculos || !ts.isNamedImports(vinculos)
            || vinculos.elements.some((item) => !permitidos.includes((item.propertyName ?? item.name).text))
            || clausula?.name) erros.push("Datas deve fornecer apenas conversões determinísticas");
        }
      }
    }
    if (ts.isImportEqualsDeclaration(no)
      || (ts.isCallExpression(no) && no.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      erros.push("Importação dinâmica ou indireta");
    }
    if (ts.isIdentifier(no) && [
      "require", "fetch", "Date", "process", "window", "document", "localStorage",
      "sessionStorage", "crypto", "setTimeout", "setInterval", "console", "Math",
      "STATUS_FLOW", "Imovel", "AgendaItem", "getSupabase",
    ].includes(no.text)) erros.push("Dependência ou efeito proibido: " + no.text);
    ts.forEachChild(no, visitar);
  }
  visitar(fonte);
  return erros;
}
describe("fronteira do domínio puro de Vendas", () => {
  it("inspeciona arquivos reais e proíbe arquivos de UI ou persistência escondidos na pasta", () => {
    expect(FONTES.length).toBeGreaterThanOrEqual(3);
    expect(FONTES.every((nome) => nome.endsWith(".ts"))).toBe(true);
    const erros = FONTES.flatMap((nome) => problemas(nome, readFileSync(nome, "utf8")).map((erro) => nome + ": " + erro));
    expect(erros).toEqual([]);
  });
  it.each([
    'import { STATUS_FLOW } from "../constantes";',
    'import type { Imovel } from "../tipos";',
    'import { x } from "../mutacoes";',
    'import { x } from "../servidor/contatos";',
    'export { x } from "../repasses";',
    'import { x } from "../calculo/sistemaPrincipal";',
    'import { x } from "../calculo/agenda";',
    'import { x } from "../calculo/whatsapp";',
    'import { x } from "../calculo/ia";',
    'import { x } from "../radarAngariacao";',
    'import { x } from "react";',
    'import { x } from "@supabase/supabase-js";',
    'import { x } from "./../../lib/mutacoes";',
    'const x = import("../mutacoes");',
    'const x = require("../mutacoes");',
    'const x = fetch("https://exemplo.invalid");',
    'const x = Date.now();',
    'const x = Math.random();',
    'import { todayISO } from "../datas";',
    'import * as datas from "../datas";',
  ])("o detector reconhece uma violação real: %s", (codigo) => {
    expect(problemas(resolve(PASTA, "exemplo.ts"), codigo).length).toBeGreaterThan(0);
  });
  it("permite somente contratos locais e conversões puras de datas", () => {
    expect(problemas(resolve(PASTA, "exemplo.ts"),
      'import type { EstadoVenda } from "./tipos"; import { timestampDeIso } from "../datas";')).toEqual([]);
  });
});
