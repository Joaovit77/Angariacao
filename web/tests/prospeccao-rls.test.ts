import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_C2A = readFileSync(
  new URL("../../supabase/migrations/20260910184310_prospeccao_campo.sql", import.meta.url),
  "utf8",
);
const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql", import.meta.url),
  "utf8",
);
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

const TABELAS = [
  "imoveis_identificados",
  "imoveis_identificados_avistamentos",
  "imoveis_identificados_fotos",
  "imoveis_identificados_classificacoes",
  "imoveis_identificados_etiquetas",
] as const;

function policy(nome: string): string {
  const trecho = MIGRATION.match(new RegExp(
    `create policy "${nome}"[\\s\\S]*?;`,
    "i",
  ))?.[0];
  if (!trecho) throw new Error(`Policy ${nome} ausente.`);
  return trecho;
}

function grantsAuthenticated(): string[] {
  return [...MIGRATION.matchAll(/^grant\b[\s\S]*?\bto authenticated;/gim)]
    .map((resultado) => resultado[0]);
}

describe("C2b — RLS do Garimpo em Campo", () => {
  it("mantém RLS nas cinco tabelas e espelha a migration uma única vez", () => {
    for (const tabela of TABELAS) {
      expect(MIGRATION_C2A).toContain(
        `alter table public.${tabela} enable row level security`,
      );
    }
    const blocoEspelhado = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(blocoEspelhado);
    expect(SCHEMA.split(blocoEspelhado)).toHaveLength(2);
    expect(MIGRATION.match(/^create policy /gm)).toHaveLength(9);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b|\bcreate (?:or replace )?function\b/i);
    expect(MIGRATION).not.toMatch(/storage\.(?:buckets|objects)/i);
  });

  it("isola todas as leituras por usuário autenticado", () => {
    for (const tabela of TABELAS) {
      const leitura = policy(`select_own_${tabela}`);
      expect(leitura).toContain(`on public.${tabela}`);
      expect(leitura).toContain("for select to authenticated");
      expect(leitura).toContain("using ((select auth.uid()) = user_id)");
    }
  });

  it("impede vínculo cruzado da identidade com imóvel da carteira de outro usuário", () => {
    const atualizacao = policy("update_own_imoveis_identificados");
    expect(atualizacao).toContain("using ((select auth.uid()) = user_id)");
    expect(atualizacao).toContain("imoveis_identificados.imovel_id is null");
    expect(atualizacao).toContain("from public.imoveis carteira");
    expect(atualizacao).toContain("carteira.id = imoveis_identificados.imovel_id");
    expect(atualizacao).toContain("carteira.user_id = (select auth.uid())");
  });

  it("impede posse cruzada e pais indisponíveis ao inserir avistamento", () => {
    const insercao = policy("insert_own_imoveis_identificados_avistamentos");
    expect(insercao).toContain("(select auth.uid()) = user_id");
    expect(insercao).toContain("from public.imoveis_identificados pai");
    expect(insercao).toContain(
      "pai.id = imoveis_identificados_avistamentos.imovel_identificado_id",
    );
    expect(insercao).toContain("pai.user_id = (select auth.uid())");
    expect(insercao).toContain(
      "pai.situacao not in ('fundido', 'promovido', 'promovendo')",
    );
    expect(insercao).toContain("pai.exclusao_solicitada_em is null");
  });

  it("revalida a posse do pai no update permitido do avistamento", () => {
    const atualizacao = policy("update_own_imoveis_identificados_avistamentos");
    expect(atualizacao).toContain("using ((select auth.uid()) = user_id)");
    expect(atualizacao).toContain(
      "pai.id = imoveis_identificados_avistamentos.imovel_identificado_id",
    );
    expect(atualizacao).toContain("pai.user_id = (select auth.uid())");
  });

  it("não cria policy nem grant de delete para authenticated", () => {
    expect(MIGRATION).not.toMatch(/create policy[^;]*for delete[\s\S]*?to authenticated/i);
    expect(grantsAuthenticated().join("\n")).not.toMatch(/\bdelete\b/i);
  });

  it("deixa fotos, classificações e etiquetas em leitura direta apenas", () => {
    const grants = grantsAuthenticated();
    for (const tabela of [
      "imoveis_identificados_fotos",
      "imoveis_identificados_classificacoes",
      "imoveis_identificados_etiquetas",
    ]) {
      const aplicaveis = grants.filter((grant) => grant.includes(`public.${tabela}`));
      expect(aplicaveis).toHaveLength(1);
      expect(aplicaveis[0]).toMatch(/^grant select on table/i);
      expect(aplicaveis[0]).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
    }
  });

  it("não concede nada ao papel anon", () => {
    expect(MIGRATION).not.toMatch(/^grant\b[\s\S]*?\bto\s+[^;]*\banon\b[^;]*;/gim);
  });

  it("mantém as cinco tabelas sem colunas de dados pessoais", () => {
    const definicoes = TABELAS.map((tabela) => MIGRATION_C2A.match(new RegExp(
      `create table if not exists public\\.${tabela} \\([\\s\\S]*?\\n\\);`,
      "i",
    ))?.[0] ?? "").join("\n");
    expect(definicoes).not.toMatch(/telefone|proprietario|e-?mail|cpf|whatsapp|nome_/i);
  });
});
