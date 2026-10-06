/** B3.3 contra Supabase LOCAL isolado: o adaptador TS (consultarInteressadoVenda e
    executarComandoVenda) com o cliente autenticado normal, sobre o B3.2 instalado. Nunca Production. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { telefoneCanonico } from "../lib/calculo/webhookWhatsapp";
import { consultarInteressadoVenda, executarComandoVenda } from "../lib/persistencia/vendas";
import type { ComandosVenda } from "../lib/persistencia/vendasComandos";

const urlAmbiente = process.env.VENDAS_B33_LOCAL_URL, anonAmbiente = process.env.VENDAS_B33_LOCAL_ANON_KEY;
if (process.env.VENDAS_B33_INTEGRACAO !== "LOCAL_ISOLADA" || urlAmbiente !== "http://127.0.0.1:55821" || !anonAmbiente) {
  throw new Error("Gate B3.3 requer stack local isolada 55821 e chave anon local explícita.");
}
const url: string = urlAmbiente, anon: string = anonAmbiente;
const PROJETO = "vendas-b33-5e25ff5", container = "supabase_db_" + PROJETO;
const argsPsql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"];
function owner(sql: string): string {
  try { return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 }).trim(); }
  catch { throw new Error("Consulta da fixture local não concluída."); }
}
function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("ID da fixture inválido."); return id;
}
const telefone = () => `(43) 9${randomInt(6000, 9999)}-${randomInt(1000, 9999)}`;
async function conta() {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const email = "vendas-b33-" + randomUUID() + "@example.test", password = "B33-" + randomUUID();
  const cadastro = await c.auth.signUp({ email, password });
  if (cadastro.error || !cadastro.data.user) throw new Error("Auth local não criou a fixture.");
  const login = await c.auth.signInWithPassword({ email, password });
  if (login.error || login.data.user?.id !== cadastro.data.user.id) throw new Error("Auth local não autenticou a fixture.");
  return { c, usuario: uuid(cadastro.data.user.id) };
}
const contar = (sql: string) => Number(owner(sql));

let a: SupabaseClient, b: SupabaseClient, usuarioA: string;
const contas: string[] = [];
beforeAll(async () => {
  const identidade = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" }).trim();
  if (identidade !== PROJETO || owner("select max(version) from supabase_migrations.schema_migrations;") !== "20261006123603") {
    throw new Error("Stack/ledger diferente do B3.2 local autorizado. Nenhuma fixture criada.");
  }
  const fa = await conta(), fb = await conta();
  a = fa.c; b = fb.c; usuarioA = fa.usuario; contas.push(fa.usuario, fb.usuario);
});
afterAll(() => {
  // Somente as contas artificiais desta prova (contatos e Vendas caem em cascata); jamais reset da stack.
  for (const usuario of contas) owner("delete from auth.users where id='" + uuid(usuario) + "';");
  for (const usuario of contas) {
    if (owner(`select count(*) from public.contatos where user_id='${uuid(usuario)}';`) !== "0") throw new Error("Limpeza incompleta.");
  }
});

describe("B3.3: adaptador TS sobre o B3.2 local", () => {
  it("resolver → criar novo → resolver encontrado → replay sem duplicar → conflitos", async () => {
    const numero = telefone(), canonico = telefoneCanonico(numero);
    expect(await consultarInteressadoVenda(numero, a)).toEqual({ ok: true, resolucao: { status: "nao-encontrado" } });

    const comando: ComandosVenda["criar"] = { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: " Comprador B3.3 ", telefone: numero } };
    const criada = await executarComandoVenda("criar", comando, a);
    if (!criada.ok) throw new Error("criar recusado: " + criada.erro.codigo);
    const contatoId = criada.oportunidade.contatoId;
    expect(owner(`select origem||'|'||nome from public.contatos where id='${uuid(contatoId)}';`)).toBe("vendas|Comprador B3.3");

    expect(await consultarInteressadoVenda("+55 " + numero, a)).toEqual({ ok: true, resolucao: { status: "encontrado", contatoId, seguiuFusao: false, avisos: [] } });

    expect(await executarComandoVenda("criar", comando, a)).toEqual(criada);
    expect(contar(`select count(*) from public.contatos_telefones where user_id='${uuid(usuarioA)}' and telefone_canonico='${canonico}';`)).toBe(1);
    expect(contar(`select count(*) from public.vendas_oportunidades where user_id='${uuid(usuarioA)}' and contato_id='${uuid(contatoId)}';`)).toBe(1);

    expect(await executarComandoVenda("criar", { ...comando, interessado: { modo: "novo", nome: "Outro Nome", telefone: numero } }, a))
      .toEqual({ ok: false, erro: { codigo: "chave-idempotencia-conflitante", motivo: null } });
    expect(await executarComandoVenda("criar", { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Outro Nome", telefone: numero } }, a))
      .toEqual({ ok: false, erro: { codigo: "telefone-ja-cadastrado", motivo: null } });

    // A decisão explícita do usuário: o modo existente com o candidato (mesma pessoa em outra oportunidade).
    const segunda = await executarComandoVenda("criar", { chaveIdempotencia: randomUUID(), interessado: { modo: "existente", contatoId } }, a);
    expect(segunda).toMatchObject({ ok: true, oportunidade: { contatoId } });
    expect(contar(`select count(*) from public.vendas_oportunidades where user_id='${uuid(usuarioA)}' and contato_id='${uuid(contatoId)}';`)).toBe(2);
    expect(contar(`select count(*) from public.contatos where user_id='${uuid(usuarioA)}';`)).toBe(1);

    // Outra conta não enxerga o número de A.
    expect(await consultarInteressadoVenda(numero, b)).toEqual({ ok: true, resolucao: { status: "nao-encontrado" } });
  });

  it("novo sem telefone cria pessoa própria a cada chave, sem deduplicar por nome", async () => {
    const r1 = await executarComandoVenda("criar", { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Sem Telefone B3.3", telefone: null } }, a);
    const r2 = await executarComandoVenda("criar", { chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome: "Sem Telefone B3.3", telefone: null } }, a);
    if (!r1.ok || !r2.ok) throw new Error("criar sem telefone recusado");
    expect(r1.oportunidade.contatoId).not.toBe(r2.oportunidade.contatoId);
    expect(contar(`select count(*) from public.contatos_telefones where contato_id in ('${uuid(r1.oportunidade.contatoId)}','${uuid(r2.oportunidade.contatoId)}');`)).toBe(0);
  });

  it("legado B2 continua funcionando pelo mesmo adaptador; erro do banco chega tipado", async () => {
    const contato = randomUUID();
    owner(`insert into public.contatos(id,user_id,nome,origem) values('${contato}','${uuid(usuarioA)}','Fixture legado B3.3','cadastro');`);
    expect(await executarComandoVenda("criar", { chaveIdempotencia: randomUUID(), contatoId: contato }, a)).toMatchObject({ ok: true, oportunidade: { contatoId: contato } });
    expect(await executarComandoVenda("criar", { chaveIdempotencia: randomUUID(), interessado: { modo: "existente", contatoId: randomUUID() } }, a))
      .toEqual({ ok: false, erro: { codigo: "contato-invalido", motivo: null } });
    const semSessao = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect(await consultarInteressadoVenda(telefone(), semSessao)).toEqual({ ok: false, erro: { codigo: "nao-autenticado", motivo: null } });
  });
});
