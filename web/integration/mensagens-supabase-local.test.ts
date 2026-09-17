import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração de mensagens requer Supabase LOCAL e chaves locais explícitas.");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
let a: SupabaseClient;
let b: SupabaseClient;
let aId: string;
let bId: string;
const usuariosCriados: string[] = [];
const futuro = "2099-09-17T12:00:00.000Z";

async function novoUsuario() {
  const email = `mensagens-m1-${randomUUID()}@example.invalid`;
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

async function criarImovel(cliente: SupabaseClient, userId: string, sufixo: string) {
  const resultado = await cliente.from("imoveis").insert({
    user_id: userId,
    endereco: `Rua Local ${sufixo}, 10`,
    status: "Publicado",
    proprietario_nome: `Proprietário ${sufixo}`,
    proprietario_telefone: "43999999999",
  }).select("id").single();
  expect(resultado.error).toBeNull();
  return resultado.data!.id as string;
}

async function criarAgenda(cliente: SupabaseClient, userId: string, imovelId: string) {
  const resultado = await cliente.from("agenda").insert({
    user_id: userId,
    title: "Verificar disponibilidade",
    type: "Follow-up",
    date: "2099-09-17",
    imovel_id: imovelId,
    is_verificacao_disponibilidade: true,
  }).select("id").single();
  expect(resultado.error).toBeNull();
  return resultado.data!.id as string;
}

function mensagemBase(userId: string, imovelId: string) {
  return {
    user_id: userId,
    imovel_id: imovelId,
    nome_proprietario: "valor substituído pelo trigger",
    telefone: "43999999999",
    mensagem: "Mensagem de teste local",
    data_envio: futuro,
    status: "agendada",
  };
}

beforeAll(async () => {
  const usuarioA = await novoUsuario();
  a = usuarioA.cliente;
  aId = usuarioA.id;
  const usuarioB = await novoUsuario();
  b = usuarioB.cliente;
  bId = usuarioB.id;
});

beforeEach(async () => {
  expect((await service.from("mensagens_agendadas").delete().in("user_id", [aId, bId])).error).toBeNull();
  expect((await service.from("agenda").delete().in("user_id", [aId, bId])).error).toBeNull();
  expect((await service.from("imoveis").delete().in("user_id", [aId, bId])).error).toBeNull();
});

afterAll(async () => {
  await service.from("mensagens_agendadas").delete().in("user_id", [aId, bId]);
  await service.from("agenda").delete().in("user_id", [aId, bId]);
  await service.from("imoveis").delete().in("user_id", [aId, bId]);
  for (const id of usuariosCriados) {
    expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

describe("M1 de mensagens no PostgreSQL + PostgREST locais", () => {
  it("mantém mensagem livre e registro legado sem agenda legíveis", async () => {
    const imovelId = await criarImovel(a, aId, "A");
    const criada = await a.from("mensagens_agendadas")
      .insert(mensagemBase(aId, imovelId))
      .select("tipo,agenda_id,cancelamento_motivo,cancelamento_origem,cancelada_em")
      .single();

    expect(criada.error).toBeNull();
    expect(criada.data).toEqual({
      tipo: "livre",
      agenda_id: null,
      cancelamento_motivo: null,
      cancelamento_origem: null,
      cancelada_em: null,
    });
  });

  it("vincula a mensagem de disponibilidade à agenda do mesmo usuário", async () => {
    const imovelId = await criarImovel(a, aId, "A");
    const agendaId = await criarAgenda(a, aId, imovelId);
    const criada = await a.from("mensagens_agendadas").insert({
      ...mensagemBase(aId, imovelId),
      tipo: "verificacao-disponibilidade",
      agenda_id: agendaId,
    }).select("tipo,agenda_id").single();

    expect(criada.error).toBeNull();
    expect(criada.data).toEqual({ tipo: "verificacao-disponibilidade", agenda_id: agendaId });
  });

  it("rejeita vínculo de agenda entre usuários até para service role", async () => {
    const imovelA = await criarImovel(a, aId, "A");
    const imovelB = await criarImovel(b, bId, "B");
    const agendaB = await criarAgenda(b, bId, imovelB);

    const navegador = await a.from("mensagens_agendadas").insert({
      ...mensagemBase(aId, imovelA),
      tipo: "verificacao-disponibilidade",
      agenda_id: agendaB,
    });
    expect(navegador.error?.code).toBe("42501");

    const privilegiada = await service.from("mensagens_agendadas").insert({
      ...mensagemBase(aId, imovelA),
      tipo: "verificacao-disponibilidade",
      agenda_id: agendaB,
    });
    expect(privilegiada.error?.code).toBe("23503");
  });

  it("audita cancelamento do usuário e impede origem privilegiada forjada", async () => {
    const imovelId = await criarImovel(a, aId, "A");
    const criada = await a.from("mensagens_agendadas")
      .insert(mensagemBase(aId, imovelId)).select("id").single();
    expect(criada.error).toBeNull();
    const instante = "2026-09-17T15:00:00.000Z";

    const cancelada = await a.from("mensagens_agendadas").update({
      status: "cancelada",
      cancelamento_motivo: "usuario",
      cancelamento_origem: "usuario",
      cancelada_em: instante,
    }).eq("id", criada.data!.id)
      .select("status,cancelamento_motivo,cancelamento_origem,cancelada_em").single();
    expect(cancelada.error).toBeNull();
    expect(cancelada.data).toMatchObject({
      status: "cancelada",
      cancelamento_motivo: "usuario",
      cancelamento_origem: "usuario",
    });
    expect(Date.parse(cancelada.data!.cancelada_em)).toBe(Date.parse(instante));

    const outra = await a.from("mensagens_agendadas")
      .insert(mensagemBase(aId, imovelId)).select("id").single();
    expect(outra.error).toBeNull();
    const forjada = await a.from("mensagens_agendadas").update({
      status: "cancelada",
      cancelamento_motivo: "imovel-indisponivel",
      cancelamento_origem: "worker",
      cancelada_em: instante,
    }).eq("id", outra.data!.id);
    expect(forjada.error?.code).toBe("42501");
  });

  it("mantém RLS por usuário e limpa somente agenda_id ao excluir a agenda", async () => {
    const imovelA = await criarImovel(a, aId, "A");
    const agendaA = await criarAgenda(a, aId, imovelA);
    const criada = await a.from("mensagens_agendadas").insert({
      ...mensagemBase(aId, imovelA),
      tipo: "verificacao-disponibilidade",
      agenda_id: agendaA,
    }).select("id").single();
    expect(criada.error).toBeNull();

    expect((await b.from("mensagens_agendadas").select("id").eq("id", criada.data!.id)).data).toEqual([]);
    expect((await a.from("agenda").delete().eq("id", agendaA)).error).toBeNull();
    const preservada = await a.from("mensagens_agendadas")
      .select("user_id,agenda_id,tipo").eq("id", criada.data!.id).single();
    expect(preservada.error).toBeNull();
    expect(preservada.data).toEqual({
      user_id: aId,
      agenda_id: null,
      tipo: "verificacao-disponibilidade",
    });
  });

  it("aceita linha cancelada legada sem auditoria, mas rejeita auditoria parcial", async () => {
    const imovelId = await criarImovel(a, aId, "A");
    const legada = await service.from("mensagens_agendadas").insert({
      ...mensagemBase(aId, imovelId),
      status: "cancelada",
    }).select("tipo,status,cancelamento_motivo,cancelamento_origem,cancelada_em").single();
    expect(legada.error).toBeNull();
    expect(legada.data).toEqual({
      tipo: "livre",
      status: "cancelada",
      cancelamento_motivo: null,
      cancelamento_origem: null,
      cancelada_em: null,
    });

    const incompleta = await service.from("mensagens_agendadas").insert({
      ...mensagemBase(aId, imovelId),
      status: "cancelada",
      cancelamento_motivo: "usuario",
    });
    expect(incompleta.error?.code).toBe("23514");
  });
});
