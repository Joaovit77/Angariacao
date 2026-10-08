/** B3.4a contra Supabase LOCAL isolado: a leitura da tela (vendasLeitura) com o cliente
    autenticado normal de duas contas. Prova que cada conta enxerga só o que é dela pela RLS,
    inclusive quando ids da outra conta são enfiados nas consultas. Nunca Production. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarComandoVenda } from "../lib/persistencia/vendas";
import {
  listarEventosVenda, listarOportunidadesVenda, type ClienteLeituraVenda, type ConsultaLeituraVenda,
} from "../lib/persistencia/vendasLeitura";

const urlAmbiente = process.env.VENDAS_B34A_LOCAL_URL, anonAmbiente = process.env.VENDAS_B34A_LOCAL_ANON_KEY;
if (process.env.VENDAS_B34A_INTEGRACAO !== "LOCAL_ISOLADA" || urlAmbiente !== "http://127.0.0.1:55821" || !anonAmbiente) {
  throw new Error("Gate B3.4a requer stack local isolada 55821 e chave anon local explícita.");
}
const url: string = urlAmbiente, anon: string = anonAmbiente;
const PROJETO = "vendas-b34a-c69a18b", container = "supabase_db_" + PROJETO;
const argsPsql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"];
function owner(sql: string): string {
  try { return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 }).trim(); }
  catch { throw new Error("Consulta da fixture local não concluída."); }
}
function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("ID da fixture inválido."); return id;
}
const leitura = (c: SupabaseClient) => c as unknown as ClienteLeituraVenda;
const opcoes = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

interface Conta {
  c: SupabaseClient; usuario: string; nome: string; codigo: string;
  oportunidade: string; contato: string; referencia: string; imovel: string;
}

async function conta(rotulo: string): Promise<Conta> {
  const c = createClient(url, anon, opcoes);
  const email = "vendas-b34a-" + randomUUID() + "@example.test", password = "B34a-" + randomUUID();
  const cadastro = await c.auth.signUp({ email, password });
  if (cadastro.error || !cadastro.data.user) throw new Error("Auth local não criou a fixture.");
  const login = await c.auth.signInWithPassword({ email, password });
  if (login.error || login.data.user?.id !== cadastro.data.user.id) throw new Error("Auth local não autenticou a fixture.");
  const usuario = uuid(cadastro.data.user.id);
  contas.push(usuario);
  // Imóvel pelo caminho real do app (RLS + grant), sem proprietário: nenhuma pessoa nasce dele.
  const codigo = "B34A-" + rotulo + "-" + randomInt(1000, 9999);
  const imovel = await c.from("imoveis").insert({ user_id: usuario, codigo, endereco: `Rua ${codigo}, 10`, status: "Novo contato" }).select("id").single();
  if (imovel.error || !imovel.data) throw new Error("Imóvel da fixture não criado.");
  // Oportunidade, contato, referência e eventos pelas portas reais do B2/B3 (escrita só da fixture).
  const nome = `Comprador ${rotulo} ${randomUUID().slice(0, 8)}`;
  const criada = await executarComandoVenda("criar", {
    chaveIdempotencia: randomUUID(), interessado: { modo: "novo", nome, telefone: `(43) 9${randomInt(6000, 9999)}-${randomInt(1000, 9999)}` },
    imovelTratado: { modo: "referencia", imovelId: imovel.data.id }, origem: { tipo: "portal", descricao: null },
    valorNegocioPrevisto: 350000.5, receitaPrevista: 0,
  }, c);
  if (!criada.ok) throw new Error("criar recusado: " + criada.erro.codigo);
  const avancada = await executarComandoVenda("transicionar", {
    chaveIdempotencia: randomUUID(), oportunidadeId: criada.oportunidade.id, versaoEsperada: 1, destino: "em_atendimento",
  }, c);
  if (!avancada.ok) throw new Error("transicionar recusado: " + avancada.erro.codigo);
  const oportunidade = uuid(criada.oportunidade.id);
  const referencia = owner(`select imovel_referencia_id from public.vendas_oportunidades where id='${oportunidade}';`);
  return { c, usuario, nome, codigo, oportunidade, contato: uuid(criada.oportunidade.contatoId), referencia: uuid(referencia), imovel: uuid(imovel.data.id) };
}

/** Cliente adulterado: acrescenta ids da outra conta em todo `in(...)` e `eq(...)` e guarda
    tudo o que o PostgREST devolveu, para provar que a RLS segura o que a leitura nem pediria. */
function adulterado(base: SupabaseClient, idsAlheios: readonly string[]) {
  const brutos: unknown[] = [];
  const cliente: ClienteLeituraVenda = {
    from(tabela) {
      return {
        select(colunas) {
          const embrulhar = (consulta: ConsultaLeituraVenda): ConsultaLeituraVenda => ({
            eq: (coluna, valor) => coluna === "oportunidade_id"
              ? embrulhar(consulta.in(coluna, [valor, ...idsAlheios]))
              : embrulhar(consulta.eq(coluna, valor)),
            in: (coluna, valores) => embrulhar(consulta.in(coluna, [...valores, ...idsAlheios])),
            order: (coluna, o) => embrulhar(consulta.order(coluna, o)),
            then: (resolver, rejeitar) => consulta.then((r) => { brutos.push(r.data); return r; }).then(resolver, rejeitar),
          });
          return embrulhar(leitura(base).from(tabela).select(colunas));
        },
      };
    },
  };
  return { cliente, brutos };
}

