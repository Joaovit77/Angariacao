/* Retirados, Fase B / B2 no PostgreSQL + PostgREST locais: o banco reconhece
   `retomada-retirado` e protege as invariantes dela (migration
   20261001210000_retomada_retirado_schema.sql).

   O que é provado aqui, contra o banco de verdade:
   - uma retomada só nasce `agendada`, para imóvel do mesmo dono, retirado, no
     status-alvo, com data futura, sem agenda e sem `imoveis_consultados`;
   - no máximo uma retomada ativa (`agendada`/`processando`) por imóvel;
   - nenhuma linha entra nem sai do tipo, e o imóvel dela é fixo; livre ↔
     verificação continua livre;
   - reativar o imóvel ou tirá-lo do status-alvo cancela só as retomadas
     `agendada`, e nunca impede a mudança no imóvel (nem quando o próprio log
     falha);
   - excluir o imóvel nunca falha por causa da retomada;
   - o claim em lote não aborta por causa de uma retomada;
   - M3/M4, consolidação e RLS não mudam.

   Alguns cenários adversariais desligam um trigger por instantes ou gravam
   com `session_replication_role = replica` pelo `psql` do container local,
   para montar estados que o banco recusaria; sempre religados no `finally`.

   Como rodar (banco local com o baseline + migrations até a 20261001210000):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     LOCAL_SUPABASE_DB_CONTAINER=supabase_db_<projeto> \
     node node_modules/vitest/vitest.mjs run --config vitest.retomada-retirado-supabase-local.config.ts */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
const container = process.env.LOCAL_SUPABASE_DB_CONTAINER || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração da retomada requer Supabase LOCAL e chaves locais explícitas.");
}
if (!/^supabase_db_[\w-]+$/.test(container)) {
  throw new Error("Integração da retomada requer LOCAL_SUPABASE_DB_CONTAINER (container do banco local).");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const usuariosCriados: string[] = [];
let aId: string;
let bId: string;
let a: SupabaseClient;
let b: SupabaseClient;

const RETOMADA = "retomada-retirado";
const FUTURO = "2099-10-01T12:00:00.000Z";
const OUTRO_FUTURO = "2099-11-15T12:00:00.000Z";
const PASSADO = "2000-01-01T12:00:00.000Z";

type Linha = Record<string, unknown> & { id: string };

/* ----------------------------------------------------------------
   Acesso direto ao banco local
   ---------------------------------------------------------------- */
const argsPsql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];

function psql(sql: string): string {
  return execFileSync("docker", argsPsql, { input: `set client_min_messages = warning;\n${sql}`, encoding: "utf8" });
}

/** Grava sem disparar trigger nenhum: só para montar estados adversariais. */
function psqlSemTriggers(sql: string): string {
  return psql(`set session_replication_role = replica;\n${sql}\nset session_replication_role = origin;`);
}

/* ----------------------------------------------------------------
   Dados
   ---------------------------------------------------------------- */
