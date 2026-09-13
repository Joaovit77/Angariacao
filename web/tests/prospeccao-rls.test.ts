import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* `core.autocrlf=true` + `* text=auto` entrega o schema em CRLF num checkout
   novo no Windows, enquanto a migration recém-escrita fica em LF. Comparar
   texto literal entre os dois sem normalizar falha por fim de linha, não por
   conteúdo — e falharia só na máquina de quem clonou, que é o pior jeito de
   descobrir. A leitura normaliza; o conteúdo continua comparado byte a byte. */
function lerSql(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION_C2A = lerSql("../../supabase/migrations/20260910184310_prospeccao_campo.sql");
const MIGRATION = lerSql(
  "../../supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql",
);
const MIGRATION_C2F = lerSql(
  "../../supabase/migrations/20260911115908_prospeccao_campo_exclusao_storage.sql",
);
const SCHEMA = lerSql("../../supabase-schema.sql");

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

function storagePolicy(nome: string): string {
  const trecho = MIGRATION_C2F.match(new RegExp(
    `create policy "${nome}"[\\s\\S]*?;`,
    "i",
  ))?.[0];
  if (!trecho) throw new Error(`Policy de Storage ${nome} ausente.`);
  return trecho;
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

describe("C2f — RLS do bucket fachadas", () => {
  it("limita a leitura ao bucket e ao prefixo do usuário", () => {
    const leitura = storagePolicy("fachadas_select_proprio_prefixo");
    expect(leitura).toContain("on storage.objects");
    expect(leitura).toContain("for select to authenticated");
    expect(leitura).toContain("bucket_id = 'fachadas'");
    expect(leitura).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
  });

  it("autoriza upload somente no caminho de uma reserva própria e aberta", () => {
    const insercao = storagePolicy("fachadas_insert_reserva_aberta");
    expect(insercao).toContain("for insert to authenticated");
    expect(insercao).toContain("bucket_id = 'fachadas'");
    expect(insercao).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
    expect(insercao).toContain("name in (f.caminho, f.caminho_miniatura)");
    expect(insercao).toContain("f.estado = 'reservada'");
    expect(insercao).toContain("f.user_id = (select auth.uid())");
    expect(insercao).toContain("a.user_id = (select auth.uid())");
    expect(insercao).toContain("i.user_id = (select auth.uid())");
    expect(insercao).toContain("i.exclusao_solicitada_em is null");
    expect(insercao).toContain("i.situacao <> 'fundido'");
    expect(insercao).not.toMatch(/promovido|promovendo/);
  });

  it("expõe ao navegador exatamente select e insert, nunca update ou delete", () => {
    const policies = [...MIGRATION_C2F.matchAll(
      /^create policy "[^"]+"[\s\S]*?;/gim,
    )].map((resultado) => resultado[0]);
    expect(policies).toHaveLength(2);
    expect(policies.filter((trecho) => /for select to authenticated/i.test(trecho))).toHaveLength(1);
    expect(policies.filter((trecho) => /for insert to authenticated/i.test(trecho))).toHaveLength(1);
    expect(policies.join("\n")).not.toMatch(/for (?:update|delete) to authenticated/i);
  });
});
