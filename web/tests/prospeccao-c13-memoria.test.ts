/* ================================================================
   GARIMPO EM CAMPO — C13A: núcleo persistente da memória de identidade

   1. Estrutura da migration e do espelho canônico (texto).
   2. Comportamento no PostgreSQL local (PGlite): RPCs, CHECKs, RLS,
      grants, merge A→B→C e exclusão em cascata. Nenhuma API, credencial
      ou .env; Production não é tocada.
   3. Módulo puro `memoriaIdentidade`: extração sem PII, vigência
      derivada, composição sem cópia.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ATRIBUTOS_MEMORIA,
  CATALOGO_ATRIBUTOS_MEMORIA,
  contemDadoPessoal,
  derivarMemoriaAtual,
  extrairAfirmacoesDaInvestigacao,
  formatarValorMemoria,
  montarMemoriaIdentidade,
  type AfirmacaoRegistrada,
  type InvestigacaoRegistrada,
} from "@/lib/calculo/memoriaIdentidade";
import type { CorrespondenciaInvestigacao } from "@/lib/calculo/investigadorImoveis";
import type { DetalheImovelIdentificado } from "@/lib/prospeccao";

const RAIZ = new URL("../../", import.meta.url);
const ler = (arquivo: string) => readFileSync(new URL(arquivo, RAIZ), "utf8").replace(/\r\n/g, "\n");
const PASTA = "supabase/migrations/";
const NOME = "20260915190000_prospeccao_memoria_identidade.sql";
const MIGRATION = ler(PASTA + NOME);
const SCHEMA = ler("supabase-schema.sql");
const C2A = ler(`${PASTA}20260910184310_prospeccao_campo.sql`);
const C2B = ler(`${PASTA}20260910190155_prospeccao_campo_rls_grants.sql`);
const C2C = ler(`${PASTA}20260910193412_prospeccao_campo_triggers.sql`);
const C2E = ler(`${PASTA}20260910211045_prospeccao_campo_rpcs_navegador.sql`);
const C7B = ler(`${PASTA}20260913162604_prospeccao_merge_contrato_transacional.sql`);

const USUARIO = "10000000-0000-4000-8000-000000000001";
const OUTRO_USUARIO = "10000000-0000-4000-8000-000000000002";
type Json = Record<string, unknown>;

function funcao(nome: string, sql = MIGRATION): string {
  const trecho = sql.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente.`);
  return trecho;
}

/* ================================================================
   1. ESTRUTURA
   ================================================================ */