async function novoUsuario() {
  const email = `retomada-b2-${randomUUID()}@example.invalid`;
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

/** Por padrão: retirado e Publicado, o caso que aceita retomada. */
async function novoImovel(userId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await service
    .from("imoveis")
    .insert({
      user_id: userId,
      endereco: `Rua Retomada ${randomUUID().slice(0, 8)}, 10`,
      status: "Publicado",
      retirado: true,
      proprietario_nome: "Proprietária Local",
      proprietario_telefone: "43988887777",
      ...extra,
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

function linha(userId: string, imovelId: string | null, extra: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    imovel_id: imovelId,
    tipo: RETOMADA,
    nome_proprietario: "substituído pelo trigger",
    telefone: "43999999999",
    mensagem: "Retomada de teste local",
    data_envio: FUTURO,
    status: "agendada",
    ...extra,
  };
}

async function inserir(cliente: SupabaseClient, dados: Record<string, unknown>) {
  return cliente.from("mensagens_agendadas").insert(dados).select("*").single();
}

async function novaRetomada(userId: string, imovelId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await inserir(service, linha(userId, imovelId, extra));
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

async function novaMensagem(userId: string, imovelId: string, tipo: "livre" | "verificacao-disponibilidade"): Promise<string> {
  const r = await inserir(service, linha(userId, imovelId, { tipo }));
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

async function ler(id: string): Promise<Linha> {
  const r = await service.from("mensagens_agendadas").select("*").eq("id", id).single();
  expect(r.error).toBeNull();
  return r.data as Linha;
}

/** Status de uma linha mudado pelo servidor (worker, claim): a validação não roda. */
async function marcar(id: string, status: string, extra: Record<string, unknown> = {}) {
  const r = await service.from("mensagens_agendadas").update({ status, ...extra }).eq("id", id);
  expect(r.error).toBeNull();
}

function intacta(antes: Linha, depois: Linha) {
  for (const coluna of ["status", "tipo", "imovel_id", "cancelamento_motivo", "cancelamento_origem", "cancelada_em", "data_envio"]) {
    expect(depois[coluna], coluna).toEqual(antes[coluna]);
  }
}

beforeAll(async () => {
  ({ id: aId, cliente: a } = await novoUsuario());
  ({ id: bId, cliente: b } = await novoUsuario());
});

afterAll(async () => {
  psql(
    "drop trigger if exists trg_zz_b2_teste_falha on public.mensagens_agendadas;\n" +
      "drop trigger if exists trg_zz_b2_teste_log on public.log_eventos;\n" +
      "drop function if exists public.b2_teste_falha();\n" +
      "drop function if exists public.b2_teste_log();\n" +
      "alter table public.mensagens_agendadas enable trigger trg_destinatario_mensagem_agendada;\n" +
      "alter table public.imoveis enable trigger trg_retomada_retirado_imovel;",
  );
  await service.from("mensagens_agendadas").delete().in("user_id", usuariosCriados);
  await service.from("agenda").delete().in("user_id", usuariosCriados);
  await service.from("log_eventos").delete().in("user_id", usuariosCriados);
  await service.from("imoveis").delete().in("user_id", usuariosCriados);
  for (const id of usuariosCriados) await service.auth.admin.deleteUser(id);
});

/* ================================================================
   INSERT
   ================================================================ */
describe("insert de retomada", () => {
  it("aceita a retomada válida do próprio cliente, com o destinatário fotografado pelo trigger existente", async () => {
    const imovel = await novoImovel(aId);
    const { data, error } = await inserir(a, linha(aId, imovel));
    expect(error).toBeNull();
    expect(data).toMatchObject({
      tipo: RETOMADA,
      status: "agendada",
      user_id: aId,
      imovel_id: imovel,
      agenda_id: null,
      imoveis_consultados: null,
      nome_proprietario: "Proprietária Local",
      telefone: "43988887777",
    });
    expect(new Date(data!.data_envio as string).getTime()).toBeGreaterThan(Date.now());
  });

  it.each(["Angariado", "Autorização assinada", "Publicado"])("aceita imóvel retirado em %s", async (status) => {
    const imovel = await novoImovel(aId, { status });
    expect((await inserir(a, linha(aId, imovel))).error).toBeNull();
  });

  it("recusa imóvel que não está retirado", async () => {
    const imovel = await novoImovel(aId, { retirado: false });
    const r = await inserir(a, linha(aId, imovel));
    expect(r.error?.message).toContain("retirado da carteira");
  });

  it.each(["Locado", "Perdido", "Cancelado", "Em negociação"])("recusa imóvel retirado fora do alvo (%s)", async (status) => {
    const imovel = await novoImovel(aId, { status });
    const r = await inserir(a, linha(aId, imovel));
    expect(r.error?.message).toContain("status-alvo");
  });

  it("recusa retomada sem imóvel (cliente e service role)", async () => {
    for (const cliente of [a, service]) {
      const r = await inserir(cliente, linha(aId, null));
      expect(r.error?.message).toContain("exige o imóvel");
    }
  });

  it("recusa imóvel de outra conta (cliente e service role)", async () => {
    const deB = await novoImovel(bId);
    expect((await inserir(a, linha(aId, deB))).error).not.toBeNull();
    expect((await inserir(service, linha(aId, deB))).error).not.toBeNull();
    const { count } = await service.from("mensagens_agendadas").select("id", { count: "exact", head: true }).eq("imovel_id", deB);
    expect(count).toBe(0);
  });

  it("recusa data no passado, inclusive pelo service role, que não passa pela RLS", async () => {
    const imovel = await novoImovel(aId);
    const r = await inserir(service, linha(aId, imovel, { data_envio: PASSADO }));
    expect(r.error?.message).toContain("data futura");
    expect((await inserir(a, linha(aId, imovel, { data_envio: PASSADO }))).error).not.toBeNull();
  });

  it.each(["processando", "enviada", "erro"])("recusa INSERT já %s, pelo service role", async (status) => {
    const imovel = await novoImovel(aId);
    const r = await inserir(service, linha(aId, imovel, { status, data_envio: FUTURO }));
    expect(r.error?.message).toContain("nasce agendada");
  });

  it("recusa agenda_id preenchido", async () => {
    const imovel = await novoImovel(aId);
    const agenda = await a.from("agenda").insert({
      user_id: aId, title: "Compromisso local", type: "Follow-up", date: "2099-10-01", imovel_id: imovel,
    }).select("id").single();
    expect(agenda.error).toBeNull();
    const r = await inserir(a, linha(aId, imovel, { agenda_id: agenda.data!.id }));
    expect(r.error?.message).toContain("Agenda");
  });

  it("recusa imoveis_consultados preenchido", async () => {
    const imovel = await novoImovel(aId);
    const r = await inserir(service, linha(aId, imovel, { imoveis_consultados: [imovel] }));
    expect(r.error?.message).toContain("próprio imóvel");
  });
});

/* ================================================================
   UMA ATIVA POR IMÓVEL
   ================================================================ */
describe("no máximo uma retomada ativa por imóvel", () => {
  it("agendada e processando bloqueiam a segunda; cancelada, erro e enviada liberam", async () => {
    const imovel = await novoImovel(aId);
    const primeira = (await inserir(a, linha(aId, imovel))).data!.id as string;
    expect((await inserir(a, linha(aId, imovel))).error?.code).toBe("23505");

    const cancelar = await a.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "usuario", cancelamento_origem: "usuario", cancelada_em: new Date().toISOString(),
    }).eq("id", primeira);
    expect(cancelar.error).toBeNull();

    const segunda = (await inserir(a, linha(aId, imovel))).data!.id as string;
    await marcar(segunda, "processando");
    expect((await inserir(a, linha(aId, imovel))).error?.code).toBe("23505");

    await marcar(segunda, "erro", { erro: "retomada-envio-desabilitado" });
    const terceira = (await inserir(a, linha(aId, imovel))).data!.id as string;
    await marcar(terceira, "enviada", { enviado_em: new Date().toISOString() });
    expect((await inserir(a, linha(aId, imovel))).error).toBeNull();
  });

  it("imóveis diferentes têm cada um a sua", async () => {
    const um = await novoImovel(aId);
    const outro = await novoImovel(aId);
    expect((await inserir(a, linha(aId, um))).error).toBeNull();
    expect((await inserir(a, linha(aId, outro))).error).toBeNull();
  });
});

/* ================================================================
   IDENTIDADE
   ================================================================ */
describe("identidade da retomada", () => {
  for (const [rotulo, cliente] of [["cliente", () => a], ["service role", () => service]] as const) {
    it(`${rotulo}: nada entra nem sai do tipo retomada-retirado`, async () => {
      const imovel = await novoImovel(aId);
      const livre = await novaMensagem(aId, imovel, "livre");
      const verificacao = await novaMensagem(aId, imovel, "verificacao-disponibilidade");
      for (const id of [livre, verificacao]) {
        const r = await cliente().from("mensagens_agendadas").update({ tipo: RETOMADA }).eq("id", id);
        expect(r.error?.message).toContain("não entra nem sai");
      }
      const retomada = await novaRetomada(aId, imovel);
      for (const tipo of ["livre", "verificacao-disponibilidade"]) {
        const r = await cliente().from("mensagens_agendadas").update({ tipo }).eq("id", retomada);
        expect(r.error?.message).toContain("não entra nem sai");
      }
      expect((await ler(livre)).tipo).toBe("livre");
      expect((await ler(verificacao)).tipo).toBe("verificacao-disponibilidade");
      expect((await ler(retomada)).tipo).toBe(RETOMADA);
    });
  }

  it("o B2 não cria regra nova entre os tipos antigos: livre ↔ verificação continua possível", async () => {
    const imovel = await novoImovel(aId, { retirado: false });
    const id = await novaMensagem(aId, imovel, "livre");
    expect((await a.from("mensagens_agendadas").update({ tipo: "verificacao-disponibilidade" }).eq("id", id)).error).toBeNull();
    expect((await ler(id)).tipo).toBe("verificacao-disponibilidade");
    expect((await service.from("mensagens_agendadas").update({ tipo: "livre" }).eq("id", id)).error).toBeNull();
    expect((await ler(id)).tipo).toBe("livre");
  });
});

/* ================================================================
   EDIÇÃO
   ================================================================ */
describe("edição de retomada agendada", () => {
  it("a data muda para outra futura", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    const r = await a.from("mensagens_agendadas").update({ data_envio: OUTRO_FUTURO, mensagem: "Texto revisto" }).eq("id", id);
    expect(r.error).toBeNull();
    const depois = await ler(id);
    expect(new Date(depois.data_envio as string).toISOString()).toBe(OUTRO_FUTURO);
    expect(depois.mensagem).toBe("Texto revisto");
  });

  it("o imóvel é fixo: nem outro retirado válido, nem um não retirado, nem um de outra conta", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    const outroRetirado = await novoImovel(aId);
    const naoRetirado = await novoImovel(aId, { retirado: false });
    const deB = await novoImovel(bId);
    for (const destino of [outroRetirado, naoRetirado]) {
      for (const cliente of [a, service]) {
        const r = await cliente.from("mensagens_agendadas").update({ imovel_id: destino }).eq("id", id);
        expect(r.error?.message).toContain("não pode ser trocado");
      }
    }
    expect((await a.from("mensagens_agendadas").update({ imovel_id: deB }).eq("id", id)).error).not.toBeNull();
    expect((await service.from("mensagens_agendadas").update({ imovel_id: deB }).eq("id", id)).error).not.toBeNull();
    expect((await ler(id)).imovel_id).toBe(imovel);
  });

  it("a edição revalida: data passada, agenda e imoveis_consultados são recusados", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    expect((await service.from("mensagens_agendadas").update({ data_envio: PASSADO }).eq("id", id)).error?.message).toContain("data futura");
    expect((await service.from("mensagens_agendadas").update({ imoveis_consultados: [imovel] }).eq("id", id)).error?.message).toContain("próprio imóvel");
    const agenda = await a.from("agenda").insert({
      user_id: aId, title: "Compromisso local", type: "Follow-up", date: "2099-10-01", imovel_id: imovel,
    }).select("id").single();
    expect((await a.from("mensagens_agendadas").update({ agenda_id: agenda.data!.id }).eq("id", id)).error?.message).toContain("Agenda");
  });

  it("anular o imóvel à mão, com o imóvel ainda existindo, é recusado (não vira cancelamento)", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    const r = await service.from("mensagens_agendadas").update({ imovel_id: null }).eq("id", id);
    expect(r.error?.message).toContain("exige o imóvel");
    expect(await ler(id)).toMatchObject({ status: "agendada", imovel_id: imovel });
  });
});

