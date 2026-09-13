import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url);
const ler = (arquivo: string) => readFileSync(new URL(arquivo, RAIZ), "utf8").replace(/\r\n/g, "\n");
const PASTA = "supabase/migrations/";
const C2A = ler(`${PASTA}20260910184310_prospeccao_campo.sql`);
const C2B = ler(`${PASTA}20260910190155_prospeccao_campo_rls_grants.sql`);
const C2C = ler(`${PASTA}20260910193412_prospeccao_campo_triggers.sql`);
const C2E = ler(`${PASTA}20260910211045_prospeccao_campo_rpcs_navegador.sql`);
const PADRAO_RPC = /create or replace function public\.fundir_imoveis_identificados\([\s\S]*?\n\$\$;/gi;
// O ledger é aplicado em ordem: os testes devem alcançar a definição EFETIVA.
const DEFINICOES = readdirSync(new URL(PASTA, RAIZ)).filter((nome) => nome.endsWith(".sql")).sort()
  .flatMap((nome) => [...ler(PASTA + nome).matchAll(PADRAO_RPC)].map(([sql]) => ({ nome, sql })));
const ATUAL = DEFINICOES.at(-1)!;
const HISTORICA = [...C2E.matchAll(PADRAO_RPC)][0][0];
const USUARIO = "10000000-0000-4000-8000-000000000001";
const OUTRO_USUARIO = "10000000-0000-4000-8000-000000000002";
type Json = Record<string, unknown>;

describe("merge — contrato estrutural da definição efetiva", () => {
  it("usa um único lock transacional com a chave literal usuário|menor|maior", () => {
    expect(ATUAL.sql.match(/pg_catalog\.pg_advisory_xact_lock\(/g)).toHaveLength(1);
    expect(ATUAL.sql).not.toMatch(/\bpg_advisory_lock\(/);
    expect(ATUAL.sql).toMatch(/v_user::text\s*\|\| '\|'\s*\|\| least\(p_sobrevivente_id::text, p_absorvido_id::text\)\s*\|\| '\|'\s*\|\| greatest\(p_sobrevivente_id::text, p_absorvido_id::text\)/);
    expect(ATUAL.sql.indexOf("pg_advisory_xact_lock")).toBeLessThan(ATUAL.sql.indexOf("select i.*"));
  });

  it("verifica exclusão dos dois lados antes de qualquer sucesso idempotente", () => {
    const bloqueio = ATUAL.sql.indexOf("if v_sobrevivente.exclusao_solicitada_em is not null");
    expect(bloqueio).toBeGreaterThan(ATUAL.sql.indexOf("if v_sobrevivente.id is null"));
    expect(ATUAL.sql).toMatch(/if v_sobrevivente\.exclusao_solicitada_em is not null\s+or v_absorvido\.exclusao_solicitada_em is not null then\s+return jsonb_build_object\('ok', false, 'codigo', 'exclusao_em_andamento'\)/);
    expect(bloqueio).toBeLessThan(ATUAL.sql.indexOf("'repetida', true"));
  });

  it("mantém intactos assinatura, transação e todos os passos após as validações", () => {
    const inicio = "  -- 1. A lápide primeiro:";
    expect(ATUAL.sql.slice(ATUAL.sql.indexOf(inicio))).toBe(HISTORICA.slice(HISTORICA.indexOf(inicio)));
    expect(ATUAL.sql.split("declare")[0]).toBe(HISTORICA.split("declare")[0]);
    expect(ATUAL.sql).not.toMatch(/\b(?:commit|rollback|savepoint)\b|public\.imoveis\b|storage\.|set_config|classificar/i);
  });

  it("espelha a correção no schema, depois da definição histórica, sem ampliar permissões", () => {
    expect(DEFINICOES).toHaveLength(2);
    const schema = ler("supabase-schema.sql");
    const migration = ler(PASTA + ATUAL.nome).trim();
    expect(schema.split(migration)).toHaveLength(2);
    expect([...schema.matchAll(PADRAO_RPC)].at(-1)?.[0]).toBe(ATUAL.sql);
    expect(schema.indexOf(ATUAL.sql)).toBeGreaterThan(schema.indexOf(HISTORICA));
    expect(migration).not.toMatch(/\b(?:grant|revoke|drop|alter|create table|create policy|create trigger)\b/i);
  });
});

// PostgreSQL real em memória, seguindo repasses-banco.test.ts. Nenhuma API,
// credencial ou .env é usada. PGlite tem uma sessão: não simula concorrência.
describe.sequential("merge — RPC, grants e triggers no PostgreSQL local", () => {
  let db: PGlite;
  let permissoesAnteriores: unknown;

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
      grant usage on schema auth to authenticated;
      create function public.set_updated_at() returns trigger language plpgsql
        as $$ begin new.updated_at := now(); return new; end; $$;
      create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
      create table storage.objects (id uuid primary key, bucket_id text, name text);
    `);
    for (const sql of [C2A, C2B, C2C, C2E]) await db.exec(sql);
    permissoesAnteriores = await permissoes();
    // Executa o arquivo corretivo inteiro, quando presente, além da criação histórica.
    for (const definicao of DEFINICOES.slice(1)) await db.exec(ler(PASTA + definicao.nome));
  }, 30_000);

  beforeEach(async () => {
    await db.exec("reset role; truncate public.imoveis_identificados, public.imoveis, storage.objects cascade; begin");
  });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  async function permissoes() {
    return (await db.query(`select proacl::text, prosecdef, proconfig from pg_proc
      where oid = 'public.fundir_imoveis_identificados(uuid,uuid)'::regprocedure`)).rows;
  }

  async function comoUsuario(sql: string, parametros: unknown[] = [], usuario = USUARIO) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
    await db.exec("set role authenticated");
    try {
      return await db.query<{ resultado: Json }>(sql, parametros);
    } finally {
      // Se houver erro dentro de BEGIN, o teste desfaz a transação no afterEach.
      await db.exec("reset role").catch(() => {});
    }
  }

  async function fundir(sobrevivente: string, absorvido: string, usuario = USUARIO) {
    const resposta = await comoUsuario("select public.fundir_imoveis_identificados($1, $2) as resultado", [sobrevivente, absorvido], usuario);
    return resposta.rows[0].resultado;
  }

  async function identidade(tipo: string | null = null, usuario = USUARIO) {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro, tipo) values ($1, $2, 'Rua de teste', $3)", [id, usuario, tipo]);
    return id;
  }

  async function avistamento(pai: string, dia: number, acuracia = 7) {
    const id = randomUUID();
    await db.query(`insert into public.imoveis_identificados_avistamentos
      (id, user_id, imovel_identificado_id, observado_em, created_at, observacao,
       latitude, longitude, acuracia_metros, precisao_localizacao)
      values ($1, $2, $3, $4, '2026-09-10T12:00:00Z', 'Fachada observada', -23.3, -51.1, $5, 'gps')`,
    [id, USUARIO, pai, `2026-09-0${dia}T12:00:00Z`, acuracia]);
    return id;
  }

  async function marcarExclusao(id: string) {
    await db.query("update public.imoveis_identificados set exclusao_solicitada_em = now() where id = $1", [id]);
  }

  async function cancelarExclusao(id: string) {
    return (await comoUsuario("select public.cancelar_exclusao_imovel_identificado($1) as resultado", [id])).rows[0].resultado;
  }

  async function retrato() {
    const tabelas = ["public.imoveis_identificados", "public.imoveis_identificados_avistamentos",
      "public.imoveis_identificados_fotos", "public.imoveis_identificados_classificacoes",
      "public.imoveis_identificados_etiquetas", "public.imoveis", "storage.objects"];
    return Object.fromEntries(await Promise.all(tabelas.map(async (tabela) => [tabela,
      (await db.query(`select to_jsonb(t) as linha from ${tabela} t order by id`)).rows,
    ])));
  }

  it("preserva execute somente para authenticated e a configuração da função", async () => {
    expect(await permissoes()).toEqual(permissoesAnteriores);
    const resultado = await db.query<{ papel: string; permitido: boolean }>(`select papel,
      has_function_privilege(papel, 'public.fundir_imoveis_identificados(uuid,uuid)', 'execute') as permitido
      from unnest(array['anon', 'authenticated', 'service_role']) as papel`);
    expect(resultado.rows).toEqual([
      { papel: "anon", permitido: false }, { papel: "authenticated", permitido: true }, { papel: "service_role", permitido: false },
    ]);
  });

  it("a expressão SQL efetiva gera o mesmo recurso para A/B e B/A, isolado por usuário", async () => {
    const expressao = ATUAL.sql.match(/perform pg_catalog\.pg_advisory_xact_lock\(([\s\S]*?)\n  \);/)![1];
    const a = randomUUID(); const b = randomUUID(); const c = randomUUID();
    async function chave(usuario: string, primeiro: string, segundo: string) {
      return (await db.query<{ chave: string }>(`select (${expressao})::text as chave
        from (select $1::uuid as v_user, $2::uuid as p_sobrevivente_id, $3::uuid as p_absorvido_id) entrada`,
      [usuario, primeiro, segundo])).rows[0].chave;
    }
    const ab = await chave(USUARIO, a, b);
    expect(await chave(USUARIO, b, a)).toBe(ab);
    expect(await chave(OUTRO_USUARIO, a, b)).not.toBe(ab);
    expect(await chave(USUARIO, a, c)).not.toBe(ab);
    expect(await chave(USUARIO, c, b)).not.toBe(ab);
  });

  it("mantém somente um advisory lock até o fim da transação e o libera no commit", async () => {
    const a = await identidade(); const b = await identidade();
    expect(await fundir(b, a)).toMatchObject({ ok: true, repetida: false });
    const locks = () => db.query("select mode, granted from pg_locks where locktype = 'advisory'");
    expect((await locks()).rows).toEqual([{ mode: "ExclusiveLock", granted: true }]);
    await db.exec("commit");
    expect((await locks()).rows).toEqual([]);
  });

  it("repetição exata sem exclusão não muda nenhuma linha", async () => {
    const a = await identidade(); const b = await identidade();
    await avistamento(a, 1); await avistamento(b, 2);
    await fundir(b, a);
    const antes = await retrato();
    expect(await fundir(b, a)).toEqual({ ok: true, repetida: true, sobrevivente_id: b, absorvido_id: a });
    expect(await retrato()).toEqual(antes);
  });

  it.each(["sobrevivente", "absorvido"])("repetição com %s em exclusão é recusada e volta após cancelar", async (lado) => {
    const a = await identidade(); const b = await identidade();
    await avistamento(a, 1); await fundir(b, a);
    const alvo = lado === "sobrevivente" ? b : a;
    await marcarExclusao(alvo);
    const antes = await retrato();
    expect(await fundir(b, a)).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
    expect(await retrato()).toEqual(antes);
    expect(await cancelarExclusao(alvo)).toMatchObject({ ok: true });
    expect(await fundir(b, a)).toMatchObject({ ok: true, repetida: true });
  });

  it.each(["sobrevivente", "absorvido"])("merge novo com %s em exclusão é recusado e volta após cancelar", async (lado) => {
    const a = await identidade(); const b = await identidade();
    await avistamento(a, 1);
    const alvo = lado === "sobrevivente" ? b : a;
    await marcarExclusao(alvo);
    const antes = await retrato();
    expect(await fundir(b, a)).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
    expect(await retrato()).toEqual(antes);
    await cancelarExclusao(alvo);
    expect(await fundir(b, a)).toMatchObject({ ok: true, repetida: false });
  });

  it("recusa auto-merge sem alterar dados", async () => {
    const a = await identidade(); const antes = await retrato();
    expect(await fundir(a, a)).toEqual({ ok: false, codigo: "fusao_em_si_mesmo" });
    expect(await retrato()).toEqual(antes);
  });

  it.each(["sobrevivente", "absorvido"])("recusa %s pertencente a outro usuário", async (lado) => {
    const a = await identidade(); const b = await identidade(null, OUTRO_USUARIO);
    await expect(lado === "sobrevivente" ? fundir(b, a) : fundir(a, b)).rejects.toMatchObject({ code: "P0002" });
  });

  it("recusa sessão ausente", async () => {
    const a = await identidade(); const b = await identidade();
    await expect(fundir(b, a, "")).rejects.toMatchObject({ code: "42501" });
  });

  it.each(["promovido", "promovendo"])("recusa %s em qualquer lado", async (situacao) => {
    const a = await identidade(); const b = await identidade();
    const oportunidade = randomUUID();
    await db.query("insert into public.imoveis values ($1, $2)", [oportunidade, USUARIO]);
    await db.query(`update public.imoveis_identificados set situacao = $2,
      imovel_id = case when $2 = 'promovido' then $3::uuid else null end,
      promovido_em = case when $2 = 'promovido' then now() else null end where id = $1`, [a, situacao, oportunidade]);
    const antes = await retrato();
    expect(await fundir(b, a)).toMatchObject({ ok: false, codigo: "situacao_incompativel" });
    expect(await fundir(a, b)).toMatchObject({ ok: false, codigo: "situacao_incompativel" });
    expect(await retrato()).toEqual(antes);
  });

  it("lápide não sobrevive, não é absorvida por outro e não forma A→B→A", async () => {
    const a = await identidade(); const b = await identidade(); const c = await identidade();
    await fundir(b, a);
    const antes = await retrato();
    expect(await fundir(a, b)).toMatchObject({ ok: false, codigo: "situacao_incompativel" });
    expect(await fundir(c, a)).toMatchObject({ ok: false, codigo: "situacao_incompativel" });
    expect(await retrato()).toEqual(antes);
  });

  it("A→B seguido de B→C repontua A diretamente para C e preserva todos os eventos", async () => {
    const a = await identidade(); const b = await identidade(); const c = await identidade();
    const eventos = [await avistamento(a, 1, 4), await avistamento(b, 3, 80), await avistamento(c, 2, 20)];
    const antes = (await db.query("select to_jsonb(a) - 'imovel_identificado_id' as evento from public.imoveis_identificados_avistamentos a order by id")).rows;
    await fundir(b, a); await fundir(c, b);
    expect((await db.query("select id, situacao, fundido_em_imovel_id from public.imoveis_identificados where id = any($1::uuid[]) order by id", [[a, b]])).rows)
      .toEqual(expect.arrayContaining([a, b].map((id) => ({ id, situacao: "fundido", fundido_em_imovel_id: c }))));
    expect((await db.query("select to_jsonb(a) - 'imovel_identificado_id' as evento from public.imoveis_identificados_avistamentos a order by id")).rows).toEqual(antes);
    expect((await db.query("select id from public.imoveis_identificados_avistamentos where imovel_identificado_id = $1", [c])).rows)
      .toEqual(expect.arrayContaining(eventos.map((id) => ({ id }))));
    expect((await db.query("select avistamentos_total, avistamento_corrente_id, acuracia_metros, precisao_localizacao from public.imoveis_identificados where id = $1", [c])).rows[0])
      .toMatchObject({ avistamentos_total: 3, avistamento_corrente_id: eventos[1], acuracia_metros: "4", precisao_localizacao: "gps" });
    expect((await db.query("select avistamentos_total, avistamento_corrente_id from public.imoveis_identificados where id = any($1::uuid[])", [[a, b]])).rows)
      .toEqual([{ avistamentos_total: 0, avistamento_corrente_id: null }, { avistamentos_total: 0, avistamento_corrente_id: null }]);
  });

  it("browser não reparenteia diretamente nem enxerga registros alheios", async () => {
    const a = await identidade(); const b = await identidade(); const alheio = await identidade(null, OUTRO_USUARIO);
    const evento = await avistamento(a, 1);
    expect((await comoUsuario("select id from public.imoveis_identificados where id = $1", [alheio])).rows).toEqual([]);
    await expect(comoUsuario("update public.imoveis_identificados_avistamentos set imovel_identificado_id = $1 where id = $2", [b, evento]))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("falha SQL após lápide, reparenteamento, denormalizados, recálculo e herança desfaz tudo", async () => {
    const a = await identidade("Casa"); const b = await identidade();
    const evento = await avistamento(a, 1, 4); await avistamento(b, 2, 80);
    const foto = randomUUID(); const classificacao = randomUUID();
    await db.query(`insert into public.imoveis_identificados_fotos
      (id, avistamento_id, imovel_identificado_id, user_id, caminho, caminho_miniatura, largura, altura, bytes)
      values ($1, $2, $3, $4, 'origem/fachada.jpg', 'origem/fachada_thumb.jpg', 100, 100, 1000)`, [foto, evento, a, USUARIO]);
    await db.query(`insert into public.imoveis_identificados_classificacoes
      (id, avistamento_id, imovel_identificado_id, user_id, modo, observacao_revisao,
       fingerprint, modelo, versao_catalogo, versao_classificador, confianca_minima)
      values ($1, $2, $3, $4, 'modelo', 1, 'fixture-local', 'fixture-sem-api', 1, 1, 80)`, [classificacao, evento, a, USUARIO]);
    await db.query(`insert into public.imoveis_identificados_etiquetas
      (imovel_identificado_id, avistamento_id, classificacao_id, user_id, categoria, codigo,
       origem, confianca, modelo, versao_catalogo, revisao_observacao)
      values ($1, $2, $3, $4, 'fachada', 'teste-local', 'ia-texto', 90, 'fixture-sem-api', 1, 1)`, [a, evento, classificacao, USUARIO]);
    await db.query("insert into storage.objects values ($1, 'fachadas', 'origem/fachada.jpg')", [foto]);
    const antes = await retrato();
    await db.exec(`
      create function private.falhar_merge_teste() returns trigger language plpgsql as $$
      begin
        if new.id = '${b}' and old.tipo is null and new.tipo = 'Casa' then
          if (select situacao from public.imoveis_identificados where id = '${a}') <> 'fundido'
             or (select avistamentos_total from public.imoveis_identificados where id = '${a}') <> 0
             or new.avistamentos_total <> 2
             or (select imovel_identificado_id from public.imoveis_identificados_avistamentos where id = '${evento}') <> new.id
             or (select imovel_identificado_id from public.imoveis_identificados_fotos where id = '${foto}') <> new.id
             or (select imovel_identificado_id from public.imoveis_identificados_classificacoes where id = '${classificacao}') <> new.id
             or exists (select 1 from public.imoveis_identificados_etiquetas where imovel_identificado_id = '${a}') then
            raise exception 'Teste não alcançou todos os passos do merge';
          end if;
          raise exception 'Falha induzida após herança e reparenteamento';
        end if;
        return new;
      end; $$;
      create trigger falha_merge_teste after update on public.imoveis_identificados
        for each row execute function private.falhar_merge_teste();
      commit;
    `);
    try {
      // Sem BEGIN externo nem compensação: a própria chamada da RPC deve abortar.
      await expect(fundir(b, a)).rejects.toThrow("Falha induzida após herança e reparenteamento");
      expect(await retrato()).toEqual(antes);
      expect((await db.query("select * from pg_locks where locktype = 'advisory'")).rows).toEqual([]);
    } finally {
      await db.exec("drop trigger falha_merge_teste on public.imoveis_identificados; drop function private.falhar_merge_teste()");
    }
  });
});
