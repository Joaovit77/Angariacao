import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ler = (nome: string) => readFileSync(new URL("../../" + nome, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = ler("supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql");
const schema = ler("supabase-schema.sql");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CA = "33333333-3333-4333-8333-333333333333";
const CB = "44444444-4444-4444-8444-444444444444";
const instante = "2026-10-04T20:00:00.123Z";
const publicas = ["vendas_oportunidades", "vendas_oportunidades_eventos", "vendas_imoveis_referencias"];
let db: PGlite;
let versaoPg: string;
let imovel: string;
let referencia: string;
let oportunidade: string;
let eventoInicial: string;

async function inserir(tabela: string, campos: Record<string, unknown>): Promise<string> {
  const nomes = Object.keys(campos);
  const sql = "insert into " + tabela + " (" + nomes.join(",") + ") values (" + nomes.map((_, i) => "$" + (i + 1)).join(",") + ") returning id";
  return (await db.query<{ id: string }>(sql, Object.values(campos))).rows[0].id;
}
function nova(extra: Record<string, unknown> = {}) {
  return inserir("public.vendas_oportunidades", {
    id: randomUUID(), user_id: A, contato_id: CA, estado: "nova", versao: "1",
    criado_por: A, responsavel_usuario_id: A, created_at: instante, updated_at: instante, ...extra,
  });
}
function evento(id: string, extra: Record<string, unknown> = {}) {
  return inserir("public.vendas_oportunidades_eventos", {
    id: randomUUID(), user_id: A, oportunidade_id: id, tipo: "oportunidade_criada",
    ator_usuario_id: A, registrado_em: instante, versao: "1", payload: {},
    chave_idempotencia: randomUUID(), ...extra,
  });
}
function recibo(id: string, extra: Record<string, unknown> = {}) {
  return inserir("private.vendas_comandos", {
    id: randomUUID(), user_id: A, oportunidade_id: id, operacao: "criar",
    chave_idempotencia: randomUUID(), fingerprint: "a".repeat(64), resposta: {},
    created_at: instante, concluido_em: instante, ...extra,
  });
}
async function como(usuario: string, sql: string, parametros: unknown[] = [], role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
  await db.exec("set role " + role);
  try { return await db.query(sql, parametros); }
  finally { await db.exec("reset role"); }
}
const ganho = { estado: "ganha", imovel_modo: "manual", manual_referencia: "Imóvel de teste",
  encerramento_tipo: "ganho", data_fato: "2026-10-04", encerrado_em: instante,
  confirmacao_explicita: true, registro_formalizacao: "Contrato registrado" };
const perda = { estado: "perdida", encerramento_tipo: "perda", data_fato: "2026-10-04",
  encerrado_em: instante, motivo_perda: "outro", justificativa_perda: "Condição de teste" };

beforeAll(async () => {
  // Motor PostgreSQL real em memória; Auth/PostgREST e concorrência Supabase não são simulados como integração completa.
  const modulo17 = process.env.VENDAS_PGLITE_MODULE;
  const Construtor = modulo17 ? (await import(/* @vite-ignore */ pathToFileURL(modulo17).href)).PGlite : PGlite;
  db = new Construtor();
  versaoPg = (await db.query<{ version: string }>("select version()")).rows[0].version;
  await db.exec([
    "create role anon; create role authenticated; create role service_role bypassrls;",
    "create schema auth; create schema private;",
    "revoke all on schema private from public, anon, authenticated;",
    "create table auth.users(id uuid primary key);",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;",
    "grant usage on schema auth, public to authenticated, anon, service_role;",
    // Defaults deliberadamente permissivos: a migration deve fechar a fronteira sozinha.
    "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;",
    "alter default privileges in schema private grant all on tables to anon, authenticated, service_role;",
  ].join("\n"));
  await db.query("insert into auth.users(id) values ($1),($2)", [A, B]);
  for (const nome of ["imoveis", "public.contatos"]) {
    const inicio = schema.indexOf("create table if not exists " + nome + " (");
    const fim = schema.indexOf("\n);", inicio);
    expect(inicio).toBeGreaterThanOrEqual(0);
    await db.exec(schema.slice(inicio, fim + 3));
  }
  await db.exec(ler("supabase/migrations/20260921173129_imoveis_unique_id_user_id.sql"));
  await db.query("insert into public.contatos(id,user_id,nome,origem) values ($1,$2,'Teste A','cadastro'),($3,$4,'Teste B','cadastro')", [CA,A,CB,B]);
  const antes = await db.query("select * from public.contatos order by id");
  await db.exec(migration);
  expect(await db.query("select * from public.contatos order by id")).toEqual(antes);
  await db.exec("create table public.mensagens_agendadas(id uuid primary key, user_id uuid, imovel_id uuid, status text); create table public.agenda(id uuid primary key, user_id uuid, imovel_id uuid)");
  // Função legada literal: prova a compatibilidade da FK com seu caminho existente de exclusão.
  const exclusaoLegada = ler("supabase/migrations/20260819132316_producao_exclusao_imovel_atomica_grants_minimos.sql")
    .split("revoke all on table")[0].replace(/^begin;\n/, "");
  await db.exec(exclusaoLegada);
  imovel = await inserir("public.imoveis", { id: randomUUID(), user_id: A, endereco: "Endereço A" });
  referencia = await inserir("public.vendas_imoveis_referencias", {
    id: randomUUID(), user_id: A, imovel_id: imovel, imovel_id_original: imovel,
    endereco: "Endereço de teste", capturado_em: instante,
  });
  oportunidade = await nova({ imovel_modo: "referencia", imovel_referencia_id: referencia });
  eventoInicial = await evento(oportunidade);
  await recibo(oportunidade, { evento_id: eventoInicial });
}, 60_000);
afterAll(async () => { if (db) await db.close(); });

describe("Vendas V1-B1: banco descartável", () => {
  it("executa em PostgreSQL identificado, sem event trigger que esconda falta de RLS", async () => {
    expect(versaoPg).toMatch(/PostgreSQL (17|18)\./);
    if (process.env.VENDAS_PGLITE_MODULE) expect(versaoPg).toMatch(/PostgreSQL 17\./);
    expect((await db.query("select * from pg_event_trigger")).rows).toHaveLength(0);
  });
  it("habilita RLS nas quatro tabelas e mantém private sem USAGE do cliente", async () => {
    const rows = (await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('vendas_oportunidades','vendas_oportunidades_eventos','vendas_imoveis_referencias','vendas_comandos')")).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every(r => r.relrowsecurity)).toBe(true);
    expect((await db.query<{ permitido: boolean }>("select has_schema_privilege('authenticated','private','USAGE') permitido")).rows[0].permitido).toBe(false);
  });
  it.each(publicas)("permite leitura própria e bloqueia outra conta/anon em %s", async tabela => {
    expect((await como(A, "select * from public." + tabela)).rows.length).toBeGreaterThan(0);
    expect((await como(B, "select * from public." + tabela + " where user_id=$1", [A])).rows).toEqual([]);
    await expect(como(A, "select * from public." + tabela, [], "anon")).rejects.toMatchObject({ code: "42501" });
  });
  it.each(publicas)("bloqueia INSERT, UPDATE e DELETE do navegador em %s", async tabela => {
    for (const sql of ["insert into public." + tabela + "(user_id) values ($1)", "update public." + tabela + " set user_id=$1", "delete from public." + tabela + " where user_id=$1"]) {
      await expect(como(A, sql, [A])).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("recibos continuam inacessíveis mesmo diante de USAGE concedido por outro subsistema", async () => {
    await db.exec("grant usage on schema private to authenticated");
    try {
      await expect(como(A, "select * from private.vendas_comandos")).rejects.toMatchObject({ code: "42501" });
      for (const privilegio of ["SELECT","INSERT","UPDATE","DELETE"]) {
        expect((await db.query<{ permitido: boolean }>("select has_table_privilege('authenticated','private.vendas_comandos',$1) permitido", [privilegio])).rows[0].permitido).toBe(false);
      }
    } finally { await db.exec("revoke usage on schema private from authenticated"); }
  });
  it("revoga também os defaults de service_role: BYPASSRLS não substitui grants", async () => {
    for (const tabela of [...publicas.map(t => "public." + t), "private.vendas_comandos"]) {
      for (const privilegio of ["SELECT","INSERT","UPDATE","DELETE"]) {
        expect((await db.query<{ permitido: boolean }>("select has_table_privilege('service_role',$1,$2) permitido", [tabela,privilegio])).rows[0].permitido).toBe(false);
      }
    }
  });
  it("impede contato e referências de outro tenant mesmo com escrita do owner", async () => {
    await expect(nova({ contato_id: CB })).rejects.toMatchObject({ code: "23503" });
    const estrangeiro = await inserir("public.imoveis", { id: randomUUID(), user_id: B, endereco: "Endereço B" });
    await expect(inserir("public.vendas_imoveis_referencias", { user_id: A, imovel_id: estrangeiro, imovel_id_original: estrangeiro, capturado_em: instante })).rejects.toMatchObject({ code: "23503" });
    const refB = await inserir("public.vendas_imoveis_referencias", { user_id: B, imovel_id: estrangeiro, imovel_id_original: estrangeiro, capturado_em: instante });
    await expect(nova({ imovel_modo: "referencia", imovel_referencia_id: refB })).rejects.toMatchObject({ code: "23503" });
  });
  it("versão cobre 1 até MAX_SAFE_INTEGER, excluindo zero, negativos e excedente", async () => {
    for (const versao of ["0","-1","9007199254740992"]) {
      await expect(nova({ versao })).rejects.toMatchObject({ code: "23514" });
      await expect(evento(oportunidade, { versao })).rejects.toMatchObject({ code: "23514" });
    }
    const id = await nova({ versao: "9007199254740991" });
    await evento(id, { versao: "9007199254740991" });
    expect((await db.query<{ versao: string }>("select versao::text from public.vendas_oportunidades where id=$1",[id])).rows[0].versao).toBe("9007199254740991");
  });
  it.each(["valor_negocio_previsto","valor_negocio_fechado","receita_prevista"])("numeric em %s recusa especiais e preserva magnitude/decimais", async campo => {
    for (const valor of ["NaN","Infinity","-Infinity","-0.001"]) {
      await expect(nova({ ...ganho, [campo]: valor })).rejects.toMatchObject({ code: "23514" });
    }
    for (const valor of [null,"0","1.23456789123456789","1.7976931348623157e308","5e-324","1e1000"]) {
      const id = await nova({ ...ganho, [campo]: valor });
      expect((await db.query<{ igual: boolean }>("select " + campo + " is not distinct from $2::numeric igual from public.vendas_oportunidades where id=$1", [id,valor])).rows[0].igual).toBe(true);
    }
  });
  it("prova por que apenas >= 0 não recusa NaN/Infinity", async () => {
    expect((await db.query("select 'NaN'::numeric >= 0 nan, 'Infinity'::numeric >= 0 infinito, 'NaN'::numeric > 'Infinity'::numeric ordenacao")).rows[0]).toEqual({ nan: true, infinito: true, ordenacao: true });
  });
  it.each([
    {estado:"inventado"}, {origem_tipo:"radar"}, {origem_descricao:"Sem tipo"},
    {criado_por:B}, {responsavel_usuario_id:B}, {imovel_modo:"outro"},
    {manual_endereco:"Sem modo"}, {imovel_modo:"referencia"},
    {imovel_modo:"manual",manual_unidade:"Só unidade"},
    {imovel_modo:"manual",manual_endereco:"\t\n\u00a0\ufeff"},
    {imovel_modo:"referencia",imovel_referencia_id:randomUUID(),manual_endereco:"Mistura"},
    {estado:"em_negociacao"}, {arquivado_em:instante}, {valor_negocio_fechado:"1"},
    {encerramento_tipo:"ganho"}, {data_fato:"2026-10-04"},
    {created_at:"2026-10-05T00:00:00Z"}, {created_at:"-infinity"}, {updated_at:"infinity"},
  ])("recusa snapshot incoerente: %j", async extra => {
    await expect(nova(extra)).rejects.toMatchObject({ code: "23514" });
  });
  it.each([
    {confirmacao_explicita:false}, {confirmacao_explicita:null}, {registro_formalizacao:"\t\u00a0"},
    {encerramento_tipo:null}, {data_fato:null}, {motivo_perda:"outro"},
  ])("ganho recusa fechamento incompleto: %j", async extra => {
    await expect(nova({ ...ganho, ...extra })).rejects.toMatchObject({ code: "23514" });
  });
  it.each([
    {motivo_perda:"inventado"}, {motivo_perda:null}, {justificativa_perda:"\n\ufeff"},
    {encerramento_tipo:null}, {data_fato:null}, {registro_formalizacao:"Incompatível"},
  ])("perda recusa fechamento incoerente: %j", async extra => {
    await expect(nova({ ...perda, ...extra })).rejects.toMatchObject({ code: "23514" });
  });
  it("aceita terminais coerentes e arquivamento; ganho não exige valor fechado", async () => {
    await nova({ ...ganho, arquivado_em:instante });
    await nova({ ...perda, arquivado_em:instante });
    await nova({ ...perda, motivo_perda:"compra_outro_canal", justificativa_perda:null });
  });
  it("date preserva dias civis e não antecipa a política operacional não-futuro do B2", async () => {
    for (const data of ["0100-01-01","2011-12-30","9999-12-31"]) {
      const id = await nova({ ...ganho, data_fato:data });
      expect((await db.query<{ data: string }>("select data_fato::text data from public.vendas_oportunidades where id=$1", [id])).rows[0].data).toBe(data);
    }
    for (const data of ["0099-12-31","10000-01-01"]) await expect(nova({ ...ganho,data_fato:data })).rejects.toMatchObject({code:"23514"});
    await expect(nova({ ...ganho,data_fato:"2026-02-30" })).rejects.toMatchObject({code:"22008"});
  });
  it("eventos possuem versão única, tenant seguro e envelope fechado estruturalmente", async () => {
    await expect(evento(oportunidade)).rejects.toMatchObject({code:"23505"});
    await expect(evento(oportunidade,{user_id:B,ator_usuario_id:B,versao:"2"})).rejects.toMatchObject({code:"23503"});
    for (const extra of [{ator_usuario_id:B},{tipo:"inventado"},{payload:[]},{chave_idempotencia:"\t\u00a0"},{data_fato:"2026-10-04"},{tipo:"oportunidade_ganha"}]) {
      await expect(evento(oportunidade,{versao:"2",...extra})).rejects.toMatchObject({code:"23514"});
    }
  });
  it("recibo vincula evento à mesma conta e oportunidade e reserva chave por conta", async () => {
    const outra = await nova();
    await expect(recibo(outra,{evento_id:eventoInicial})).rejects.toMatchObject({code:"23503"});
    await expect(recibo(oportunidade,{user_id:B})).rejects.toMatchObject({code:"23503"});
    const chave = randomUUID();
    await recibo(outra,{chave_idempotencia:chave});
    await expect(recibo(outra,{chave_idempotencia:chave})).rejects.toMatchObject({code:"23505"});
  });
  it("exclusão do imóvel apaga somente ponteiro vivo e preserva todo histórico comercial", async () => {
    const antes = await db.query("select * from public.vendas_oportunidades where id=$1",[oportunidade]);
    await como(A, "select public.excluir_imovel_com_dependencias($1)", [imovel]);
    expect(await db.query("select * from public.vendas_oportunidades where id=$1",[oportunidade])).toEqual(antes);
    expect((await db.query("select user_id,imovel_id,imovel_id_original,endereco from public.vendas_imoveis_referencias where id=$1",[referencia])).rows[0]).toEqual({user_id:A,imovel_id:null,imovel_id_original:imovel,endereco:"Endereço de teste"});
    expect((await db.query("select id from public.vendas_oportunidades_eventos where id=$1",[eventoInicial])).rows).toHaveLength(1);
    expect((await db.query("select id from private.vendas_comandos where oportunidade_id=$1",[oportunidade])).rows).toHaveLength(1);
    await expect(db.query("delete from public.vendas_imoveis_referencias where id=$1",[referencia])).rejects.toMatchObject({code:"23503"});
    await expect(db.query("delete from public.contatos where id=$1",[CA])).rejects.toMatchObject({code:"23503"});
  });
  it("remoção administrativa da conta mantém a cascata de isolamento consistente", async () => {
    const usuario = randomUUID();
    const contato = randomUUID();
    await db.query("insert into auth.users values ($1)",[usuario]);
    await db.query("insert into public.contatos(id,user_id,nome,origem) values ($1,$2,'Teste descartável','cadastro')",[contato,usuario]);
    const id = await nova({user_id:usuario,contato_id:contato,criado_por:usuario,responsavel_usuario_id:usuario});
    const ev = await evento(id,{user_id:usuario,ator_usuario_id:usuario});
    await recibo(id,{user_id:usuario,evento_id:ev});
    await db.query("delete from auth.users where id=$1",[usuario]);
    expect((await db.query("select id from public.vendas_oportunidades where id=$1",[id])).rows).toEqual([]);
  });
});
