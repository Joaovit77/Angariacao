/* B3.2 em Postgres local descartável (PGlite). O SQL vem das migrations versionadas
   e do schema canônico; nada aqui toca banco remoto. Triggers de Contatos, PostgREST,
   Auth real e concorrência entre conexões ficam para a prova em Supabase local. */
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { telefoneCanonico } from "../lib/calculo/webhookWhatsapp";
import { decodificarErroVenda, decodificarRespostaVenda } from "../lib/persistencia/vendasDecodificacao";
import {
  arvoreFingerprintCriarVenda, classificarIdentificacaoCriarVenda, codificarArvoreFingerprintVenda,
  resolverInteressadoVenda, type ContatoEstadoVenda,
} from "../lib/persistencia/vendasInteressado";

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const B32 = "supabase/migrations/20261006123603_vendas_v1_b3_2_interessado.sql";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CA = "33333333-3333-4333-8333-333333333333";
const CB = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
let telefoneSeq = 0;
/** Um número novo e válido por cenário: 43 9 8xxx-xxxx. */
const telefone = () => `(43) 98${String(++telefoneSeq).padStart(3, "0")}-${String(1000 + telefoneSeq)}`;

const VETORES_LEGADO: readonly Record<string, unknown>[] = [
  { chaveIdempotencia: " chave ", contatoId: CA },
  { chaveIdempotencia: "k-2", contatoId: CA.toUpperCase() },
  { chaveIdempotencia: "k-3", contatoId: CA, imovelTratado: { modo: "referencia", imovelId: "55555555-5555-4555-8555-555555555555" } },
  { chaveIdempotencia: "k-4", contatoId: CA, imovelTratado: { modo: "manual", endereco: " Rua A, 10 ", referencia: "  " } },
  { chaveIdempotencia: "k-5", contatoId: CA, origem: { tipo: "portal", descricao: " ZAP " }, valorNegocioPrevisto: "0.1", receitaPrevista: "1000" },
  { chaveIdempotencia: "chave-é-😀", contatoId: CA, receitaPrevista: null },
];
const fingerprintsAntes: string[] = [];
let reciboPre: { comando: Record<string, unknown>; resposta: unknown; oportunidades: number; eventos: number; comandos: number };

async function fingerprintSql(porta: string, comando: Record<string, unknown>, usuario = A) {
  return (await db.query<{ hash: string }>("select private.vendas_b2_fingerprint($1::uuid,$2,private.vendas_b2_normalizar($2,$3::jsonb)) hash",
    [usuario, porta, JSON.stringify(comando)])).rows[0].hash;
}
/** Dentro de um `begin` explícito do teste, a chamada roda num savepoint para que a recusa
    não aborte a transação do cenário (o erro original chega intacto ao assert). */
let emTransacao = false;
async function comoUsuario<T>(usuario: string | null, sql: string, parametros: unknown[]): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [usuario ?? ""]);
  if (emTransacao) await db.exec("savepoint chamada");
  await db.exec("set role authenticated");
  try {
    const r = (await db.query<{ r: T }>(sql, parametros)).rows[0].r;
    if (emTransacao) await db.exec("release savepoint chamada");
    return r;
  } catch (erro) {
    if (emTransacao) await db.exec("rollback to savepoint chamada");
    throw erro;
  } finally { await db.exec("reset role"); }
}
async function cenario(corpo: () => Promise<void>) {
  await db.exec("begin"); emTransacao = true;
  try { await corpo(); } finally { emTransacao = false; await db.exec("rollback"); }
}
const resolver = (consulta: unknown, usuario: string | null = A) =>
  comoUsuario<Record<string, unknown>>(usuario, "select public.vendas_resolver_interessado($1::jsonb) r", [JSON.stringify(consulta)]);
const criar = (comando: Record<string, unknown>, usuario = A) =>
  comoUsuario<unknown>(usuario, "select public.vendas_criar_oportunidade($1::jsonb) r", [JSON.stringify(comando)]);
async function falha(promessa: Promise<unknown>) {
  try { await promessa; } catch (erro) {
    const e = erro as { code?: string; detail?: string };
    const codigo = e.detail ? (JSON.parse(e.detail) as { codigo: string }).codigo : null;
    return { estado: e.code, codigo, decodificado: decodificarErroVenda({ code: e.code, details: e.detail }).codigo };
  }
  throw new Error("Era esperada uma recusa.");
}
async function contar(tabela: string, usuario = A) {
  return Number((await db.query<{ n: string }>(`select count(*)::text n from ${tabela} where user_id=$1`, [usuario])).rows[0].n);
}

