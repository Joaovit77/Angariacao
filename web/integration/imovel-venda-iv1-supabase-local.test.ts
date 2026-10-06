/** Imóvel de venda, IV-1, contra Supabase LOCAL isolado (migrations até o IV-1). Usa os caminhos
    reais de gravação do app (salvarImovel, importarImoveis, desdobrarImovel), trocando só o
    `getSupabase()` pelo cliente autenticado da conta local. Prova que o schema é inerte: linha
    antiga fica null, o save genérico não apaga as colunas novas, RLS de sempre, Realtime publica
    a coluna e reconciliar não grava nada. Nunca Production. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("../lib/persistencia/supabase", () => ({ getSupabase: () => banco.cliente }));

import { reconciliarImovelRealtime } from "../lib/calculo/estabilidadeMensagens";
import { lerImportacao } from "../lib/calculo/importacao";
import { desdobrarImovel, importarImoveis, salvarImovel } from "../lib/mutacoes";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "../lib/persistencia/mapeadores";
import { useAppStore } from "../lib/store";
import type { Imovel } from "../lib/tipos";

const urlAmbiente = process.env.IMOVEL_IV1_LOCAL_URL, anonAmbiente = process.env.IMOVEL_IV1_LOCAL_ANON_KEY;
if (process.env.IMOVEL_IV1_INTEGRACAO !== "LOCAL_ISOLADA" || urlAmbiente !== "http://127.0.0.1:55821" || !anonAmbiente) {
  throw new Error("Gate IV-1 requer stack local isolada 55821 e chave anon local explícita.");
}
const url: string = urlAmbiente, anon: string = anonAmbiente;
const PROJETO = "imovel-iv1-c69a18b", container = "supabase_db_" + PROJETO;
const argsPsql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"];
function owner(sql: string): string {
  try { return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 }).trim(); }
  catch { throw new Error("Consulta da fixture local não concluída."); }
}
function uuid(id: string | undefined): string {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("ID da fixture inválido."); return id;
}
const LEGADO = { id: uuid(process.env.IMOVEL_IV1_LEGADO_ID), usuario: uuid(process.env.IMOVEL_IV1_LEGADO_USUARIO),
  xmin: process.env.IMOVEL_IV1_LEGADO_XMIN ?? "", atualizado: process.env.IMOVEL_IV1_LEGADO_UPDATED ?? "" };
const opcoes = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const colunasNovas = (id: string) => owner(`select coalesce(finalidade,'∅')||'|'||coalesce(valor_venda::text,'∅')||'|'||coalesce(vendido_em::text,'∅') from public.imoveis where id='${uuid(id)}';`);

async function conta() {
  const c = createClient(url, anon, opcoes);
  const email = "imovel-iv1-" + randomUUID() + "@example.test", password = "Iv1-" + randomUUID();
  const cadastro = await c.auth.signUp({ email, password });
  if (cadastro.error || !cadastro.data.user) throw new Error("Auth local não criou a fixture.");
  const login = await c.auth.signInWithPassword({ email, password });
  if (login.error || login.data.user?.id !== cadastro.data.user.id) throw new Error("Auth local não autenticou a fixture.");
  contas.push(uuid(cadastro.data.user.id));
  return { c, usuario: uuid(cadastro.data.user.id) };
}
/** Como o ModalImovel monta: campo a campo, sem as colunas novas. */
function imovelDeFormulario(extra: Partial<Imovel> = {}): Imovel {
  return {
    id: randomUUID(), codigo: "IV1-" + randomUUID().slice(0, 6), referenciaCrm: "", cep: "", endereco: "Rua IV-1, " + Math.floor(Math.random() * 999),
    bairro: "Centro", cidade: "Londrina", estado: "PR", unidade: "", bloco: "", edificio: "", tipo: "Casa", quartos: 2, banheiros: 1, vagas: 1,
    valorAluguel: 2000, valorCondominio: 0, proprietarioNome: "", proprietarioTelefone: "", formaAbordagem: "", origemImovel: "",
    imobiliariaConcorrente: "", latitude: null, longitude: null, dataAngariacao: "2026-10-06", responsavel: "", status: "Novo contato",
    observacoes: "", statusHistory: [], notas: [], tentativas: [], pausadoAte: null, motivoPerda: "", motivoPerdaOutro: "",
    comissaoRecebida: false, comissaoRecebidaValor: null, comissaoRecebidaData: null, preCadastro: false, retirado: false, ...extra,
  } as Imovel;
}
async function lerImovel(c: SupabaseClient, id: string): Promise<Imovel> {
  const r = await c.from("imoveis").select("*").eq("id", id).single();
  if (r.error || !r.data) throw new Error("Leitura do imóvel falhou.");
  return fromDbImovel(r.data as DbImovelRow);
}

