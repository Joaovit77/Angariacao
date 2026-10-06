/* Imóvel de venda, IV-1, em Postgres local descartável (PGlite). A tabela
   `imoveis` é montada com o próprio SQL versionado (tabela base e colunas do
   schema canônico ANTES do bloco IV-1, unicidade, Retirados C1, RLS e
   policies); depois a migration IV-1 é aplicada por cima de linhas antigas.
   PostgREST, Auth real, Realtime e os caminhos de gravação do app ficam para
   `integration/imovel-venda-iv1-supabase-local.test.ts`. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = ler("supabase/migrations/20261006200215_imoveis_finalidade_venda.sql");
const SCHEMA = ler("supabase-schema.sql");
const ANTES_IV1 = SCHEMA.slice(0, SCHEMA.indexOf("-- BEGIN IMOVEL VENDA IV-1"));
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const LEGADO_A = "aaaaaaaa-0000-4000-8000-000000000001";
const LEGADO_B = "bbbbbbbb-0000-4000-8000-000000000002";
const NOVAS = ["finalidade", "valor_venda", "vendido_em"];

let db: PGlite;
type Catalogo = Record<string, unknown[]>;
let antes: Catalogo;
let depois: Catalogo;
let legadoAntes: { id: string; xmin: string; linha: Record<string, unknown> }[];

async function catalogo(): Promise<Catalogo> {
  const q = async (sql: string) => (await db.query(sql)).rows;
  return {
    colunas: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'imoveis' order by column_name`),
    constraints: await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid = 'public.imoveis'::regclass order by conname`),
    indices: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'imoveis' order by indexname`),
    triggers: await q(`select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid = 'public.imoveis'::regclass and not tgisinternal order by tgname`),
    policies: await q(`select polname, polcmd, pg_get_expr(polqual, polrelid) usando, pg_get_expr(polwithcheck, polrelid) checando
      from pg_policy where polrelid = 'public.imoveis'::regclass order by polname`),
    rls: await q(`select relrowsecurity from pg_class where oid = 'public.imoveis'::regclass`),
    funcoes: await q(`select p.oid::regprocedure::text fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') order by 1`),
  };
}
async function linhasLegado() {
  return (await db.query<{ id: string; xmin: string; linha: Record<string, unknown> }>(
    "select id::text, xmin::text, to_jsonb(i) linha from public.imoveis i order by id")).rows;
}
async function como<T = unknown>(usuario: string, sql: string, parametros: unknown[] = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
  await db.exec("set role authenticated");
  try { return await db.query<T>(sql, parametros); } finally { await db.exec("reset role"); }
}
/** Cada tentativa num savepoint: a recusa não contamina as seguintes. */
async function tentar(sql: string, parametros: unknown[] = []): Promise<string | null> {
  await db.exec("begin");
  try { await db.query(sql, parametros); return null; }
  catch (erro) { return (erro as { code?: string }).code ?? "erro-sem-codigo"; }
  finally { await db.exec("rollback"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema private; create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated, anon, service_role;
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;`);
  const funcao = ANTES_IV1.indexOf("create or replace function telefone_canonico(telefone text)");
  await db.exec(ANTES_IV1.slice(funcao, ANTES_IV1.indexOf("\n$$;", funcao) + 4));
  const tabela = ANTES_IV1.indexOf("create table if not exists imoveis (");
  await db.exec(ANTES_IV1.slice(tabela, ANTES_IV1.indexOf("\n);", tabela) + 3));
  // Toda coluna que o schema canônico acrescenta a `imoveis` antes do bloco IV-1.
  const colunas = ANTES_IV1.match(/^alter table (?:public\.)?imoveis\s+add column if not exists [^;]+;/gm) ?? [];
  expect(colunas.length).toBeGreaterThan(20);
  for (const comando of colunas) await db.exec(comando);
  await db.exec(ler("supabase/migrations/20260921173129_imoveis_unique_id_user_id.sql"));
  await db.exec(ler("supabase/migrations/20261002210000_retirada_data_motivo.sql"));
  await db.exec("create trigger trg_imoveis_updated_at before update on public.imoveis for each row execute function public.set_updated_at();");
  await db.exec("alter table public.imoveis enable row level security;");
  const policies = ANTES_IV1.match(/^create policy "?\w+_own_imoveis"? on (?:public\.)?imoveis\b[^;]+;/gm) ?? [];
  expect(policies).toHaveLength(4);
  for (const policy of policies) await db.exec(policy);
  await db.exec("grant select, insert, update, delete on public.imoveis to authenticated;");

  await db.query("insert into auth.users(id) values ($1), ($2)", [A, B]);
  // Linhas antigas, gravadas antes da migration, com dados de verdade nas colunas existentes.
  await db.query(`insert into public.imoveis (id, user_id, codigo, endereco, status, valor_aluguel, locado_em, retirado, retirado_em, retirado_motivo, status_history)
    values ($1, $2, 'LEG-A', 'Rua Antiga, 1', 'Locado', 2500.5, '2026-09-01', false, null, null, '[{"status":"Locado","date":"2026-09-01"}]'),
           ($3, $4, 'LEG-B', 'Rua Antiga, 2', 'Angariado', 0, null, true, '2026-09-20', 'vendido', '[]')`, [LEGADO_A, A, LEGADO_B, B]);

  antes = await catalogo();
  legadoAntes = await linhasLegado();
  await db.exec(MIGRATION);
  depois = await catalogo();
}, 60_000);
afterAll(async () => { if (db) await db.close(); });

describe("IV-1 no banco: antes → migration → depois", () => {
  it("acrescenta exatamente as três colunas nulas, sem default, com os tipos aprovados", () => {
    const nomesAntes = new Set((antes.colunas as { column_name: string }[]).map((c) => c.column_name));
    const novas = (depois.colunas as { column_name: string }[]).filter((c) => !nomesAntes.has(c.column_name));
    expect(novas).toEqual([
      { column_name: "finalidade", data_type: "text", is_nullable: "YES", column_default: null },
      { column_name: "valor_venda", data_type: "numeric", is_nullable: "YES", column_default: null },
      { column_name: "vendido_em", data_type: "date", is_nullable: "YES", column_default: null },
    ]);
    expect((depois.colunas as unknown[]).filter((c) => !novas.includes(c as never))).toEqual(antes.colunas);
  });

  it("acrescenta só os dois checks; índices, triggers, policies, RLS e funções não mudam", () => {
    const nomesAntes = new Set((antes.constraints as { conname: string }[]).map((c) => c.conname));
    expect((depois.constraints as { conname: string }[]).filter((c) => !nomesAntes.has(c.conname))).toEqual([
      { conname: "imoveis_finalidade_check", def: "CHECK (((finalidade IS NULL) OR (finalidade = ANY (ARRAY['locacao'::text, 'venda'::text, 'locacao_venda'::text]))))" },
      { conname: "imoveis_valor_venda_check", def: "CHECK (((valor_venda IS NULL) OR ((valor_venda >= (0)::numeric) AND (valor_venda < 'Infinity'::numeric))))" },
    ]);
    for (const chave of ["indices", "triggers", "policies", "rls", "funcoes"]) expect(depois[chave], chave).toEqual(antes[chave]);
    expect((depois.policies as unknown[]).length).toBe(4);
  });

  it("linhas antigas ficam intocadas: mesmo xmin (sem reescrita nem DML), mesmos dados, null nas novas", async () => {
    const agora = await linhasLegado();
    expect(agora.map((l) => [l.id, l.xmin])).toEqual(legadoAntes.map((l) => [l.id, l.xmin]));
    for (const [i, linha] of agora.entries()) {
      for (const coluna of NOVAS) expect(linha.linha[coluna], coluna).toBeNull();
      const semNovas = Object.fromEntries(Object.entries(linha.linha).filter(([k]) => !NOVAS.includes(k)));
      expect(semNovas).toEqual(legadoAntes[i].linha);
    }
  });

  it("o bloco do schema canônico é repetível: rodar de novo não falha nem muda nada", async () => {
    const bloco = SCHEMA.split("-- BEGIN IMOVEL VENDA IV-1\n")[1].split("-- END IMOVEL VENDA IV-1\n")[0];
    await db.exec(bloco);
    expect(await catalogo()).toEqual(depois);
    expect((await linhasLegado()).map((l) => l.xmin)).toEqual(legadoAntes.map((l) => l.xmin));
  });
});

describe("IV-1 no banco: valores aceitos e recusados", () => {
  const atualizar = (coluna: string, valor: string) => tentar(`update public.imoveis set ${coluna} = ${valor} where id = '${LEGADO_A}'`);

  it("finalidade: null e as três da lista; qualquer outra é recusada pelo check", async () => {
    for (const valor of ["null", "'locacao'", "'venda'", "'locacao_venda'"]) expect(await atualizar("finalidade", valor), valor).toBeNull();
    for (const valor of ["'aluguel'", "'Venda'", "''", "'ambos'", "' venda'"]) expect(await atualizar("finalidade", valor), valor).toBe("23514");
  });

  it("valor_venda: null, zero e decimal; negativo, NaN, Infinity e -Infinity recusados", async () => {
    for (const valor of ["null", "0", "350000.50", "0.01"]) expect(await atualizar("valor_venda", valor), valor).toBeNull();
    for (const valor of ["-1", "-0.01", "'NaN'", "'Infinity'", "'-Infinity'"]) expect(await atualizar("valor_venda", valor), valor).toBe("23514");
  });

  it("valor_venda guarda o decimal exato, sem arredondar", async () => {
    await db.exec("begin");
    try {
      await db.query(`update public.imoveis set valor_venda = 350000.50 where id = '${LEGADO_A}'`);
      expect((await db.query<{ v: string }>(`select valor_venda::text v from public.imoveis where id = '${LEGADO_A}'`)).rows[0].v).toBe("350000.50");
    } finally { await db.exec("rollback"); }
  });

  it("vendido_em: null ou data; sem coerência com status nesta fase", async () => {
    for (const valor of ["null", "'2026-10-01'::date"]) expect(await atualizar("vendido_em", valor), valor).toBeNull();
    // LEGADO_A está Locado: a data de venda não é recusada por isso (Vendido é IV-5).
    expect(await tentar(`update public.imoveis set vendido_em = '2026-10-01', finalidade = 'venda' where id = '${LEGADO_A}' and status = 'Locado'`)).toBeNull();
    expect(await atualizar("vendido_em", "'2026-02-30'")).not.toBeNull();
  });

  it("insert sem as colunas novas continua válido e grava null", async () => {
    await db.exec("begin");
    try {
      await db.query(`insert into public.imoveis (user_id, endereco) values ($1, 'Rua Nova, 3')`, [A]);
      const r = (await db.query<Record<string, unknown>>(`select finalidade, valor_venda, vendido_em from public.imoveis where endereco = 'Rua Nova, 3'`)).rows[0];
      expect(r).toEqual({ finalidade: null, valor_venda: null, vendido_em: null });
    } finally { await db.exec("rollback"); }
  });
});

describe("IV-1 no banco: RLS de sempre, sem policy nova", () => {
  it("A lê e altera as colunas novas na própria linha", async () => {
    await db.exec("begin");
    try {
      const r = await como(A, `update public.imoveis set finalidade = 'venda', valor_venda = 1, vendido_em = '2026-10-01' where id = '${LEGADO_A}'`);
      expect(r.affectedRows).toBe(1);
      const lida = await como<{ finalidade: string }>(A, `select finalidade from public.imoveis where id = '${LEGADO_A}'`);
      expect(lida.rows).toEqual([{ finalidade: "venda" }]);
    } finally { await db.exec("rollback"); }
  });

  it("B não lê nem altera as colunas novas da linha de A", async () => {
    expect((await como(B, `select finalidade, valor_venda, vendido_em from public.imoveis where id = '${LEGADO_A}'`)).rows).toEqual([]);
    expect((await como(B, `update public.imoveis set finalidade = 'venda' where id = '${LEGADO_A}'`)).affectedRows).toBe(0);
    expect((await db.query(`select finalidade from public.imoveis where id = '${LEGADO_A}'`)).rows).toEqual([{ finalidade: null }]);
  });
});
