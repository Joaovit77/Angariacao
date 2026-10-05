import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodificarNumericVenda, identidadeDecimalVenda } from "../lib/persistencia/vendasDecodificacao";
import { decodificarRespostaVenda } from "../lib/persistencia/vendasDecodificacao";
import { randomUUID, createHash } from "node:crypto";
import { PORTAS_VENDAS, type PortaVenda } from "../lib/persistencia/vendasComandos";
import { alterarImovelTratadoVenda, alterarValoresVenda, arquivarOportunidadeVenda, criarOportunidadeVenda, transicionarOportunidadeVenda } from "../lib/vendas/dominio";

const migration = readFileSync(new URL("../../supabase/migrations/20261005160044_vendas_v1_b2_operacoes.sql", import.meta.url), "utf8");
const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CA = "33333333-3333-4333-8333-333333333333";
const CB = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create schema private; create schema auth; create role anon; create role authenticated; create role service_role bypassrls; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon,service_role;");
  const schema = ler("supabase-schema.sql");
  for (const nome of ["imoveis", "public.contatos"]) {
    const inicio = schema.indexOf("create table if not exists " + nome + " (");
    await db.exec(schema.slice(inicio, schema.indexOf("\n);", inicio) + 3));
  }
  await db.exec("alter table public.imoveis add column unidade text; alter table public.imoveis add column bloco text;");
  await db.exec(ler("supabase/migrations/20260921173129_imoveis_unique_id_user_id.sql"));
  await db.exec("alter default privileges in schema public grant execute on functions to anon,authenticated,service_role; alter default privileges in schema private grant execute on functions to anon,authenticated,service_role;");
  await db.exec(ler("supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql"));
  await db.exec(migration);
  await db.query("insert into auth.users(id) values ($1),($2)", [A,B]);
  await db.query("insert into public.contatos(id,user_id,nome,origem) values($1,$2,'Fixture A','cadastro'),($3,$4,'Fixture B','cadastro')", [CA,A,CB,B]);
}, 60_000);
afterAll(async () => { if (db) await db.close(); });

async function rpc(porta: PortaVenda, comando: Record<string, unknown>, usuario = A, role = "authenticated"): Promise<unknown> {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [usuario]);
  await db.exec("set role " + role);
  try { return (await db.query<{ resposta: unknown }>("select public." + PORTAS_VENDAS[porta] + "($1::jsonb) resposta", [JSON.stringify(comando)])).rows[0].resposta; }
  finally { await db.exec("reset role"); }
}
const criar = (extra: Record<string,unknown> = {}) => ({chaveIdempotencia:randomUUID(),contatoId:CA,...extra});
const cabecalho = (id: string, versao: number) => ({chaveIdempotencia:randomUUID(),oportunidadeId:id,versaoEsperada:versao});
async function fingerprint(porta: PortaVenda, comando: Record<string,unknown>, usuario = A) {
  return (await db.query<{ hash: string }>("select private.vendas_b2_fingerprint($1::uuid,$2,private.vendas_b2_normalizar($2,$3::jsonb)) hash", [usuario,porta,JSON.stringify(comando)])).rows[0].hash;
}
function codificar(arvore: unknown): Buffer {
  if (arvore === null || arvore === undefined) return Buffer.from("N");
  if (typeof arvore === "boolean") return Buffer.from(arvore ? "T" : "F");
  if (typeof arvore === "string" || typeof arvore === "number") {
    const bytes = Buffer.from(String(arvore)); return Buffer.concat([Buffer.from((typeof arvore === "string" ? "S" : "D") + bytes.length + ":"),bytes]);
  }
  if (Array.isArray(arvore)) return Buffer.concat([Buffer.from("A" + arvore.length + ":"),...arvore.map(codificar)]);
  throw new Error("Árvore fora do contrato.");
}

