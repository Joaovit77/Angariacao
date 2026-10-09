/* Formulário → adaptador publicado → SQL versionado em Postgres descartável.
   Auth/PostgREST reais e concorrência entre conexões exigem smoke em Supabase local. */
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarComandoVenda, type ClienteRpcVendas } from "@/lib/persistencia/vendas";
import { listarContatosCandidatosVenda, type ClienteContatosVenda } from "@/lib/persistencia/vendasContatosLeitura";
import { RASCUNHO_CRIACAO_VENDA, validarRascunhoCriacaoVenda } from "@/components/vendas/criacaoVenda";
const ler = (f: string) => readFileSync(new URL("../../" + f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const CA = "33333333-3333-4333-8333-333333333333", CB = "44444444-4444-4444-8444-444444444444";
let db: PGlite, usuario = A;
let perderResposta: "timeout" | "invalida" | null = null;
const cliente: ClienteRpcVendas = { async rpc(nome, args) {
  expect(nome).toBe("vendas_criar_oportunidade");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [usuario]); await db.exec("set role authenticated");
  let data: unknown;
  try { data = (await db.query<{ r: unknown }>("select public.vendas_criar_oportunidade($1::jsonb) r", [JSON.stringify("p_comando" in args ? args.p_comando : null)])).rows[0].r; }
  catch (e) { const erro = e as { code: string; detail: string }; return { data: null, error: { code: erro.code, details: erro.detail } }; }
  finally { await db.exec("reset role"); }
  if (perderResposta) { const modo = perderResposta; perderResposta = null; if (modo === "timeout") throw new TypeError("Resposta perdida após commit local"); return { data: {}, error: null }; }
  return { data, error: null };
} };
function comando(extra: Partial<typeof RASCUNHO_CRIACAO_VENDA> = {}) {
  const v = validarRascunhoCriacaoVenda({ ...RASCUNHO_CRIACAO_VENDA, modo: "novo", nome: "Pessoa Sintética", telefone: "(43) 99802-4316", ...extra });
  if (!v.ok) throw new Error(v.mensagem);
  return { chaveIdempotencia: randomUUID(), ...v.dados };
}
const criar = (c: ReturnType<typeof comando>) => executarComandoVenda("criar", c, cliente);
async function contagens() {
  const valores = [];
  for (const t of ["public.contatos", "public.contatos_telefones", "public.vendas_oportunidades", "public.vendas_oportunidades_eventos", "private.vendas_comandos", "public.imoveis_contatos"]) valores.push(Number((await db.query<{ n: string }>(`select count(*)::text n from ${t}`)).rows[0].n));
  return valores;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create schema private; create schema auth; create role anon; create role authenticated; create role service_role bypassrls; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon,service_role;");
  await db.exec("create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;");
  const schema = ler("supabase-schema.sql"), funcao = schema.indexOf("create or replace function telefone_canonico(telefone text)"), inicio = schema.indexOf("create table if not exists imoveis (");
  await db.exec(schema.slice(funcao, schema.indexOf("\n$$;", funcao) + 4));
  await db.exec(schema.slice(inicio, schema.indexOf("\n);", inicio) + 3));
  await db.exec("alter table public.imoveis add column unidade text; alter table public.imoveis add column bloco text;");
  await db.exec(ler("supabase/migrations/20260921173129_imoveis_unique_id_user_id.sql"));
  const fase = ler("supabase/migrations/20260921183930_contatos_fase1a.sql");
  await db.exec(fase.slice(fase.indexOf("create table if not exists public.contatos ("), fase.indexOf("-- 5. Views")));
  // Projeções reais de Contatos: a ausência de vínculo no novo interessado não pode atualizar imóvel.
  await db.exec(fase.slice(fase.indexOf("create or replace function private.contato_em_revisao("), fase.indexOf("-- 9. Resolução")));
  await db.exec("grant select on public.contatos,public.contatos_telefones to authenticated;");
  await db.exec("alter default privileges in schema public grant execute on functions to anon,authenticated,service_role; alter default privileges in schema private grant execute on functions to anon,authenticated,service_role;");
  for (const migration of ["20261005003257_vendas_v1_b1_estrutura.sql", "20261005160044_vendas_v1_b2_operacoes.sql", "20261006123603_vendas_v1_b3_2_interessado.sql"]) await db.exec(ler("supabase/migrations/" + migration));
  await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
  await db.query("insert into public.contatos(id,user_id,nome,origem) values($1,$2,'Ana Local','cadastro'),($3,$4,'Pessoa Estrangeira','cadastro')", [CA, A, CB, B]);
  const imovelId = randomUUID();
  await db.query("insert into public.imoveis(id,user_id,endereco) values($1,$2,'Imóvel sentinela')", [imovelId, A]);
  await db.query("insert into public.imoveis_contatos(imovel_id,contato_id,user_id,papel,principal,origem) values($1,$2,$3,'contato',true,'cadastro')", [imovelId, CA, A]);
  // Sentinela no banco descartável: qualquer UPDATE em imóvel faz o cenário falhar.
  await db.exec("create function public.b1_proibir_update_imovel() returns trigger language plpgsql as $$ begin raise exception 'UPDATE de imóvel fora do escopo'; end $$; create trigger b1_sem_update before update on public.imoveis for each row execute function public.b1_proibir_update_imovel();");
}, 60_000);
afterAll(async () => { if (db) await db.close(); });
describe("B3.4b-B1: integração local do comando produzido pela UI", () => {
  it("novo sem telefone: origem vendas, Nova/v1, zero distinto de null e evento compatível", async () => {
    const antes = await contagens(), c = comando({ telefone: "", valor: "0", origem: "portal", descricaoOrigem: " Portal local " });
    const r = await criar(c); expect(r.ok).toBe(true); if (!r.ok) throw new Error(r.erro.codigo);
    expect(r.oportunidade).toMatchObject({ estado: "nova", versao: 1, imovelTratado: null, origem: { tipo: "portal", descricao: "Portal local" }, valores: { valorNegocioPrevisto: 0, receitaPrevista: null } });
    expect(r.evento?.tipo).toBe("oportunidade_criada");
    expect((await db.query("select origem from public.contatos where id=$1", [r.oportunidade.contatoId])).rows).toEqual([{ origem: "vendas" }]);
    expect(await contagens()).toEqual(antes.map((n, i) => n + ([0, 2, 3, 4].includes(i) ? 1 : 0)));
  });
  it.each(["timeout", "invalida"] as const)("%s após commit: mesma chave/payload devolve recibo e único conjunto", async (modo) => {
    const antes = await contagens(), c = comando({ telefone: "" }); perderResposta = modo;
    expect(await criar(c)).toMatchObject({ ok: false, erro: { codigo: modo === "timeout" ? "transporte-indisponivel" : "resposta-invalida" } });
    const r = await criar(c); expect(r.ok).toBe(true); expect(await criar(c)).toEqual(r);
    expect(await criar({ ...c, receitaPrevista: 1 })).toMatchObject({ ok: false, erro: { codigo: "chave-idempotencia-conflitante" } });
    expect(await contagens()).toEqual(antes.map((n, i) => n + ([0, 2, 3, 4].includes(i) ? 1 : 0)));
  });
  it.each(["contatos_telefones", "vendas_oportunidades", "vendas_oportunidades_eventos", "private.vendas_comandos"])("falha em %s desfaz contato, telefone, oportunidade, evento e recibo", async (tabela) => {
    const antes = await contagens(), nome = tabela.includes(".") ? tabela : "public." + tabela;
    await db.exec(`create function public.b1_injetar_falha() returns trigger language plpgsql as $$ begin raise exception 'Falha local deliberada'; end $$; create trigger b1_falha before insert on ${nome} for each row execute function public.b1_injetar_falha();`);
    try { expect(await criar(comando())).toMatchObject({ ok: false, erro: { codigo: "falha-interna" } }); expect(await contagens()).toEqual(antes); }
    finally { await db.exec(`drop trigger b1_falha on ${nome}; drop function public.b1_injetar_falha();`); }
  });
  it("telefone normalizado na mesma transação; colisão não altera pessoa nem cria parcial", async () => {
    const r = await criar(comando()); expect(r.ok).toBe(true); if (!r.ok) throw new Error(r.erro.codigo);
    expect((await db.query("select telefone_canonico from public.contatos_telefones where contato_id=$1", [r.oportunidade.contatoId])).rows).toEqual([{ telefone_canonico: "4398024316" }]);
    const antes = await contagens(); expect(await criar(comando({ nome: "Outro nome" }))).toMatchObject({ ok: false, erro: { codigo: "telefone-ja-cadastrado" } }); expect(await contagens()).toEqual(antes);
    expect((await db.query("select nome from public.contatos where id=$1", [r.oportunidade.contatoId])).rows).toEqual([{ nome: "Pessoa Sintética" }]);
  });
  it("ownership no RPC, id inexistente, fundido, anonimizado e arquivado sem telefone", async () => {
    const existente = (contatoId: string) => criar(comando({ modo: "existente", contatoId }));
    for (const id of [CB, randomUUID()]) expect(await existente(id)).toMatchObject({ ok: false, erro: { codigo: "contato-invalido" } });
    await db.query("update public.contatos set arquivado_em=now() where id=$1", [CA]); expect((await existente(CA)).ok).toBe(true);
    const fundido = randomUUID(), anonimo = randomUUID();
    await db.query("insert into public.contatos(id,user_id,nome,origem,arquivado_em,fundido_em_contato_id,anonimizado_em) values($1,$2,'Fundido','cadastro',now(),$3,null),($4,$2,'Anônimo','cadastro',null,null,now())", [fundido, A, CA, anonimo]);
    expect(await existente(fundido)).toMatchObject({ ok: false, erro: { codigo: "contato-fundido" } }); expect(await existente(anonimo)).toMatchObject({ ok: false, erro: { codigo: "contato-anonimizado" } });
    usuario = B; try { expect(await existente(CA)).toMatchObject({ ok: false, erro: { codigo: "contato-invalido" } }); } finally { usuario = A; }
  });
  it("RLS real das tabelas + filtro da leitura: outro tenant não é candidato", async () => {
    const consultas: string[] = [];
    const c = { auth: { async getUser() { return { data: { user: { id: A } }, error: null }; } }, from(tabela: string) {
      const filtros: string[] = [], params: unknown[] = []; let colunas = "", intervalo = [0, 499];
      const q = { eq(k: string, v: string) { params.push(v); filtros.push(`${k}=$${params.length}`); return q; }, is(k: string) { filtros.push(`${k} is null`); return q; }, order() { return q; }, range(a: number, b: number) { intervalo = [a, b]; return q; },
        then(resolve: (r: { data: unknown; error: unknown }) => unknown, reject?: (e: unknown) => unknown) { return (async () => {
          const sql = `select ${colunas} from public.${tabela} where ${filtros.join(" and ")} order by id limit ${intervalo[1] - intervalo[0] + 1} offset ${intervalo[0]}`; consultas.push(sql);
          await db.query("select set_config('request.jwt.claim.sub',$1,false)", [A]); await db.exec("set role authenticated");
          try { return { data: JSON.parse(JSON.stringify((await db.query(sql, params)).rows)), error: null }; } finally { await db.exec("reset role"); }
        })().then(resolve, reject); } };
      return { select(s: string) { colunas = s; return q; } };
    } };
    const r = await listarContatosCandidatosVenda(c as unknown as ClienteContatosVenda); expect(r).toMatchObject({ ok: true }); if (!r.ok) throw new Error(r.erro);
    expect(r.dados.some((p) => p.id === CB)).toBe(false); expect(r.dados.some((p) => p.id === CA && p.arquivado)).toBe(true);
    expect(consultas.every((sql) => sql.includes("user_id=$1"))).toBe(true);
    await db.exec("set role authenticated");
    try { expect((await db.query("select id from public.contatos where id=$1", [CB])).rows).toEqual([]); } finally { await db.exec("reset role"); }
  });
});
