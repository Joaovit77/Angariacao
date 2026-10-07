/** Imóvel de venda, IV-2B, contra Supabase LOCAL isolado (mesma stack do IV-1: o IV-2B não tem
    migration). Usa os caminhos reais de gravação do app (salvarImovel, importarImoveis,
    desdobrarImovel), trocando só o `getSupabase()` pelo cliente autenticado da conta local.
    Prova: finalidade e valor de venda persistem; quem não traz o campo não apaga; null explícito
    limpa; `vendido_em` não é tocado pelo save genérico; arrasto, pré-cadastro, importação e
    desdobramento. Nunca Production. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("../lib/persistencia/supabase", () => ({ getSupabase: () => banco.cliente }));

import { reconciliarImovelRealtime } from "../lib/calculo/estabilidadeMensagens";
import { lerImportacao } from "../lib/calculo/importacao";
import { aplicarMudancaDeStatus, desdobrarImovel, importarImoveis, salvarImovel } from "../lib/mutacoes";
import { fromDbImovel, type DbImovelRow } from "../lib/persistencia/mapeadores";
import { useAppStore } from "../lib/store";
import type { Imovel } from "../lib/tipos";

const urlAmbiente = process.env.IMOVEL_IV1_LOCAL_URL, anonAmbiente = process.env.IMOVEL_IV1_LOCAL_ANON_KEY;
if (process.env.IMOVEL_IV1_INTEGRACAO !== "LOCAL_ISOLADA" || urlAmbiente !== "http://127.0.0.1:55821" || !anonAmbiente) {
  throw new Error("Gate IV-2B requer a stack local isolada 55821 e chave anon local explícita.");
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
const opcoes = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const colunas = (id: string) => owner(`select coalesce(finalidade,'∅')||'|'||coalesce(valor_venda::text,'∅')||'|'||coalesce(vendido_em::text,'∅') from public.imoveis where id='${uuid(id)}';`);

const contas: string[] = [];
let A: { c: SupabaseClient; usuario: string };
async function conta() {
  const c = createClient(url, anon, opcoes);
  const email = "imovel-iv2b-" + randomUUID() + "@example.test", password = "Iv2b-" + randomUUID();
  const cadastro = await c.auth.signUp({ email, password });
  if (cadastro.error || !cadastro.data.user) throw new Error("Auth local não criou a fixture.");
  const login = await c.auth.signInWithPassword({ email, password });
  if (login.error || login.data.user?.id !== cadastro.data.user.id) throw new Error("Auth local não autenticou a fixture.");
  contas.push(uuid(cadastro.data.user.id));
  return { c, usuario: uuid(cadastro.data.user.id) };
}
/** Como o ModalImovel monta hoje: campo a campo, sem as colunas de venda. `extra` simula o IV-2C. */
function formulario(extra: Partial<Imovel> = {}): Imovel {
  return {
    id: randomUUID(), codigo: "IV2B-" + randomUUID().slice(0, 6), referenciaCrm: "", cep: "", endereco: "Rua IV-2B, " + Math.floor(Math.random() * 999),
    bairro: "Centro", cidade: "Londrina", estado: "PR", unidade: "", bloco: "", edificio: "", tipo: "Casa", quartos: 2, banheiros: 1, vagas: 1,
    valorAluguel: 2000, valorCondominio: 0, proprietarioNome: "", proprietarioTelefone: "", formaAbordagem: "", origemImovel: "",
    imobiliariaConcorrente: "", latitude: null, longitude: null, dataAngariacao: "2026-10-06", responsavel: "", status: "Novo contato",
    observacoes: "", statusHistory: [], notas: [], tentativas: [], pausadoAte: null, motivoPerda: "", motivoPerdaOutro: "",
    comissaoRecebida: false, comissaoRecebidaValor: null, comissaoRecebidaData: null, preCadastro: false, retirado: false, ...extra,
  } as Imovel;
}
async function ler(id: string): Promise<Imovel> {
  const r = await A.c.from("imoveis").select("*").eq("id", id).single();
  if (r.error || !r.data) throw new Error("Leitura do imóvel falhou.");
  return fromDbImovel(r.data as DbImovelRow);
}

beforeAll(async () => {
  const identidade = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" }).trim();
  if (identidade !== PROJETO || owner("select max(version) from supabase_migrations.schema_migrations;") !== "20261006200215") {
    throw new Error("Stack/ledger diferente do local autorizado. Nenhuma fixture criada.");
  }
  A = await conta();
  banco.cliente = A.c;
  useAppStore.setState({ imoveis: [], agenda: [] });
});
afterAll(() => {
  // Somente a conta artificial desta prova (imóveis caem em cascata); jamais reset da stack.
  for (const usuario of contas) owner(`delete from auth.users where id='${uuid(usuario)}';`);
  for (const usuario of contas) {
    if (owner(`select count(*) from public.imoveis where user_id='${uuid(usuario)}';`) !== "0") throw new Error("Limpeza incompleta.");
  }
});