const vetores: readonly (string | null)[] = [
  null, "0", "-0", "0.0", "1", "1.0", "1e0", "0.1", "0.10000000000000001",
  "1.23456789123456789", "1.7976931348623157e308", "1.7976931348623158e308",
  "1.7976931348623159e308", "5e-324", "4e-324", "1e-324", "2.4703282292062327e-324",
  "2.4703282292062328e-324", "1e1000", "1e-1000", "NaN", "Infinity", "-Infinity",
  "-0.001", "9007199254740991", "9007199254740992", "9007199254740993",
  "999999999999999900000", "1000000000000000000000", "1e23",
  "1000000000000000100", "2.2250738585072014e-308", "2.225073858507201e-308",
  "0.9999999999999999", "1.0000000000000002", "1.0000000000000001",
  "0.000001", "0.0000001", " 1", "+1", "01", "1.", ".1", "1,5",
];

describe("Vendas B2: gate numeric SQL ↔ TypeScript", () => {
  it.each(vetores)("paridade de aceitação e valor: %s", async valor => {
    let esperado: number | null;
    try { esperado = decodificarNumericVenda(valor); }
    catch {
      await expect(db.query("select private.vendas_b2_numeric($1::jsonb)", [JSON.stringify(valor)])).rejects.toMatchObject({ code: "PT422" });
      return;
    }
    const canonico = (await db.query<{ valor: string | null }>("select private.vendas_b2_numeric($1::jsonb) valor", [JSON.stringify(valor)])).rows[0].valor;
    expect(canonico).toBe(esperado === null ? null : identidadeDecimalVenda(String(esperado)));
  });
  it("vetor amplo determinístico de binary64, vizinhos e fronteiras decimais", async () => {
    const buffer = new ArrayBuffer(8); const view = new DataView(buffer);
    const numeros = new Set<number>([0, Number.MIN_VALUE, Number.MAX_VALUE, 0.1, 1e23]);
    for (let e = -1074; e <= 1023; e += 17) {
      const n = 2 ** e; if (n > 0 && Number.isFinite(n)) {
        view.setFloat64(0, n); const bits = view.getBigUint64(0);
        for (const d of [BigInt(-1), BigInt(0), BigInt(1)]) { view.setBigUint64(0, bits + d); numeros.add(view.getFloat64(0)); }
      }
    }
    let seed = 0x1a2b3c4d;
    for (let i = 0; i < 600; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; view.setUint32(0, seed & 0x7fffffff);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; view.setUint32(4, seed);
      const n = view.getFloat64(0); if (Number.isFinite(n)) numeros.add(n);
    }
    for (const numero of numeros) {
      const texto = String(numero);
      const sql = (await db.query<{ valor: string }>("select private.vendas_b2_numeric($1::jsonb) valor", [JSON.stringify(texto)])).rows[0].valor;
      expect(sql, "HOLD NUMERIC se divergente: " + texto).toBe(identidadeDecimalVenda(texto));
    }
  }, 60_000);
});

