/* ================================================================
   RLS OBRIGATÓRIA EM TODA TABELA NOVA

   O banco de produção carrega uma event trigger legada, `ensure_rls`,
   que liga RLS sozinha em qualquer `create table` no schema public.
   Ela não pode ser versionada: `create event trigger` exige superuser,
   e no Supabase de hoje nem a role `postgres` é superuser — só
   `supabase_admin`. Ou seja, um ambiente novo nasce sem essa rede.

   Como o app publica a anon key, tabela sem RLS é vazamento de dados
   de todo mundo. Então a garantia não pode morar no banco: mora aqui,
   conferindo que todo arquivo que cria tabela também liga RLS nela.
   ================================================================ */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url);
const PASTA_MIGRATIONS = new URL("supabase/migrations/", RAIZ);

interface ArquivoSql {
  nome: string;
  sql: string;
}

const CANONICO: ArquivoSql = {
  nome: "supabase-schema.sql",
  sql: readFileSync(new URL("supabase-schema.sql", RAIZ), "utf8"),
};

const MIGRATIONS: ArquivoSql[] = readdirSync(PASTA_MIGRATIONS)
  .filter((nome) => nome.endsWith(".sql"))
  .sort()
  .map((nome) => ({
    nome: `supabase/migrations/${nome}`,
    sql: readFileSync(new URL(nome, PASTA_MIGRATIONS), "utf8"),
  }));

const ARQUIVOS = [CANONICO, ...MIGRATIONS];

/** Toda tabela é verificada, inclusive a fundação privada de recibos do V1-B1. */
function tabelasCriadas(sql: string): string[] {
  return [...new Set([...sql.matchAll(/^[ \t]*create table (?:if not exists )?((?:\w+\.)?\w+)/gim)]
    .map((m) => m[1].includes(".") ? m[1] : "public." + m[1]))];
}

function ligaRls(sql: string, tabela: string): boolean {
  const alvo = tabela.startsWith("public.") ? "(?:public\\.)?" + tabela.slice(7) : tabela.replace(".", "\\.");
  return new RegExp("alter table (?:if exists )?" + alvo + " enable row level security", "i").test(sql);
}

describe("RLS obrigatória no schema", () => {
  it("liga RLS no mesmo arquivo que cria a tabela", () => {
    const semProtecao = ARQUIVOS.flatMap(({ nome, sql }) =>
      tabelasCriadas(sql)
        .filter((tabela) => !ligaRls(sql, tabela))
        .map((tabela) => `${nome} cria ${tabela} sem ligar RLS`),
    );
    expect(semProtecao).toEqual([]);
  });

  it("só permite schemas/tabelas privados explicitamente aprovados", () => {
    const foraDoPublic = ARQUIVOS.flatMap(({ nome, sql }) =>
      [...sql.matchAll(/^[ \t]*create table (?:if not exists )?(\w+)\.\w+/gim)]
        .filter((m) => m[1].toLowerCase() !== "public" && !/^create table (?:if not exists )?private\.vendas_comandos\b/i.test(m[0].trim()))
        .map((m) => `${nome}: ${m[0].trim()}`),
    );
    expect(foraDoPublic).toEqual([]);
  });

  /* Sem esta âncora, um regex que parasse de casar deixaria os dois
     testes acima passando com lista vazia — verdes e cegos. */
  it("enxerga o schema canônico inteiro", () => {
    const tabelas = tabelasCriadas(CANONICO.sql);
    expect(tabelas).toContain("public.imoveis");
    expect(tabelas).toContain("public.repasses");
    expect(tabelas).toContain("private.vendas_comandos");
    expect(ligaRls("", "private.vendas_comandos")).toBe(false);
    expect(ligaRls("alter table private.vendas_comandos enable row level security", "private.vendas_comandos")).toBe(true);
    expect(tabelas.length).toBeGreaterThanOrEqual(29);
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(52);
  });
});
