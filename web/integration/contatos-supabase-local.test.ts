/* Fase 1a-A no PostgreSQL + PostgREST locais: as quatro tabelas de contatos,
   as views, o backfill classificado, a projeção legada, o INSERT legado, o
   UPDATE legado (aceito + revisão) e o isolamento entre contas. Opt-in, só
   contra Supabase LOCAL, como `disponibilidade-supabase-local.test.ts`.

   Como rodar (com o banco local já com o schema + migrations aplicados):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     LOCAL_SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
     node node_modules/vitest/vitest.mjs run --config vitest.contatos-supabase-local.config.ts */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
const dbUrl = process.env.LOCAL_SUPABASE_DB_URL || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração de contatos requer Supabase LOCAL e chaves locais explícitas.");
}
if (!/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/\w+(\?[\w=&-]*)?$/.test(dbUrl)) {
  throw new Error("Integração de contatos requer LOCAL_SUPABASE_DB_URL apontando para 127.0.0.1/localhost.");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
let a: SupabaseClient;
let b: SupabaseClient;
let aId: string;
let bId: string;
const usuariosCriados: string[] = [];

async function novoUsuario() {
  const email = `contatos-1a-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const criado = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(criado.error).toBeNull();
  const id = criado.data.user!.id;
  usuariosCriados.push(id);
  const cliente = createClient(url, anonKey, opcoes);
  const login = await cliente.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  return { id, cliente };
}

/** Pelo CLI, só contra o banco local; um comando por arquivo. */
function sqlLocal(instrucoes: string[]) {
  for (const sql of instrucoes) {
    const arquivo = join(tmpdir(), `angario-contatos-${randomUUID()}.sql`);
    writeFileSync(arquivo, sql, "utf8");
    try {
      execSync(`npx --no-install supabase db query --db-url "${dbUrl}" -f "${arquivo}"`, { stdio: "pipe", cwd: process.cwd() });
    } finally {
      rmSync(arquivo, { force: true });
    }
  }
}

/** Cadastro pelo caminho REAL do app: o usuário autenticado insere em `imoveis`
    (RLS + grant), e a trigger security definer cria a pessoa/canal/vínculo. */
async function criarImovel(cliente: SupabaseClient, userId: string, codigo: string, nome: string | null, telefone: string | null, extra: Record<string, unknown> = {}) {
  const r = await cliente.from("imoveis").insert({
    user_id: userId, codigo, endereco: `Rua ${codigo}, 10`, status: "Novo contato",
    proprietario_nome: nome, proprietario_telefone: telefone, ...extra,
  }).select("id").single();
  expect(r.error, `insert ${codigo}`).toBeNull();
  return r.data!.id as string;
}

async function legado(imovelId: string) {
  const r = await service.from("imoveis").select("proprietario_nome,proprietario_telefone,proprietario_telefone_canonico,updated_at").eq("id", imovelId).single();
  expect(r.error).toBeNull();
  return r.data!;
}

async function principal(imovelId: string) {
  const r = await service.from("imoveis_contato_principal").select("contato_id,nome,papel,relacao,telefone,telefone_canonico").eq("imovel_id", imovelId).maybeSingle();
  expect(r.error).toBeNull();
  return r.data;
}

async function proprietarios(imovelId: string) {
  const r = await service.from("imoveis_proprietario").select("contato_id,nome,relacao,principal,telefone").eq("imovel_id", imovelId);
  expect(r.error).toBeNull();
  return r.data!;
}

async function contatosDe(userId: string) {
  const r = await service.from("contatos").select("id,nome,origem,metadados").eq("user_id", userId).order("nome");
  expect(r.error).toBeNull();
  return r.data!;
}

async function revisoesDe(userId: string) {
  const r = await service.from("contatos_revisoes").select("tipo,estado,contato_id,imovel_id,evidencia").eq("user_id", userId).order("tipo");
  expect(r.error).toBeNull();
  return r.data!;
}

async function limpar(userIds: string[]) {
  // Vínculos, telefones e revisões caem em cascata pelos contatos/imóveis.
  await service.from("contatos").delete().in("user_id", userIds);
  await service.from("imoveis").delete().in("user_id", userIds);
  await service.from("log_eventos").delete().in("user_id", userIds);
}

beforeAll(async () => {
  const ua = await novoUsuario();
  a = ua.cliente; aId = ua.id;
  const ub = await novoUsuario();
  b = ub.cliente; bId = ub.id;
});

afterAll(async () => {
  await limpar([aId, bId]);
  for (const id of usuariosCriados) {
    expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

describe("1–2. pessoa e canais", () => {
  it("cadastro legado cria a pessoa com UM canal ativo principal, sem `contato_id` no imóvel", async () => {
    await limpar([aId]);
    const imovel = await criarImovel(a, aId, "P-1", "Ana", "(43) 99999-0001");
    const p = await principal(imovel);
    expect(p).toMatchObject({ nome: "Ana", papel: "proprietario", telefone: "(43) 99999-0001", telefone_canonico: "4399990001" });
    const colunas = await service.from("imoveis").select("*").eq("id", imovel).single();
    expect(Object.keys(colunas.data!)).not.toContain("contato_id");
  });

  it("uma pessoa pode ter vários telefones; só um principal ativo; o antigo fica no histórico", async () => {
    const imovel = await criarImovel(a, aId, "P-2", "Beto", "43999990002");
    const contatoId = (await principal(imovel))!.contato_id;
    const segundo = await service.from("contatos_telefones").insert({ contato_id: contatoId, user_id: aId, telefone: "43988880002", principal: false, motivo: "cadastro" });
    expect(segundo.error).toBeNull();
    const doisPrincipais = await service.from("contatos_telefones").insert({ contato_id: contatoId, user_id: aId, telefone: "43977770002", principal: true, motivo: "cadastro" });
    expect(doisPrincipais.error?.code).toBe("23505");
    const historico = await service.from("contatos_telefones").select("telefone_canonico,principal,desativado_em").eq("contato_id", contatoId).order("telefone_canonico");
    expect(historico.data!.map((t) => [t.telefone_canonico, t.principal])).toEqual([["4388880002", false], ["4399990002", true]]);
  });
});

describe("3–4. canal ativo único por conta, livre entre contas", () => {
  it("o mesmo número ativo não resolve para duas pessoas na mesma conta", async () => {
    const outra = await service.from("contatos").insert({ user_id: aId, nome: "Homônima de número", origem: "indicado" }).select("id").single();
    const dup = await service.from("contatos_telefones").insert({ contato_id: outra.data!.id, user_id: aId, telefone: "43 99999-0002", motivo: "cadastro" });
    expect(dup.error?.code).toBe("23505");
  });

  it("o mesmo número é permitido em outra conta (tenant)", async () => {
    await limpar([bId]);
    const imovelB = await criarImovel(b, bId, "P-1B", "Ana da conta B", "43999990001");
    expect((await principal(imovelB))!.telefone_canonico).toBe("4399990001");
    expect((await principal(imovelB))!.nome).toBe("Ana da conta B");
  });
});

describe("5–9. vínculos N:N, papel ≠ principal, sem telefone, histórico", () => {
  it("um imóvel com vários contatos e um contato em vários imóveis; a filha vira principal sem ser proprietária", async () => {
    const casa = await criarImovel(a, aId, "V-1", "Dona Célia", "43999990005");
    const galpao = await criarImovel(a, aId, "V-2", "Dona Célia", "43999990005");
    const celia = (await principal(casa))!.contato_id;
    expect((await principal(galpao))!.contato_id).toBe(celia); // mesma pessoa, dois imóveis

    const filha = await service.from("contatos").insert({ user_id: aId, nome: "Marina", origem: "indicado" }).select("id").single();
    expect((await service.from("contatos_telefones").insert({ contato_id: filha.data!.id, user_id: aId, telefone: "43966660005", motivo: "indicado-por-terceiro" })).error).toBeNull();
    expect((await service.from("imoveis_contatos").update({ principal: false }).eq("imovel_id", casa).eq("contato_id", celia)).error).toBeNull();
    expect((await service.from("imoveis_contatos").insert({ imovel_id: casa, contato_id: filha.data!.id, user_id: aId, papel: "contato", relacao: "filha", principal: true, origem: "indicado" })).error).toBeNull();

    expect(await principal(casa)).toMatchObject({ nome: "Marina", papel: "contato", relacao: "filha", telefone: "43966660005" });
    expect(await proprietarios(casa)).toEqual([expect.objectContaining({ nome: "Dona Célia", principal: false })]);
    // Projeção: quem recebe mensagem é a filha; o dono continua o dono.
    expect(await legado(casa)).toMatchObject({ proprietario_nome: "Marina", proprietario_telefone: "43966660005" });
    expect(await legado(galpao)).toMatchObject({ proprietario_nome: "Dona Célia" });
  });

  it("principal sem telefone é permitido e projeta telefone NULO; encerrar o vínculo preserva o histórico e volta ao dono", async () => {
    const casa = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "V-1").single()).data!.id;
    const marina = (await principal(casa))!.contato_id;
    expect((await service.from("contatos_telefones").update({ desativado_em: new Date().toISOString(), motivo: "numero-errado" }).eq("contato_id", marina)).error).toBeNull();
    expect(await legado(casa)).toMatchObject({ proprietario_nome: "Marina", proprietario_telefone: null, proprietario_telefone_canonico: null });

    expect((await service.from("imoveis_contatos").update({ encerrado_em: new Date().toISOString(), encerramento_motivo: "não fala mais pela mãe" }).eq("imovel_id", casa).eq("contato_id", marina)).error).toBeNull();
    const vinculos = await service.from("imoveis_contatos").select("contato_id,encerrado_em").eq("imovel_id", casa);
    expect(vinculos.data).toHaveLength(2); // nada foi apagado
    expect(await principal(casa)).toBeNull();
    // Sem principal, fallback explícito ao único proprietário vigente.
    expect(await legado(casa)).toMatchObject({ proprietario_nome: "Dona Célia", proprietario_telefone: "43999990005" });
  });

  it("FK composta por tenant: vínculo com imóvel de A e user_id de B é recusado", async () => {
    const casa = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "V-1").single()).data!.id;
    const contatoB = (await contatosDe(bId))[0].id;
    const r = await service.from("imoveis_contatos").insert({ imovel_id: casa, contato_id: contatoB, user_id: bId, papel: "contato", origem: "indicado" });
    expect(r.error?.code).toBe("23503");
  });
});

describe("10–13. backfill classificado (sem nome, sem agrupar por nome, ambíguo → revisão, idempotente)", () => {
  const codigos = ["BF-A", "BF-B1", "BF-B2", "BF-C1", "BF-C2", "BF-D1", "BF-D2", "BF-E", "BF-F"];

  it("classifica A/B/C/D/E/F sem tocar em proprietario_* e é idempotente", async () => {
    await limpar([aId]);
    await criarImovel(a, aId, "BF-A", "Alice", "43999990101");
    await criarImovel(a, aId, "BF-B1", "Bruno", "43999990102");
    await criarImovel(a, aId, "BF-B2", " BRÚNO", "+55 43 99999-0102");
    await criarImovel(a, aId, "BF-C1", "Carlos", "43999990103");
    await criarImovel(a, aId, "BF-C2", "Carlos Silva", "43999990103");
    await criarImovel(a, aId, "BF-D1", "Dora", null);
    await criarImovel(a, aId, "BF-D2", "Dora", "");
    await criarImovel(a, aId, "BF-E", null, null);
    await criarImovel(a, aId, "BF-F", "Fábio", "123");
    // Simula o legado anterior à migration: apaga o modelo novo com a projeção
    // desligada (senão, sem candidato, a projeção anularia as colunas — regra I4).
    sqlLocal([`do $$ begin
      perform set_config('angario.contatos_backfill', '1', true);
      delete from public.contatos where user_id = '${aId}';
    end $$;`]);
    expect(await contatosDe(aId)).toHaveLength(0);
    const antes = await service.from("imoveis").select("codigo,proprietario_nome,proprietario_telefone,updated_at").eq("user_id", aId).order("codigo");
    expect(antes.data!.find((i) => i.codigo === "BF-A")!.proprietario_telefone).toBe("43999990101");

    sqlLocal([`select private.backfill_contatos('${aId}');`]);

    const depois = await service.from("imoveis").select("codigo,proprietario_nome,proprietario_telefone,updated_at").eq("user_id", aId).order("codigo");
    expect(depois.data).toEqual(antes.data); // byte a byte, inclusive updated_at

    const contatos = await contatosDe(aId);
    expect(contatos.map((c) => [c.nome, c.origem])).toEqual([
      ["Alice", "backfill-telefone"],
      ["BRÚNO", "backfill-telefone"],       // classe B: um só nome normalizado → uma pessoa (nome mais recente)
      ["Carlos Silva", "backfill-telefone"], // classe C: uma pessoa + revisão
      ["Dora", "backfill-imovel"],           // classe D: uma pessoa POR IMÓVEL…
      ["Dora", "backfill-imovel"],           // …nunca agrupada por nome
      ["Fábio", "backfill-imovel"],          // classe F
    ]);
    expect(contatos.find((c) => c.nome === "Carlos Silva")!.metadados).toEqual({ nomes_alternativos: ["Carlos", "Carlos Silva"] });
    expect(contatos.find((c) => c.nome === "Fábio")!.metadados).toEqual({ telefone_implausivel: "123" });

    const revisoes = await revisoesDe(aId);
    expect(revisoes).toHaveLength(1);
    expect(revisoes[0]).toMatchObject({ tipo: "nome-divergente-backfill", estado: "pendente", imovel_id: null });
    expect(revisoes[0].evidencia.nomes).toEqual(["Carlos", "Carlos Silva"]);

    const vinculos = await service.from("imoveis_contatos").select("imovel_id").eq("user_id", aId);
    expect(vinculos.data).toHaveLength(codigos.length - 1); // BF-E fica sem vínculo

    // Paridade: todo imóvel com canônico tem principal com o mesmo canônico.
    const comTelefone = await service.from("imoveis").select("id,proprietario_telefone_canonico").eq("user_id", aId).not("proprietario_telefone_canonico", "is", null);
    for (const i of comTelefone.data!) {
      expect((await principal(i.id))!.telefone_canonico).toBe(i.proprietario_telefone_canonico);
    }

    // Idempotente: reexecutar não cria nada.
    sqlLocal([`select private.backfill_contatos('${aId}');`]);
    expect(await contatosDe(aId)).toHaveLength(6);
    expect(await revisoesDe(aId)).toHaveLength(1);
    expect((await service.from("imoveis_contatos").select("id").eq("user_id", aId)).data).toHaveLength(codigos.length - 1);
  });
});

describe("14–15. compatibilidade: projeção e INSERT legado", () => {
  it("INSERT com telefone já ativo e nome diferente vincula à MESMA pessoa, não renomeia e abre revisão", async () => {
    const carlos = (await contatosDe(aId)).find((c) => c.nome === "Carlos Silva")!;
    const novo = await criarImovel(a, aId, "I-1", "C. Silva", "43 99999-0103");
    expect((await principal(novo))!.contato_id).toBe(carlos.id);
    expect((await contatosDe(aId)).filter((c) => c.nome === "C. Silva")).toHaveLength(0);
    expect((await revisoesDe(aId)).find((r) => r.tipo === "nome-divergente-importacao")).toMatchObject({ imovel_id: novo, contato_id: carlos.id });
    // A projeção não mexe no nome deste imóvel enquanto a dúvida existir.
    expect(await legado(novo)).toMatchObject({ proprietario_nome: "C. Silva" });
  });

  it("projeção só escreve quando o valor muda (updated_at intacto) e propaga correção de número a todos os imóveis da pessoa", async () => {
    const bruno = (await contatosDe(aId)).find((c) => c.nome === "BRÚNO")!;
    const imoveis = (await service.from("imoveis").select("id,codigo,updated_at").eq("user_id", aId).in("codigo", ["BF-B1", "BF-B2"]).order("codigo")).data!;
    expect((await service.from("contatos").update({ observacoes: "sem efeito na projeção" }).eq("id", bruno.id)).error).toBeNull();
    for (const i of imoveis) expect((await legado(i.id)).updated_at).toBe(i.updated_at);
    // 12. Tocar o nome com o MESMO valor: a primeira vez alinha o legado ("Bruno" → "BRÚNO"); a segunda não escreve nada.
    expect((await service.from("contatos").update({ nome: "BRÚNO" }).eq("id", bruno.id)).error).toBeNull();
    const alinhados = (await service.from("imoveis").select("id,updated_at,proprietario_nome").eq("user_id", aId).in("codigo", ["BF-B1", "BF-B2"]).order("codigo")).data!;
    expect(alinhados.every((i) => i.proprietario_nome === "BRÚNO")).toBe(true);
    expect((await service.from("contatos").update({ nome: "BRÚNO" }).eq("id", bruno.id)).error).toBeNull();
    for (const i of alinhados) expect((await legado(i.id)).updated_at).toBe(i.updated_at);

    expect((await service.from("contatos_telefones").update({ desativado_em: new Date().toISOString(), motivo: "corrigido" }).eq("contato_id", bruno.id)).error).toBeNull();
    expect((await service.from("contatos_telefones").insert({ contato_id: bruno.id, user_id: aId, telefone: "43 98888-0102", principal: true, motivo: "corrigido" })).error).toBeNull();
    for (const i of imoveis) expect(await legado(i.id)).toMatchObject({ proprietario_telefone: "43 98888-0102", proprietario_telefone_canonico: "4388880102" });
  });
});

describe("UPDATE legado (decisão de 21/09/2026): aceito, registrado, nunca decidido", () => {
  it("mudar o telefone pelo modal atual mantém o modelo novo e abre UMA revisão com histórico", async () => {
    const alice = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "BF-A").single()).data!.id;
    const contatoId = (await principal(alice))!.contato_id;
    expect((await a.from("imoveis").update({ proprietario_telefone: "43966660101" }).eq("id", alice)).error).toBeNull();
    expect((await a.from("imoveis").update({ proprietario_telefone: "43955550101" }).eq("id", alice)).error).toBeNull();
    expect(await legado(alice)).toMatchObject({ proprietario_telefone: "43955550101" });
    expect((await principal(alice))!.telefone_canonico).toBe("4399990101"); // canal intocado
    const rev = (await revisoesDe(aId)).filter((r) => r.tipo === "telefone-alterado-legado" && r.imovel_id === alice);
    expect(rev).toHaveLength(1);
    expect(rev[0]).toMatchObject({ contato_id: contatoId, estado: "pendente" });
    expect(rev[0].evidencia).toMatchObject({ telefone_anterior: "43966660101", telefone_novo: "43955550101", origem: "update-legado" });
    expect(rev[0].evidencia.historico).toHaveLength(1);
  });

  it("mudar o nome abre revisão de nome; salvar sem mudar nome/telefone (upsert do Pipeline) não abre nada", async () => {
    const alice = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "BF-A").single()).data!.id;
    expect((await a.from("imoveis").update({ proprietario_nome: "Alice Renomeada" }).eq("id", alice)).error).toBeNull();
    expect((await principal(alice))!.nome).toBe("Alice");
    const antes = (await revisoesDe(aId)).length;
    expect((await a.from("imoveis").update({ status: "Sem resposta", proprietario_nome: "Alice Renomeada", proprietario_telefone: "43955550101" }).eq("id", alice)).error).toBeNull();
    expect((await revisoesDe(aId)).length).toBe(antes);
    expect((await revisoesDe(aId)).some((r) => r.tipo === "nome-alterado-legado" && r.imovel_id === alice)).toBe(true);
  });

  it("imóvel sem nenhum vínculo que ganha nome/telefone depois recebe o primeiro contato (regra do INSERT)", async () => {
    const vazio = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "BF-E").single()).data!.id;
    expect(await principal(vazio)).toBeNull();
    expect((await a.from("imoveis").update({ proprietario_nome: "Eva", proprietario_telefone: "43944440001" }).eq("id", vazio)).error).toBeNull();
    expect(await principal(vazio)).toMatchObject({ nome: "Eva", telefone_canonico: "4344440001", papel: "proprietario" });
  });
});

describe("correção final: telefone não autoriza nome (C2)", () => {
  it("1. pessoa sem nome + INSERT legado com o mesmo número e um nome: nome continua NULL e abre nome-divergente-importacao", async () => {
    const soNumero = await criarImovel(a, aId, "NN-1", null, "43933330001", { pre_cadastro: true });
    const contatoId = (await principal(soNumero))!.contato_id;
    expect((await principal(soNumero))!.nome).toBeNull();
    const comNome = await criarImovel(a, aId, "NN-2", "Maria", "43 93333-0001");
    expect((await principal(comNome))!.contato_id).toBe(contatoId); // mesmo canal → mesma resolução
    expect((await principal(comNome))!.nome).toBeNull();             // …mas nenhum nome inferido
    expect((await revisoesDe(aId)).find((r) => r.tipo === "nome-divergente-importacao" && r.imovel_id === comNome)).toMatchObject({
      contato_id: contatoId, estado: "pendente", evidencia: expect.objectContaining({ nome_informado: "Maria", nome_contato: null }),
    });
    expect(await legado(comNome)).toMatchObject({ proprietario_nome: "Maria" }); // o legado guarda o que foi digitado
  });

  it("2. pessoa sem nome + UPDATE legado de nome: nome continua NULL e abre nome-alterado-legado", async () => {
    const soNumero = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "NN-1").single()).data!.id;
    expect((await a.from("imoveis").update({ proprietario_nome: "Zé" }).eq("id", soNumero)).error).toBeNull();
    expect((await principal(soNumero))!.nome).toBeNull();
    expect(await legado(soNumero)).toMatchObject({ proprietario_nome: "Zé" });
    expect((await revisoesDe(aId)).find((r) => r.tipo === "nome-alterado-legado" && r.imovel_id === soNumero)).toMatchObject({
      estado: "pendente", evidencia: expect.objectContaining({ nome_anterior: null, nome_novo: "Zé", nome_contato: null }),
    });
  });
});

describe("correção final: exclusão, escopo e unicidade das revisões (C1, I1, relacionado)", () => {
  it("3. duas revisões do mesmo tipo/pessoa em dois imóveis + DELETE dos dois pelo usuário: sem 23505, revisões vão junto, pessoa fica", async () => {
    const i1 = await criarImovel(a, aId, "DL-1", "Dono", "43922220001");
    const i2 = await criarImovel(a, aId, "DL-2", "Dono", "43922220001");
    const dono = (await principal(i1))!.contato_id;
    expect((await a.from("imoveis").update({ proprietario_telefone: "43922220002" }).eq("id", i1)).error).toBeNull();
    expect((await a.from("imoveis").update({ proprietario_telefone: "43922220003" }).eq("id", i2)).error).toBeNull();
    expect((await revisoesDe(aId)).filter((r) => r.contato_id === dono && r.tipo === "telefone-alterado-legado")).toHaveLength(2);
    const exclusao = await a.from("imoveis").delete().in("id", [i1, i2]).select("id");
    expect(exclusao.error).toBeNull();
    expect(exclusao.data).toHaveLength(2);
    expect((await revisoesDe(aId)).filter((r) => r.contato_id === dono)).toHaveLength(0);
    expect((await contatosDe(aId)).some((c) => c.id === dono)).toBe(true);
  });

  it("4. SET NULL de contato_relacionado_id não colide nem perde o dedupe do par vivo; a revisão fica como histórico", async () => {
    const dono = (await contatosDe(aId)).find((c) => c.nome === "Dono")!.id;
    const pares = await service.from("contatos").insert([{ user_id: aId, nome: "Par 1", origem: "indicado" }, { user_id: aId, nome: "Par 2", origem: "indicado" }]).select("id");
    expect(pares.error).toBeNull();
    const [p1, p2] = pares.data!.map((c) => c.id);
    expect((await service.from("contatos_revisoes").insert([
      { user_id: aId, tipo: "telefone-conflito", contato_id: dono, contato_relacionado_id: p1 },
      { user_id: aId, tipo: "telefone-conflito", contato_id: dono, contato_relacionado_id: p2 },
    ])).error).toBeNull();
    const duplicata = await service.from("contatos_revisoes").insert({ user_id: aId, tipo: "telefone-conflito", contato_id: dono, contato_relacionado_id: p1 });
    expect(duplicata.error?.code).toBe("23505"); // par vivo continua deduplicado
    expect((await service.from("contatos").delete().in("id", [p1, p2])).error).toBeNull(); // limpeza administrativa
    const restantes = await service.from("contatos_revisoes").select("contato_relacionado_id,estado").eq("user_id", aId).eq("tipo", "telefone-conflito").eq("contato_id", dono);
    expect(restantes.error).toBeNull();
    expect(restantes.data).toHaveLength(2); // histórico preservado, sem colisão
    expect(restantes.data!.every((r) => r.contato_relacionado_id === null && r.estado === "pendente")).toBe(true);
  });

  it("10–11. revisão só de nome deixa o telefone projetável; revisão só de telefone deixa o nome projetável; escopo é do imóvel", async () => {
    const x1 = await criarImovel(a, aId, "ESC-1", "Tres", "43911110003");
    const x2 = await criarImovel(a, aId, "ESC-2", "Tres", "43911110003");
    const tres = (await principal(x1))!.contato_id;
    expect((await a.from("imoveis").update({ proprietario_nome: "Tres Editado" }).eq("id", x1)).error).toBeNull();   // revisão de NOME só em x1
    expect((await a.from("imoveis").update({ proprietario_telefone: "43900001111" }).eq("id", x2)).error).toBeNull(); // revisão de TELEFONE só em x2
    // Nome da pessoa muda: x1 congelado (nome em revisão), x2 acompanha.
    expect((await service.from("contatos").update({ nome: "Tres Corrigido" }).eq("id", tres)).error).toBeNull();
    expect(await legado(x1)).toMatchObject({ proprietario_nome: "Tres Editado" });
    expect(await legado(x2)).toMatchObject({ proprietario_nome: "Tres Corrigido" });
    // Número da pessoa muda: x2 congelado (telefone em revisão), x1 acompanha.
    expect((await service.from("contatos_telefones").update({ desativado_em: new Date().toISOString(), motivo: "corrigido" }).eq("contato_id", tres)).error).toBeNull();
    expect((await service.from("contatos_telefones").insert({ contato_id: tres, user_id: aId, telefone: "43922223333", principal: true, motivo: "corrigido" })).error).toBeNull();
    expect(await legado(x1)).toMatchObject({ proprietario_telefone: "43922223333" });
    expect(await legado(x2)).toMatchObject({ proprietario_telefone: "43900001111" });
  });
});

describe("correção final: projeção sem candidato inequívoco (I4)", () => {
  it("7. sem principal + zero proprietário: legado vira NULL nas dimensões não congeladas", async () => {
    const z = await criarImovel(a, aId, "Z-1", "Zero", "43911110001");
    expect((await service.from("imoveis_contatos").update({ encerrado_em: new Date().toISOString(), encerramento_motivo: "saiu" }).eq("imovel_id", z)).error).toBeNull();
    expect(await legado(z)).toMatchObject({ proprietario_nome: null, proprietario_telefone: null, proprietario_telefone_canonico: null });
  });

  it("8. sem principal + dois proprietários: legado vira NULL, sem escolher por updated_at/ordem/nome/id", async () => {
    const z = await criarImovel(a, aId, "Z-2", "Dois A", "43911110002");
    const b2 = await service.from("contatos").insert({ user_id: aId, nome: "Dois B", origem: "indicado" }).select("id").single();
    expect((await service.from("imoveis_contatos").insert({ imovel_id: z, contato_id: b2.data!.id, user_id: aId, papel: "proprietario", principal: false, origem: "indicado" })).error).toBeNull();
    expect(await legado(z)).toMatchObject({ proprietario_nome: "Dois A" }); // ainda há principal
    expect((await service.from("imoveis_contatos").update({ principal: false }).eq("imovel_id", z)).error).toBeNull();
    expect(await legado(z)).toMatchObject({ proprietario_nome: null, proprietario_telefone: null });
    expect(await proprietarios(z)).toHaveLength(2);
  });

  it("7b. dimensão congelada por revisão não é anulada: revisão de nome pendente mantém o nome, telefone vira NULL", async () => {
    const z = await criarImovel(a, aId, "Z-3", "Tres", "43911110004");
    expect((await a.from("imoveis").update({ proprietario_nome: "Tres Editado" }).eq("id", z)).error).toBeNull();
    expect((await service.from("imoveis_contatos").update({ encerrado_em: new Date().toISOString(), encerramento_motivo: "saiu" }).eq("imovel_id", z)).error).toBeNull();
    expect(await legado(z)).toMatchObject({ proprietario_nome: "Tres Editado", proprietario_telefone: null });
  });
});

describe("correção final: backfill nunca desfaz decisão humana nem funde por canal (I2, I3)", () => {
  it("5. vínculo encerrado + reexecução do backfill: vínculo NÃO recriado", async () => {
    const im = await criarImovel(a, aId, "ENC-1", "Encerrada", "43955550005");
    expect((await service.from("imoveis_contatos").update({ encerrado_em: new Date().toISOString(), encerramento_motivo: "desvinculado pelo corretor" }).eq("imovel_id", im)).error).toBeNull();
    sqlLocal([`select private.backfill_contatos('${aId}');`]);
    const vinculos = await service.from("imoveis_contatos").select("encerrado_em").eq("imovel_id", im);
    expect(vinculos.data).toHaveLength(1);
    expect(vinculos.data![0].encerrado_em).not.toBeNull();
    expect(await legado(im)).toMatchObject({ proprietario_nome: null, proprietario_telefone: null }); // I4: sem candidato
  });

  it("6. número já ativo em outra pessoa + nome divergente no backfill: canal reaproveitado, revisão por imóvel, nome não sobrescrito", async () => {
    const bruno = (await contatosDe(aId)).find((c) => c.nome === "BRÚNO")!;
    // Estado legado simulado numa transação só (projeção desligada): imóvel com o número do Bruno e outro nome, sem vínculo.
    sqlLocal([`do $$
      declare v_id uuid;
      begin
        perform set_config('angario.contatos_backfill', '1', true);
        insert into public.imoveis (user_id, codigo, endereco, status, proprietario_nome, proprietario_telefone)
        values ('${aId}', 'RX-1', 'Rua RX, 1', 'Novo contato', 'Bruno Outro', '43988880102') returning id into v_id;
        delete from public.imoveis_contatos where imovel_id = v_id;
        delete from public.contatos_revisoes where imovel_id = v_id;
      end $$;`]);
    const rx = (await service.from("imoveis").select("id").eq("user_id", aId).eq("codigo", "RX-1").single()).data!.id;
    expect(await principal(rx)).toBeNull();
    sqlLocal([`select private.backfill_contatos('${aId}');`]);
    expect((await principal(rx))!.contato_id).toBe(bruno.id);
    expect((await contatosDe(aId)).filter((c) => c.nome === "Bruno Outro")).toHaveLength(0);
    expect((await contatosDe(aId)).find((c) => c.id === bruno.id)!.nome).toBe("BRÚNO");
    expect((await revisoesDe(aId)).find((r) => r.tipo === "nome-divergente-importacao" && r.imovel_id === rx)).toMatchObject({
      contato_id: bruno.id, evidencia: expect.objectContaining({ nome_informado: "Bruno Outro", nome_contato: "BRÚNO", origem: "backfill-reexecucao" }),
    });
    expect(await legado(rx)).toMatchObject({ proprietario_nome: "Bruno Outro" });
  });
});

describe("16–18. RLS, grants e ausência de hard delete pelo browser", () => {
  it("cada conta só enxerga as próprias pessoas, canais, vínculos, revisões e views", async () => {
    for (const tabela of ["contatos", "contatos_telefones", "imoveis_contatos", "contatos_revisoes", "imoveis_contato_principal", "imoveis_proprietario"]) {
      const deA = await a.from(tabela).select("user_id");
      const deB = await b.from(tabela).select("user_id");
      expect(deA.error, tabela).toBeNull();
      expect(deB.error, tabela).toBeNull();
      expect(deA.data!.length, `${tabela} visível para A`).toBeGreaterThan(0);
      expect(deA.data!.every((l) => l.user_id === aId), tabela).toBe(true);
      expect(deB.data!.every((l) => l.user_id === bId), tabela).toBe(true);
    }
  });

  it("o browser não insere, altera nem apaga nada nas quatro tabelas (grant negado, mesmo sendo o dono)", async () => {
    const contato = (await contatosDe(aId))[0];
    const insercao = await a.from("contatos").insert({ user_id: aId, nome: "Intruso", origem: "cadastro" });
    expect(insercao.error?.code).toBe("42501");
    const alteracao = await a.from("contatos").update({ nome: "Renomeado" }).eq("id", contato.id).select("id");
    expect(alteracao.error?.code ?? (alteracao.data?.length === 0 ? "42501" : "ok")).toBe("42501");
    const exclusao = await a.from("imoveis_contatos").delete().eq("user_id", aId).select("id");
    expect(exclusao.error?.code ?? (exclusao.data?.length === 0 ? "42501" : "ok")).toBe("42501");
    expect((await contatosDe(aId)).find((c) => c.id === contato.id)!.nome).toBe(contato.nome);
  });
});

describe("19. M3/M4 continua lendo uma projeção legada válida", () => {
  it("proprietario_telefone_canonico agrupa os imóveis da mesma pessoa exatamente como o vínculo agrupa", async () => {
    const porCanonico = await service.from("imoveis").select("id,proprietario_telefone_canonico").eq("user_id", aId).not("proprietario_telefone_canonico", "is", null);
    const grupos = new Map<string, string[]>();
    for (const i of porCanonico.data!) grupos.set(i.proprietario_telefone_canonico, [...(grupos.get(i.proprietario_telefone_canonico) ?? []), i.id]);
    for (const [canonico, ids] of grupos) {
      const principais = await Promise.all(ids.map((id) => principal(id)));
      const semRevisaoDeTelefone = principais.filter((p) => p !== null && p.telefone_canonico === canonico);
      // Toda linha cujo número legado não está em revisão aponta o mesmo canal do principal.
      expect(semRevisaoDeTelefone.length + (await revisoesDe(aId)).filter((r) => r.tipo === "telefone-alterado-legado" && ids.includes(r.imovel_id as string)).length).toBe(ids.length);
    }
  });
});