async function contato(id: string, extra: { usuario?: string; fundido?: string; arquivado?: boolean; anonimizado?: boolean; numero?: string } = {}) {
  const usuario = extra.usuario ?? A;
  await db.query("insert into public.contatos(id,user_id,nome,origem,fundido_em_contato_id,arquivado_em,anonimizado_em) values($1,$2,'Fixture','cadastro',$3,$4,$5)",
    [id, usuario, extra.fundido ?? null, extra.arquivado || extra.fundido ? new Date().toISOString() : null, extra.anonimizado ? new Date().toISOString() : null]);
  if (extra.numero) await db.query("insert into public.contatos_telefones(contato_id,user_id,telefone,motivo) values($1,$2,$3,'cadastro')", [id, usuario, extra.numero]);
}
async function imovel(usuario = A) {
  const id = randomUUID();
  await db.query("insert into public.imoveis(id,user_id,endereco) values($1,$2,'Fixture B3.2')", [id, usuario]);
  return id;
}
/** Mesma decisão calculada pela função TS do B3.1 sobre os dados do banco (owner, filtrado pela conta). */
async function resolverTs(numero: string, usuario = A) {
  const canonico = telefoneCanonico(numero.trim());
  const canaisAtivos = (await db.query<{ contato_id: string }>("select contato_id from public.contatos_telefones where user_id=$1 and telefone_canonico=$2 and desativado_em is null", [usuario, canonico])).rows.map((r) => ({ userId: usuario, contatoId: r.contato_id }));
  const revisoesTelefone = (await db.query<{ contato_id: string }>("select contato_id from public.contatos_revisoes where user_id=$1 and estado='pendente' and tipo='telefone-alterado-legado' and evidencia->>'canonico_novo'=$2", [usuario, canonico])).rows.map((r) => ({ userId: usuario, contatoId: r.contato_id }));
  const contatos: ContatoEstadoVenda[] = (await db.query<{ id: string; fundido: string | null; arquivado: boolean; anonimizado: boolean; revisao: boolean }>(
    "select c.id, c.fundido_em_contato_id fundido, c.arquivado_em is not null arquivado, c.anonimizado_em is not null anonimizado, exists(select 1 from public.contatos_revisoes r where r.user_id=c.user_id and r.estado='pendente' and (r.contato_id=c.id or r.contato_relacionado_id=c.id)) revisao from public.contatos c where c.user_id=$1", [usuario])).rows
    .map((r) => ({ id: r.id, userId: usuario, fundidoEmContatoId: r.fundido, arquivado: r.arquivado, anonimizado: r.anonimizado, revisaoPendente: r.revisao }));
  return resolverInteressadoVenda({ userId: usuario, telefone: numero, canaisAtivos, revisoesTelefone, contatos });
}
async function paridade(numero: string, usuario = A) {
  const sql = await resolver({ telefone: numero }, usuario);
  expect(sql.contrato).toBe("vendas-b3-resolucao-v1");
  const semEnvelope = Object.fromEntries(Object.entries(sql).filter(([chave]) => chave !== "contrato"));
  expect(semEnvelope).toEqual(await resolverTs(numero, usuario));
  return semEnvelope;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create schema private; create schema auth; create role anon; create role authenticated; create role service_role bypassrls; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon,service_role;");
  await db.exec("create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;");
  const schema = ler("supabase-schema.sql");
  const funcao = schema.indexOf("create or replace function telefone_canonico(telefone text)");
  await db.exec(schema.slice(funcao, schema.indexOf("\n$$;", funcao) + 4));
  const inicio = schema.indexOf("create table if not exists imoveis (");
  await db.exec(schema.slice(inicio, schema.indexOf("\n);", inicio) + 3));
  await db.exec("alter table public.imoveis add column unidade text; alter table public.imoveis add column bloco text;");
  await db.exec(ler("supabase/migrations/20260921173129_imoveis_unique_id_user_id.sql"));
  // Tabelas, índices, RLS e policies de Contatos da Fase 1a (sem views, triggers de imóvel nem backfill).
  const fase1a = ler("supabase/migrations/20260921183930_contatos_fase1a.sql");
  await db.exec(fase1a.slice(fase1a.indexOf("create table if not exists public.contatos ("), fase1a.indexOf("-- 5. Views")));
  await db.exec("grant select on public.contatos, public.contatos_telefones, public.imoveis_contatos, public.contatos_revisoes to authenticated;");
  await db.exec("alter default privileges in schema public grant execute on functions to anon,authenticated,service_role; alter default privileges in schema private grant execute on functions to anon,authenticated,service_role;");
  await db.exec(ler("supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql"));
  await db.exec(ler("supabase/migrations/20261005160044_vendas_v1_b2_operacoes.sql"));
  await db.query("insert into auth.users(id) values ($1),($2)", [A, B]);
  await contato(CA); await contato(CB, { usuario: B });

  // Recibo e fingerprints com o B2 puro, ANTES do B3.2.
  for (const v of VETORES_LEGADO) fingerprintsAntes.push(await fingerprintSql("criar", v));
  const comando = { chaveIdempotencia: "pre-b3-2-" + randomUUID(), contatoId: CA, imovelTratado: { modo: "manual", referencia: "Pré B3.2" }, origem: { tipo: "indicacao" } };
  const resposta = await criar(comando);
  reciboPre = { comando, resposta, oportunidades: await contar("public.vendas_oportunidades"), eventos: await contar("public.vendas_oportunidades_eventos"), comandos: await contar("private.vendas_comandos") };

  await db.exec(ler(B32));
}, 60_000);
afterAll(async () => { if (db) await db.close(); });

