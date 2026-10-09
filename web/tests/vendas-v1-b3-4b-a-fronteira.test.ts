import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const fonte = (caminho: string) => readFileSync(join(__dirname, "..", caminho), "utf8");
const COMPONENTE = "components/vendas/SeletorImovelVenda.tsx";
const ADAPTADOR = "lib/persistencia/vendasImoveisLeitura.ts";
const PERMITIDOS = {
  [COMPONENTE]: new Set(["react", "@/lib/constantes", "@/lib/calculo/valoresImovel", "@/lib/persistencia/vendasImoveisLeitura", "./seletorImovelVenda.css"]),
  [ADAPTADOR]: new Set(["../constantes", "./supabase"]),
};

function violaFronteira(codigo: string, arquivo: keyof typeof PERMITIDOS): boolean {
  const arvore = ts.createSourceFile(arquivo, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let violacao = false;
  const visitar = (no: ts.Node) => {
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) {
      const modulo = no.moduleSpecifier;
      if (modulo && (!ts.isStringLiteral(modulo) || !PERMITIDOS[arquivo].has(modulo.text))) violacao = true;
      if (arquivo === COMPONENTE && modulo && ts.isStringLiteral(modulo) && modulo.text.includes("persistencia/")) {
        if (!ts.isImportDeclaration(no) || !no.importClause?.isTypeOnly) violacao = true;
      }
    }
    if (ts.isCallExpression(no) && (no.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(no.expression) && ["require", "eval", "fetch", "Function"].includes(no.expression.text)))) violacao = true;
    ts.forEachChild(no, visitar);
  };
  visitar(arvore);
  return violacao || /\.\s*(rpc|insert|update|upsert|delete)\s*\(|executarComandoVenda|consultarInteressadoVenda|service_role|SERVICE_ROLE|supabaseAdmin|createClient|\/api\/|locarImoveis|repasses|vendas_criar/.test(codigo);
}

describe("B3.4b-A: fronteira exclusiva de leitura de imóveis", () => {
  it("componente e adaptador têm dependências fechadas; componente só importa os tipos de leitura", () => {
    expect(violaFronteira(fonte(COMPONENTE), COMPONENTE)).toBe(false);
    expect(violaFronteira(fonte(ADAPTADOR), ADAPTADOR)).toBe(false);
  });
  it.each([
    'import { executarComandoVenda } from "@/lib/persistencia/vendas"; executarComandoVenda("criar", {});',
    'import { PORTAS_VENDAS } from "@/lib/persistencia/vendasComandos";',
    'import type { ComandosVenda } from "@/lib/persistencia/vendasComandos";',
    'import { resolver } from "@/lib/persistencia/vendasInteressado";',
    'import { listar } from "@/lib/persistencia/vendasLeitura";',
    'import { locarImoveis } from "@/lib/persistencia/locacoes";',
    'import { repasses } from "@/lib/persistencia/repasses";',
    'export { executarComandoVenda } from "@/lib/persistencia/vendas";',
    'const banco = await import("@/lib/persistencia/vendas");',
    'const banco = require("@/lib/persistencia/vendas");',
    'fetch("/api/criar-oportunidade");',
    'banco.rpc("vendas_criar");',
    'import { listarImoveisCandidatosVenda } from "@/lib/persistencia/vendasImoveisLeitura";',
  ])("recusa ponte de mutação ou leitura fora do building block: %s", (codigo) => {
    expect(violaFronteira(codigo, COMPONENTE)).toBe(true);
  });
  it("adaptador não recebe user_id; Auth antecede SELECT e aplica escopo confiável", () => {
    const codigo = fonte(ADAPTADOR);
    expect(codigo).toContain('import { getSupabase } from "./supabase"');
    expect(codigo).toContain("getSupabase()");
    expect(codigo).toContain("await banco.auth.getUser()");
    expect(codigo).toContain('eq("user_id", usuarioId)');
    expect(codigo).not.toMatch(/process\.env|userId\s*[:=]|usuarioId\s*:\s*string/);
    const esquema = readFileSync(join(__dirname, "../../supabase-schema.sql"), "utf8");
    expect(esquema).toMatch(/alter table imoveis enable row level security/i);
    expect(esquema).toMatch(/create policy "select_own_imoveis" on imoveis\s+for select using \(auth.uid\(\) = user_id\)/);
  });
  it("B3.4a-R continua sem importar ou montar o seletor/catalogo", () => {
    for (const arquivo of ["components/vendas/VendasView.tsx", "components/vendas/DrawerOportunidadeVenda.tsx", "app/(painel)/vendas/page.tsx", "lib/persistencia/vendasLeitura.ts"]) {
      expect(fonte(arquivo)).not.toMatch(/SeletorImovelVenda|vendasImoveisLeitura/);
    }
  });
  it("CSS só atua no bloco e usa tokens existentes", () => {
    const css = fonte("components/vendas/seletorImovelVenda.css");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|:root|\.vendas-view|\.vendas-toolbar/);
    const seletores = css.split("\n").filter((linha) => linha.includes("{") && !linha.startsWith("@"));
    expect(seletores.every((linha) => linha.trim().startsWith(".vendas-imoveis-"))).toBe(true);
  });
  it("harness usa somente fixtures; smoke autenticado fica fora da suíte comum e bloqueia escrita", () => {
    expect(fonte("tests/harness/vendas-b34b-a/main.tsx")).not.toMatch(/getSupabase|createClient|listarImoveisCandidatosVenda|fetch\(/);
    expect(fonte("vitest.config.ts")).toContain('include: ["tests/**/*.test.ts"]');
    const smoke = fonte("integration/vendas-v1-b3-4b-a-leitura-manual.test.ts");
    expect(smoke).toContain('process.env.VENDAS_IMOVEIS_SMOKE_READONLY !== "1"');
    expect(smoke).toContain('if (metodo !== "GET")');
    expect(smoke).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|dotenv|loadEnv|readFile/);
  });
});