/* ================================================================
   REATIVAÇÃO E SAÍDA DO ALVO
   ================================================================ */
describe("o imóvel muda", () => {
  it("reativar cancela só a retomada agendada, como imovel-reativado/automacao", async () => {
    const imovel = await novoImovel(aId);
    const enviada = await novaRetomada(aId, imovel);
    await marcar(enviada, "enviada", { enviado_em: new Date().toISOString() });
    const comErro = await novaRetomada(aId, imovel);
    await marcar(comErro, "erro", { erro: "retomada-envio-desabilitado" });
    const agendada = await novaRetomada(aId, imovel);
    const livre = await novaMensagem(aId, imovel, "livre");
    const verificacao = await novaMensagem(aId, imovel, "verificacao-disponibilidade");
    const antes = await Promise.all([enviada, comErro, livre, verificacao].map(ler));

    const reativar = await a.from("imoveis").update({ retirado: false }).eq("id", imovel);
    expect(reativar.error).toBeNull();

    expect(await ler(agendada)).toMatchObject({
      status: "cancelada", cancelamento_motivo: "imovel-reativado", cancelamento_origem: "automacao",
    });
    expect((await ler(agendada)).cancelada_em).not.toBeNull();
    const depois = await Promise.all([enviada, comErro, livre, verificacao].map(ler));
    antes.forEach((linhaAntes, i) => intacta(linhaAntes, depois[i]));
  });

  it("reativar não toca a retomada que o worker já reclamou (processando)", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    await marcar(id, "processando");
    const antes = await ler(id);
    expect((await a.from("imoveis").update({ retirado: false }).eq("id", imovel)).error).toBeNull();
    intacta(antes, await ler(id));
  });

  it.each(["Locado", "Perdido"])("Publicado → %s cancela a retomada agendada como imovel-indisponivel", async (status) => {
    const imovel = await novoImovel(aId);
    const agendada = await novaRetomada(aId, imovel);
    const enviada = await novaRetomada(aId, await novoImovel(aId));
    await marcar(enviada, "enviada", { enviado_em: new Date().toISOString() });
    const livre = await novaMensagem(aId, imovel, "livre");
    const antes = await Promise.all([livre, enviada].map(ler));

    expect((await a.from("imoveis").update({ status }).eq("id", imovel)).error).toBeNull();

    expect(await ler(agendada)).toMatchObject({
      status: "cancelada", cancelamento_motivo: "imovel-indisponivel", cancelamento_origem: "automacao",
    });
    const depois = await Promise.all([livre, enviada].map(ler));
    antes.forEach((linhaAntes, i) => intacta(linhaAntes, depois[i]));
  });

  it("reativar e sair do alvo na mesma atualização: prevalece imovel-indisponivel", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    expect((await a.from("imoveis").update({ retirado: false, status: "Locado" }).eq("id", imovel)).error).toBeNull();
    expect(await ler(id)).toMatchObject({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
  });

  it("mudar de status dentro do alvo, ainda retirado, não cancela", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    expect((await a.from("imoveis").update({ status: "Angariado" }).eq("id", imovel)).error).toBeNull();
    expect((await ler(id)).status).toBe("agendada");
  });

  it("só cancela as retomadas do dono do imóvel (filtro por user_id)", async () => {
    const imovel = await novoImovel(aId);
    // Estado que o banco recusaria: retomada da conta B apontando para o imóvel de A.
    const intrusa = randomUUID();
    psqlSemTriggers(
      "insert into public.mensagens_agendadas (id, user_id, imovel_id, tipo, nome_proprietario, telefone, mensagem, data_envio, status) " +
        `values ('${intrusa}', '${bId}', '${imovel}', '${RETOMADA}', 'x', '43999999999', 'adversarial', '${FUTURO}', 'agendada');`,
    );
    expect((await a.from("imoveis").update({ retirado: false }).eq("id", imovel)).error).toBeNull();
    expect((await ler(intrusa)).status).toBe("agendada");
  });
});