describe("B3.2: recibo criado antes da migration", () => {
  it("repetir o comando B2 depois do B3.2 devolve a mesma resposta, sem nova oportunidade nem evento", async () => {
    expect(await criar(reciboPre.comando)).toEqual(reciboPre.resposta);
    expect(await contar("public.vendas_oportunidades")).toBe(reciboPre.oportunidades);
    expect(await contar("public.vendas_oportunidades_eventos")).toBe(reciboPre.eventos);
    expect(await contar("private.vendas_comandos")).toBe(reciboPre.comandos);
  });
  it("o fingerprint SQL do legado não mudou nos 6 vetores e ainda bate com a árvore TS", async () => {
    for (const [i, v] of VETORES_LEGADO.entries()) expect(await fingerprintSql("criar", v)).toBe(fingerprintsAntes[i]);
    const r = classificarIdentificacaoCriarVenda(VETORES_LEGADO[0]);
    if (!r.ok) throw new Error(r.codigo);
    const ts = createHash("sha256").update(codificarArvoreFingerprintVenda(arvoreFingerprintCriarVenda({
      usuario: A, chaveIdempotencia: " chave ", identificacao: r.identificacao, imovel: null, origem: null, valorNegocioPrevisto: null, receitaPrevista: null,
    }))).digest("hex");
    expect(fingerprintsAntes[0]).toBe(ts);
  });
});