const contas: string[] = [];
let A: { c: SupabaseClient; usuario: string };
let B: { c: SupabaseClient; usuario: string };
beforeAll(async () => {
  const identidade = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" }).trim();
  if (identidade !== PROJETO || owner("select max(version) from supabase_migrations.schema_migrations;") !== "20261006200215") {
    throw new Error("Stack/ledger diferente do IV-1 local autorizado. Nenhuma fixture criada.");
  }
  A = await conta(); B = await conta();
  useAppStore.setState({ imoveis: [], agenda: [] });
});
afterAll(() => {
  // Somente as contas artificiais desta prova (imóveis, contatos e agenda caem em cascata); jamais reset da stack.
  for (const usuario of [...contas, LEGADO.usuario]) owner(`delete from auth.users where id='${uuid(usuario)}';`);
  for (const usuario of [...contas, LEGADO.usuario]) {
    if (owner(`select count(*) from public.imoveis where user_id='${uuid(usuario)}';`) !== "0") throw new Error("Limpeza incompleta.");
  }
});

describe("IV-1 local: linha anterior à migration", () => {
  it("fica com null nas três colunas, mesmo xmin e mesmo updated_at (sem reescrita)", () => {
    expect(colunasNovas(LEGADO.id)).toBe("∅|∅|∅");
    expect(owner(`select xmin::text||'|'||updated_at::text from public.imoveis where id='${LEGADO.id}';`)).toBe(LEGADO.xmin + "|" + LEGADO.atualizado);
  });
});

describe("IV-1 local: o save genérico não apaga as colunas novas", () => {
  it("criar pelo salvarImovel, escrever as colunas, salvar de novo duas vezes: os valores ficam", async () => {
    banco.cliente = A.c;
    const novo = imovelDeFormulario();
    expect(await salvarImovel(novo, A.usuario, false)).toEqual({ ok: true, criado: true });
    expect(colunasNovas(novo.id)).toBe("∅|∅|∅");

    // Fixture: no IV-1 nenhuma tela escreve estas colunas; a escrita vem direto, com a sessão de A.
    const escrita = await A.c.from("imoveis").update({ finalidade: "venda", valor_venda: 350000.5, vendido_em: "2026-10-01" }).eq("id", novo.id).select("id");
    expect(escrita.error).toBeNull(); expect(escrita.data).toHaveLength(1);
    const lido = await lerImovel(A.c, novo.id);
    expect([lido.finalidade, lido.valorVenda, lido.vendidoEm]).toEqual(["venda", 350000.5, "2026-10-01"]);
    useAppStore.setState({ imoveis: [lido] });

    // 1) como o ModalImovel: objeto montado campo a campo, sem as colunas novas, com uma edição real.
    const formulario = imovelDeFormulario({ id: novo.id, codigo: novo.codigo, endereco: novo.endereco, observacoes: "editado pelo formulário", statusHistory: lido.statusHistory });
    expect(await salvarImovel(formulario, A.usuario, false)).toEqual({ ok: true, criado: false });
    expect(owner(`select observacoes from public.imoveis where id='${novo.id}';`)).toBe("editado pelo formulário");
    expect(colunasNovas(novo.id)).toBe("venda|350000.5|2026-10-01");

    // 2) objeto com as colunas presentes mas trocadas na memória: o toDbImovel não as manda.
    const trocado: Imovel = { ...(await lerImovel(A.c, novo.id)), finalidade: "locacao", valorVenda: 1, vendidoEm: null, observacoes: "segunda edição" };
    useAppStore.setState({ imoveis: [trocado] });
    expect(await salvarImovel(trocado, A.usuario, false)).toEqual({ ok: true, criado: false });
    expect(owner(`select observacoes from public.imoveis where id='${novo.id}';`)).toBe("segunda edição");
    expect(colunasNovas(novo.id)).toBe("venda|350000.5|2026-10-01");
    expect(owner(`select valor_venda::text from public.imoveis where id='${novo.id}';`)).toBe("350000.5");
  });

  it("os checks valem pelo PostgREST: recusa com 23514, aceita null/zero/a lista", async () => {
    banco.cliente = A.c;
    const im = imovelDeFormulario();
    expect((await salvarImovel(im, A.usuario, false)).ok).toBe(true);
    const tentar = async (campos: Record<string, unknown>) => (await A.c.from("imoveis").update(campos).eq("id", im.id)).error?.code ?? null;
    for (const f of ["aluguel", "Venda", "", "ambos"]) expect(await tentar({ finalidade: f }), f).toBe("23514");
    for (const v of [-1, "NaN", "Infinity", "-Infinity"]) expect(await tentar({ valor_venda: v }), String(v)).toBe("23514");
    for (const campos of [{ finalidade: "locacao" }, { finalidade: "locacao_venda" }, { finalidade: null }, { valor_venda: 0 }, { valor_venda: null }, { vendido_em: "2026-10-01" }, { vendido_em: null }]) {
      expect(await tentar(campos), JSON.stringify(campos)).toBeNull();
    }
  });
});

