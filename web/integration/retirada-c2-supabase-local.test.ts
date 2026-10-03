/* Retirados, Fase C / C2 no PostgreSQL + PostgREST locais: as gravações REAIS
   da janela de retirada (`definirRetiradoDaCarteira`, `editarRetiradaDaCarteira`)
   contra o banco migrado com o C1, por um usuário autenticado (RLS).

   O que é provado aqui:
   - retirar grava marca, data, motivo, observação e a nota num único update,
     sem mexer em status nem histórico de status;
   - a data é a de Brasília e a observação chega aparada;
   - D4: uma escrita concorrente (nota do webhook) entre a leitura e a gravação
     faz o update condicional por `updated_at` não casar linha; a retirada não
     é aplicada e a nota concorrente fica intacta (retirar e reativar);
   - corrida de estado: imóvel retirado ou reativado por outra aba não é
     regravado;
   - editar a retirada de um legado sem data mantém a data null;
   - reativar: o banco (C1) limpa os campos e a nota registra a retirada;
   - M3/M4 e B2 continuam reagindo à marca.

   Como rodar (banco local com o baseline + migrations até a 20261002210000):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     node node_modules/vitest/vitest.mjs run --config vitest.retirada-c2-supabase-local.config.ts */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração do C2 requer Supabase LOCAL e chaves locais explícitas.");
}

const estado = vi.hoisted(() => ({
  cliente: null as unknown,
  userId: "",
  /** Roda logo depois da leitura do retrato, antes do update: a "outra aba". */
  depoisDaLeitura: null as null | (() => Promise<void>),
  toasts: [] as { texto: string; tipo?: string }[],
}));

/** O cliente autenticado, com um gancho entre a leitura (`maybeSingle`) e a
    gravação da retirada, para encaixar uma escrita concorrente de verdade. */
function clienteComGancho(base: SupabaseClient): SupabaseClient {
  return {
    from: (tabela: string) => {
      const consulta = base.from(tabela);
      if (tabela !== "imoveis") return consulta;
      const select = consulta.select.bind(consulta);
      (consulta as unknown as { select: unknown }).select = (...args: Parameters<typeof select>) => {
        const filtro = select(...args) as unknown as Record<string, (...a: unknown[]) => unknown>;
        const eq = filtro.eq.bind(filtro);
        filtro.eq = (...e: unknown[]) => {
          const comFiltro = eq(...e) as Record<string, (...a: unknown[]) => unknown>;
          const maybeSingle = comFiltro.maybeSingle.bind(comFiltro);
          comFiltro.maybeSingle = async () => {
            const lido = await maybeSingle();
            const gancho = estado.depoisDaLeitura;
            estado.depoisDaLeitura = null;
            if (gancho) await gancho();
            return lido;
          };
          return comFiltro;
        };
        return filtro;
      };
      return consulta;
    },
  } as unknown as SupabaseClient;
}

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => estado.cliente }));
vi.mock("@/lib/toast", () => ({ toast: (texto: string, tipo?: string) => estado.toasts.push({ texto, tipo }) }));
vi.mock("@/lib/googleAgenda", () => ({ sincronizarCompromisso: async () => ({ ok: true }) }));
vi.mock("@/lib/persistencia/cidadePadrao", () => ({
  carregarCidadePadraoDaConta: async () => ({ origem: "nenhuma", cidade: null, uf: null }),
}));
vi.mock("@/lib/repasses", () => ({ carregarRepasses: async () => [] }));
vi.mock("@/lib/persistencia/carregarEstado", async () => {
  const { fromDbImovel } = await import("@/lib/persistencia/mapeadores");
  const { useAppStore } = await import("@/lib/store");
  return {
    carregarEstado: async () => {
      const atual = useAppStore.getState();
      const r = await (estado.cliente as SupabaseClient).from("imoveis").select("*").eq("user_id", estado.userId);
      return {
        imoveis: (r.data || []).map((l) => fromDbImovel(l as never)),
        agenda: atual.agenda,
        metas: atual.metas,
        abordagens: atual.abordagens,
        protocolos: atual.protocolos,
        config: atual.config,
      };
    },
  };
});