describe("B3.2: resolução (INVOKER) igual à decisão TS do B3.1", () => {
  it("exige sessão e payload fechado {telefone: string}", async () => {
    expect(await falha(resolver({ telefone: "43998024316" }, null))).toEqual({ estado: "PT401", codigo: "nao-autenticado", decodificado: "nao-autenticado" });
    for (const consulta of [null, [], "43998024316", {}, { telefone: null }, { telefone: 43998024316 }, { telefone: "43998024316", userId: B }, { telefone: "1", nome: "x" }]) {
      expect(await falha(resolver(consulta))).toEqual({ estado: "PT422", codigo: "estrutura-invalida", decodificado: "estrutura-invalida" });
    }
  });

  it("telefone inválido, 0 canais e 1 canal", async () => {
    for (const numero of ["", "   ", "abc", "+1 415 555 2671", "43 99802-4316 " + "-".repeat(27)]) {
      expect(await paridade(numero)).toEqual({ status: "telefone-invalido" });
    }
    expect(await paridade(telefone())).toEqual({ status: "nao-encontrado" });
    const numero = telefone(), id = randomUUID();
    await contato(id, { numero });
    expect(await paridade(" +55 " + numero + " ")).toEqual({ status: "encontrado", contatoId: id, seguiuFusao: false, avisos: [] });
  });

  it("revisão de telefone pendente vence o canal; ambíguo não escolhe (índice suspenso só no teste)", async () => {
    const numero = telefone(), dono = randomUUID(), outro = randomUUID();
    await contato(dono, { numero }); await contato(outro);
    await db.query("insert into public.contatos_revisoes(user_id,tipo,contato_id,imovel_id,evidencia) values($1,'telefone-alterado-legado',$2,$3,$4)",
      [A, outro, await imovel(), JSON.stringify({ canonico_novo: telefoneCanonico(numero) })]);
    expect(await paridade(numero)).toEqual({ status: "em-revisao", candidatos: [outro] });

    const n2 = telefone(), x = randomUUID(), y = randomUUID();
    await cenario(async () => {
      await db.exec("drop index public.contatos_telefones_ativo_unico_idx");
      await contato(x, { numero: n2 }); await contato(y, { numero: n2 });
      expect(await paridade(n2)).toEqual({ status: "ambiguo", candidatos: [x, y].sort() });
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Ana", telefone: n2 } }))).toMatchObject({ estado: "PT409", codigo: "interessado-ambiguo" });
    });
  });

  it("lápide: sobrevivente, ciclo, cadeia quebrada e mais de 8 saltos", async () => {
    const n1 = telefone(), vivo = randomUUID(), lapide = randomUUID();
    await contato(vivo); await contato(lapide, { fundido: vivo, numero: n1 });
    expect(await paridade(n1)).toEqual({ status: "encontrado", contatoId: vivo, seguiuFusao: true, avisos: [] });

    const n2 = telefone(), p = randomUUID(), q = randomUUID();
    await contato(p, { numero: n2 }); await contato(q, { fundido: p });
    await db.query("update public.contatos set fundido_em_contato_id=$1, arquivado_em=now() where id=$2", [q, p]);
    expect(await paridade(n2)).toEqual({ status: "indisponivel", motivo: "fusao-invalida" });

    const cadeia = Array.from({ length: 10 }, () => randomUUID());
    for (let i = cadeia.length - 1; i >= 0; i--) await contato(cadeia[i], { fundido: cadeia[i + 1] });
    const n3 = telefone(), n4 = telefone();
    await db.query("insert into public.contatos_telefones(contato_id,user_id,telefone,motivo) values($1,$3,$4,'cadastro'),($2,$3,$5,'cadastro')", [cadeia[0], cadeia[1], A, n3, n4]);
    expect(await paridade(n3)).toEqual({ status: "indisponivel", motivo: "fusao-invalida" }); // 9 saltos
    expect(await paridade(n4)).toEqual({ status: "encontrado", contatoId: cadeia[9], seguiuFusao: true, avisos: [] }); // 8 saltos

    const n5 = telefone(), solto = randomUUID();
    await cenario(async () => {
      await db.exec("alter table public.contatos drop constraint contatos_fundido_em_usuario_fkey");
      await contato(solto, { fundido: randomUUID(), numero: n5 });
      expect(await paridade(n5)).toEqual({ status: "indisponivel", motivo: "fusao-invalida" });
    });
  });

  it("anonimizado indisponível; arquivado e revisão comum só avisam", async () => {
    const n1 = telefone(), n2 = telefone(), anon = randomUUID(), arq = randomUUID();
    await contato(anon, { anonimizado: true, numero: n1 }); await contato(arq, { arquivado: true, numero: n2 });
    await db.query("insert into public.contatos_revisoes(user_id,tipo,contato_id,evidencia) values($1,'nome-divergente-backfill',$2,'{}')", [A, arq]);
    expect(await paridade(n1)).toEqual({ status: "indisponivel", motivo: "contato-anonimizado" });
    expect(await paridade(n2)).toEqual({ status: "encontrado", contatoId: arq, seguiuFusao: false, avisos: ["contato-arquivado", "revisao-pendente"] });
  });

  it("número só da conta B é nao-encontrado para A, sem nome, telefone ou id na resposta", async () => {
    const numero = telefone(), deB = randomUUID();
    await contato(deB, { usuario: B, numero });
    const r = await resolver({ telefone: numero }, A);
    expect(r).toEqual({ contrato: "vendas-b3-resolucao-v1", status: "nao-encontrado" });
    expect(JSON.stringify(r)).not.toMatch(new RegExp(deB + "|Fixture|" + telefoneCanonico(numero)));
    expect(await resolver({ telefone: numero }, B)).toMatchObject({ status: "encontrado", contatoId: deB });
    const encontrado = await resolver({ telefone: numero }, B);
    expect(Object.keys(encontrado).sort()).toEqual(["avisos", "contatoId", "contrato", "seguiuFusao", "status"]);
  });
});

