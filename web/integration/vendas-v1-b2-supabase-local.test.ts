/** Preparado para o checkpoint posterior. NÃO executado na implementação local B2. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarComandoVenda } from "../lib/persistencia/vendas";
import type { ResultadoOperacaoVenda } from "../lib/persistencia/vendasComandos";
import { decodificarRespostaVenda } from "../lib/persistencia/vendasDecodificacao";

const url = process.env.VENDAS_B2_LOCAL_URL;
const anon = process.env.VENDAS_B2_LOCAL_ANON_KEY;
if (process.env.VENDAS_B2_INTEGRACAO !== "EXECUTAR_APOS_REVISAO" || url !== "http://127.0.0.1:55721" || !anon) {
  throw new Error("Gate B2 requer revisão específica, URL local 55721 e chave anon local explícita.");
}
const container = "supabase_db_vendas-b1-5e58bded";
const argsPsql = ["exec","-i",container,"psql","-U","postgres","-d","postgres","-X","-At","-v","ON_ERROR_STOP=1"];
function owner(sql: string): string {
  try { return execFileSync("docker",argsPsql,{input:sql,encoding:"utf8",stdio:["pipe","pipe","pipe"],timeout:10_000}).trim(); }
  catch { throw new Error("Consulta da fixture local não concluída."); }
}
function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("ID da fixture inválido."); return id;
}
const contas: string[] = [];
let a: SupabaseClient, b: SupabaseClient, usuarioA: string, contatoA: string, contatoB: string;
beforeAll(async () => {
  const identidade = execFileSync("docker",["inspect","--format",'{{index .Config.Labels "com.supabase.cli.project"}}',container],{encoding:"utf8"}).trim();
  if (identidade !== "vendas-b1-5e58bded" || owner("select max(version) from supabase_migrations.schema_migrations;") !== "20261005160044") {
    throw new Error("Stack/ledger diferente do checkpoint B1+B2 autorizado. Nenhuma fixture criada.");
  }
  const fixture = async () => {
    const cliente = createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const email = "vendas-b2-fixture-" + randomUUID() + "@example.test", password = "B2-fixture-" + randomUUID();
    const cadastro = await cliente.auth.signUp({email,password});
    if (cadastro.error || !cadastro.data.user || cadastro.data.user.email !== email) throw new Error("Auth local não criou a fixture.");
    const usuario = uuid(cadastro.data.user.id); contas.push(usuario);
    const login = await cliente.auth.signInWithPassword({email,password});
    if (login.error || login.data.user?.id !== usuario) throw new Error("Auth local não autenticou a fixture.");
    const contato = randomUUID();
    owner("insert into public.contatos(id,user_id,nome,origem) values('"+contato+"','"+usuario+"','Fixture Vendas B2','cadastro');");
    return {cliente,usuario,contato};
  };
  const fa = await fixture(), fb = await fixture();
  a=fa.cliente; b=fb.cliente; usuarioA=fa.usuario; contatoA=fa.contato; contatoB=fb.contato;
});
afterAll(async () => {
  // Somente contas artificiais geradas nesta execução; jamais reset da stack.
  for (const conta of contas) owner("delete from auth.users where id='" + uuid(conta) + "';");
});

function sucesso(r: ResultadoOperacaoVenda) { if (!r.ok) throw new Error("Comando da fixture recusado: " + r.erro.codigo); return r; }
const cab = (id: string,v: number) => ({chaveIdempotencia:randomUUID(),oportunidadeId:id,versaoEsperada:v});
async function nova(negociacao = false) {
  let r = sucesso(await executarComandoVenda("criar",{chaveIdempotencia:randomUUID(),contatoId:contatoA,imovelTratado:{modo:"manual",referencia:"Fixture B2"}},a));
  if (negociacao) {
    r = sucesso(await executarComandoVenda("transicionar",{...cab(r.oportunidade.id,1),destino:"em_atendimento"},a));
    r = sucesso(await executarComandoVenda("transicionar",{...cab(r.oportunidade.id,2),destino:"em_negociacao"},a));
  }
  return r;
}

async function barreira(sql: string, tarefas: (()=>Promise<ResultadoOperacaoVenda>)[]) {
  const processo = spawn("docker",argsPsql,{stdio:["pipe","pipe","pipe"]});
  await new Promise<void>((resolve,reject) => {
    let saida = "";
    const timer = setTimeout(()=>{processo.stdin.end("rollback;\n\\q\n");reject(new Error("Barreira local não abriu."));},5_000);
    processo.stdout.on("data",chunk=>{saida+=String(chunk);if(saida.includes("B2_BARREIRA_PRONTA")){clearTimeout(timer);resolve();}});
    processo.on("error",()=>{clearTimeout(timer);reject(new Error("Cliente PostgreSQL local indisponível."));});
    processo.on("exit",()=>{clearTimeout(timer);if(!saida.includes("B2_BARREIRA_PRONTA"))reject(new Error("Barreira local interrompida."));});
    processo.stdin.write("begin;\n"+sql+";\n\\echo B2_BARREIRA_PRONTA\n");
  });
  const pendentes = tarefas.map(t=>t());
  try {
    const limite = Date.now()+5_000; let esperando = 0;
    while (Date.now()<limite) {
      esperando=Number(owner("select count(*) from pg_catalog.pg_stat_activity where datname=pg_catalog.current_database() and wait_event_type='Lock' and query like '%vendas_%' and pid<>pg_catalog.pg_backend_pid();"));
      if (esperando>=tarefas.length) break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    expect(esperando).toBeGreaterThanOrEqual(tarefas.length);
  } finally { processo.stdin.end("commit;\n\\q\n"); }
  return Promise.all(pendentes);
}
function lockOportunidade(id: string) { return "select id from public.vendas_oportunidades where id='"+uuid(id)+"' for update"; }
function lockChave(chave: string) {
  return "select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(private.vendas_b2_codificar(pg_catalog.jsonb_build_array('vendas-b2-lock-1','"+uuid(usuarioA)+"'::text,'"+uuid(chave)+"'::text)),'hex'),0))";
}

describe("Vendas B2: gate Supabase real pendente", () => {
  it("Auth/Data API: leitura própria, tenant, anon e escrita direta", async () => {
    const r = await nova();
    expect((await a.from("vendas_oportunidades").select("id").eq("id",r.oportunidade.id)).data).toHaveLength(1);
    expect((await b.from("vendas_oportunidades").select("id").eq("id",r.oportunidade.id)).data).toEqual([]);
    expect((await a.from("vendas_oportunidades").update({estado:"perdida"}).eq("id",r.oportunidade.id)).error).not.toBeNull();
    const semSessao = createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
    expect((await semSessao.rpc("vendas_criar_oportunidade",{p_comando:{chaveIdempotencia:randomUUID(),contatoId:contatoA}})).error).not.toBeNull();
    expect(await executarComandoVenda("criar",{chaveIdempotencia:randomUUID(),contatoId:contatoB},a)).toMatchObject({ok:false,erro:{codigo:"contato-invalido"}});
  });
  it("A: duas transições em N, barreira observável e um evento vencedor", async () => {
    const r = await nova(), id = r.oportunidade.id;
    const respostas = await barreira(lockOportunidade(id),[1,2].map(()=>()=>executarComandoVenda("transicionar",{...cab(id,1),destino:"em_atendimento"},a)));
    expect(respostas.filter(x=>x.ok)).toHaveLength(1); expect(respostas.filter(x=>!x.ok)).toEqual([{ok:false,erro:{codigo:"versao-conflitante",motivo:null}}]);
    expect(owner("select count(*) from public.vendas_oportunidades_eventos where oportunidade_id='"+uuid(id)+"';")).toBe("2");
  });
  it.each(["valores","imovel"])("B/C: %s versus ganho, sem commit parcial", async tipo => {
    const r = await nova(true), id = r.oportunidade.id;
    const editar = tipo === "valores" ? ()=>executarComandoVenda("alterar_valores",{...cab(id,3),valorNegocioPrevisto:0.1,receitaPrevista:null},a) :
      ()=>executarComandoVenda("alterar_imovel",{...cab(id,3),imovelTratado:{modo:"manual",referencia:"Outra fixture"}},a);
    const respostas = await barreira(lockOportunidade(id),[editar,()=>executarComandoVenda("ganhar",{...cab(id,3),confirmacaoExplicita:true,dataFato:"2011-12-30",registroFormalizacao:"Fixture"},a)]);
    expect(respostas.filter(x=>x.ok)).toHaveLength(1); expect(respostas.filter(x=>!x.ok)).toEqual([{ok:false,erro:{codigo:"versao-conflitante",motivo:null}}]);
  });
  it("D/E: mesma chave concorrente, replay exato ou conflito de pedido", async () => {
    for (const diferente of [false,true]) {
      const chave = randomUUID(), comando = {chaveIdempotencia:chave,contatoId:contatoA};
      const respostas = await barreira(lockChave(chave),[()=>executarComandoVenda("criar",comando,a),()=>executarComandoVenda("criar",{...comando,...(diferente ? {receitaPrevista:1} : {})},a)]);
      if (diferente) { expect(respostas.filter(x=>x.ok)).toHaveLength(1); expect(respostas.filter(x=>!x.ok)).toEqual([{ok:false,erro:{codigo:"chave-idempotencia-conflitante",motivo:null}}]); }
      else { expect(respostas[0]).toEqual(respostas[1]); expect(respostas.every(x=>x.ok)).toBe(true); }
    }
  });
  it("F/G: versão máxima, no-op e replay de resposta antiga depois do avanço", async () => {
    const comando = {chaveIdempotencia:randomUUID(),contatoId:contatoA}; const original = sucesso(await executarComandoVenda("criar",comando,a)); const id = original.oportunidade.id;
    const noop = sucesso(await executarComandoVenda("alterar_valores",{...cab(id,1),valorNegocioPrevisto:null,receitaPrevista:null},a)); expect(noop.noOp).toBe(true);
    await executarComandoVenda("transicionar",{...cab(id,1),destino:"em_atendimento"},a);
    expect(await executarComandoVenda("criar",comando,a)).toEqual(original);
    owner("update public.vendas_oportunidades set versao=9007199254740991 where id='"+uuid(id)+"';");
    expect(await executarComandoVenda("alterar_valores",{...cab(id,Number.MAX_SAFE_INTEGER),valorNegocioPrevisto:null,receitaPrevista:null},a)).toMatchObject({ok:false,erro:{codigo:"limite-versao"}});
    expect(await executarComandoVenda("criar",comando,a)).toEqual(original);
  });
  it.each(["public.vendas_oportunidades_eventos","private.vendas_comandos"])("H: rollback real por constraint de fixture em %s", async tabela => {
    const r = await nova(), id = r.oportunidade.id, chave = randomUUID(); const comando = {...cab(id,1),chaveIdempotencia:chave,valorNegocioPrevisto:1,receitaPrevista:null};
    const antes = owner("select row_to_json(o)::text from public.vendas_oportunidades o where id='"+uuid(id)+"';");
    owner("alter table "+tabela+" add constraint vendas_b2_fixture_falha check(chave_idempotencia<>'"+uuid(chave)+"');");
    try {
      expect(await executarComandoVenda("alterar_valores",comando,a)).toMatchObject({ok:false,erro:{codigo:"falha-interna"}});
      expect(owner("select row_to_json(o)::text from public.vendas_oportunidades o where id='"+uuid(id)+"';")).toBe(antes);
      expect(owner("select count(*) from private.vendas_comandos where user_id='"+uuid(usuarioA)+"' and chave_idempotencia='"+uuid(chave)+"';")).toBe("0");
      expect(owner("select count(*) from public.vendas_oportunidades_eventos where oportunidade_id='"+uuid(id)+"' and versao=2;")).toBe("0");
    } finally { owner("alter table "+tabela+" drop constraint vendas_b2_fixture_falha;"); }
    expect(sucesso(await executarComandoVenda("alterar_valores",comando,a)).oportunidade.versao).toBe(2);
  });
  it("wire mantém Number.MIN/MAX sem coerção Data API", async () => {
    for (const valor of [Number.MIN_VALUE,Number.MAX_VALUE,0.1]) {
      const r = await a.rpc("vendas_criar_oportunidade",{p_comando:{chaveIdempotencia:randomUUID(),contatoId:contatoA,valorNegocioPrevisto:String(valor)}});
      expect(r.error).toBeNull(); expect(decodificarRespostaVenda(r.data).oportunidade.valores.valorNegocioPrevisto).toBe(valor);
    }
  });
  it("perda e arquivamento: evento único, no-op e histórico preservado", async () => {
    const r = await nova(), id = r.oportunidade.id;
    const perda = sucesso(await executarComandoVenda("perder",{...cab(id,1),dataFato:"2011-12-30",motivo:"outro",justificativa:"Fixture B2"},a));
    expect(perda.evento?.tipo).toBe("oportunidade_perdida");
    const arquivo = sucesso(await executarComandoVenda("arquivar",cab(id,2),a));
    expect(arquivo.evento?.tipo).toBe("oportunidade_arquivada");
    const repeticao = sucesso(await executarComandoVenda("arquivar",cab(id,3),a));
    expect(repeticao.noOp).toBe(true); expect(repeticao.evento).toBeNull(); expect(repeticao.oportunidade).toEqual(arquivo.oportunidade);
    expect(owner("select count(*) from public.vendas_oportunidades_eventos where oportunidade_id='"+uuid(id)+"';")).toBe("3");
  });
});