describe("IV-1 local: RLS de sempre", () => {
  it("B não lê nem altera as colunas novas de A, nem pelo upsert", async () => {
    banco.cliente = A.c;
    const im = imovelDeFormulario();
    expect((await salvarImovel(im, A.usuario, false)).ok).toBe(true);
    await A.c.from("imoveis").update({ finalidade: "locacao_venda", valor_venda: 1000, vendido_em: "2026-09-30" }).eq("id", im.id);

    expect((await B.c.from("imoveis").select("finalidade,valor_venda,vendido_em").eq("id", im.id)).data).toEqual([]);
    expect((await B.c.from("imoveis").update({ finalidade: "venda", valor_venda: 1 }).eq("id", im.id).select("id")).data).toEqual([]);
    const upsert = await B.c.from("imoveis").upsert({ ...toDbImovel(im, B.usuario), user_id: B.usuario });
    expect(upsert.error?.code).toBe("42501");
    expect(colunasNovas(im.id)).toBe("locacao_venda|1000|2026-09-30");
    expect(owner(`select user_id::text from public.imoveis where id='${im.id}';`)).toBe(A.usuario);
  });
});

describe("IV-1 local: importação, pré-cadastro e desdobramento seguem iguais e gravam null", () => {
  it("importação pelo leitor de planilha e pela mutação real", async () => {
    banco.cliente = A.c;
    useAppStore.setState({ imoveis: [] });
    const csv = "endereco;bairro;cidade;tipo;valor\nRua Importada IV1, 10;Centro;Londrina;Casa;1500\nRua Importada IV1, 20;Centro;Londrina;Apartamento;1800\n";
    const leitura = lerImportacao(csv, [], "2026-10-06");
    const candidatos = leitura.linhas.map((l) => l.imovel).filter((i) => i !== null);
    expect(candidatos).toHaveLength(2);
    expect(await importarImoveis(candidatos, A.usuario)).toMatchObject({ ok: true, gravados: 2 });
    expect(owner(`select string_agg(coalesce(finalidade,'∅')||'|'||coalesce(valor_venda::text,'∅')||'|'||coalesce(vendido_em::text,'∅'), ',') from public.imoveis where user_id='${A.usuario}' and endereco like 'Rua Importada IV1%';`)).toBe("∅|∅|∅,∅|∅|∅");
  });

  it("pré-cadastro (mesmos campos do ModalPreCadastro) pelo salvarImovel", async () => {
    banco.cliente = A.c;
    useAppStore.setState({ imoveis: [] });
    const pre = imovelDeFormulario({ preCadastro: true, textoAnuncio: "Casa à venda, 3 quartos", origemImovel: "OLX",
      statusHistory: [{ status: "Novo contato", date: "2026-10-06", userId: A.usuario, source: "usuario" }] });
    expect(await salvarImovel(pre, A.usuario, false)).toEqual({ ok: true, criado: true });
    expect(owner(`select pre_cadastro::text from public.imoveis where id='${pre.id}';`)).toBe("true");
    expect(colunasNovas(pre.id)).toBe("∅|∅|∅");
  });

  it("desdobramento real: unidades nascem null (sem herança no IV-1) e o principal mantém as suas", async () => {
    banco.cliente = A.c;
    const principal = imovelDeFormulario({ status: "Angariado", statusHistory: [{ status: "Angariado", date: "2026-10-01", userId: A.usuario, source: "usuario" }] });
    useAppStore.setState({ imoveis: [] });
    expect((await salvarImovel(principal, A.usuario, false)).ok).toBe(true);
    await A.c.from("imoveis").update({ finalidade: "venda", valor_venda: 900000 }).eq("id", principal.id);
    useAppStore.setState({ imoveis: [await lerImovel(A.c, principal.id)] });
    const ok = await desdobrarImovel(principal.id, [
      { unidade: "Sala 1", tipo: "Sala", codigo: "IV1-S1-" + randomUUID().slice(0, 4), valorAluguel: 800, valorCondominio: 0 },
      { unidade: "Sala 2", tipo: "Sala", codigo: "IV1-S2-" + randomUUID().slice(0, 4), valorAluguel: 900, valorCondominio: 0 },
    ], A.usuario);
    expect(ok).toBe(true);
    expect(owner(`select count(*)||':'||string_agg(distinct coalesce(finalidade,'∅')||'|'||coalesce(valor_venda::text,'∅')||'|'||coalesce(vendido_em::text,'∅'), ',') from public.imoveis where imovel_principal_id='${principal.id}';`)).toBe("2:∅|∅|∅");
    expect(colunasNovas(principal.id)).toBe("venda|900000|∅");
  });
});