describe("B3.2: criar com contato existente (legado e modo existente)", () => {
  it("aceita o próprio contato e o arquivado; recusa lápide, anonimizado, outra conta e inexistente", async () => {
    const arq = randomUUID(), vivo = randomUUID(), lapide = randomUUID(), anon = randomUUID();
    await contato(arq, { arquivado: true }); await contato(vivo); await contato(lapide, { fundido: vivo }); await contato(anon, { anonimizado: true });
    for (const ident of [(id: string) => ({ contatoId: id }), (id: string) => ({ interessado: { modo: "existente", contatoId: id } })]) {
      const ok = decodificarRespostaVenda(await criar({ chaveIdempotencia: randomUUID(), ...ident(arq) }));
      expect(ok.oportunidade.contatoId).toBe(arq);
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), ...ident(lapide) }))).toEqual({ estado: "PT422", codigo: "contato-fundido", decodificado: "contato-fundido" });
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), ...ident(anon) }))).toEqual({ estado: "PT422", codigo: "contato-anonimizado", decodificado: "contato-anonimizado" });
      const deB = await falha(criar({ chaveIdempotencia: randomUUID(), ...ident(CB) }));
      expect(deB).toEqual({ estado: "PT422", codigo: "contato-invalido", decodificado: "contato-invalido" });
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), ...ident(randomUUID()) }))).toEqual(deB);
    }
  });

  it("contatoId e interessado juntos, ou nenhum dos dois, é estrutura inválida", async () => {
    for (const comando of [{ contatoId: CA, interessado: { modo: "existente", contatoId: CA } }, {}, { interessado: null }, { contatoId: null }]) {
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), ...comando }))).toMatchObject({ estado: "PT422", codigo: "estrutura-invalida" });
    }
  });
});