describe("IV-2B local: o save genérico grava finalidade e valor de venda sem perda", () => {
  it("1/2. finalidade 'venda' e valor decimal persistem pelo salvarImovel", async () => {
    useAppStore.setState({ imoveis: [] });
    const novo = formulario({ finalidade: "venda", valorVenda: 350000.55 });
    expect(await salvarImovel(novo, A.usuario, false)).toEqual({ ok: true, criado: true });
    expect(colunas(novo.id)).toBe("venda|350000.55|∅");
  });

  it("3. editar pelo formulário de hoje (sem as chaves) não apaga; 4. null explícito limpa; zero é zero", async () => {
    useAppStore.setState({ imoveis: [] });
    const novo = formulario({ finalidade: "locacao_venda", valorVenda: 500000 });
    await salvarImovel(novo, A.usuario, false);
    useAppStore.setState({ imoveis: [await ler(novo.id)] });

    const semChaves = formulario({ id: novo.id, codigo: novo.codigo, endereco: novo.endereco, observacoes: "editado" });
    expect((await salvarImovel(semChaves, A.usuario, false)).ok).toBe(true);
    expect(owner(`select observacoes from public.imoveis where id='${novo.id}';`)).toBe("editado");
    expect(colunas(novo.id)).toBe("locacao_venda|500000|∅");
    const store = useAppStore.getState().imoveis.find((i) => i.id === novo.id)!;
    expect([store.finalidade, store.valorVenda]).toEqual(["locacao_venda", 500000]);

    await salvarImovel(formulario({ id: novo.id, codigo: novo.codigo, endereco: novo.endereco, finalidade: "locacao", valorVenda: 0 }), A.usuario, false);
    expect(colunas(novo.id)).toBe("locacao|0|∅");
    await salvarImovel(formulario({ id: novo.id, codigo: novo.codigo, endereco: novo.endereco, finalidade: null, valorVenda: null }), A.usuario, false);
    expect(colunas(novo.id)).toBe("∅|∅|∅");
  });

  it("5. vendido_em não é tocado pelo save genérico, nem quando o objeto traz outro valor", async () => {
    useAppStore.setState({ imoveis: [] });
    const novo = formulario({ finalidade: "venda", valorVenda: 1000 });
    await salvarImovel(novo, A.usuario, false);
    const fixture = await A.c.from("imoveis").update({ vendido_em: "2026-10-01" }).eq("id", novo.id).select("id");
    expect(fixture.error).toBeNull();
    const lido = await ler(novo.id);
    useAppStore.setState({ imoveis: [lido] });
    await salvarImovel({ ...lido, vendidoEm: "2030-01-01", observacoes: "tentou mudar a venda" }, A.usuario, false);
    expect(colunas(novo.id)).toBe("venda|1000|2026-10-01");
    await salvarImovel({ ...lido, vendidoEm: null }, A.usuario, false);
    expect(colunas(novo.id)).toBe("venda|1000|2026-10-01");
    expect(useAppStore.getState().imoveis.find((i) => i.id === novo.id)!.vendidoEm).toBe("2026-10-01");
  });

  it("arrastar no Pipeline depois de um Realtime parcial mantém venda e valor", async () => {
    useAppStore.setState({ imoveis: [] });
    const novo = formulario({ finalidade: "venda", valorVenda: 500000 });
    await salvarImovel(novo, A.usuario, false);
    const aposRealtime = reconciliarImovelRealtime(await ler(novo.id), { id: novo.id, observacoes: "chegou resposta" }, A.usuario);
    useAppStore.setState({ imoveis: [aposRealtime] });
    const atualizado: Imovel = { ...aposRealtime, status: "Sem resposta", statusHistory: [...(aposRealtime.statusHistory || [])] };
    aplicarMudancaDeStatus(atualizado, "Sem resposta", aposRealtime.status, A.usuario);
    expect((await salvarImovel(atualizado, A.usuario, false)).ok).toBe(true);
    expect(owner(`select status from public.imoveis where id='${novo.id}';`)).toBe("Sem resposta");
    expect(colunas(novo.id)).toBe("venda|500000|∅");
  });
});

describe("IV-2B local: caminhos que não definem finalidade continuam null", () => {
  it("pré-cadastro e importação gravam null", async () => {
    useAppStore.setState({ imoveis: [] });
    const pre = formulario({ preCadastro: true, textoAnuncio: "Casa à venda, 3 quartos", origemImovel: "OLX" });
    await salvarImovel(pre, A.usuario, false);
    expect(colunas(pre.id)).toBe("∅|∅|∅");

    const csv = "endereco;cidade;tipo;valor\nRua Importada IV2B, 10;Londrina;Casa;450000\n";
    const candidatos = lerImportacao(csv, [], "2026-10-06").linhas.map((l) => l.imovel).filter((i) => i !== null);
    expect(await importarImoveis(candidatos, A.usuario)).toMatchObject({ ok: true, gravados: 1 });
    expect(owner(`select coalesce(finalidade,'∅')||'|'||coalesce(valor_venda::text,'∅')||'|'||valor_aluguel::text from public.imoveis where user_id='${A.usuario}' and endereco='Rua Importada IV2B, 10';`)).toBe("∅|∅|450000");
  });

  it("desdobramento: unidades herdam a finalidade e nascem sem valor de venda", async () => {
    useAppStore.setState({ imoveis: [] });
    const principal = formulario({ status: "Angariado", finalidade: "venda", valorVenda: 900000,
      statusHistory: [{ status: "Angariado", date: "2026-10-01", userId: A.usuario, source: "usuario" }] });
    await salvarImovel(principal, A.usuario, false);
    useAppStore.setState({ imoveis: [await ler(principal.id)] });
    expect(await desdobrarImovel(principal.id, [
      { unidade: "Sala 1", tipo: "Sala", codigo: "IV2B-S1-" + randomUUID().slice(0, 4), valorAluguel: 800, valorCondominio: 0 },
      { unidade: "Sala 2", tipo: "Sala", codigo: "IV2B-S2-" + randomUUID().slice(0, 4), valorAluguel: 900, valorCondominio: 0 },
    ], A.usuario)).toBe(true);
    expect(owner(`select count(*)||':'||string_agg(distinct coalesce(finalidade,'∅')||'|'||coalesce(valor_venda::text,'∅')||'|'||coalesce(vendido_em::text,'∅'), ',') from public.imoveis where imovel_principal_id='${principal.id}';`)).toBe("2:venda|∅|∅");
    expect(colunas(principal.id)).toBe("venda|900000|∅");
  });
});