/* ================================================================
   FAIL-OPEN
   ================================================================ */
describe("fail-open do trigger de imóveis", () => {
  const FALHA = "FALHA-B2-AUTOMACAO";

  function instalarFalhaNaAutomacao() {
    psql(
      "create or replace function public.b2_teste_falha() returns trigger language plpgsql as $$\n" +
        `begin if new.mensagem = '${FALHA}' and new.status = 'cancelada' then raise exception 'falha injetada'; end if; return new; end; $$;\n` +
        "drop trigger if exists trg_zz_b2_teste_falha on public.mensagens_agendadas;\n" +
        "create trigger trg_zz_b2_teste_falha before update on public.mensagens_agendadas for each row execute function public.b2_teste_falha();",
    );
  }

  function instalarFalhaNoLog() {
    psql(
      "create or replace function public.b2_teste_log() returns trigger language plpgsql as $$\n" +
        "begin if new.evento = 'retomada-cancelamento-falhou' then raise exception 'log indisponível'; end if; return new; end; $$;\n" +
        "drop trigger if exists trg_zz_b2_teste_log on public.log_eventos;\n" +
        "create trigger trg_zz_b2_teste_log before insert on public.log_eventos for each row execute function public.b2_teste_log();",
    );
  }

  function removerFalhas() {
    psql(
      "drop trigger if exists trg_zz_b2_teste_falha on public.mensagens_agendadas;\n" +
        "drop trigger if exists trg_zz_b2_teste_log on public.log_eventos;\n" +
        "drop function if exists public.b2_teste_falha();\n" +
        "drop function if exists public.b2_teste_log();",
    );
  }

  async function eventosFalha(): Promise<Array<{ detalhe: string; nivel: string; categoria: string }>> {
    const { data, error } = await service.from("log_eventos").select("detalhe, nivel, categoria")
      .eq("user_id", aId).eq("evento", "retomada-cancelamento-falhou");
    expect(error).toBeNull();
    return data as Array<{ detalhe: string; nivel: string; categoria: string }>;
  }

  it("a automação falha: a reativação conclui e a falha vai para log_eventos", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel, { mensagem: FALHA });
    const antes = (await eventosFalha()).length;
    instalarFalhaNaAutomacao();
    try {
      const r = await a.from("imoveis").update({ retirado: false }).eq("id", imovel);
      expect(r.error).toBeNull();
    } finally {
      removerFalhas();
    }
    const imovelDepois = await service.from("imoveis").select("retirado").eq("id", imovel).single();
    expect(imovelDepois.data!.retirado).toBe(false);
    expect((await ler(id)).status).toBe("agendada");
    const eventos = await eventosFalha();
    expect(eventos.length).toBe(antes + 1);
    expect(eventos.at(-1)).toMatchObject({ categoria: "whatsapp", nivel: "erro" });
    expect(eventos.at(-1)!.detalhe).toMatch(/^imovel-reativado:[0-9A-Z]{5}$/);
  });

  it("a automação falha E o log falha: a mudança de status do imóvel ainda conclui", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel, { mensagem: FALHA });
    const antes = (await eventosFalha()).length;
    instalarFalhaNaAutomacao();
    instalarFalhaNoLog();
    try {
      const r = await a.from("imoveis").update({ status: "Locado" }).eq("id", imovel);
      expect(r.error).toBeNull();
    } finally {
      removerFalhas();
    }
    const imovelDepois = await service.from("imoveis").select("status").eq("id", imovel).single();
    expect(imovelDepois.data!.status).toBe("Locado");
    expect((await ler(id)).status).toBe("agendada");
    expect((await eventosFalha()).length).toBe(antes);
  });
});