describe("B3.2: criar com interessado novo", () => {
  it("com telefone: cria contato 'vendas' + número + oportunidade; evento só com contatoId", async () => {
    const numero = telefone();
    const antes = await contar("public.contatos");
    const r = decodificarRespostaVenda(await criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "  Ana Compradora ", telefone: " " + numero } }));
    const novo = (await db.query<{ nome: string; origem: string; metadados: unknown }>("select nome, origem, metadados from public.contatos where id=$1 and user_id=$2", [r.oportunidade.contatoId, A])).rows[0];
    expect(novo).toEqual({ nome: "Ana Compradora", origem: "vendas", metadados: {} });
    const tel = (await db.query("select telefone, telefone_canonico, principal, motivo, desativado_em from public.contatos_telefones where contato_id=$1", [r.oportunidade.contatoId])).rows;
    expect(tel).toEqual([{ telefone: numero, telefone_canonico: telefoneCanonico(numero), principal: true, motivo: "cadastro", desativado_em: null }]);
    expect(await contar("public.contatos")).toBe(antes + 1);
    expect(await contar("public.imoveis_contatos")).toBe(0);
    const payload = (await db.query<{ payload: unknown }>("select payload from public.vendas_oportunidades_eventos where oportunidade_id=$1", [r.oportunidade.id])).rows[0].payload;
    expect(JSON.stringify(payload)).not.toMatch(/Ana|98\d{3}|telefone|nome/);
    expect(await paridade(numero)).toEqual({ status: "encontrado", contatoId: r.oportunidade.contatoId, seguiuFusao: false, avisos: [] });
  });

  it("sem telefone: cria pessoa própria a cada pedido (sem deduplicação por nome)", async () => {
    const r1 = decodificarRespostaVenda(await criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Sem Telefone", telefone: null } }));
    const r2 = decodificarRespostaVenda(await criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Sem Telefone", telefone: null } }));
    expect(r1.oportunidade.contatoId).not.toBe(r2.oportunidade.contatoId);
    expect(Number((await db.query<{ n: string }>("select count(*)::text n from public.contatos_telefones where contato_id = any($1::uuid[])", [[r1.oportunidade.contatoId, r2.oportunidade.contatoId]])).rows[0].n)).toBe(0);
  });

  it("nome e telefone inválidos, na ordem estrutura → nome → telefone", async () => {
    const cmd = (interessado: unknown) => criar({ chaveIdempotencia: randomUUID(), interessado });
    expect(await falha(cmd({ modo: "novo", nome: "  ", telefone: "abc" }))).toEqual({ estado: "PT422", codigo: "nome-invalido", decodificado: "nome-invalido" });
    expect(await falha(cmd({ modo: "novo", nome: "😀".repeat(201), telefone: null }))).toMatchObject({ codigo: "nome-invalido" });
    expect(await falha(cmd({ modo: "novo", nome: "Ana", telefone: "abc" }))).toEqual({ estado: "PT422", codigo: "telefone-invalido", decodificado: "telefone-invalido" });
    for (const hostil of [{ modo: "novo", nome: 1, telefone: "abc" }, { modo: "novo", nome: "Ana" }, { modo: "novo", nome: "Ana", telefone: null, userId: B },
      { modo: "existente", contatoId: CA, telefone: "43998024316" }, { modo: "NOVO", nome: "Ana", telefone: null }, ["novo"]]) {
      expect(await falha(cmd(hostil))).toMatchObject({ estado: "PT422", codigo: "estrutura-invalida" });
    }
    const ok = decodificarRespostaVenda(await criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "😀".repeat(200), telefone: null } }));
    expect(ok.oportunidade.contatoId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("número já conhecido, em revisão ou indisponível é conflito, nunca reaproveitamento", async () => {
    const conhecido = telefone(), revisao = telefone(), anon = telefone(), ids = [randomUUID(), randomUUID(), randomUUID()];
    await contato(ids[0], { numero: conhecido }); await contato(ids[1]); await contato(ids[2], { anonimizado: true, numero: anon });
    await db.query("insert into public.contatos_revisoes(user_id,tipo,contato_id,imovel_id,evidencia) values($1,'telefone-alterado-legado',$2,$3,$4)",
      [A, ids[1], await imovel(), JSON.stringify({ canonico_novo: telefoneCanonico(revisao) })]);
    const antes = await contar("public.contatos");
    const novo = (numero: string) => criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Outro Nome", telefone: numero } });
    expect(await falha(novo("+55 " + conhecido))).toEqual({ estado: "PT409", codigo: "telefone-ja-cadastrado", decodificado: "telefone-ja-cadastrado" });
    expect(await falha(novo(revisao))).toEqual({ estado: "PT409", codigo: "telefone-em-revisao", decodificado: "telefone-em-revisao" });
    expect(await falha(novo(anon))).toEqual({ estado: "PT409", codigo: "interessado-indisponivel", decodificado: "interessado-indisponivel" });
    expect(await contar("public.contatos")).toBe(antes);
    expect((await db.query<{ nome: string }>("select nome from public.contatos where id=$1", [ids[0]])).rows[0].nome).toBe("Fixture");
  });

  it("falha depois do contato desfaz tudo: nenhum contato órfão", async () => {
    const antes = { contatos: await contar("public.contatos"), telefones: await contar("public.contatos_telefones"), oportunidades: await contar("public.vendas_oportunidades") };
    const numero = telefone();
    expect(await falha(criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Rollback", telefone: numero },
      imovelTratado: { modo: "referencia", imovelId: randomUUID() } }))).toMatchObject({ codigo: "imovel-invalido" });
    expect({ contatos: await contar("public.contatos"), telefones: await contar("public.contatos_telefones"), oportunidades: await contar("public.vendas_oportunidades") }).toEqual(antes);
    expect(await paridade(numero)).toEqual({ status: "nao-encontrado" });
  });

  it("mesma chave repete a resposta sem segundo contato; chave com outro pedido é conflitante", async () => {
    const chave = randomUUID(), numero = telefone();
    const comando = { chaveIdempotencia: chave, interessado: { modo: "novo", nome: "Idempotente", telefone: numero } };
    const primeira = await criar(comando);
    const antes = await contar("public.contatos");
    expect(await criar(comando)).toEqual(primeira);
    expect(await criar({ ...comando, interessado: { ...comando.interessado, telefone: "+55 " + numero, nome: " Idempotente " } })).toEqual(primeira);
    expect(await contar("public.contatos")).toBe(antes);
    for (const outro of [{ ...comando.interessado, nome: "Outro" }, { ...comando.interessado, nome: "" }, { modo: "existente", contatoId: CA }]) {
      expect(await falha(criar({ chaveIdempotencia: chave, interessado: outro }))).toEqual({ estado: "PT409", codigo: "chave-idempotencia-conflitante", decodificado: "chave-idempotencia-conflitante" });
    }
  });

  it("fingerprint B3 do SQL é a árvore TS do B3.1", async () => {
    for (const comando of [
      { chaveIdempotencia: " k ", interessado: { modo: "existente", contatoId: CA.toUpperCase() } },
      { chaveIdempotencia: "k", interessado: { modo: "novo", nome: "  Ana ", telefone: " +55 (43) 99802-4316" } },
      { chaveIdempotencia: "k", interessado: { modo: "novo", nome: "Ana", telefone: null } },
    ]) {
      const r = classificarIdentificacaoCriarVenda(comando);
      if (!r.ok) throw new Error(r.codigo);
      const ts = createHash("sha256").update(codificarArvoreFingerprintVenda(arvoreFingerprintCriarVenda({
        usuario: A, chaveIdempotencia: comando.chaveIdempotencia, identificacao: r.identificacao, imovel: null, origem: null, valorNegocioPrevisto: null, receitaPrevista: null,
      }))).digest("hex");
      expect(await fingerprintSql("criar", comando)).toBe(ts);
    }
  });
});