import { AVISO_CONFLITO_RETIRADA, definirRetiradoDaCarteira, editarRetiradaDaCarteira } from "@/lib/mutacoes";
import { fromDbImovel } from "@/lib/persistencia/mapeadores";
import { useAppStore } from "@/lib/store";

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const usuarios: string[] = [];
let uid: string;
const FUTURO = "2099-10-01T12:00:00.000Z";
const HIST = [
  { status: "Novo contato", date: "2026-08-01" },
  { status: "Angariado", date: "2026-08-03" },
  { status: "Publicado", date: "2026-08-10" },
];
const NOTA_INICIAL = { id: "n-inicial", texto: "Proprietária atende de manhã.", data: "2026-08-02T10:00" };
const NOTA_WEBHOOK = { id: "wa:CONCORRENTE", texto: "Resposta pelo WhatsApp: ainda está disponível?", data: "2026-10-02T21:59" };

type Linha = Record<string, unknown> & { id: string };

function hojeBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function ler(id: string): Promise<Linha> {
  const r = await service.from("imoveis").select("*").eq("id", id).single();
  expect(r.error).toBeNull();
  return r.data as Linha;
}

/** Imóvel captado do usuário, já no store, como depois de um carregamento. */
async function novoImovel(extra: Record<string, unknown> = {}): Promise<string> {
  const r = await service
    .from("imoveis")
    .insert({
      user_id: uid,
      endereco: `Rua C2 ${randomUUID().slice(0, 8)}, 10`,
      status: "Publicado",
      retirado: false,
      proprietario_nome: "Proprietária Local",
      proprietario_telefone: "43988887777",
      status_history: HIST,
      notas: [NOTA_INICIAL],
      ...extra,
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  const id = r.data!.id as string;
  await sincronizarStore(id);
  return id;
}

async function sincronizarStore(id: string): Promise<void> {
  const linha = await ler(id);
  useAppStore.setState({ imoveis: [fromDbImovel(linha as never)], agenda: [] });
}

async function notaConcorrente(id: string): Promise<void> {
  const atual = await ler(id);
  const r = await service.from("imoveis").update({ notas: [...((atual.notas as unknown[]) || []), NOTA_WEBHOOK] }).eq("id", id);
  expect(r.error).toBeNull();
}

const erros = () => estado.toasts.filter((t) => t.tipo === "error").map((t) => t.texto);
const sucessos = () => estado.toasts.filter((t) => t.tipo !== "error");
const textos = (l: Linha) => ((l.notas as { texto: string }[]) || []).map((n) => n.texto);

beforeAll(async () => {
  const email = `retirada-c2-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const c = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(c.error).toBeNull();
  uid = c.data.user!.id;
  usuarios.push(uid);
  const cliente = createClient(url, anonKey, opcoes);
  expect((await cliente.auth.signInWithPassword({ email, password })).error).toBeNull();
  estado.cliente = clienteComGancho(cliente);
  estado.userId = uid;
});

beforeEach(() => {
  estado.toasts = [];
  estado.depoisDaLeitura = null;
});

afterAll(async () => {
  await service.from("mensagens_agendadas").delete().in("user_id", usuarios);
  await service.from("agenda").delete().in("user_id", usuarios);
  await service.from("log_eventos").delete().in("user_id", usuarios);
  await service.from("imoveis").delete().in("user_id", usuarios);
  for (const id of usuarios) await service.auth.admin.deleteUser(id);
});

describe("retirar pela janela", () => {
  it("um update grava marca, data, motivo, observação aparada e nota; status e histórico ficam", async () => {
    const id = await novoImovel();
    const antes = await ler(id);
    const ok = await definirRetiradoDaCarteira(id, true, uid, {
      motivo: "reservado-outra-imobiliaria",
      observacao: "  Reserva feita pela outra imobiliária  ",
      data: "2026-10-01",
    });
    expect(ok).toBe(true);
    const depois = await ler(id);
    expect(depois).toMatchObject({
      retirado: true,
      retirado_em: "2026-10-01",
      retirado_motivo: "reservado-outra-imobiliaria",
      retirado_observacao: "Reserva feita pela outra imobiliária",
      status: "Publicado",
    });
    expect(depois.status_history).toEqual(antes.status_history);
    expect(textos(depois)).toEqual([
      NOTA_INICIAL.texto,
      "Retirado da carteira em 01/10/2026. Motivo: Reservado por outra imobiliária. Observação: Reserva feita pela outra imobiliária",
    ]);
    expect(depois.updated_at).not.toBe(antes.updated_at);
    expect(useAppStore.getState().imoveis[0]).toMatchObject({ retirado: true, retiradoMotivo: "reservado-outra-imobiliaria" });
  });

  it("'outro' com observação, na data de hoje em Brasília", async () => {
    const id = await novoImovel();
    const hoje = hojeBrasilia();
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "outro", observacao: "Mudou de país", data: hoje })).toBe(true);
    expect(await ler(id)).toMatchObject({ retirado_em: hoje, retirado_motivo: "outro", retirado_observacao: "Mudou de país" });
  });

  it("M3/M4: retirar pela janela continua cancelando a verificação agendada", async () => {
    const id = await novoImovel();
    const m = await service.from("mensagens_agendadas").insert({
      user_id: uid, imovel_id: id, tipo: "verificacao-disponibilidade",
      nome_proprietario: "x", telefone: "43999999999", mensagem: "Disponível?", data_envio: FUTURO, status: "agendada",
    }).select("id").single();
    expect(m.error).toBeNull();
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "vendido", observacao: null, data: hojeBrasilia() })).toBe(true);
    const l = await service.from("mensagens_agendadas").select("status, cancelamento_motivo").eq("id", m.data!.id).single();
    expect(l.data).toEqual({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
  });
});

describe("D4: concorrência sem perda", () => {
  it("retirar: nota do webhook entre a leitura e a gravação → 0 linhas, nada aplicado, a nota fica", async () => {
    const id = await novoImovel();
    estado.depoisDaLeitura = () => notaConcorrente(id);
    const ok = await definirRetiradoDaCarteira(id, true, uid, { motivo: "vendido", observacao: null, data: hojeBrasilia() });
    expect(ok).toBe(false);
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
    expect(sucessos()).toEqual([]);
    const depois = await ler(id);
    expect(depois).toMatchObject({ retirado: false, retirado_em: null, retirado_motivo: null });
    expect(textos(depois)).toEqual([NOTA_INICIAL.texto, NOTA_WEBHOOK.texto]);
  });

  it("reativar: a mesma garantia", async () => {
    const id = await novoImovel();
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "vendido", observacao: null, data: "2026-09-21" })).toBe(true);
    await sincronizarStore(id);
    estado.toasts = [];
    estado.depoisDaLeitura = () => notaConcorrente(id);
    expect(await definirRetiradoDaCarteira(id, false, uid)).toBe(false);
    const depois = await ler(id);
    expect(depois).toMatchObject({ retirado: true, retirado_em: "2026-09-21", retirado_motivo: "vendido" });
    expect(textos(depois).at(-1)).toBe(NOTA_WEBHOOK.texto);
    expect(textos(depois).some((t) => t.startsWith("Reativado"))).toBe(false);
  });

  it("sem concorrência a mesma retirada passa (a versão lida casa)", async () => {
    const id = await novoImovel();
    await notaConcorrente(id); // antes da leitura: entra no retrato
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "vendido", observacao: null, data: hojeBrasilia() })).toBe(true);
    const depois = await ler(id);
    expect(textos(depois)).toEqual([NOTA_INICIAL.texto, NOTA_WEBHOOK.texto, expect.stringMatching(/^Retirado da carteira/)]);
  });
});

describe("corrida de estado", () => {
  it("retirado por outra aba antes da leitura: nem grava", async () => {
    const id = await novoImovel();
    await service.from("imoveis").update({ retirado: true }).eq("id", id);
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "desistiu", observacao: null, data: hojeBrasilia() })).toBe(false);
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
    expect((await ler(id)).retirado_motivo).toBeNull();
  });

  it("retirado por outra aba entre a leitura e a gravação: 0 linhas", async () => {
    const id = await novoImovel();
    estado.depoisDaLeitura = async () => { await service.from("imoveis").update({ retirado: true }).eq("id", id); };
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "desistiu", observacao: null, data: hojeBrasilia() })).toBe(false);
    expect((await ler(id)).retirado_motivo).toBeNull();
  });

  it("editar depois de outra aba reativar: 0 linhas, nada gravado", async () => {
    const id = await novoImovel({ retirado: true });
    await service.from("imoveis").update({ retirado: false }).eq("id", id);
    expect(await editarRetiradaDaCarteira(id, { motivo: "vendido", observacao: null, data: null })).toBe(false);
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
    expect(await ler(id)).toMatchObject({ retirado: false, retirado_motivo: null });
  });
});

describe("editar retirada", () => {
  it("legado sem data: grava o motivo e a data continua null; nada além das três colunas", async () => {
    const id = await novoImovel({ retirado: true }); // INSERT já retirado: sem data (D5A)
    const antes = await ler(id);
    expect(antes.retirado_em).toBeNull();
    expect(await editarRetiradaDaCarteira(id, { motivo: "reservado-outra-imobiliaria", observacao: null, data: null })).toBe(true);
    const depois = await ler(id);
    expect(depois).toMatchObject({ retirado: true, retirado_em: null, retirado_motivo: "reservado-outra-imobiliaria", status: "Publicado" });
    expect(depois.notas).toEqual(antes.notas);
    expect(depois.status_history).toEqual(antes.status_history);
  });

  it("corrige data e observação de uma retirada com dados", async () => {
    const id = await novoImovel();
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "vendido", observacao: null, data: hojeBrasilia() })).toBe(true);
    await sincronizarStore(id);
    expect(await editarRetiradaDaCarteira(id, { motivo: "locado-outra-imobiliaria", observacao: "Fechou fora", data: "2026-09-15" })).toBe(true);
    expect(await ler(id)).toMatchObject({ retirado_em: "2026-09-15", retirado_motivo: "locado-outra-imobiliaria", retirado_observacao: "Fechou fora" });
  });
});

describe("reativar", () => {
  it("o banco limpa os campos (C1) e a nota registra a retirada encerrada; status fica", async () => {
    const id = await novoImovel();
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "vendido", observacao: "Vendeu", data: "2026-09-21" })).toBe(true);
    await sincronizarStore(id);
    expect(await definirRetiradoDaCarteira(id, false, uid)).toBe(true);
    const depois = await ler(id);
    expect(depois).toMatchObject({ retirado: false, retirado_em: null, retirado_motivo: null, retirado_observacao: null, status: "Publicado" });
    expect(textos(depois).at(-1)).toBe(
      "Reativado na carteira. Retirada encerrada (de 21/09/2026; motivo: Vendido). Observação da retirada: Vendeu",
    );
  });

  it("B2: reativar pela janela continua cancelando a retomada agendada", async () => {
    const id = await novoImovel();
    expect(await definirRetiradoDaCarteira(id, true, uid, { motivo: "locado-proprietario", observacao: null, data: hojeBrasilia() })).toBe(true);
    const m = await service.from("mensagens_agendadas").insert({
      user_id: uid, imovel_id: id, tipo: "retomada-retirado",
      nome_proprietario: "x", telefone: "43999999999", mensagem: "Quer voltar?", data_envio: FUTURO, status: "agendada",
    }).select("id").single();
    expect(m.error).toBeNull();
    await sincronizarStore(id);
    expect(await definirRetiradoDaCarteira(id, false, uid)).toBe(true);
    const l = await service.from("mensagens_agendadas").select("status, cancelamento_motivo").eq("id", m.data!.id).single();
    expect(l.data).toEqual({ status: "cancelada", cancelamento_motivo: "imovel-reativado" });
  });
});