/* ================================================================
   EXCLUSÃO
   ================================================================ */
describe("exclusão do imóvel", () => {
  it("RPC existente: a retomada agendada é apagada, como qualquer agendada; o histórico fica", async () => {
    const imovel = await novoImovel(aId);
    const enviada = await novaRetomada(aId, imovel);
    await marcar(enviada, "enviada", { enviado_em: new Date().toISOString() });
    const agendada = await novaRetomada(aId, imovel);
    const r = await a.rpc("excluir_imovel_com_dependencias", { p_imovel_id: imovel });
    expect(r.error).toBeNull();
    const apagada = await service.from("mensagens_agendadas").select("id").eq("id", agendada);
    expect(apagada.data).toEqual([]);
    expect(await ler(enviada)).toMatchObject({ status: "enviada", imovel_id: null, tipo: RETOMADA });
  });

  it("DELETE direto: conclui, e a retomada agendada vira cancelada/imovel-excluido/automacao", async () => {
    const imovel = await novoImovel(aId);
    const retomada = await novaRetomada(aId, imovel);
    const livre = await novaMensagem(aId, imovel, "livre");
    const r = await a.from("imoveis").delete().eq("id", imovel).select("id");
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(1);
    expect(await ler(retomada)).toMatchObject({
      status: "cancelada", cancelamento_motivo: "imovel-excluido", cancelamento_origem: "automacao", imovel_id: null,
    });
    // Comportamento de antes para os outros tipos: só perde o vínculo.
    expect(await ler(livre)).toMatchObject({ status: "agendada", imovel_id: null, cancelamento_motivo: null });
  });
});

