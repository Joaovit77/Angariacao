/* Retirados, Fase C / C1 no PostgreSQL + PostgREST locais: quando e por que o
   imóvel saiu da carteira (migration 20261002210000_retirada_data_motivo.sql).

   O que é provado aqui, contra o banco de verdade:
   - o botão atual ("Retirar da carteira" grava só `retirado = true`) continua
     funcionando e ganha a data de hoje (Brasília), sem motivo;
   - a retirada com data, motivo e observação grava o que veio;
   - reativar apaga os três campos;
   - imóvel fora de Retirados não aceita data, motivo nem observação; motivo
     fora da lista é recusado; "outro" exige observação; vale também para o
     service role;
   - salvar o cadastro (upsert com o payload REAL do `toDbImovel`) não apaga a
     data nem o motivo, nem quando o imóvel é novo (linha proposta);
   - a retirada não escreve no `status_history`;
   - os triggers que já reagiam a `retirado` (M3/M4 e retomada do B2) seguem
     iguais;
   - outro usuário não lê nem altera;
   - um retirado LEGADO (sem data, motivo nem observação) continua sem data
     depois de qualquer edição: o banco nunca fabrica a data de hoje para uma
     retirada que já existia;
   - o dia carimbado é o de Brasília, qualquer que seja o fuso da sessão.

   Como rodar (banco local com o baseline + migrations até a 20261002210000):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     LOCAL_SUPABASE_DB_CONTAINER=supabase_db_<projeto> \
     node node_modules/vitest/vitest.mjs run --config vitest.retirada-dados-supabase-local.config.ts */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração da retirada requer Supabase LOCAL e chaves locais explícitas.");
}
const container = process.env.LOCAL_SUPABASE_DB_CONTAINER || "";
if (!/^supabase_db_[\w-]+$/.test(container)) {
  throw new Error("Integração da retirada requer LOCAL_SUPABASE_DB_CONTAINER (container do banco local).");
}

/** SQL direto no banco local: é o único jeito de escolher o fuso da sessão. */
function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1"],
    { input: `set client_min_messages = warning;\n${sql}`, encoding: "utf8" },
  ).trim();
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const usuariosCriados: string[] = [];
let aId: string;
let bId: string;
let a: SupabaseClient;
let b: SupabaseClient;

const FUTURO = "2099-10-01T12:00:00.000Z";
const CHECK = "23514";

type Linha = Record<string, unknown> & { id: string };