const contas: string[] = [];
let A: Conta, B: Conta;
beforeAll(async () => {
  const identidade = execFileSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.supabase.cli.project"}}', container], { encoding: "utf8" }).trim();
  if (identidade !== PROJETO || owner("select max(version) from supabase_migrations.schema_migrations;") !== "20261006123603") {
    throw new Error("Stack/ledger diferente do local autorizado. Nenhuma fixture criada.");
  }
  A = await conta("A");
  B = await conta("B");
});
afterAll(() => {
  // Somente as contas artificiais desta prova (imóveis, contatos e Vendas caem em cascata); jamais reset da stack.
  for (const usuario of contas) owner("delete from auth.users where id='" + uuid(usuario) + "';");
  for (const usuario of contas) {
    const restos = owner(`select (select count(*) from public.contatos where user_id='${usuario}')
      + (select count(*) from public.imoveis where user_id='${usuario}')
      + (select count(*) from public.vendas_oportunidades where user_id='${usuario}')
      + (select count(*) from public.vendas_oportunidades_eventos where user_id='${usuario}')
      + (select count(*) from public.vendas_imoveis_referencias where user_id='${usuario}')
      + (select count(*) from private.vendas_comandos where user_id='${usuario}');`);
    if (restos !== "0") throw new Error("Limpeza incompleta.");
  }
});

describe("B3.4a: leitura sob RLS com duas contas", () => {
  it("cada conta lista exclusivamente a sua oportunidade, com nome, referência e valores exatos", async () => {
    for (const [eu, outra] of [[A, B], [B, A]] as const) {
      const r = await listarOportunidadesVenda(leitura(eu.c));
      if (!r.ok) throw new Error("leitura recusada: " + r.erro);
      expect(r.dados).toHaveLength(1);
      const [item] = r.dados;
      expect(item.oportunidade).toMatchObject({ id: eu.oportunidade, userId: eu.usuario, contatoId: eu.contato, estado: "em_atendimento", versao: 2,
        valores: { valorNegocioPrevisto: 350000.5, receitaPrevista: 0, valorNegocioFechado: null }, imovelTratado: { modo: "referencia", imovelId: eu.imovel } });
      expect(item.interessadoNome).toBe(eu.nome);
      expect(item.imovel).toMatchObject({ tipo: "referencia", codigo: eu.codigo, naCarteira: true });
      const texto = JSON.stringify(r.dados);
      for (const alheio of [outra.nome, outra.oportunidade, outra.contato, outra.referencia, outra.codigo, outra.usuario]) expect(texto).not.toContain(alheio);
    }
  });

  it("histórico: a própria oportunidade em ordem; a da outra conta volta vazia", async () => {
    const proprio = await listarEventosVenda(A.oportunidade, leitura(A.c));
    if (!proprio.ok) throw new Error(proprio.erro);
    expect(proprio.dados.map((e) => [e.tipo, e.versao, e.userId])).toEqual([["oportunidade_criada", 1, A.usuario], ["etapa_alterada", 2, A.usuario]]);
    expect(await listarEventosVenda(B.oportunidade, leitura(A.c))).toEqual({ ok: true, dados: [] });
    expect(await listarEventosVenda(A.oportunidade, leitura(B.c))).toEqual({ ok: true, dados: [] });
  });

  it("ids da outra conta enfiados nas consultas não trazem nada dela (RLS, não filtro do app)", async () => {
    for (const [eu, outra] of [[A, B], [B, A]] as const) {
      const alheios = [outra.oportunidade, outra.contato, outra.referencia];
      const lista = adulterado(eu.c, alheios);
      const r = await listarOportunidadesVenda(lista.cliente);
      expect(r.ok).toBe(true);
      const eventos = adulterado(eu.c, alheios);
      expect((await listarEventosVenda(eu.oportunidade, eventos.cliente)).ok).toBe(true);
      const brutos = JSON.stringify([...lista.brutos, ...eventos.brutos]);
      expect(lista.brutos).toHaveLength(3); // oportunidades, referências e contatos: todas consultadas com os ids alheios.
      for (const alheio of [outra.nome, outra.oportunidade, outra.contato, outra.referencia, outra.codigo, outra.usuario]) expect(brutos).not.toContain(alheio);
      expect(brutos).toContain(eu.nome);
    }
  });

  it("sem sessão a leitura é recusada como nao-autenticado, sem dado nenhum", async () => {
    const semSessao = createClient(url, anon, opcoes);
    expect(await listarOportunidadesVenda(leitura(semSessao))).toEqual({ ok: false, erro: "nao-autenticado" });
    expect(await listarEventosVenda(A.oportunidade, leitura(semSessao))).toEqual({ ok: false, erro: "nao-autenticado" });
  });
});