describe("Vendas B2: portas comerciais no PostgreSQL descartável", () => {
  it("catálogo: sete portas, definer, owner postgres, search_path vazio e ACL efetiva", async () => {
    const funcoes = (await db.query<{ nome: string; definer: boolean; owner: string; config: string[]; schema: string; oid: number }>(
      "select p.proname nome,p.prosecdef definer,r.rolname owner,p.proconfig config,n.nspname schema,p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace join pg_catalog.pg_roles r on r.oid=p.proowner where p.proname like 'vendas_b2_%' or p.proname=any($1)", [Object.values(PORTAS_VENDAS)])).rows;
    expect(funcoes.filter(f => f.schema === "public")).toHaveLength(7);
    for (const f of funcoes) {
      expect(f.owner).toBe("postgres"); expect(f.config).toContain('search_path=""'); expect(f.definer).toBe(f.schema === "public");
      for (const role of ["anon","authenticated","service_role"]) {
        expect((await db.query<{ permitido: boolean }>("select pg_catalog.has_function_privilege($1,$2::oid,'EXECUTE') permitido", [role,f.oid])).rows[0].permitido).toBe(f.schema === "public" && role === "authenticated");
      }
      expect((await db.query<{ n: number }>("select count(*)::int n from pg_catalog.aclexplode((select proacl from pg_catalog.pg_proc where oid=$1::oid)) where grantee=0 and privilege_type='EXECUTE'",[f.oid])).rows[0].n).toBe(0);
    }
  });
  it("bloqueia anon, service role, UID ausente/deletado e acesso direto às tabelas/helpers", async () => {
    for (const role of ["anon","service_role"]) await expect(rpc("criar",criar(),A,role)).rejects.toMatchObject({code:"42501"});
    for (const uid of ["",randomUUID()]) await expect(rpc("criar",criar(),uid)).rejects.toMatchObject({code:"PT401"});
    await db.exec("grant usage on schema private to authenticated; set role authenticated;");
    try {
      await expect(db.query("select private.vendas_b2_normalizar('criar','{}')")).rejects.toMatchObject({code:"42501"});
      for (const tabela of ["public.vendas_oportunidades","public.vendas_imoveis_referencias","public.vendas_oportunidades_eventos","private.vendas_comandos"]) {
        for (const sql of ["delete from " + tabela,"update " + tabela + " set user_id=$1","insert into " + tabela + "(user_id) values($1)"]) {
          await expect(db.query(sql,sql.includes("$1") ? [A] : [])).rejects.toMatchObject({code:"42501"});
        }
      }
    } finally { await db.exec("reset role; revoke usage on schema private from authenticated;"); }
  });
  it("tenant: ID estrangeiro e inexistente têm o mesmo código sem vazamento", async () => {
    for (const contatoId of [CB,randomUUID()]) await expect(rpc("criar",criar({contatoId}))).rejects.toMatchObject({code:"PT422",detail:expect.stringContaining('"contato-invalido"')});
    const outra = decodificarRespostaVenda(await rpc("criar",criar({contatoId:CB}),B));
    for (const oportunidadeId of [outra.oportunidade.id,randomUUID()]) await expect(rpc("arquivar",cabecalho(oportunidadeId,1))).rejects.toMatchObject({code:"PT404"});
  });
  it("paridade V1-A: criação, valores, imóvel, etapas, ganho e arquivamento", async () => {
    let resposta = decodificarRespostaVenda(await rpc("criar",criar({valorNegocioPrevisto:"0.1",receitaPrevista:"0"})));
    const criada = criarOportunidadeVenda({id:resposta.oportunidade.id,userId:A,contatoId:CA,valorNegocioPrevisto:0.1,receitaPrevista:0},resposta.oportunidade.criadoEm);
    expect(criada.ok).toBe(true); if (!criada.ok) throw new Error("Oráculo recusou criação.");
    expect(resposta.oportunidade).toMatchObject(criada.oportunidade); expect(resposta.evento?.dados).toEqual(criada.eventos[0].dados);
    const casos = [
      {porta:"alterar_valores",extra:{valorNegocioPrevisto:"10.25",receitaPrevista:null}},
      {porta:"alterar_imovel",extra:{imovelTratado:{modo:"manual",referencia:"\t Unidade A \ufeff"}}},
      {porta:"transicionar",extra:{destino:"em_atendimento"}},
      {porta:"transicionar",extra:{destino:"em_negociacao"}},
      {porta:"ganhar",extra:{confirmacaoExplicita:true,dataFato:"0100-01-01",registroFormalizacao:" Contrato ",valorNegocioFechado:"0"}},
      {porta:"arquivar",extra:{}},
    ] as const;
    for (const caso of casos) {
      const {encerradoEm, ...anterior} = resposta.oportunidade;
      void encerradoEm; // Metadado B1 fora do contrato puro V1-A.
      resposta = decodificarRespostaVenda(await rpc(caso.porta,{...cabecalho(anterior.id,anterior.versao),...caso.extra}));
      const contexto = {atorUsuarioId:A,versaoEsperada:anterior.versao,registradoEm:resposta.oportunidade.atualizadoEm};
      const esperado = caso.porta === "alterar_valores" ? alterarValoresVenda(anterior,{valorNegocioPrevisto:10.25,receitaPrevista:null},contexto) :
        caso.porta === "alterar_imovel" ? alterarImovelTratadoVenda(anterior,{modo:"manual",referencia:"\t Unidade A \ufeff"},contexto) :
        caso.porta === "ganhar" ? transicionarOportunidadeVenda(anterior,{destino:"ganha",ganho:{confirmacaoExplicita:true,dataFato:"0100-01-01",registroFormalizacao:" Contrato ",valorNegocioFechado:0}},contexto) :
        caso.porta === "arquivar" ? arquivarOportunidadeVenda(anterior,contexto) : transicionarOportunidadeVenda(anterior,{destino:caso.extra.destino},contexto);
      expect(esperado.ok).toBe(true); if (!esperado.ok) throw new Error("Oráculo recusou comando.");
      expect(resposta.oportunidade).toMatchObject(esperado.oportunidade); expect(resposta.evento?.dados).toEqual(esperado.eventos[0].dados);
      expect(resposta.oportunidade.versao).toBe(anterior.versao+1);
    }
  });
  it("regras negativas comerciais não deixam evento, recibo ou alteração parcial", async () => {
    const r = decodificarRespostaVenda(await rpc("criar",criar())); const id = r.oportunidade.id;
    const rejeitar = async (porta: PortaVenda, versao: number, extra: Record<string,unknown>, codigo: string) => {
      const comando = {...cabecalho(id,versao),...extra};
      const antes = (await db.query("select row_to_json(o) retrato from public.vendas_oportunidades o where id=$1",[id])).rows;
      await expect(rpc(porta,comando)).rejects.toMatchObject({code:"PT422",detail:expect.stringContaining('"'+codigo+'"')});
      expect((await db.query("select row_to_json(o) retrato from public.vendas_oportunidades o where id=$1",[id])).rows).toEqual(antes);
      expect((await db.query<{n:number}>("select count(*)::int n from private.vendas_comandos where user_id=$1 and chave_idempotencia=$2",[A,comando.chaveIdempotencia])).rows[0].n).toBe(0);
      expect((await db.query<{n:number}>("select count(*)::int n from public.vendas_oportunidades_eventos where oportunidade_id=$1 and versao>$2",[id,versao])).rows[0].n).toBe(0);
    };
    await rejeitar("transicionar",1,{destino:"em_negociacao"},"transicao-invalida");
    await rejeitar("arquivar",1,{},"arquivamento-invalido");
    await rejeitar("alterar_imovel",1,{imovelTratado:{modo:"manual",unidade:"1"}},"modo-imovel-invalido");
    await rejeitar("alterar_valores",1,{valorNegocioPrevisto:"1",receitaPrevista:null,valorNegocioFechado:"1"},"valor-fechado-incompativel");
    await rejeitar("perder",1,{dataFato:"2011-12-30",motivo:"outro",justificativa:" \ufeff "},"perda-invalida");
    await rejeitar("perder",1,{dataFato:"2011-12-30",motivo:"qualquer"},"perda-invalida");
    await rpc("transicionar",{...cabecalho(id,1),destino:"em_atendimento"});
    await rejeitar("transicionar",2,{destino:"em_atendimento"},"transicao-invalida");
    await rejeitar("transicionar",2,{destino:"em_negociacao"},"imovel-obrigatorio");
    await rpc("alterar_imovel",{...cabecalho(id,2),imovelTratado:{modo:"manual",referencia:"Fixture"}});
    await rpc("transicionar",{...cabecalho(id,3),destino:"em_negociacao"});
    await rejeitar("alterar_imovel",4,{imovelTratado:null},"imovel-obrigatorio");
    await rejeitar("ganhar",4,{confirmacaoExplicita:false,dataFato:"2011-12-30",registroFormalizacao:"Contrato"},"ganho-invalido");
    await rejeitar("ganhar",4,{confirmacaoExplicita:true,dataFato:"2011-12-30",registroFormalizacao:" \ufeff "},"ganho-invalido");
  });
  it.each(["desistencia_interessado","condicoes_incompativeis","imovel_indisponivel","compra_outro_canal","outro"])("perda %s: evento único e justificativa opcional preservada", async motivo => {
    const inicial = decodificarRespostaVenda(await rpc("criar",criar()));
    const r = decodificarRespostaVenda(await rpc("perder",{...cabecalho(inicial.oportunidade.id,1),dataFato:"2011-12-30",motivo,justificativa:" Motivo registrado "}));
    expect(r.oportunidade.estado).toBe("perdida"); expect(r.evento?.tipo).toBe("oportunidade_perdida");
    expect(r.evento?.dados).toMatchObject({encerramento:{justificativa:"Motivo registrado"}});
    expect((await db.query<{n:number}>("select count(*)::int n from public.vendas_oportunidades_eventos where oportunidade_id=$1",[inicial.oportunidade.id])).rows[0].n).toBe(2);
  });
  it("no-op, CAS, transição igual inválida, arquivamento repetido e terminal imutável", async () => {
    const inicial = decodificarRespostaVenda(await rpc("criar",criar())); const id = inicial.oportunidade.id;
    for (const [porta,extra] of [["alterar_valores",{valorNegocioPrevisto:null,receitaPrevista:null}],["alterar_imovel",{imovelTratado:null}]] as const) {
      const comando = {...cabecalho(id,1),...extra}; const raw = await rpc(porta,comando); const r = decodificarRespostaVenda(raw);
      expect(r.noOp).toBe(true); expect(r.evento).toBeNull(); expect(r.oportunidade).toEqual(inicial.oportunidade); expect(await rpc(porta,comando)).toEqual(raw);
    }
    await expect(rpc("transicionar",{...cabecalho(id,1),destino:"nova"})).rejects.toMatchObject({code:"PT422",detail:expect.stringContaining('"transicao-invalida"')});
    await rpc("perder",{...cabecalho(id,1),dataFato:"2011-12-30",motivo:"compra_outro_canal"});
    await expect(rpc("alterar_valores",{...cabecalho(id,1),valorNegocioPrevisto:null,receitaPrevista:null})).rejects.toMatchObject({code:"PT409"});
    await expect(rpc("alterar_valores",{...cabecalho(id,2),valorNegocioPrevisto:null,receitaPrevista:null})).rejects.toMatchObject({code:"PT422",detail:expect.stringContaining('"estado-terminal"')});
    const arquivada = decodificarRespostaVenda(await rpc("arquivar",cabecalho(id,2)));
    const repetida = decodificarRespostaVenda(await rpc("arquivar",cabecalho(id,3)));
    expect(repetida.noOp).toBe(true); expect(repetida.oportunidade).toEqual(arquivada.oportunidade);
  });
  it("recibo antes do CAS: replay original após avanço, pedido diferente e chave malformada", async () => {
    const comando = criar(); const original = await rpc("criar",comando); const inicial = decodificarRespostaVenda(original);
    await rpc("transicionar",{...cabecalho(inicial.oportunidade.id,1),destino:"em_atendimento"});
    expect(await rpc("criar",comando)).toEqual(original);
    for (const extra of [{receitaPrevista:"1"},{desconhecido:null},{valorNegocioPrevisto:"1e1000"}]) await expect(rpc("criar",{...comando,...extra})).rejects.toMatchObject({code:"PT409",detail:expect.stringContaining('"chave-idempotencia-conflitante"')});
    await expect(rpc("criar",criar({chaveIdempotencia:" \t\ufeff"}))).rejects.toMatchObject({code:"PT422"});
    const hash = (await db.query<{hash:string}>("select fingerprint hash from private.vendas_comandos where user_id=$1 and chave_idempotencia=$2",[A,comando.chaveIdempotencia])).rows[0].hash;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("versão máxima recusa comando novo/no-op e permite replay antigo", async () => {
    const c = criar(); const raw = await rpc("criar",c); const id = decodificarRespostaVenda(raw).oportunidade.id;
    await db.query("update public.vendas_oportunidades set versao=9007199254740991 where id=$1",[id]);
    await expect(rpc("alterar_valores",{...cabecalho(id,Number.MAX_SAFE_INTEGER),valorNegocioPrevisto:null,receitaPrevista:null})).rejects.toMatchObject({code:"PT422",detail:expect.stringContaining('"limite-versao"')});
    expect(await rpc("criar",c)).toEqual(raw);
  });
  it("referência congelada: nova captura na troca/retorno, sem PII; exclusão só anula ponteiro vivo", async () => {
    const imovel = randomUUID(); await db.query("insert into public.imoveis(id,user_id,endereco,codigo,referencia_crm,unidade) values($1,$2,'Endereço antigo','Código','CRM','101')",[imovel,A]);
    let r = decodificarRespostaVenda(await rpc("criar",criar({imovelTratado:{modo:"referencia",imovelId:imovel}}))); const id = r.oportunidade.id;
    await db.query("update public.imoveis set endereco='Endereço novo' where id=$1",[imovel]);
    const igual = decodificarRespostaVenda(await rpc("alterar_imovel",{...cabecalho(id,1),imovelTratado:{modo:"referencia",imovelId:imovel}})); expect(igual.noOp).toBe(true);
    r = decodificarRespostaVenda(await rpc("alterar_imovel",{...cabecalho(id,1),imovelTratado:{modo:"manual",endereco:"Manual"}}));
    r = decodificarRespostaVenda(await rpc("alterar_imovel",{...cabecalho(id,2),imovelTratado:{modo:"referencia",imovelId:imovel}}));
    expect((await db.query<{endereco:string}>("select endereco from public.vendas_imoveis_referencias where imovel_id_original=$1 order by capturado_em,id",[imovel])).rows.map(x=>x.endereco).sort()).toEqual(["Endereço antigo","Endereço novo"]);
    await db.query("delete from public.imoveis where id=$1",[imovel]);
    const noop = decodificarRespostaVenda(await rpc("alterar_imovel",{...cabecalho(id,3),imovelTratado:{modo:"referencia",imovelId:imovel}})); expect(noop.noOp).toBe(true); expect(noop.oportunidade).toEqual(r.oportunidade);
    expect((await db.query<{vivo:null}>("select imovel_id vivo from public.vendas_imoveis_referencias where imovel_id_original=$1",[imovel])).rows.every(x=>x.vivo===null)).toBe(true);
  });
  it.each(["public.vendas_oportunidades_eventos","private.vendas_comandos"])("rollback provocado no %s, incluindo referência; retry com a mesma chave", async tabela => {
    const inicial = decodificarRespostaVenda(await rpc("criar",criar())); const chave = randomUUID(), imovel = randomUUID();
    await db.query("insert into public.imoveis(id,user_id,endereco) values($1,$2,'Fixture rollback')",[imovel,A]);
    const comando = {...cabecalho(inicial.oportunidade.id,1),chaveIdempotencia:chave,imovelTratado:{modo:"referencia",imovelId:imovel}};
    const antes = await db.query("select (select count(*) from public.vendas_imoveis_referencias) referencias,(select count(*) from public.vendas_oportunidades_eventos) eventos,(select count(*) from private.vendas_comandos) recibos");
    await db.exec("alter table " + tabela + " add constraint b2_fixture_falha check (chave_idempotencia <> '" + chave + "')");
    try {
      await expect(rpc("alterar_imovel",comando)).rejects.toMatchObject({code:"PT500",detail:expect.stringContaining('"falha-interna"')});
      expect(await db.query("select (select count(*) from public.vendas_imoveis_referencias) referencias,(select count(*) from public.vendas_oportunidades_eventos) eventos,(select count(*) from private.vendas_comandos) recibos")).toEqual(antes);
      const snapshot = (await db.query<{s:unknown}>("select private.vendas_b2_snapshot(o) s from public.vendas_oportunidades o where id=$1",[inicial.oportunidade.id])).rows[0].s;
      expect(snapshot).toMatchObject({versao:"1",imovelTratado:null,atualizadoEm:inicial.oportunidade.atualizadoEm});
    } finally { await db.exec("alter table " + tabela + " drop constraint b2_fixture_falha"); }
    const sucesso = await rpc("alterar_imovel",comando); expect(decodificarRespostaVenda(sucesso).oportunidade.versao).toBe(2); expect(await rpc("alterar_imovel",comando)).toEqual(sucesso);
  });
});

describe("Vendas B2: fingerprint e datas", () => {
  it("golden vector independente: tupla fixa e bytes UTF-8", async () => {
    const comando = {chaveIdempotencia:" chave ",contatoId:CA};
    const arvore = ["vendas-b2-fingerprint-1",A," chave ","criar",null,null,[CA,null,null,null,null]];
    const esperado = createHash("sha256").update(codificar(arvore)).digest("hex");
    expect(esperado).toBe("bb00dae503127ea2fbd2bfec604506707276f3cbf4837a3aaa1f5d0fdabe95b2");
    expect(await fingerprint("criar",comando)).toBe(esperado);
  });
  it("ordem, UUID, trim, null/omissão, numeric e Unicode", async () => {
    const base = {chaveIdempotencia:" chave ",contatoId:CA,valorNegocioPrevisto:"1"};
    const hash = await fingerprint("criar",base);
    for (const valor of ["1","1.0","1e0"]) expect(await fingerprint("criar",{valorNegocioPrevisto:valor,contatoId:CA.toUpperCase(),chaveIdempotencia:" chave ",imovelTratado:null,origem:null,receitaPrevista:null})).toBe(hash);
    expect(await fingerprint("criar",{...base,chaveIdempotencia:"chave"})).not.toBe(hash);
    expect(await fingerprint("criar",base,B)).not.toBe(hash);
    const contatoComLetras = "abcdefab-cdef-abcd-efab-cdefabcdefab";
    expect(await fingerprint("criar",{...base,contatoId:contatoComLetras})).toBe(await fingerprint("criar",{...base,contatoId:contatoComLetras.toUpperCase()}));
    expect(await fingerprint("criar",{...base,valorNegocioPrevisto:"2"})).not.toBe(hash);
    const manual = {...base,imovelTratado:{modo:"manual",referencia:"\t imóvel \ufeff"}};
    expect(await fingerprint("criar",manual)).toBe(await fingerprint("criar",{...manual,imovelTratado:{modo:"manual",referencia:"imóvel",endereco:null,unidade:null,bloco:null,descricaoCurta:null}}));
    expect(await fingerprint("criar",{...base,origem:{tipo:"outro",descricao:"é"}})).not.toBe(await fingerprint("criar",{...base,origem:{tipo:"outro",descricao:"e\u0301"}}));
    await expect(fingerprint("criar",{...base,desconhecido:null})).rejects.toMatchObject({code:"PT422"});
    const cab = cabecalho(randomUUID(),1);
    await expect(fingerprint("alterar_valores",cab)).rejects.toMatchObject({code:"PT422"});
    expect(await fingerprint("alterar_valores",{...cab,valorNegocioPrevisto:null,receitaPrevista:null})).not.toBe(await fingerprint("alterar_imovel",{...cab,imovelTratado:null}));
    const valores = {...cab,valorNegocioPrevisto:null,receitaPrevista:null};
    expect(await fingerprint("alterar_valores",valores)).not.toBe(await fingerprint("alterar_valores",{...valores,versaoEsperada:2}));
    expect(await fingerprint("alterar_valores",valores)).not.toBe(await fingerprint("alterar_valores",{...valores,oportunidadeId:randomUUID()}));
  });
  it.each(["0100-01-01","9999-12-31","2000-02-29","2011-12-30","1994-12-31"])("calendário aceita %s sem fuso local", async data => {
    expect((await db.query<{valor:string}>("select pg_catalog.to_char(private.vendas_b2_data($1),'YYYY-MM-DD') valor",[data])).rows[0].valor).toBe(data);
  });
  it.each(["0000-01-01","0099-12-31","2100-02-29","2026-02-30","2026-1-01","01/01/2026","0100-01-01 BC"])("calendário recusa %s", async data => {
    await expect(db.query("select private.vendas_b2_data($1)",[data])).rejects.toMatchObject({code:"PT422"});
  });
  it("virada UTC/BRT, DST histórico e UTC explícito sob fuso Apia", async () => {
    await db.exec("set timezone='Pacific/Apia'");
    try {
      for (const [instante,dia] of [["2026-01-01T02:59:59.999Z","2025-12-31"],["2026-01-01T03:00:00.000Z","2026-01-01"],["2018-12-01T02:00:00.000Z","2018-12-01"]]) {
        expect((await db.query<{dia:string;utc:string}>("select pg_catalog.to_char($1::timestamptz at time zone 'America/Sao_Paulo','YYYY-MM-DD') dia,private.vendas_b2_instante($1::timestamptz) utc",[instante])).rows[0]).toEqual({dia,utc:instante});
      }
    } finally { await db.exec("set timezone='UTC'"); }
  });
  it("ano 9999 é civil válido mas fato futuro é recusado na operação", async () => {
    const r = decodificarRespostaVenda(await rpc("criar",criar()));
    await expect(rpc("perder",{...cabecalho(r.oportunidade.id,1),dataFato:"9999-12-31",motivo:"outro",justificativa:"Fixture"})).rejects.toMatchObject({code:"PT422",detail:expect.stringContaining('"data-futura"')});
  });
});