/* ================================================================
   CLAIM EM LOTE
   ================================================================ */
describe("claim em lote", () => {
  it("um lote com livre, verificação e retomada vencidas não aborta, nem com o imóvel da retomada já fora do retirado", async () => {
    const retirado = await novoImovel(aId);
    const ativo = await novoImovel(aId, { retirado: false });
    const retomada = await novaRetomada(aId, retirado);
    const livre = await novaMensagem(aId, ativo, "livre");
    const verificacao = await novaMensagem(aId, ativo, "verificacao-disponibilidade");

    // Adversarial: o imóvel é reativado sem o trigger que cancelaria a retomada.
    psql("alter table public.imoveis disable trigger trg_retomada_retirado_imovel;");
    try {
      expect((await service.from("imoveis").update({ retirado: false }).eq("id", retirado)).error).toBeNull();
    } finally {
      psql("alter table public.imoveis enable trigger trg_retomada_retirado_imovel;");
    }
    psqlSemTriggers(
      `update public.mensagens_agendadas set data_envio = now() - interval '1 minute' where id in ('${retomada}', '${livre}', '${verificacao}');`,
    );

    const { data, error } = await service.rpc("claim_mensagens_agendadas", { p_limite: 20 });
    expect(error).toBeNull();
    const ids = (data as Linha[]).map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining([retomada, livre, verificacao]));
    for (const id of [retomada, livre, verificacao]) expect((await ler(id)).status).toBe("processando");
  });
});

