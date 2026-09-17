import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração do Radar requer Supabase LOCAL e chaves locais explícitas.");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
let a: SupabaseClient;
let b: SupabaseClient;
let aId: string;
let bId: string;
const usuariosCriados: string[] = [];
const instanteManual = "2026-09-17T11:40:00.000Z";
const instanteCron = "2026-09-17T12:00:00.000Z";

async function novoUsuario() {
  const email = `radar-r2-${randomUUID()}@example.invalid`;
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

async function inserirBusca(cliente: SupabaseClient, userId: string, nome: string) {
  return cliente.from("radar_buscas").insert({
    user_id: userId,
    nome,
    filtros: { portal: "olx", cidade: "Londrina", estado: "PR" },
    ultimo_check: instanteManual,
    ultimo_check_origem: "manual",
  }).select().single();
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
  const limpo = await service.from("radar_buscas").delete().in("user_id", [aId, bId]);
  expect(limpo.error).toBeNull();
});

afterAll(async () => {
  await service.from("radar_buscas").delete().in("user_id", [aId, bId]);
  for (const id of usuariosCriados) {
    const removido = await service.auth.admin.deleteUser(id);
    expect(removido.error).toBeNull();
  }
});

describe("R2 do Radar no PostgreSQL + PostgREST locais", () => {
  it("navegador atualiza a coleta geral, mas não o relógio automático", async () => {
    const criada = await inserirBusca(a, aId, "Busca A");
    expect(criada.error).toBeNull();

    const atualizada = await a.from("radar_buscas").update({
      ultimo_check: "2026-09-17T11:50:00.000Z",
      ultimo_check_origem: "navegador",
    }).eq("id", criada.data!.id).select().single();

    expect(atualizada.error).toBeNull();
    expect(atualizada.data).toMatchObject({
      ultimo_check: "2026-09-17T11:50:00+00:00",
      ultimo_check_automatico: null,
      ultimo_check_origem: "navegador",
    });
  });

  it("browser não forja cron nem o relógio automático; service role registra ambos", async () => {
    const criada = await inserirBusca(a, aId, "Busca protegida");
    expect(criada.error).toBeNull();

    const relogioForjado = await a.from("radar_buscas")
      .update({ ultimo_check_automatico: instanteCron }).eq("id", criada.data!.id);
    expect(relogioForjado.error?.code).toBe("42501");
    const origemForjada = await a.from("radar_buscas")
      .update({ ultimo_check_origem: "cron" }).eq("id", criada.data!.id);
    expect(origemForjada.error?.code).toBe("42501");

    const automatica = await service.from("radar_buscas").update({
      ultimo_check: instanteCron,
      ultimo_check_automatico: instanteCron,
      ultimo_check_origem: "cron",
    }).eq("id", criada.data!.id).select().single();
    expect(automatica.error).toBeNull();
    expect(automatica.data).toMatchObject({
      ultimo_check_automatico: "2026-09-17T12:00:00+00:00",
      ultimo_check_origem: "cron",
    });
  });

  it("mantém buscas de contas diferentes isoladas por RLS", async () => {
    const buscaA = await inserirBusca(a, aId, "Busca A");
    const buscaB = await inserirBusca(b, bId, "Busca B");
    expect(buscaA.error).toBeNull();
    expect(buscaB.error).toBeNull();

    expect((await b.from("radar_buscas").select("id").eq("id", buscaA.data!.id)).data).toEqual([]);
    expect((await b.from("radar_buscas").update({ nome: "Invadida" })
      .eq("id", buscaA.data!.id).select()).data).toEqual([]);
    expect((await a.from("radar_buscas").select("nome").order("nome")).data)
      .toEqual([{ nome: "Busca A" }]);
    expect((await b.from("radar_buscas").select("nome").order("nome")).data)
      .toEqual([{ nome: "Busca B" }]);
  });
});
