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

/** Só `public` importa: é o único schema exposto pela anon key. O
    `private` guarda função, nunca tabela — e a varredura confirma isso. */
function tabelasCriadas(sql: string): string[] {
  const achadas = sql.matchAll(/^[ \t]*create table (?:if not exists )?(?:public\.)?(\w+)/gim);
  return [...new Set([...achadas].map((m) => m[1]))];
}

function ligaRls(sql: string, tabela: string): boolean {
  return new RegExp(
    `alter table (?:if exists )?(?:public\.)?${tabela} enable row level security`,
    "i",
  ).test(sql);
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

  it("não cria tabela fora do public, onde a varredura seria cega", () => {
    const foraDoPublic = ARQUIVOS.flatMap(({ nome, sql }) =>
      [...sql.matchAll(/^[ \t]*create table (?:if not exists )?(\w+)\.\w+/gim)]
        .filter((m) => m[1].toLowerCase() !== "public")
        .map((m) => `${nome}: ${m[0].trim()}`),
    );
    expect(foraDoPublic).toEqual([]);
  });

  /* Sem esta âncora, um regex que parasse de casar deixaria os dois
     testes acima passando com lista vazia — verdes e cegos. */
  it("enxerga o schema canônico inteiro", () => {
    const tabelas = tabelasCriadas(CANONICO.sql);
    expect(tabelas).toContain("imoveis");
    expect(tabelas).toContain("repasses");
    expect(tabelas.length).toBeGreaterThanOrEqual(29);
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(52);
  });
});