/* ================================================================
   M3/M4 E CONSOLIDAÇÃO
   ================================================================ */
describe("M3/M4 não alteram a retomada", () => {
  it("encerrar e confirmar disponibilidade passam por cima da retomada", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    const antes = await ler(id);
    const encerrar = await a.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel });
    expect(encerrar.error).toBeNull();
    expect(encerrar.data).toMatchObject({ ok: true, acao: "encerrar", mensagens_canceladas: 0 });
    const confirmar = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    expect(confirmar.error).toBeNull();
    expect(confirmar.data).toMatchObject({ ok: true, acao: "ignorada" });
    intacta(antes, await ler(id));
    expect((await ler(id)).reagendada_em).toBeNull();
  });
});

describe("consolidação ignora a retomada", () => {
  it("retomada não é âncora", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    await marcar(id, "processando");
    const { data, error } = await service.rpc("efetivar_consolidacao_contato", {
      p_mensagem_id: id, p_user_id: aId, p_texto: "Texto único", p_imoveis_consultados: [imovel],
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: false, motivo: "ancora-nao-verificacao" });
    expect((await ler(id)).status).toBe("processando");
  });

  it("retomada nunca é absorvida, nem reservada para a âncora", async () => {
    const ativo = await novoImovel(aId, { retirado: false });
    const ancora = await novaMensagem(aId, ativo, "verificacao-disponibilidade");
    await marcar(ancora, "processando");
    const retomada = await novaRetomada(aId, await novoImovel(aId));
    await marcar(retomada, "processando", { reservada_para_mensagem_id: ancora });
    const { data, error } = await service.rpc("efetivar_consolidacao_contato", {
      p_mensagem_id: ancora, p_user_id: aId, p_texto: "Texto único", p_imoveis_consultados: [ativo],
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, absorvidas_total: 0 });
    expect(await ler(retomada)).toMatchObject({ status: "processando", reservada_para_mensagem_id: ancora, consolidada_em_mensagem_id: null });
  });
});

