/* Retirados, Fase B / B3 contra o PostgreSQL + PostgREST locais: a carga
   real de `observarAtribuicao` (canal → contato → vínculos → imóveis →
   envios) leva a resposta a uma retomada ENVIADA para o imóvel retirado,
   e não para o ativo do mesmo dono.

   O contato, o canal e os vínculos nascem do trigger de sincronização da
   Fase 1a-A ao inserir os imóveis: nada é montado à mão. A retomada nasce
   `agendada` (pelas invariantes do B2) e o servidor a marca `enviada`,
   como o worker fará no B5.

   Opt-in, só contra Supabase LOCAL (banco com o B2 aplicado):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     node node_modules/vitest/vitest.mjs run --config vitest.retomada-atribuicao-supabase-local.config.ts */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { agoraISOComSegundos } from "@/lib/datas";
import { observarAtribuicao } from "@/lib/servidor/contatos";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração da atribuição da retomada requer Supabase LOCAL e chaves locais explícitas.");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const usuarios: string[] = [];
let conta: string;
let outraConta: string;

async function novoUsuario(): Promise<string> {
  const criado = await service.auth.admin.createUser({
    email: `retomada-b3-${randomUUID()}@example.invalid`,
    password: randomUUID(),
    email_confirm: true,
  });
  expect(criado.error).toBeNull();
  usuarios.push(criado.data.user!.id);
  return criado.data.user!.id;
}

/** Um telefone por cenário, para cada um ter o seu contato. */
function telefone(): string {
  return `4398${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

async function novoImovel(userId: string, fone: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await service
    .from("imoveis")
    .insert({
      user_id: userId,
      endereco: `Rua B3 ${randomUUID().slice(0, 8)}, 10`,
      status: "Publicado",
      retirado: false,
      proprietario_nome: "Proprietária B3",
      proprietario_telefone: fone,
      ...extra,
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

async function canonico(imovelId: string): Promise<string> {
  const r = await service.from("imoveis").select("proprietario_telefone_canonico").eq("id", imovelId).single();
  expect(r.error).toBeNull();
  return r.data!.proprietario_telefone_canonico as string;
}

/** Cria a mensagem como o app criaria (agendada, futura) e a marca enviada
    duas horas atrás, como o worker marcará. */
async function enviada(userId: string, imovelId: string, tipo: string, horasAtras = 2): Promise<string> {
  const criada = await service
    .from("mensagens_agendadas")
    .insert({
      user_id: userId,
      imovel_id: imovelId,
      tipo,
      nome_proprietario: "x",
      telefone: "43999999999",
      mensagem: "teste local B3",
      data_envio: "2099-10-01T12:00:00.000Z",
      status: "agendada",
    })
    .select("id")
    .single();
  expect(criada.error).toBeNull();
  const id = criada.data!.id as string;
  const enviadoEm = new Date(Date.now() - horasAtras * 3_600_000).toISOString();
  expect((await service.from("mensagens_agendadas").update({ status: "processando" }).eq("id", id)).error).toBeNull();
  expect(
    (await service.from("mensagens_agendadas").update({ status: "enviada", enviado_em: enviadoEm }).eq("id", id)).error,
  ).toBeNull();
  return id;
}

async function observar(userId: string, fone: string, legadoImovelId: string) {
  return observarAtribuicao(service, {
    userId,
    telefoneCanonico: fone,
    texto: "Oi! Tenho interesse, sim.",
    recebidaEm: agoraISOComSegundos(),
    legadoImovelId,
    direcao: "recebida",
  });
}

/** A ativo e retirado, B ativo, mesmo telefone; o retirado nasce ativo e é
    retirado depois, como no app. */
async function cenario(userId = conta) {
  const fone = telefone();
  const a = await novoImovel(userId, fone);
  const b = await novoImovel(userId, fone);
  expect((await service.from("imoveis").update({ retirado: true }).eq("id", a)).error).toBeNull();
  return { a, b, fone: await canonico(a) };
}

beforeAll(async () => {
  conta = await novoUsuario();
  outraConta = await novoUsuario();
});

afterAll(async () => {
  for (const tabela of ["mensagens_agendadas", "imoveis_contatos", "contatos_revisoes", "imoveis", "contatos_telefones", "contatos"]) {
    await service.from(tabela).delete().in("user_id", usuarios);
  }
  for (const id of usuarios) await service.auth.admin.deleteUser(id);
});

describe("B3 com a carga real", () => {
  it("o trigger da Fase 1a-A ligou os dois imóveis ao mesmo contato", async () => {
    const { a, b } = await cenario();
    const v = await service.from("imoveis_contatos").select("imovel_id, contato_id").in("imovel_id", [a, b]).is("encerrado_em", null);
    expect(v.error).toBeNull();
    expect(v.data).toHaveLength(2);
    expect(new Set(v.data!.map((l) => l.contato_id)).size).toBe(1);
  });

  it("sem retomada: B pelo N4, como hoje", async () => {
    const { b, fone } = await cenario();
    expect(await observar(conta, fone, b)).toMatchObject({ estado: "resolvido", novoImovelId: b, nivel: "unico", terminal: false });
  });

  it("retomada enviada a A: A, contexto-retomada, terminal", async () => {
    const { a, b, fone } = await cenario();
    await enviada(conta, a, "retomada-retirado");
    expect(await observar(conta, fone, b)).toMatchObject({
      estado: "resolvido",
      novoImovelId: a,
      nivel: "contexto-retomada",
      terminal: true,
      candidatoIds: [b],
      terminalIds: [a],
    });
  });

  it("concorrência: verificação enviada a B na janela → pendente no nível da retomada", async () => {
    const { a, b, fone } = await cenario();
    await enviada(conta, a, "retomada-retirado");
    await enviada(conta, b, "verificacao-disponibilidade", 1);
    expect(await observar(conta, fone, b)).toMatchObject({ estado: "pendente", nivel: "contexto-retomada", novoImovelId: null });
  });

  it("retomada fora da janela (49 h) não conta", async () => {
    const { a, b, fone } = await cenario();
    await enviada(conta, a, "retomada-retirado", 49);
    expect(await observar(conta, fone, b)).toMatchObject({ novoImovelId: b, nivel: "unico" });
  });

  it("retomada ainda processando não conta", async () => {
    const { a, b, fone } = await cenario();
    const id = await enviada(conta, a, "retomada-retirado");
    // Volta a `processando` direto (estado que o banco permite ao servidor).
    expect((await service.from("mensagens_agendadas").update({ status: "processando", enviado_em: null }).eq("id", id)).error).toBeNull();
    expect(await observar(conta, fone, b)).toMatchObject({ novoImovelId: b, nivel: "unico" });
  });

  it("outra conta com o mesmo telefone não enxerga a retomada desta", async () => {
    const { a, fone } = await cenario();
    await enviada(conta, a, "retomada-retirado");
    const bOutra = await novoImovel(outraConta, fone);
    expect(await observar(outraConta, fone, bOutra)).toMatchObject({ novoImovelId: bOutra, nivel: "unico" });
  });
});