describe("C13A — migration e espelho canônico", () => {
  it("espelha a migration inteira no schema canônico, uma única vez, no fim", () => {
    const bloco = MIGRATION.trim();
    expect(SCHEMA.split(bloco)).toHaveLength(2);
    expect(SCHEMA.trimEnd().endsWith(bloco)).toBe(true);
  });

  it("cria exatamente as duas tabelas da memória, ambas com RLS no mesmo arquivo", () => {
    const tabelas = [...MIGRATION.matchAll(/^create table if not exists public\.(\w+)/gim)].map((m) => m[1]);
    expect(tabelas).toEqual(["imoveis_identificados_investigacoes", "imoveis_identificados_atributos"]);
    for (const tabela of tabelas) {
      expect(MIGRATION).toContain(`alter table public.${tabela} enable row level security;`);
      expect(MIGRATION).toMatch(new RegExp(`references public\\.imoveis_identificados\\(id\\) on delete cascade[\\s\\S]*?\\n\\);\\n[\\s\\S]*?${tabela}`));
    }
    expect(MIGRATION).toMatch(/imovel_identificado_id uuid not null\n\s+references public\.imoveis_identificados\(id\) on delete cascade/);
    expect(MIGRATION).toMatch(/investigacao_id uuid not null\n\s+references public\.imoveis_identificados_investigacoes\(id\) on delete cascade/);
  });

  it("não tem coluna de dado pessoal, de vigência materializada nem de embedding", () => {
    const colunas = [...MIGRATION.matchAll(/^  (\w+) (?:uuid|text|integer|bigint|numeric|timestamptz)\b/gm)].map((m) => m[1]);
    expect(colunas.length).toBeGreaterThan(20);
    for (const coluna of colunas) {
      expect(coluna).not.toMatch(/nome|telefone|whats|email|e_mail|cpf|^rg$|documento|banc|conta|pix|proprietario|contato/i);
    }
    expect(colunas).not.toContain("vigente");
    expect(colunas).not.toContain("atributo_atual_id");
    expect(MIGRATION).not.toMatch(/vector|embedding|langchain|redis/i);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b|\bcreate event trigger\b/i);
    expect(MIGRATION).not.toMatch(/\bdrop (?:table|function|index|column)\b/i);
    expect(MIGRATION).not.toMatch(/public\.imoveis\b(?!_identificados)/);
  });

  it("o catálogo fechado do banco é o mesmo do código", () => {
    const check = MIGRATION.match(/atributo in \(([^)]+)\)/)![1].split(",").map((v) => v.trim().replace(/'/g, ""));
    expect(check).toEqual([...ATRIBUTOS_MEMORIA]);
    expect(Object.keys(CATALOGO_ATRIBUTOS_MEMORIA)).toEqual([...ATRIBUTOS_MEMORIA]);
    // A RPC repete a lista literalmente: recusa antes de chegar ao CHECK.
    expect(funcao("registrar_investigacao_identificado")).toContain(
      "('area_m2', 'quartos', 'vagas', 'valor_anunciado', 'condominio', 'referencia_anuncio')",
    );
  });

  it("tem os CHECKs de invariante: um valor só, tipo por atributo, confirmação completa, fonte http(s)", () => {
    expect(MIGRATION).toContain("(valor_texto is null) <> (valor_num is null)");
    expect(MIGRATION).toContain("(estado = 'confirmada' and confirmado_por is not null and confirmado_em is not null)\n    or (estado = 'hipotese' and confirmado_por is null and confirmado_em is null)");
    expect(MIGRATION).toMatch(/fonte_url ~\* '\^https\?:\/\/'/);
    expect(MIGRATION).toContain("estado in ('hipotese', 'confirmada')");
    expect(MIGRATION).toContain("confianca in ('muito-forte', 'forte', 'possivel', 'indicio')");
    expect(MIGRATION).toContain("origem in ('investigador-web')");
  });

  it("RLS de leitura própria e grants: navegador só lê; escrita só via service_role e RPCs", () => {
    for (const tabela of ["imoveis_identificados_investigacoes", "imoveis_identificados_atributos"]) {
      expect(MIGRATION).toMatch(new RegExp(
        `create policy "select_own_${tabela}"\\n  on public\\.${tabela}\\n  for select to authenticated\\n  using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\);`,
      ));
      expect(MIGRATION).not.toMatch(new RegExp(`create policy "(?:insert|update|delete)_own_${tabela}"`));
    }
    expect(MIGRATION).toMatch(/revoke all on table\n  public\.imoveis_identificados_investigacoes,\n  public\.imoveis_identificados_atributos\nfrom public, anon, authenticated, service_role;/);
    expect(MIGRATION).toMatch(/grant select on table\n  public\.imoveis_identificados_investigacoes,\n  public\.imoveis_identificados_atributos\nto authenticated;/);
    expect(MIGRATION).toMatch(/grant select, insert, update, delete on table\n  public\.imoveis_identificados_investigacoes,\n  public\.imoveis_identificados_atributos\nto service_role;/);
    expect(MIGRATION).not.toMatch(/grant (?:insert|update|delete)[^;]*to authenticated/i);
    expect(MIGRATION).not.toMatch(/to anon\b/);
  });

  it("cria exatamente as RPCs previstas, com security definer e search_path vazio", () => {
    const criadas = [...MIGRATION.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]);
    expect(criadas).toEqual(["registrar_investigacao_identificado", "confirmar_atributo_identificado", "fundir_imoveis_identificados"]);
    for (const nome of criadas) {
      const fn = funcao(nome);
      expect(fn).toMatch(/security definer/i);
      expect(fn).toContain("set search_path = ''");
      expect(fn).not.toMatch(/\b(?:commit|rollback|savepoint)\b/i);
    }
  });

  it("registrar: modelo Servidor (p_user_id + trava de JWT), idempotente por execução, só service_role", () => {
    const fn = funcao("registrar_investigacao_identificado");
    expect(fn).toMatch(/p_user_id uuid,\n\s+p_investigacao_id uuid,\n\s+p_imovel_identificado_id uuid,\n\s+p_consulta text,\n\s+p_resultados_total integer,\n\s+p_recusados_total integer,\n\s+p_atributos jsonb/);
    expect(fn).toMatch(/if p_user_id is null then\s+raise exception[\s\S]*?'42501'/i);
    expect(fn).toMatch(/v_jwt uuid := \(select auth\.uid\(\)\)/);
    expect(fn).toMatch(/if v_jwt is not null and v_jwt <> p_user_id then\s+raise exception[\s\S]*?'42501'/i);
    expect(fn).toMatch(/where i\.id = p_imovel_identificado_id\s+and i\.user_id = p_user_id\s+for update/);
    expect(fn).toContain("'exclusao_em_andamento'");
    expect(fn).toContain("'situacao_incompativel'");
    expect(fn).toContain("'repetida', true");
    expect(fn).toMatch(/insert into public\.imoveis_identificados_atributos[\s\S]*?'investigador-web', 'hipotese'/);
    expect(fn).not.toMatch(/'confirmada'/);
    expect(fn).toMatch(/update public\.imoveis_identificados\s+set ultima_investigacao_em = v_agora/);
    // Só essa coluna da identidade é tocada: nada de situação, tipo ou promoção.
    expect(fn).not.toMatch(/set situacao|promovido|imovel_id =|tipo =/);
    expect(MIGRATION).toMatch(/revoke all on function public\.registrar_investigacao_identificado\(uuid, uuid, uuid, text, integer, integer, jsonb\)\n  from public, anon, authenticated, service_role;\ngrant execute on function public\.registrar_investigacao_identificado\(uuid, uuid, uuid, text, integer, integer, jsonb\)\n  to service_role;/);
  });

  it("confirmar: modelo Navegador (auth.uid), só muda estado/autor/instante, só authenticated", () => {
    const fn = funcao("confirmar_atributo_identificado");
    expect(fn).toMatch(/v_user uuid := \(select auth\.uid\(\)\)/);
    expect(fn).not.toContain("p_user_id");
    expect(fn).toMatch(/where a\.id = p_atributo_id\s+and a\.user_id = v_user\s+for update/);
    expect(fn).toMatch(/set estado = 'confirmada',\n\s+confirmado_por = v_user,\n\s+confirmado_em = now\(\)\n\s+where a\.id = p_atributo_id;/);
    expect(fn).not.toMatch(/valor_texto =|valor_num =|fonte_url =|observado_em =|atributo =/);
    expect(MIGRATION).toMatch(/revoke all on function public\.confirmar_atributo_identificado\(bigint\)\n  from public, anon, authenticated, service_role;\ngrant execute on function public\.confirmar_atributo_identificado\(bigint\)\n  to authenticated;/);
  });

  it("merge reparenteia investigações e atributos sem recriar, e a exclusão é cascata por FK", () => {
    const fn = funcao("fundir_imoveis_identificados");
    expect(fn).toMatch(/update public\.imoveis_identificados_investigacoes x\s+set imovel_identificado_id = p_sobrevivente_id\s+where x\.imovel_identificado_id = p_absorvido_id;/);
    expect(fn).toMatch(/update public\.imoveis_identificados_atributos t\s+set imovel_identificado_id = p_sobrevivente_id\s+where t\.imovel_identificado_id = p_absorvido_id;/);
    expect(fn).not.toMatch(/insert into public\.imoveis_identificados_(?:investigacoes|atributos)/);
    expect(fn).not.toMatch(/delete from public\.imoveis_identificados_(?:investigacoes|atributos)/);
    expect(MIGRATION).not.toMatch(/delete from/i);
  });
});