/** O dia civil de hoje em Brasília, como o banco o calcula. */
function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function novoUsuario() {
  const email = `retirada-c1-${randomUUID()}@example.invalid`;
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

/** Por padrão: Publicado e ainda na carteira (o caso que pode ser retirado). */
async function novoImovel(userId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await service
    .from("imoveis")
    .insert({
      user_id: userId,
      endereco: `Rua Retirada ${randomUUID().slice(0, 8)}, 10`,
      status: "Publicado",
      retirado: false,
      proprietario_nome: "Proprietária Local",
      proprietario_telefone: "43988887777",
      ...extra,
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

async function ler(id: string): Promise<Linha> {
  const r = await service.from("imoveis").select("*").eq("id", id).single();
  expect(r.error).toBeNull();
  return r.data as Linha;
}

async function atualizar(cliente: SupabaseClient, id: string, dados: Record<string, unknown>) {
  return cliente.from("imoveis").update(dados).eq("id", id).select("id");
}

function dadosRetirada(l: Linha) {
  return { retirado: l.retirado, retirado_em: l.retirado_em, retirado_motivo: l.retirado_motivo, retirado_observacao: l.retirado_observacao };
}

beforeAll(async () => {
  ({ id: aId, cliente: a } = await novoUsuario());
  ({ id: bId, cliente: b } = await novoUsuario());
});

afterAll(async () => {
  await service.from("mensagens_agendadas").delete().in("user_id", usuariosCriados);
  await service.from("agenda").delete().in("user_id", usuariosCriados);
  await service.from("log_eventos").delete().in("user_id", usuariosCriados);
  await service.from("imoveis").delete().in("user_id", usuariosCriados);
  for (const id of usuariosCriados) await service.auth.admin.deleteUser(id);
});

/* ================================================================
   RETIRAR E REATIVAR
   ================================================================ */
describe("retirar", () => {
  it("o botão atual (só `retirado = true`) ganha a data de hoje em Brasília, sem motivo", async () => {
    const imovel = await novoImovel(aId);
    const r = await atualizar(a, imovel, { retirado: true });
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
    expect(dadosRetirada(await ler(imovel))).toEqual({
      retirado: true,
      retirado_em: hojeBrasilia(),
      retirado_motivo: null,
      retirado_observacao: null,
    });
  });

  it("a retirada com data, motivo e observação grava o que veio (observação aparada)", async () => {
    const imovel = await novoImovel(aId);
    const r = await atualizar(a, imovel, {
      retirado: true,
      retirado_em: "2026-10-01",
      retirado_motivo: "reservado-outra-imobiliaria",
      retirado_observacao: "  Reserva feita pela outra imobiliária  ",
    });
    expect(r.error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toEqual({
      retirado: true,
      retirado_em: "2026-10-01",
      retirado_motivo: "reservado-outra-imobiliaria",
      retirado_observacao: "Reserva feita pela outra imobiliária",
    });
  });

  it.each([
    "locado-proprietario",
    "locado-outra-imobiliaria",
    "reservado-outra-imobiliaria",
    "vendido",
    "desistiu",
    "nao-e-mais-proprietario",
  ])("aceita o motivo %s", async (motivo) => {
    const imovel = await novoImovel(aId);
    expect((await atualizar(a, imovel, { retirado: true, retirado_motivo: motivo })).error).toBeNull();
    expect((await ler(imovel)).retirado_motivo).toBe(motivo);
  });

  it("um imóvel já retirado pode ter o motivo corrigido; a data fica", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, { retirado: true, retirado_em: "2026-09-21" });
    const r = await atualizar(a, imovel, { retirado_motivo: "locado-proprietario" });
    expect(r.error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toMatchObject({ retirado_em: "2026-09-21", retirado_motivo: "locado-proprietario" });
  });

  it("não escreve no status_history nem muda o status", async () => {
    const imovel = await novoImovel(aId);
    const antes = await ler(imovel);
    await atualizar(a, imovel, { retirado: true, retirado_motivo: "vendido" });
    const depois = await ler(imovel);
    expect(depois.status).toBe(antes.status);
    expect(depois.status_history).toEqual(antes.status_history);
  });
});

describe("reativar", () => {
  it("apaga data, motivo e observação", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, { retirado: true, retirado_motivo: "outro", retirado_observacao: "Mudou de ideia" });
    const r = await atualizar(a, imovel, { retirado: false });
    expect(r.error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toEqual({
      retirado: false,
      retirado_em: null,
      retirado_motivo: null,
      retirado_observacao: null,
    });
  });

  it("apaga mesmo quando a reativação manda os valores antigos junto, sem falhar nos checks", async () => {
    const imovel = await novoImovel(aId);
    const antigos = { retirado_em: "2026-09-21", retirado_motivo: "outro", retirado_observacao: "Mudou de ideia" };
    await atualizar(a, imovel, { retirado: true, ...antigos });
    expect((await atualizar(a, imovel, { retirado: false, ...antigos })).error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toEqual({
      retirado: false,
      retirado_em: null,
      retirado_motivo: null,
      retirado_observacao: null,
    });
  });

  it("a próxima retirada começa do zero (data nova, sem o motivo antigo)", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, { retirado: true, retirado_em: "2026-01-10", retirado_motivo: "vendido" });
    await atualizar(a, imovel, { retirado: false });
    await atualizar(a, imovel, { retirado: true });
    expect(dadosRetirada(await ler(imovel))).toMatchObject({ retirado_em: hojeBrasilia(), retirado_motivo: null });
  });
});

/* ================================================================
   RETIRADO LEGADO (existia antes da coluna)
   ================================================================ */
/** Um retirado como os de Production antes do C1: marca ligada e os três
    campos vazios. Gravado com os triggers desligados, como se a linha já
    existisse quando a migration rodou, para não depender da regra do INSERT. */
function retiradoLegado(userId: string): string {
  const id = randomUUID();
  psql(
    "set session_replication_role = replica;\n" +
      `insert into public.imoveis (id, user_id, endereco, status, retirado, proprietario_nome, proprietario_telefone, status_history)\n` +
      `values ('${id}', '${userId}', 'Rua Legado ${id.slice(0, 8)}, 1', 'Publicado', true, 'Proprietária Local', '43988887777',\n` +
      `  '[{"status":"Angariado","date":"2026-08-03"},{"status":"Publicado","date":"2026-08-10"}]'::jsonb);\n` +
      "set session_replication_role = origin;",
  );
  return id;
}

const VAZIO = { retirado: true, retirado_em: null, retirado_motivo: null, retirado_observacao: null };

describe("retirado legado", () => {
  it("nasce com os três campos vazios", async () => {
    expect(dadosRetirada(await ler(retiradoLegado(aId)))).toEqual(VAZIO);
  });

  it("UPDATE de um campo comum não fabrica a data de hoje", async () => {
    const imovel = retiradoLegado(aId);
    const r = await atualizar(a, imovel, { bairro: "Centro", valor_aluguel: 1800 });
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
    const depois = await ler(imovel);
    expect(depois.bairro).toBe("Centro");
    expect(dadosRetirada(depois)).toEqual(VAZIO);
  });

  it("UPDATE true → true com data null continua null", async () => {
    const imovel = retiradoLegado(aId);
    expect((await atualizar(a, imovel, { retirado: true, retirado_em: null })).error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toEqual(VAZIO);
  });

  it("salvar o cadastro (payload real do toDbImovel) não cria data nem motivo", async () => {
    const imovel = retiradoLegado(aId);
    const carregado = fromDbImovel((await ler(imovel)) as unknown as DbImovelRow);
    const r = await a.from("imoveis").upsert(toDbImovel({ ...carregado, observacoes: "Editado no cadastro" }, aId));
    expect(r.error).toBeNull();
    const depois = await ler(imovel);
    expect(depois.observacoes).toBe("Editado no cadastro");
    expect(dadosRetirada(depois)).toEqual(VAZIO);
  });

  it("aceita motivo e data informados depois (como o C5 vai fazer)", async () => {
    const imovel = retiradoLegado(aId);
    const r = await atualizar(a, imovel, { retirado_em: "2026-10-01", retirado_motivo: "reservado-outra-imobiliaria" });
    expect(r.error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toMatchObject({ retirado_em: "2026-10-01", retirado_motivo: "reservado-outra-imobiliaria" });
  });
});

/* ================================================================
   FUSO
   ================================================================ */
describe("fuso", () => {
  // Kiritimati (UTC+14) e GMT-12 ficam a 17 h e a 9 h de Brasília: em
  // qualquer hora do dia, pelo menos um dos dois está noutro dia civil. Se o
  // carimbo seguisse o fuso da sessão (ou o `current_date`), um deles erraria.
  it.each(["Pacific/Kiritimati", "Etc/GMT+12", "UTC"])(
    "a data carimbada é o dia de Brasília mesmo com a sessão em %s",
    async (fuso) => {
      const imovel = await novoImovel(aId);
      const carimbo = psql(
        `set timezone = '${fuso}';\n` +
          `update public.imoveis set retirado = true where id = '${imovel}';\n` +
          `select retirado_em from public.imoveis where id = '${imovel}';`,
      );
      expect(carimbo).toBe(hojeBrasilia());
    },
  );

  it("o par de fusos do teste cobre o dia todo (um deles está noutro dia civil agora)", () => {
    const dias = ["Pacific/Kiritimati", "Etc/GMT+12"].map((fuso) => psql(`set timezone = '${fuso}';\nselect current_date;`));
    expect(dias.some((dia) => dia !== hojeBrasilia())).toBe(true);
  });
});

/* ================================================================
   REGRAS DO BANCO
   ================================================================ */
describe("coerência", () => {
  it.each([
    ["data", { retirado_em: "2026-10-01" }],
    ["motivo", { retirado_motivo: "vendido" }],
    ["observação", { retirado_observacao: "texto" }],
  ])("imóvel na carteira não aceita %s de retirada", async (_nome, dados) => {
    const imovel = await novoImovel(aId);
    const r = await atualizar(a, imovel, dados);
    expect(r.error?.code).toBe(CHECK);
    expect(dadosRetirada(await ler(imovel))).toMatchObject({ retirado: false, retirado_em: null, retirado_motivo: null, retirado_observacao: null });
  });

  it.each([
    ["data", { retirado_em: "2026-10-01" }],
    ["motivo", { retirado_motivo: "vendido" }],
    ["observação", { retirado_observacao: "texto" }],
  ])("insert fora de Retirados com %s é recusado", async (_nome, dados) => {
    const r = await service
      .from("imoveis")
      .insert({ user_id: aId, endereco: "Rua Incoerente, 1", status: "Publicado", retirado: false, ...dados });
    expect(r.error?.code).toBe(CHECK);
  });

  it("motivo diferente de 'outro' não exige observação", async () => {
    const imovel = await novoImovel(aId);
    expect((await atualizar(a, imovel, { retirado: true, retirado_motivo: "desistiu" })).error).toBeNull();
    expect(dadosRetirada(await ler(imovel))).toMatchObject({ retirado_motivo: "desistiu", retirado_observacao: null });
  });

  it.each(["nao-informado", "Vendido", "perdido", ""])("motivo fora da lista (%j) é recusado", async (motivo) => {
    const imovel = await novoImovel(aId);
    const r = await atualizar(a, imovel, { retirado: true, retirado_motivo: motivo });
    expect(r.error?.code).toBe(CHECK);
    expect((await ler(imovel)).retirado).toBe(false);
  });

  it.each([
    ["sem observação", {}],
    ["com observação null", { retirado_observacao: null }],
    ["com observação vazia", { retirado_observacao: "" }],
    ["com observação só de espaços", { retirado_observacao: "   " }],
  ])("'outro' %s é recusado", async (_nome, extra) => {
    const imovel = await novoImovel(aId);
    const r = await atualizar(a, imovel, { retirado: true, retirado_motivo: "outro", ...extra });
    expect(r.error?.code).toBe(CHECK);
    expect((await ler(imovel)).retirado).toBe(false);
  });

  it("insert já retirado (carga antiga) apara a observação e não inventa data", async () => {
    const r = await service
      .from("imoveis")
      .insert({
        user_id: aId, endereco: "Rua Carga Antiga, 2", status: "Publicado", retirado: true,
        retirado_motivo: "outro", retirado_observacao: "  Saiu antes do sistema  ",
      })
      .select("*")
      .single();
    expect(r.error).toBeNull();
    expect(dadosRetirada(r.data as Linha)).toEqual({
      retirado: true,
      retirado_em: null,
      retirado_motivo: "outro",
      retirado_observacao: "Saiu antes do sistema",
    });
  });

  it("'outro' com observação é aceito", async () => {
    const imovel = await novoImovel(aId);
    expect((await atualizar(a, imovel, { retirado: true, retirado_motivo: "outro", retirado_observacao: "Imóvel não está mais disponível" })).error).toBeNull();
  });

  it.each([
    ["ASCII", "x"],
    ["acentuados (2 bytes cada)", "é"],
  ])("observação com exatamente 1000 caracteres %s é aceita (conta caractere, não byte)", async (_nome, letra) => {
    const imovel = await novoImovel(aId);
    const texto = letra.repeat(1000);
    expect((await atualizar(a, imovel, { retirado: true, retirado_observacao: texto })).error).toBeNull();
    expect((await ler(imovel)).retirado_observacao).toBe(texto);
  });

  it("observação acima de 1000 caracteres é recusada", async () => {
    const imovel = await novoImovel(aId);
    const r = await atualizar(a, imovel, { retirado: true, retirado_observacao: "x".repeat(1001) });
    expect(r.error?.code).toBe(CHECK);
  });

  it("o service role também é barrado", async () => {
    const imovel = await novoImovel(aId);
    expect((await atualizar(service, imovel, { retirado: true, retirado_motivo: "nao-informado" })).error?.code).toBe(CHECK);
    expect((await atualizar(service, imovel, { retirado_motivo: "vendido" })).error?.code).toBe(CHECK);
  });
});

/* ================================================================
   CADASTRO (UPSERT DA LINHA INTEIRA)
   ================================================================ */
describe("salvar o cadastro", () => {
  it("o payload real do toDbImovel não apaga data, motivo nem observação", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, {
      retirado: true,
      retirado_em: "2026-09-23",
      retirado_motivo: "locado-outra-imobiliaria",
      retirado_observacao: "Fechou com a outra",
    });
    const carregado = fromDbImovel((await ler(imovel)) as unknown as DbImovelRow);
    const editado = { ...carregado, proprietarioTelefone: "43977776666" };
    const payload = toDbImovel(editado, aId);
    expect(Object.keys(payload).filter((k) => k.startsWith("retirado_"))).toEqual([]);

    const r = await a.from("imoveis").upsert(payload);
    expect(r.error).toBeNull();
    const depois = await ler(imovel);
    expect(depois.proprietario_telefone).toBe("43977776666");
    expect(dadosRetirada(depois)).toEqual({
      retirado: true,
      retirado_em: "2026-09-23",
      retirado_motivo: "locado-outra-imobiliaria",
      retirado_observacao: "Fechou com a outra",
    });
  });

  it("um imóvel NOVO criado pelo upsert já retirado nasce sem data (não se sabe quando saiu)", async () => {
    const id = randomUUID();
    const base = fromDbImovel((await ler(await novoImovel(aId))) as unknown as DbImovelRow);
    const payload = toDbImovel({ ...base, id, endereco: "Rua Upsert Novo, 5", retirado: true, statusHistory: [] }, aId);
    const r = await a.from("imoveis").upsert(payload);
    expect(r.error).toBeNull();
    expect(dadosRetirada(await ler(id))).toEqual({ retirado: true, retirado_em: null, retirado_motivo: null, retirado_observacao: null });
  });
});

/* ================================================================
   O QUE JÁ REAGIA A `retirado`
   ================================================================ */
describe("triggers existentes", () => {
  it("M3/M4: retirar continua cancelando a verificação agendada (imovel-indisponivel)", async () => {
    const imovel = await novoImovel(aId);
    const m = await service
      .from("mensagens_agendadas")
      .insert({
        user_id: aId, imovel_id: imovel, tipo: "verificacao-disponibilidade",
        nome_proprietario: "x", telefone: "43999999999", mensagem: "Disponível?", data_envio: FUTURO, status: "agendada",
      })
      .select("id")
      .single();
    expect(m.error).toBeNull();
    await atualizar(a, imovel, { retirado: true, retirado_motivo: "vendido" });
    const linha = await service.from("mensagens_agendadas").select("status, cancelamento_motivo").eq("id", m.data!.id).single();
    expect(linha.data).toEqual({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
  });

  it("B2: reativar continua cancelando a retomada agendada (imovel-reativado) e limpa a retirada", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, { retirado: true, retirado_motivo: "locado-proprietario" });
    const m = await service
      .from("mensagens_agendadas")
      .insert({
        user_id: aId, imovel_id: imovel, tipo: "retomada-retirado",
        nome_proprietario: "x", telefone: "43999999999", mensagem: "Quer voltar?", data_envio: FUTURO, status: "agendada",
      })
      .select("id")
      .single();
    expect(m.error).toBeNull();
    await atualizar(a, imovel, { retirado: false });
    const linha = await service.from("mensagens_agendadas").select("status, cancelamento_motivo").eq("id", m.data!.id).single();
    expect(linha.data).toEqual({ status: "cancelada", cancelamento_motivo: "imovel-reativado" });
    expect((await ler(imovel)).retirado_motivo).toBeNull();
  });
});

/* ================================================================
   RLS
   ================================================================ */
describe("outro usuário", () => {
  it("não altera a retirada de quem não é dono", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, { retirado: true, retirado_motivo: "vendido" });
    const r = await atualizar(b, imovel, { retirado_motivo: "desistiu" });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
    expect((await ler(imovel)).retirado_motivo).toBe("vendido");
  });

  it("não lê os campos de quem não é dono", async () => {
    const imovel = await novoImovel(aId);
    await atualizar(a, imovel, { retirado: true, retirado_motivo: "vendido" });
    const r = await b.from("imoveis").select("retirado_motivo").eq("id", imovel);
    expect(r.data).toEqual([]);
    expect(bId).not.toBe(aId);
  });
});