describe("B3.2: unicidade", () => {
  it("corrida pelo mesmo número ativo vira conflito-transitorio; o contato não sobra", async () => {
    const numero = telefone(), rival = randomUUID();
    await contato(rival);
    await cenario(async () => {
      // Simula o cadastro de imóvel gravando o mesmo número entre a resolução e o insert de Vendas.
      await db.query(`create function public.b32_corrida() returns trigger language plpgsql as $$ begin
        insert into public.contatos_telefones(contato_id,user_id,telefone,motivo) values('${rival}','${A}','${numero}','cadastro'); return new; end $$`);
      await db.exec("create trigger b32_corrida after insert on public.contatos for each row when (new.origem = 'vendas') execute function public.b32_corrida()");
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Corrida", telefone: numero } })))
        .toEqual({ estado: "PT503", codigo: "conflito-transitorio", decodificado: "conflito-transitorio" });
      expect(Number((await db.query<{ n: string }>("select count(*)::text n from public.contatos where nome='Corrida'")).rows[0].n)).toBe(0);
    });
  });

  it("outra violação de unicidade não é mascarada como corrida", async () => {
    await cenario(async () => {
      await db.exec("create unique index b32_nome_unico on public.contatos(user_id, nome) where nome = 'Nome Único'");
      await criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Nome Único", telefone: null } });
      expect(await falha(criar({ chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Nome Único", telefone: null } })))
        .toEqual({ estado: "PT500", codigo: "falha-interna", decodificado: "falha-interna" });
    });
  });
});

describe("B3.2: ACL e origem", () => {
  it("resolução só para authenticated; helpers privados e schema private sem cliente", async () => {
    const acl = (await db.query<Record<string, boolean>>(`select
      has_function_privilege('authenticated','public.vendas_resolver_interessado(jsonb)','execute') auth,
      has_function_privilege('anon','public.vendas_resolver_interessado(jsonb)','execute') anon,
      has_function_privilege('service_role','public.vendas_resolver_interessado(jsonb)','execute') servico,
      has_function_privilege('authenticated','private.vendas_b2_executar(text,jsonb)','execute') executor,
      has_function_privilege('authenticated','private.vendas_b2_normalizar(text,jsonb)','execute') normalizador,
      has_function_privilege('authenticated','private.vendas_b2_erro(text,text)','execute') erro,
      has_schema_privilege('authenticated','private','usage') privado,
      (select prosecdef from pg_proc where oid='public.vendas_resolver_interessado(jsonb)'::regprocedure) definer,
      (select provolatile = 's' from pg_proc where oid='public.vendas_resolver_interessado(jsonb)'::regprocedure) estavel`)).rows[0];
    expect(acl).toEqual({ auth: true, anon: false, servico: false, executor: false, normalizador: false, erro: false, privado: false, definer: false, estavel: true });
  });
  it("origem 'vendas' entra; as anteriores continuam; outra continua recusada", async () => {
    for (const origem of ["cadastro", "pre-cadastro", "importacao", "garimpo", "indicado", "backfill-telefone", "backfill-imovel", "vendas"]) {
      await db.query("insert into public.contatos(user_id,nome,origem) values($1,'Origem',$2)", [A, origem]);
    }
    await expect(db.query("insert into public.contatos(user_id,nome,origem) values($1,'Origem','compra')", [A])).rejects.toMatchObject({ code: "23514" });
  });
});