/* ================================================================
   RLS E TENANT
   ================================================================ */
describe("RLS entre contas", () => {
  it("a conta B não lê, não altera, não cancela e não reaponta a retomada da conta A", async () => {
    const imovel = await novoImovel(aId);
    const id = await novaRetomada(aId, imovel);
    const antes = await ler(id);
    const imovelDeB = await novoImovel(bId);

    const leitura = await b.from("mensagens_agendadas").select("id").eq("id", id);
    expect(leitura.data).toEqual([]);
    const alterar = await b.from("mensagens_agendadas").update({ data_envio: OUTRO_FUTURO }).eq("id", id).select("id");
    expect(alterar.data ?? []).toEqual([]);
    const cancelar = await b.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "usuario", cancelamento_origem: "usuario", cancelada_em: new Date().toISOString(),
    }).eq("id", id).select("id");
    expect(cancelar.data ?? []).toEqual([]);
    const reapontar = await b.from("mensagens_agendadas").update({ imovel_id: imovelDeB }).eq("id", id).select("id");
    expect(reapontar.data ?? []).toEqual([]);

    intacta(antes, await ler(id));
  });

  it("a validação confere o dono do imóvel por conta própria, mesmo sem o trigger do destinatário", async () => {
    const imovelDeA = await novoImovel(aId);
    psql("alter table public.mensagens_agendadas disable trigger trg_destinatario_mensagem_agendada;");
    try {
      const r = await inserir(service, linha(bId, imovelDeA, { nome_proprietario: "x" }));
      expect(r.error?.message).toContain("não pertence ao usuário");
    } finally {
      psql("alter table public.mensagens_agendadas enable trigger trg_destinatario_mensagem_agendada;");
    }
  });
});

/* ================================================================
   MOTIVOS
   ================================================================ */
describe("motivos de cancelamento", () => {
  it("aceita imovel-reativado, recusa destinatario-alterado e mantém o cancelamento auditável", async () => {
    const imovel = await novoImovel(aId, { retirado: false });
    const ok = await novaMensagem(aId, imovel, "livre");
    const agora = new Date().toISOString();
    expect((await service.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "imovel-reativado", cancelamento_origem: "automacao", cancelada_em: agora,
    }).eq("id", ok)).error).toBeNull();

    const outra = await novaMensagem(aId, imovel, "livre");
    const futuro = await service.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "destinatario-alterado", cancelamento_origem: "worker", cancelada_em: agora,
    }).eq("id", outra);
    expect(futuro.error?.code).toBe("23514");
    const semOrigem = await service.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "imovel-reativado", cancelada_em: agora,
    }).eq("id", outra);
    expect(semOrigem.error?.code).toBe("23514");
  });
});