/* ================================================================
   2. POSTGRESQL LOCAL
   ================================================================ */
describe.sequential("C13A — RPCs, CHECKs, RLS e merge no PostgreSQL local", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create schema private;
      create schema storage;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${USUARIO}'), ('${OUTRO_USUARIO}');
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant usage on schema public to authenticated, service_role, anon;
      create function public.set_updated_at() returns trigger language plpgsql
        as $$ begin new.updated_at := now(); return new; end; $$;
      create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
      create table storage.objects (id uuid primary key, bucket_id text, name text);
    `);
    for (const sql of [C2A, C2B, C2C, C2E, C7B, MIGRATION]) await db.exec(sql);
  }, 30_000);

  beforeEach(async () => {
    await db.exec("reset role; truncate public.imoveis_identificados, public.imoveis, storage.objects cascade; begin");
  });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  /** Erro esperado dentro de BEGIN abortaria a transação do teste: cada
      chamada roda num savepoint e volta a ele em caso de falha. */
  async function tentar<T>(acao: () => Promise<T>): Promise<T> {
    await db.exec("savepoint tentativa");
    try {
      const r = await acao();
      await db.exec("release savepoint tentativa");
      return r;
    } catch (erro) {
      await db.exec("rollback to savepoint tentativa");
      throw erro;
    }
  }

  async function como(papel: "authenticated" | "service_role" | "anon", sub: string | null, sql: string, parametros: unknown[] = []) {
    return tentar(async () => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
      await db.exec(`set role ${papel}`);
      try {
        return await db.query<{ resultado: Json }>(sql, parametros);
      } finally {
        await db.exec("reset role").catch(() => {});
      }
    });
  }

  async function identidade(usuario = USUARIO) {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua de teste')", [id, usuario]);
    return id;
  }

  const AFIRMACOES = [
    { atributo: "area_m2", valor_num: 85.5, confianca: "forte", fonte_url: "https://portal.exemplo/anuncio/1", fonte_dominio: "portal.exemplo" },
    { atributo: "quartos", valor_num: 3, confianca: "forte", fonte_url: "https://portal.exemplo/anuncio/1", fonte_dominio: "portal.exemplo" },
    { atributo: "condominio", valor_texto: "Residencial Aurora", confianca: "possivel", fonte_url: "https://outro.exemplo/x", fonte_dominio: "outro.exemplo" },
  ];

  async function registrar(
    identificado: string,
    execucao = randomUUID(),
    atributos: unknown[] = AFIRMACOES,
    opcoes: { papel?: "authenticated" | "service_role" | "anon"; sub?: string | null; usuario?: string; recusados?: number } = {},
  ) {
    const { papel = "service_role", sub = null, usuario = USUARIO, recusados = 0 } = opcoes;
    const resposta = await como(papel, sub,
      "select public.registrar_investigacao_identificado($1, $2, $3, $4, $5, $6, $7::jsonb) as resultado",
      [usuario, execucao, identificado, "Rua de teste 100, Londrina", 2, recusados, JSON.stringify(atributos)]);
    return { execucao, resultado: resposta.rows[0].resultado };
  }

  async function linhas(tabela: string, identificado?: string) {
    const filtro = identificado ? " where imovel_identificado_id = $1" : "";
    return (await db.query<Json>(`select to_jsonb(t) as linha from public.${tabela} t${filtro} order by id`, identificado ? [identificado] : []))
      .rows.map((r) => r.linha as Json);
  }

  it("grants efetivos: navegador só lê; service_role escreve; anon nada", async () => {
    const tabelas = ["imoveis_identificados_investigacoes", "imoveis_identificados_atributos"];
    for (const tabela of tabelas) {
      const rows = (await db.query<{ papel: string; priv: string; ok: boolean }>(`select papel, priv,
        has_table_privilege(papel, 'public.${tabela}', priv) as ok
        from unnest(array['anon','authenticated','service_role']) papel, unnest(array['select','insert','update','delete']) priv`)).rows;
      const permitidos = rows.filter((r) => r.ok).map((r) => `${r.papel}:${r.priv}`).sort();
      expect(permitidos).toEqual(["authenticated:select", "service_role:delete", "service_role:insert", "service_role:select", "service_role:update"]);
    }
    const fns = (await db.query<{ fn: string; papel: string; ok: boolean }>(`select fn, papel, has_function_privilege(papel, fn, 'execute') as ok
      from unnest(array['public.registrar_investigacao_identificado(uuid,uuid,uuid,text,integer,integer,jsonb)', 'public.confirmar_atributo_identificado(bigint)']) fn,
           unnest(array['anon','authenticated','service_role']) papel`)).rows;
    expect(fns.filter((r) => r.ok).map((r) => `${r.fn.split("(")[0]}:${r.papel}`).sort()).toEqual([
      "public.confirmar_atributo_identificado:authenticated",
      "public.registrar_investigacao_identificado:service_role",
    ]);
    expect((await db.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class where relname = any($1)", [tabelas])).rows)
      .toEqual([{ rls: true }, { rls: true }]);
  });

  it("registrar grava a execução, as afirmações como hipótese e marca ultima_investigacao_em na mesma transação", async () => {
    const id = await identidade();
    const antes = (await db.query<{ u: string | null }>("select ultima_investigacao_em as u from public.imoveis_identificados where id = $1", [id])).rows[0].u;
    expect(antes).toBeNull();
    const { execucao, resultado } = await registrar(id, undefined, AFIRMACOES, { recusados: 1 });
    expect(resultado).toEqual({ ok: true, repetida: false, investigacao_id: execucao, atributos_salvos: 3, atributos_recusados: 1 });
    const [investigacao] = await linhas("imoveis_identificados_investigacoes", id);
    expect(investigacao).toMatchObject({ id: execucao, user_id: USUARIO, origem: "investigador-web", consulta: "Rua de teste 100, Londrina", resultados_total: 2, atributos_total: 3, recusados_total: 1 });
    const atributos = await linhas("imoveis_identificados_atributos", id);
    expect(atributos.map((a) => [a.atributo, a.valor_num, a.valor_texto, a.estado, a.confianca, a.fonte_dominio])).toEqual([
      ["area_m2", 85.5, null, "hipotese", "forte", "portal.exemplo"],
      ["quartos", 3, null, "hipotese", "forte", "portal.exemplo"],
      ["condominio", null, "Residencial Aurora", "hipotese", "possivel", "outro.exemplo"],
    ]);
    expect(atributos.every((a) => a.investigacao_id === execucao && a.confirmado_por === null && a.confirmado_em === null)).toBe(true);
    const depois = (await db.query<{ u: string | null; situacao: string }>("select ultima_investigacao_em as u, situacao from public.imoveis_identificados where id = $1", [id])).rows[0];
    expect(depois.u).not.toBeNull();
    expect(depois.situacao).toBe("identificado"); // nada promove nem investiga sozinho
  });

  it("é idempotente por execução: repetir o mesmo id não duplica; outra execução grava evidência nova", async () => {
    const id = await identidade();
    const { execucao } = await registrar(id);
    const antes = await linhas("imoveis_identificados_atributos", id);
    const repeticao = await registrar(id, execucao);
    expect(repeticao.resultado).toEqual({ ok: true, repetida: true, investigacao_id: execucao, atributos_salvos: 3, atributos_recusados: 0 });
    expect(await linhas("imoveis_identificados_atributos", id)).toEqual(antes);
    const outra = await registrar(id);
    expect(outra.resultado).toMatchObject({ ok: true, repetida: false, atributos_salvos: 3 });
    expect(await linhas("imoveis_identificados_investigacoes", id)).toHaveLength(2);
    expect(await linhas("imoveis_identificados_atributos", id)).toHaveLength(6);
  });

  it("recusa e conta o que está fora do catálogo ou mal formado, sem abortar o resto", async () => {
    const id = await identidade();
    const { resultado } = await registrar(id, undefined, [
      ...AFIRMACOES,
      { atributo: "telefone_proprietario", valor_texto: "43 99999-0000", fonte_url: "https://x.exemplo/1", fonte_dominio: "x.exemplo" },
      { atributo: "quartos", valor_texto: "três", fonte_url: "https://x.exemplo/1", fonte_dominio: "x.exemplo" },
      { atributo: "area_m2", valor_num: -1, fonte_url: "https://x.exemplo/1", fonte_dominio: "x.exemplo" },
      { atributo: "vagas", valor_num: 2, fonte_url: "ftp://x.exemplo/1", fonte_dominio: "x.exemplo" },
      { atributo: "vagas", valor_num: 2, fonte_url: "https://x.exemplo/1", fonte_dominio: "" },
      { atributo: "vagas", valor_num: 2, confianca: "certeza", fonte_url: "https://x.exemplo/1", fonte_dominio: "x.exemplo" },
      { atributo: "condominio", valor_texto: "x".repeat(201), fonte_url: "https://x.exemplo/1", fonte_dominio: "x.exemplo" },
    ]);
    expect(resultado).toMatchObject({ ok: true, atributos_salvos: 3, atributos_recusados: 7 });
    expect((await linhas("imoveis_identificados_atributos", id)).map((a) => a.atributo)).toEqual(["area_m2", "quartos", "condominio"]);
  });

  it("recusa JWT diferente de p_user_id, imóvel alheio, exclusão pendente e lápide de merge", async () => {
    const meu = await identidade(); const alheio = await identidade(OUTRO_USUARIO);
    await expect(registrar(meu, undefined, AFIRMACOES, { sub: OUTRO_USUARIO })).rejects.toMatchObject({ code: "42501" });
    await expect(registrar(alheio)).rejects.toMatchObject({ code: "P0002" });
    await expect(registrar(meu, undefined, AFIRMACOES, { papel: "authenticated", sub: USUARIO })).rejects.toMatchObject({ code: "42501" });
    await db.query("update public.imoveis_identificados set exclusao_solicitada_em = now() where id = $1", [meu]);
    expect((await registrar(meu)).resultado).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
    const b = await identidade(); const a = await identidade();
    await como("authenticated", USUARIO, "select public.fundir_imoveis_identificados($1, $2) as resultado", [b, a]);
    expect((await registrar(a)).resultado).toEqual({ ok: false, codigo: "situacao_incompativel" });
    expect(await linhas("imoveis_identificados_investigacoes")).toEqual([]);
  });

  it("CHECKs: um valor só, tipo por atributo, confirmação completa, catálogo fechado", async () => {
    const id = await identidade();
    const { execucao } = await registrar(id, undefined, []);
    const inserir = (colunas: string) => tentar(() => db.query(`insert into public.imoveis_identificados_atributos
      (user_id, imovel_identificado_id, investigacao_id, fonte_url, fonte_dominio, observado_em, ${colunas.split("|")[0]})
      values ($1, $2, $3, 'https://x.exemplo/1', 'x.exemplo', now(), ${colunas.split("|")[1]})`, [USUARIO, id, execucao]));
    await expect(inserir("atributo, valor_num, valor_texto|'quartos', 2, 'dois'")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir("atributo|'quartos'")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir("atributo, valor_texto|'quartos', 'dois'")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir("atributo, valor_num|'condominio', 1")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir("atributo, valor_num|'preco_desejado', 1")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir("atributo, valor_num, estado|'quartos', 2, 'confirmada'")).rejects.toMatchObject({ code: "23514" });
    await expect(inserir(`atributo, valor_num, confirmado_por|'quartos', 2, '${USUARIO}'`)).rejects.toMatchObject({ code: "23514" });
    await expect(tentar(() => db.query(`insert into public.imoveis_identificados_atributos
      (user_id, imovel_identificado_id, investigacao_id, fonte_url, fonte_dominio, observado_em, atributo, valor_num)
      values ($1, $2, $3, 'javascript:alert(1)', 'x.exemplo', now(), 'quartos', 2)`, [USUARIO, id, execucao]))).rejects.toMatchObject({ code: "23514" });
    await expect(inserir("atributo, valor_num|'quartos', 2")).resolves.toBeTruthy();
  });

  it("RLS: navegador lê só a própria memória e não insere, altera nem apaga nada diretamente", async () => {
    const meu = await identidade(); const alheio = await identidade(OUTRO_USUARIO);
    await registrar(meu);
    await registrar(alheio, undefined, AFIRMACOES, { usuario: OUTRO_USUARIO });
    const vistas = await como("authenticated", USUARIO, "select imovel_identificado_id as resultado from public.imoveis_identificados_atributos");
    expect(new Set(vistas.rows.map((r) => r.resultado))).toEqual(new Set([meu]));
    const investigacoes = await como("authenticated", USUARIO, "select user_id as resultado from public.imoveis_identificados_investigacoes");
    expect(investigacoes.rows.map((r) => r.resultado)).toEqual([USUARIO]);
    expect((await como("anon", null, "select count(*)::int as resultado from public.imoveis_identificados_atributos").catch((e: { code: string }) => e)))
      .toMatchObject({ code: "42501" });
    await expect(como("authenticated", USUARIO, "update public.imoveis_identificados_atributos set estado = 'confirmada'")).rejects.toMatchObject({ code: "42501" });
    await expect(como("authenticated", USUARIO, "delete from public.imoveis_identificados_atributos")).rejects.toMatchObject({ code: "42501" });
    await expect(como("authenticated", USUARIO, `insert into public.imoveis_identificados_investigacoes (id, user_id, imovel_identificado_id, consulta) values ($1, $2, $3, 'x')`, [randomUUID(), USUARIO, meu]))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("confirmar: só o dono, só de hipótese para confirmada, idempotente, sem tocar o valor", async () => {
    const meu = await identidade();
    await registrar(meu);
    const [alvo] = await linhas("imoveis_identificados_atributos", meu);
    const confirmar = (sub: string | null, id = alvo.id as number) =>
      como("authenticated", sub, "select public.confirmar_atributo_identificado($1) as resultado", [id]).then((r) => r.rows[0].resultado);
    await expect(confirmar(null)).rejects.toMatchObject({ code: "42501" });
    await expect(confirmar(OUTRO_USUARIO)).rejects.toMatchObject({ code: "P0002" });
    const primeira = await confirmar(USUARIO);
    expect(primeira).toMatchObject({ ok: true, repetida: false, atributo_id: alvo.id });
    const [depois] = await linhas("imoveis_identificados_atributos", meu);
    expect(depois).toMatchObject({ estado: "confirmada", confirmado_por: USUARIO, valor_num: alvo.valor_num, fonte_url: alvo.fonte_url, observado_em: alvo.observado_em, investigacao_id: alvo.investigacao_id });
    expect(depois.confirmado_em).not.toBeNull();
    expect(await confirmar(USUARIO)).toMatchObject({ ok: true, repetida: true, atributo_id: alvo.id });
    expect((await linhas("imoveis_identificados_atributos", meu))[0]).toEqual(depois);
    await expect(como("service_role", null, "select public.confirmar_atributo_identificado($1) as resultado", [alvo.id])).rejects.toMatchObject({ code: "42501" });
    await db.query("update public.imoveis_identificados set exclusao_solicitada_em = now() where id = $1", [meu]);
    const [, segundo] = await linhas("imoveis_identificados_atributos", meu);
    expect(await confirmar(USUARIO, segundo.id as number)).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
  });

  it("merge A→B seguido de B→C leva a memória inteira para C sem recriar linhas", async () => {
    const a = await identidade(); const b = await identidade(); const c = await identidade();
    await registrar(a); await registrar(b);
    const [alvo] = await linhas("imoveis_identificados_atributos", a);
    await como("authenticated", USUARIO, "select public.confirmar_atributo_identificado($1) as resultado", [alvo.id]);
    const semPai = async () => Promise.all(["imoveis_identificados_atributos", "imoveis_identificados_investigacoes"].map(async (tabela) =>
      (await db.query<{ l: Json }>(`select to_jsonb(t) - 'imovel_identificado_id' as l from public.${tabela} t order by id`)).rows.map((r) => r.l)));
    const antes = await semPai();
    expect(antes.map((t) => t.length)).toEqual([6, 2]);
    const fundir = (s: string, x: string) => como("authenticated", USUARIO, "select public.fundir_imoveis_identificados($1, $2) as resultado", [s, x]).then((r) => r.rows[0].resultado);
    expect(await fundir(b, a)).toMatchObject({ ok: true });
    expect(await fundir(c, b)).toMatchObject({ ok: true });
    expect(await semPai()).toEqual(antes);
    expect(await linhas("imoveis_identificados_atributos", c)).toHaveLength(6);
    expect(await linhas("imoveis_identificados_investigacoes", c)).toHaveLength(2);
    expect(await linhas("imoveis_identificados_atributos", a)).toEqual([]);
    expect(await linhas("imoveis_identificados_investigacoes", b)).toEqual([]);
    const confirmadas = (await linhas("imoveis_identificados_atributos", c)).filter((x) => x.estado === "confirmada");
    expect(confirmadas.map((x) => x.id)).toEqual([alvo.id]);
    // A memória chega a C sem que C tenha sido "investigado": a data mora no evento.
    expect((await db.query<{ u: string | null }>("select ultima_investigacao_em as u from public.imoveis_identificados where id = $1", [c])).rows[0].u).toBeNull();
  });

  it("apagar a identidade apaga a memória em cascata; apagar a investigação apaga as suas afirmações", async () => {
    const a = await identidade(); const b = await identidade();
    const { execucao } = await registrar(a); await registrar(a); await registrar(b);
    await db.query("delete from public.imoveis_identificados_investigacoes where id = $1", [execucao]);
    expect(await linhas("imoveis_identificados_atributos", a)).toHaveLength(3);
    await db.query("delete from public.imoveis_identificados where id = $1", [a]);
    expect(await linhas("imoveis_identificados_investigacoes", a)).toEqual([]);
    expect(await linhas("imoveis_identificados_atributos", a)).toEqual([]);
    expect(await linhas("imoveis_identificados_atributos", b)).toHaveLength(3);
  });
});

/* ================================================================
   3. MÓDULO PURO
   ================================================================ */
function correspondencia(extra: Partial<CorrespondenciaInvestigacao> = {}): CorrespondenciaInvestigacao {
  return {
    titulo: "Casa 3 quartos, ligue 43 99999-0000", url: "https://portal.exemplo/anuncio/1", dominio: "portal.exemplo",
    descricao: "Fale com João no WhatsApp", consultas: [], preco: 450000, endereco: "Rua de teste, 100",
    referencia: "ZAP-1234", condominio: "Residencial Aurora", quartos: 3, vagas: 2, area: 85.5,
    confianca: "forte", evidencias: ["telefone 43 99999-0000"], contradicoes: [], ...extra,
  };
}

function registrada(extra: Partial<AfirmacaoRegistrada>): AfirmacaoRegistrada {
  return {
    id: 1, imovelIdentificadoId: "i", investigacaoId: "x1", atributo: "quartos", valorTexto: null, valorNum: 3,
    origem: "investigador-web", estado: "hipotese", confianca: "forte", fonteUrl: "https://a.exemplo/1", fonteDominio: "a.exemplo",
    observadoEm: "2026-09-10T12:00:00Z", confirmadoPor: null, confirmadoEm: null, criadoEm: "2026-09-10T12:00:00Z", ...extra,
  };
}

describe("C13A — extração: só o estruturado, sem PII, sem texto livre", () => {
  it("mapeia os seis campos estruturados para o catálogo e ignora título, descrição, evidências e endereço", () => {
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([correspondencia()]);
    expect(recusadas).toBe(0);
    expect(afirmacoes.map((a) => [a.atributo, a.valorNum, a.valorTexto])).toEqual([
      ["area_m2", 85.5, null], ["quartos", 3, null], ["vagas", 2, null], ["valor_anunciado", 450000, null],
      ["condominio", null, "Residencial Aurora"], ["referencia_anuncio", null, "ZAP-1234"],
    ]);
    expect(afirmacoes.every((a) => a.fonteUrl === "https://portal.exemplo/anuncio/1" && a.fonteDominio === "portal.exemplo" && a.confianca === "forte")).toBe(true);
    const texto = JSON.stringify(afirmacoes);
    expect(texto).not.toMatch(/99999|WhatsApp|João|Rua de teste|ligue/);
  });

  it("ausência é neutra: campo nulo não vira afirmação nem recusa", () => {
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([
      correspondencia({ preco: null, area: null, condominio: null, referencia: null, vagas: null }),
    ]);
    expect(afirmacoes.map((a) => a.atributo)).toEqual(["quartos"]);
    expect(recusadas).toBe(0);
    expect(extrairAfirmacoesDaInvestigacao([])).toEqual({ afirmacoes: [], recusadas: 0 });
  });

  it("recusa e conta texto com cara de dado pessoal, valores inválidos e fonte inválida", () => {
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([
      correspondencia({ condominio: "Falar com Maria (43) 99999-0000", referencia: "CPF 123.456.789-00", quartos: -1, area: Number.NaN }),
      correspondencia({ url: "javascript:alert(1)", preco: 1, area: null, quartos: null, vagas: null, condominio: null, referencia: null }),
      correspondencia({ dominio: " ", preco: 1, area: null, quartos: null, vagas: null, condominio: null, referencia: null }),
    ]);
    expect(afirmacoes.map((a) => a.atributo)).toEqual(["vagas", "valor_anunciado"]);
    expect(recusadas).toBe(6);
    for (const texto of ["maria@exemplo.com", "43999990000", "12.345.678/0001-90", "whatsapp 9999", "Doc 123456789"]) {
      expect(contemDadoPessoal(texto), texto).toBe(true);
    }
    for (const texto of ["Residencial Aurora", "Ed. Rio 2000", "Ref 4521", "Bloco B apto 302"]) {
      expect(contemDadoPessoal(texto), texto).toBe(false);
    }
  });

  it("deduplica dentro da execução por atributo+valor+fonte, mas mantém fontes diferentes", () => {
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([
      correspondencia({ area: null, preco: null, vagas: null, condominio: null, referencia: null }),
      correspondencia({ area: null, preco: null, vagas: null, condominio: null, referencia: null }),
      correspondencia({ area: null, preco: null, vagas: null, condominio: null, referencia: null, url: "https://outro.exemplo/2", dominio: "outro.exemplo" }),
    ]);
    expect(afirmacoes.map((a) => a.fonteDominio)).toEqual(["portal.exemplo", "outro.exemplo"]);
    expect(recusadas).toBe(1);
  });
});

describe("C13A — vigência derivada na leitura", () => {
  it("sem confirmação, vale a hipótese mais recente por observado_em; o histórico fica inteiro", () => {
    const visoes = derivarMemoriaAtual([
      registrada({ id: 1, valorNum: 2, observadoEm: "2026-09-01T00:00:00Z" }),
      registrada({ id: 2, valorNum: 3, observadoEm: "2026-09-05T00:00:00Z" }),
      registrada({ id: 3, valorNum: 2, observadoEm: "2026-09-03T00:00:00Z" }),
    ]);
    expect(visoes).toHaveLength(1);
    expect(visoes[0]).toMatchObject({ atributo: "quartos", rotulo: "Quartos", valoresDistintos: 2, divergente: true });
    expect(visoes[0].vigente.id).toBe(2);
    expect(visoes[0].historico.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it("confirmada vence hipótese mais nova; entre confirmadas, a confirmação mais recente", () => {
    const visoes = derivarMemoriaAtual([
      registrada({ id: 1, valorNum: 2, observadoEm: "2026-09-01T00:00:00Z", estado: "confirmada", confirmadoPor: USUARIO, confirmadoEm: "2026-09-02T00:00:00Z" }),
      registrada({ id: 2, valorNum: 3, observadoEm: "2026-09-09T00:00:00Z" }),
      registrada({ id: 3, valorNum: 4, observadoEm: "2026-09-04T00:00:00Z", estado: "confirmada", confirmadoPor: USUARIO, confirmadoEm: "2026-09-06T00:00:00Z" }),
    ]);
    expect(visoes[0].vigente.id).toBe(3);
    expect(visoes[0].divergente).toBe(true);
  });

  it("mesmo valor de fontes diferentes não é divergência; texto compara sem caixa; ordem é a do catálogo", () => {
    const visoes = derivarMemoriaAtual([
      registrada({ id: 1, atributo: "condominio", valorNum: null, valorTexto: "Residencial Aurora" }),
      registrada({ id: 2, atributo: "condominio", valorNum: null, valorTexto: "residencial aurora ", fonteUrl: "https://b.exemplo/2" }),
      registrada({ id: 3, atributo: "area_m2", valorNum: 85.5 }),
    ]);
    expect(visoes.map((v) => [v.atributo, v.divergente])).toEqual([["area_m2", false], ["condominio", false]]);
    expect(derivarMemoriaAtual([])).toEqual([]);
  });

  it("formata valores para leitura humana sem vazar o formato interno", () => {
    expect(formatarValorMemoria({ atributo: "valor_anunciado", valorNum: 450000, valorTexto: null })).toMatch(/^R\$\s?450\.000$/);
    expect(formatarValorMemoria({ atributo: "area_m2", valorNum: 85.5, valorTexto: null })).toBe("85,5 m²");
    expect(formatarValorMemoria({ atributo: "quartos", valorNum: 3, valorTexto: null })).toBe("3");
    expect(formatarValorMemoria({ atributo: "condominio", valorNum: null, valorTexto: "Aurora" })).toBe("Aurora");
  });
});

describe("C13A — composição sem cópia", () => {
  function detalhe(extra: Partial<DetalheImovelIdentificado["identificado"]> = {}): DetalheImovelIdentificado {
    const identificado = {
      id: "i", situacao: "identificado", logradouro: "Rua", numero: "1", unidade: null, bloco: null, edificio: null,
      bairro: null, cidade: null, estado: null, cep: null, pontoReferencia: null, enderecoChave: "rua 1", cidadeChave: "", bairroChave: "",
      latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "sem-localizacao", tipo: "Casa", tipoOrigem: "manual",
      tipoConfianca: null, tipoEstado: "confirmado", tipoDefinidoEm: "2026-09-02T00:00:00Z", tipoClassificacaoId: null, tipoAvistamentoId: null,
      tipoConfirmadoPor: null, tipoConfirmadoEm: null, avistamentosTotal: 1, primeiroAvistamentoEm: null, ultimoAvistamentoEm: null,
      avistamentoCorrenteId: "av1", origemIdentificacao: "campo", ultimaInvestigacaoEm: null, imovelId: null, promovidoEm: null,
      descartadoMotivo: null, descartadoEm: null, fundidoEm: null, fundidoEmImovelId: null, exclusaoSolicitadaEm: null,
      criadoEm: "2026-09-01T00:00:00Z", atualizadoEm: "2026-09-01T00:00:00Z", ...extra,
    } as DetalheImovelIdentificado["identificado"];
    const foto = { id: "f1", estado: "ativa", ativadaEm: "2026-09-01T10:05:00Z", criadoEm: "2026-09-01T10:04:00Z" } as DetalheImovelIdentificado["avistamentos"][number]["fotos"][number];
    const reservada = { ...foto, id: "f2", estado: "reservada", ativadaEm: null };
    const avistamento = { id: "av1", observadoEm: "2026-09-01T10:00:00Z", fotos: [foto, reservada], classificacoes: [], etiquetas: [] } as unknown as DetalheImovelIdentificado["avistamentos"][number];
    return { identificado, avistamentos: [avistamento], etiquetasDoImovel: [], classificacoesCarregadas: true };
  }
  const investigacao: InvestigacaoRegistrada = {
    id: "x1", imovelIdentificadoId: "i", origem: "investigador-web", consulta: "Rua 1", resultadosTotal: 2,
    atributosTotal: 2, recusadosTotal: 1, concluidaEm: "2026-09-05T00:00:00Z", criadoEm: "2026-09-05T00:00:00Z",
  };

  it("compõe passagens, fotos ativas, tipo, investigações, confirmações e promoção numa linha do tempo por referência", () => {
    const memoria = montarMemoriaIdentidade(detalhe({ promovidoEm: "2026-09-12T00:00:00Z" }), [investigacao], [
      registrada({ id: 1, observadoEm: "2026-09-05T00:00:00Z" }),
      registrada({ id: 2, atributo: "area_m2", valorNum: 85.5, observadoEm: "2026-09-05T00:00:00Z", estado: "confirmada", confirmadoPor: USUARIO, confirmadoEm: "2026-09-06T00:00:00Z" }),
    ]);
    expect(memoria.linhaDoTempo.map((e) => [e.tipo, e.em, e.referencia])).toEqual([
      ["promocao", "2026-09-12T00:00:00Z", "i"],
      ["confirmacao", "2026-09-06T00:00:00Z", "2"],
      ["investigacao", "2026-09-05T00:00:00Z", "x1"],
      ["tipo", "2026-09-02T00:00:00Z", "i"],
      ["foto", "2026-09-01T10:05:00Z", "f1"],
      ["passagem", "2026-09-01T10:00:00Z", "av1"],
    ]);
    expect(memoria.linhaDoTempo.find((e) => e.tipo === "investigacao")?.descricao).toBe("Investigação na web: 2 informações salvas");
    expect(memoria.linhaDoTempo.find((e) => e.tipo === "tipo")?.descricao).toBe("Tipo confirmado: Casa");
    expect(memoria.atributos.map((v) => [v.atributo, v.vigente.estado])).toEqual([["area_m2", "confirmada"], ["quartos", "hipotese"]]);
    expect(memoria.divergentes).toEqual([]);
    expect(memoria.investigacoes).toEqual([investigacao]);
  });

  it("ausência é neutra: sem memória nem eventos externos, só o que o módulo já sabia", () => {
    const memoria = montarMemoriaIdentidade(detalhe({ tipo: null, tipoDefinidoEm: null }), [], []);
    expect(memoria.atributos).toEqual([]);
    expect(memoria.investigacoes).toEqual([]);
    expect(memoria.divergentes).toEqual([]);
    expect(memoria.linhaDoTempo.map((e) => e.tipo)).toEqual(["foto", "passagem"]);
  });
});