describe("IV-1 local: Realtime", () => {
  // A entrega ao vivo de UPDATE pelo Realtime não é estável numa stack local recém-criada: a
  // assinatura fica SUBSCRIBED e nenhum UPDATE de `imoveis` chega, com ou sem o IV-1 aplicado
  // (controle feito antes e depois da migration). Por isso este teste não depende dela; fica o que
  // o banco decide: a publicação leva as colunas, e reconciliar uma linha publicada não grava nada.
  it("a publicação supabase_realtime transmite as três colunas novas", () => {
    expect(owner("select (prattrs is null)::text from pg_publication_rel where prrelid='public.imoveis'::regclass;")).toBe("true");
    expect(owner(`select string_agg(c, ',' order by c) from unnest((select attnames from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='imoveis')) c where c in ('finalidade','valor_venda','vendido_em');`)).toBe("finalidade,valor_venda,vendido_em");
  });

  it("reconciliar uma linha no formato publicado leva os valores para a memória e não grava nada", async () => {
    banco.cliente = A.c;
    useAppStore.setState({ imoveis: [] });
    const im = imovelDeFormulario();
    expect((await salvarImovel(im, A.usuario, false)).ok).toBe(true);
    const anterior = await lerImovel(A.c, im.id);
    await A.c.from("imoveis").update({ finalidade: "locacao_venda", valor_venda: 123.45 }).eq("id", im.id);
    const publicada = (await A.c.from("imoveis").select("*").eq("id", im.id).single()).data as DbImovelRow;
    const antes = owner(`select xmin::text from public.imoveis where id='${im.id}';`);
    const reconciliado = reconciliarImovelRealtime(anterior, publicada, A.usuario);
    expect([reconciliado.finalidade, reconciliado.valorVenda, reconciliado.vendidoEm]).toEqual(["locacao_venda", 123.45, null]);
    for (const coluna of ["finalidade", "valor_venda", "vendido_em"]) expect(toDbImovel(reconciliado, A.usuario)).not.toHaveProperty(coluna);
    expect(owner(`select xmin::text from public.imoveis where id='${im.id}';`)).toBe(antes);
  });
});
