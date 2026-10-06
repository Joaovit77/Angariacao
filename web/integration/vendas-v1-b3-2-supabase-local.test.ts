/** B3.2 contra Supabase LOCAL isolado (Auth, PostgREST, RLS, triggers reais de Contatos e
    conexões concorrentes). Duas fases sobre a mesma stack: `pre` (ledger no B2) grava um recibo
    pelo B2 puro; `pos` (ledger no B3.2) repete esse recibo e prova o resto. Nunca Production. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { telefoneCanonico } from "../lib/calculo/webhookWhatsapp";
import { executarComandoVenda } from "../lib/persistencia/vendas";
import type { ErroOperacaoVenda, RespostaOperacaoVenda } from "../lib/persistencia/vendasComandos";
import { decodificarErroVenda, decodificarRespostaVenda } from "../lib/persistencia/vendasDecodificacao";

const url = process.env.VENDAS_B32_LOCAL_URL, anon = process.env.VENDAS_B32_LOCAL_ANON_KEY;
const fase = process.env.VENDAS_B32_FASE, arquivoEstado = process.env.VENDAS_B32_ESTADO;
if (process.env.VENDAS_B32_INTEGRACAO !== "LOCAL_ISOLADA" || url !== "http://127.0.0.1:55821" || !anon
  || (fase !== "pre" && fase !== "pos") || !arquivoEstado) {
  throw new Error("Gate B3.2 requer stack local isolada 55821, chave anon local, fase e arquivo de estado explícitos.");
}
const PROJETO = "vendas-b32-6774dce", container = "supabase_db_" + PROJETO;
const B2 = "20261005160044", B32 = "20261006123603";
const argsPsql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"];
function owner(sql: string): string {
  try { return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 }).trim(); }
  catch { throw new Error("Consulta da fixture local não concluída."); }
}
function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("ID da fixture inválido."); return id;
}
const telefone = () => `(43) 9${randomInt(6000, 9999)}-${randomInt(1000, 9999)}`;
const cliente = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
async function entrar(email: string, password: string) {
  const c = cliente(); const login = await c.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.user) throw new Error("Auth local não autenticou a fixture."); return { c, usuario: uuid(login.data.user.id) };
}
async function nova() {
  const c = cliente(), email = "vendas-b32-" + randomUUID() + "@example.test", password = "B32-" + randomUUID();
  const cadastro = await c.auth.signUp({ email, password });
  if (cadastro.error || !cadastro.data.user) throw new Error("Auth local não criou a fixture.");
  return { email, password, ...(await entrar(email, password)) };
}
type Resultado = RespostaOperacaoVenda | { ok: false; erro: ErroOperacaoVenda };
async function criar(c: SupabaseClient, comando: Record<string, unknown>): Promise<Resultado> {
  const r = await c.rpc("vendas_criar_oportunidade", { p_comando: comando });
  return r.error ? { ok: false, erro: decodificarErroVenda(r.error) } : decodificarRespostaVenda(r.data);
}
async function resolver(c: SupabaseClient, telefoneDigitado: string) {
  const r = await c.rpc("vendas_resolver_interessado", { p_consulta: { telefone: telefoneDigitado } });
  if (r.error) throw new Error("Resolução recusada: " + r.error.code); return r.data as Record<string, unknown>;
}
const contar = (sql: string) => Number(owner(sql));

/** Sessão owner com uma transação aberta segurando `sql`; as tarefas começam e só seguem no commit. */
async function barreira<T>(sql: string, tarefas: (() => Promise<T>)[], filtro: string): Promise<T[]> {
  const processo = spawn("docker", argsPsql, { stdio: ["pipe", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    let saida = "";
    const timer = setTimeout(() => { processo.stdin.end("rollback;\n\\q\n"); reject(new Error("Barreira local não abriu.")); }, 10_000);
    processo.stdout.on("data", (chunk) => { saida += String(chunk); if (saida.includes("B32_BARREIRA_PRONTA")) { clearTimeout(timer); resolve(); } });
    processo.on("error", () => { clearTimeout(timer); reject(new Error("Cliente PostgreSQL local indisponível.")); });
    processo.stdin.write("begin;\n" + sql + ";\n\\echo B32_BARREIRA_PRONTA\n");
  });
  const pendentes = tarefas.map((t) => t());
  try {
    const limite = Date.now() + 10_000; let esperando = 0;
    while (Date.now() < limite) {
      esperando = contar("select count(*) from pg_catalog.pg_stat_activity where datname=pg_catalog.current_database() and wait_event_type='Lock' and query like '%" + filtro + "%' and pid<>pg_catalog.pg_backend_pid();");
      if (esperando >= tarefas.length) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(esperando).toBeGreaterThanOrEqual(tarefas.length);
  } finally { processo.stdin.end("commit;\n\\q\n"); }
  return Promise.all(pendentes);
}
const travaTelefone = (usuario: string, numero: string) =>
  "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(private.vendas_b2_codificar(pg_catalog.jsonb_build_array('vendas-b3-telefone-1','"
  + uuid(usuario) + "'::text,'" + telefoneCanonico(numero) + "'::text)),'hex'),0))";

interface Estado { email: string; password: string; usuario: string; contato: string; comando: Record<string, unknown>; resposta: unknown; contagens: string }
const contagens = (usuario: string) => owner(`select (select count(*) from public.vendas_oportunidades where user_id='${uuid(usuario)}')||'/'||
  (select count(*) from public.vendas_oportunidades_eventos where user_id='${uuid(usuario)}')||'/'||(select count(*) from private.vendas_comandos where user_id='${uuid(usuario)}');`);

beforeAll(() => {
  const identidade = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" }).trim();
  const ledger = owner("select max(version) from supabase_migrations.schema_migrations;");
  if (identidade !== PROJETO || ledger !== (fase === "pre" ? B2 : B32)) throw new Error("Stack/ledger diferente da fase autorizada. Nenhuma fixture criada.");
});

describe.runIf(fase === "pre")("B3.2 fase pre: recibo pelo B2 puro", () => {
  it("cria uma oportunidade pelo contatoId legado e guarda o recibo", async () => {
    const f = await nova(), contato = randomUUID();
    owner(`insert into public.contatos(id,user_id,nome,origem) values('${contato}','${f.usuario}','Fixture B3.2 pre','cadastro');`);
    const comando = { chaveIdempotencia: randomUUID(), contatoId: contato, imovelTratado: { modo: "manual" as const, referencia: "Pré B3.2" } };
    const r = await executarComandoVenda("criar", comando, f.c);
    if (!r.ok) throw new Error("B2 recusou a fixture: " + r.erro.codigo);
    const estado: Estado = { email: f.email, password: f.password, usuario: f.usuario, contato, comando, resposta: r, contagens: contagens(f.usuario) };
    writeFileSync(arquivoEstado, JSON.stringify(estado));
    expect(estado.contagens).toBe("1/1/1");
  });
});

describe.runIf(fase === "pos")("B3.2 fase pos: Supabase local real", () => {
  let estado: Estado, a: SupabaseClient, a2: SupabaseClient, b: SupabaseClient, usuarioA: string, usuarioB: string;
  const contas: string[] = [];
  beforeAll(async () => {
    estado = JSON.parse(readFileSync(arquivoEstado, "utf8")) as Estado;
    const fa = await entrar(estado.email, estado.password), fb = await nova();
    a = fa.c; a2 = (await entrar(estado.email, estado.password)).c; usuarioA = fa.usuario; b = fb.c; usuarioB = fb.usuario; contas.push(usuarioA, usuarioB);
  });
  afterAll(() => {
    // Somente as contas artificiais desta prova; jamais reset da stack.
    for (const conta of contas) owner("delete from auth.users where id='" + uuid(conta) + "';");
  });

  it("recibo criado antes do B3.2: mesma resposta, sem nova oportunidade, evento ou recibo", async () => {
    expect(await executarComandoVenda("criar", estado.comando as never, a)).toEqual(estado.resposta);
    expect(contagens(usuarioA)).toBe(estado.contagens);
  });

  it("RLS A/B: número só de B é nao-encontrado para A, sem id, nome ou telefone de B", async () => {
    const numero = telefone(), deB = randomUUID();
    owner(`insert into public.contatos(id,user_id,nome,origem) values('${deB}','${usuarioB}','Pessoa Secreta B','cadastro');
      insert into public.contatos_telefones(contato_id,user_id,telefone,motivo) values('${deB}','${usuarioB}','${numero}','cadastro');`);
    const paraA = await resolver(a, numero);
    expect(paraA).toEqual({ contrato: "vendas-b3-resolucao-v1", status: "nao-encontrado" });
    expect(JSON.stringify(paraA)).not.toMatch(new RegExp(deB + "|Secreta|" + telefoneCanonico(numero)));
    expect(await resolver(b, numero)).toEqual({ contrato: "vendas-b3-resolucao-v1", status: "encontrado", contatoId: deB, seguiuFusao: false, avisos: [] });
    expect((await a.from("contatos").select("id").eq("id", deB)).data).toEqual([]);
    const invalido = await criar(a, { chaveIdempotencia: randomUUID(), interessado: { modo: "existente", contatoId: deB } });
    expect(invalido).toEqual(await criar(a, { chaveIdempotencia: randomUUID(), interessado: { modo: "existente", contatoId: randomUUID() } }));
    expect(invalido).toEqual({ ok: false, erro: { codigo: "contato-invalido", motivo: null } });
    // A pode cadastrar o mesmo número na própria conta; B continua resolvendo a própria pessoa.
    const deA = await criar(a, { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Pessoa A", telefone: numero } });
    expect(deA.ok).toBe(true);
    expect(await resolver(b, numero)).toMatchObject({ status: "encontrado", contatoId: deB });
  });

  it("ACL: resolução só authenticated; anon recusado; private sem USAGE; INVOKER e STABLE", async () => {
    expect(owner(`select string_agg(r||'='||has_function_privilege(r,'public.vendas_resolver_interessado(jsonb)','execute'),',' order by r) from unnest(array['anon','authenticated','service_role']) r;`))
      .toBe("anon=false,authenticated=true,service_role=false");
    expect(owner(`select has_schema_privilege('authenticated','private','usage')||','||has_schema_privilege('anon','private','usage');`)).toBe("false,false");
    expect(owner(`select prosecdef::text||','||provolatile::text from pg_proc where oid='public.vendas_resolver_interessado(jsonb)'::regprocedure;`)).toBe("false,s");
    expect(owner(`select count(*) from information_schema.role_routine_grants where routine_schema='private' and routine_name in ('vendas_b2_executar','vendas_b2_normalizar','vendas_b2_erro') and grantee in ('anon','authenticated','service_role','PUBLIC');`)).toBe("0");
    const semSessao = await cliente().rpc("vendas_resolver_interessado", { p_consulta: { telefone: "43998024316" } });
    expect(semSessao.error).not.toBeNull();
    expect(owner(`select pg_get_constraintdef(oid) like '%''vendas''%' from pg_constraint where conname='contatos_origem_check';`)).toBe("t");
  });

  it("contato criado por Vendas: nenhum vínculo, revisão, log, imóvel, agenda ou mensagem", async () => {
    const antes = owner(`select (select count(*) from public.log_eventos)||'/'||(select count(*) from public.imoveis_contatos)||'/'||
      (select count(*) from public.contatos_revisoes)||'/'||(select count(*) from public.imoveis)||'/'||(select coalesce(max(updated_at)::text,'-') from public.imoveis)||'/'||
      (select count(*) from public.agenda)||'/'||(select count(*) from public.mensagens_agendadas);`);
    const r = await criar(a, { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Sem Efeito", telefone: telefone() } });
    if (!r.ok) throw new Error(r.erro.codigo);
    expect(owner(`select origem from public.contatos where id='${uuid(r.oportunidade.contatoId)}';`)).toBe("vendas");
    expect(owner(`select (select count(*) from public.log_eventos)||'/'||(select count(*) from public.imoveis_contatos)||'/'||
      (select count(*) from public.contatos_revisoes)||'/'||(select count(*) from public.imoveis)||'/'||(select coalesce(max(updated_at)::text,'-') from public.imoveis)||'/'||
      (select count(*) from public.agenda)||'/'||(select count(*) from public.mensagens_agendadas);`)).toBe(antes);
  });

  it("concorrência real: duas sessões, mesmo número, uma cria e a outra vê o commit depois da trava (STABLE)", async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      const numero = telefone();
      const pedido = (c: SupabaseClient) => () => criar(c, { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Corrida " + rodada, telefone: numero } });
      const respostas = await barreira(travaTelefone(usuarioA, numero), [pedido(a), pedido(a2)], "vendas_criar_oportunidade");
      expect(respostas.filter((x) => x.ok)).toHaveLength(1);
      expect(respostas.filter((x) => !x.ok)).toEqual([{ ok: false, erro: { codigo: "telefone-ja-cadastrado", motivo: null } }]);
      expect(contar(`select count(*) from public.contatos_telefones where user_id='${uuid(usuarioA)}' and telefone_canonico='${telefoneCanonico(numero)}';`)).toBe(1);
      expect(contar(`select count(*) from public.contatos where user_id='${uuid(usuarioA)}' and nome='Corrida ${rodada}';`)).toBe(1);
    }
    // Sem barreira: disparo simultâneo repetido.
    for (let rodada = 0; rodada < 10; rodada++) {
      const numero = telefone();
      const respostas = await Promise.all([a, a2].map((c) =>
        criar(c, { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Livre " + rodada, telefone: numero } })));
      expect(respostas.filter((x) => x.ok)).toHaveLength(1);
      expect(contar(`select count(*) from public.contatos_telefones where user_id='${uuid(usuarioA)}' and telefone_canonico='${telefoneCanonico(numero)}';`)).toBe(1);
    }
  });

  it("corrida com o cadastro de imóvel: Vendas recebe conflito-transitorio, sem contato duplicado; repetir dá telefone-ja-cadastrado", async () => {
    const numero = telefone(), imovel = randomUUID(), chave = randomUUID();
    const comando = { chaveIdempotencia: chave, interessado: { modo: "novo", nome: "Comprador Corrida", telefone: numero } };
    const [r] = await barreira(
      `insert into public.imoveis(id,user_id,endereco,proprietario_nome,proprietario_telefone) values('${imovel}','${uuid(usuarioA)}','Fixture B3.2 corrida','Dono Corrida','${numero}')`,
      [() => criar(a, comando)], "vendas_criar_oportunidade");
    expect(r).toEqual({ ok: false, erro: { codigo: "conflito-transitorio", motivo: null } });
    expect(contar(`select count(*) from public.contatos_telefones where user_id='${uuid(usuarioA)}' and telefone_canonico='${telefoneCanonico(numero)}' and desativado_em is null;`)).toBe(1);
    expect(contar(`select count(*) from public.contatos where user_id='${uuid(usuarioA)}' and nome='Comprador Corrida';`)).toBe(0);
    expect(await criar(a, comando)).toEqual({ ok: false, erro: { codigo: "telefone-ja-cadastrado", motivo: null } });
  });

  it("ordem inversa: imóvel cadastrado depois reaproveita o contato de Vendas pelo canal, sem duplicar", async () => {
    const numero = telefone();
    const r = await criar(a, { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Comprador Depois Dono", telefone: numero } });
    if (!r.ok) throw new Error(r.erro.codigo);
    const imovel = randomUUID();
    owner(`insert into public.imoveis(id,user_id,endereco,proprietario_nome,proprietario_telefone) values('${imovel}','${uuid(usuarioA)}','Fixture B3.2 depois','Outro Nome','${numero}');`);
    expect(owner(`select contato_id from public.imoveis_contatos where imovel_id='${imovel}';`)).toBe(r.oportunidade.contatoId);
    expect(contar(`select count(*) from public.contatos_telefones where user_id='${uuid(usuarioA)}' and telefone_canonico='${telefoneCanonico(numero)}';`)).toBe(1);
    expect(owner(`select nome from public.contatos where id='${uuid(r.oportunidade.contatoId)}';`)).toBe("Comprador Depois Dono");
    expect(owner(`select tipo from public.contatos_revisoes where imovel_id='${imovel}';`)).toBe("nome-divergente-importacao");
  });
});
