/* M3/M4 no PostgreSQL + PostgREST locais: a função interna única de
   transição de disponibilidade, as duas RPCs que a autorizam e o trigger
   que a chama com NEW.id + NEW.user_id. Opt-in, só contra Supabase LOCAL. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração de disponibilidade requer Supabase LOCAL e chaves locais explícitas.");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
let a: SupabaseClient;
let b: SupabaseClient;
let aId: string;
let bId: string;
const usuariosCriados: string[] = [];
/** 08:00 em São Paulo, dia 22/09/2099. */
const ENVIO = "2099-09-22T11:00:00.000Z";
const DIAS = 60;

async function novoUsuario() {
  const email = `disponibilidade-m4-${randomUUID()}@example.invalid`;
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

async function criarImovel(cliente: SupabaseClient, userId: string, sufixo: string, extra: Record<string, unknown> = {}) {
  const resultado = await cliente.from("imoveis").insert({
    user_id: userId,
    codigo: `LD-${sufixo}`,
    endereco: `Rua Local ${sufixo}, 10`,
    status: "Publicado",
    proprietario_nome: `Proprietário ${sufixo}`,
    proprietario_telefone: "43999999999",
    ...extra,
  }).select("id").single();
  expect(resultado.error).toBeNull();
  return resultado.data!.id as string;
}

async function criarLembrete(cliente: SupabaseClient, userId: string, imovelId: string, date = "2099-09-22") {
  const resultado = await cliente.from("agenda").insert({
    user_id: userId,
    title: "Verificar disponibilidade",
    type: "Follow-up",
    date,
    imovel_id: imovelId,
    is_verificacao_disponibilidade: true,
  }).select("id").single();
  expect(resultado.error).toBeNull();
  return resultado.data!.id as string;
}

async function criarVerificacao(cliente: SupabaseClient, userId: string, imovelId: string, dataEnvio = ENVIO) {
  const resultado = await cliente.from("mensagens_agendadas").insert({
    user_id: userId,
    imovel_id: imovelId,
    nome_proprietario: "substituído pelo trigger",
    telefone: "43999999999",
    mensagem: "Verificação de teste local",
    data_envio: dataEnvio,
    status: "agendada",
    tipo: "verificacao-disponibilidade",
  }).select("id").single();
  expect(resultado.error).toBeNull();
  return resultado.data!.id as string;
}

async function mensagem(id: string) {
  const { data, error } = await service.from("mensagens_agendadas")
    .select("status,data_envio,data_envio_original,reagendada_em,reagendamento_motivo,cancelamento_motivo,cancelamento_origem,cancelada_em")
    .eq("id", id).single();
  expect(error).toBeNull();
  return data!;
}

async function lembretesAbertos(userId: string, imovelId: string) {
  const { data, error } = await service.from("agenda")
    .select("id,date,done,completion_reason,completion_origin,origin,reason_code")
    .eq("user_id", userId).eq("imovel_id", imovelId).eq("is_verificacao_disponibilidade", true)
    .order("date");
  expect(error).toBeNull();
  return data!;
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
  await service.from("log_eventos").delete().in("user_id", [aId, bId]);
});

afterAll(async () => {
  await service.from("mensagens_agendadas").delete().in("user_id", [aId, bId]);
  await service.from("agenda").delete().in("user_id", [aId, bId]);
  await service.from("imoveis").delete().in("user_id", [aId, bId]);
  for (const id of usuariosCriados) {
    expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
  }
});

describe("colunas e restrições do M3/M4", () => {
  it("aceita contato-consolidado com vínculo e rejeita vínculo com outro motivo", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const ancora = await criarVerificacao(a, aId, imovel);
    const absorvida = await criarVerificacao(a, aId, imovel, "2099-09-22T11:02:00.000Z");
    const agora = new Date().toISOString();

    const ok = await service.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "contato-consolidado", cancelamento_origem: "worker",
      cancelada_em: agora, consolidada_em_mensagem_id: ancora,
    }).eq("id", absorvida);
    expect(ok.error).toBeNull();

    const incoerente = await service.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "imovel-indisponivel", cancelamento_origem: "worker",
      cancelada_em: agora, consolidada_em_mensagem_id: ancora,
    }).eq("id", ancora);
    expect(incoerente.error?.code).toBe("23514");

    const reagendamentoParcial = await service.from("mensagens_agendadas").update({
      reagendada_em: agora,
    }).eq("id", ancora);
    expect(reagendamentoParcial.error?.code).toBe("23514");
  });

  it("o navegador não consegue forjar consolidação nem reagendamento automático", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id = await criarVerificacao(a, aId, imovel);
    const forjada = await a.from("mensagens_agendadas").update({
      status: "cancelada", cancelamento_motivo: "contato-consolidado", cancelamento_origem: "worker",
      cancelada_em: new Date().toISOString(),
    }).eq("id", id);
    expect(forjada.error?.code).toBe("42501");
  });
});

describe("encerrar: imóvel saiu da carteira", () => {
  it("1/2. RPC pela sessão cancela a verificação pendente com auditoria e apaga o lembrete aberto", async () => {
    const imovel = await criarImovel(a, aId, "A");
    await criarLembrete(a, aId, imovel);
    const id = await criarVerificacao(a, aId, imovel);

    const { data, error } = await a.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, acao: "encerrar", lembretes_removidos: 1, mensagens_canceladas: 1 });

    expect(await mensagem(id)).toMatchObject({
      status: "cancelada", cancelamento_motivo: "imovel-indisponivel", cancelamento_origem: "usuario",
    });
    expect((await mensagem(id)).cancelada_em).not.toBeNull();
    expect(await lembretesAbertos(aId, imovel)).toEqual([]);
  });

  it("4/11/19. repetir a mesma transição não muda nada nem duplica cancelamento", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id1 = await criarVerificacao(a, aId, imovel);
    const id2 = await criarVerificacao(a, aId, imovel, "2099-09-22T11:02:00.000Z");
    const primeira = await a.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel });
    expect(primeira.data).toMatchObject({ mensagens_canceladas: 2 });
    const antes = [await mensagem(id1), await mensagem(id2)];

    const segunda = await a.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel });
    expect(segunda.error).toBeNull();
    expect(segunda.data).toMatchObject({ ok: true, lembretes_removidos: 0, mensagens_canceladas: 0 });
    expect([await mensagem(id1), await mensagem(id2)]).toEqual(antes);
    const total = await service.from("mensagens_agendadas").select("id", { count: "exact", head: true }).eq("user_id", aId);
    expect(total.count).toBe(2);
  });

  it("17/18. o trigger reage à mudança de status por qualquer caminho, com NEW.id + NEW.user_id (service role, sem sessão)", async () => {
    const imovel = await criarImovel(a, aId, "A");
    await criarLembrete(a, aId, imovel);
    const id = await criarVerificacao(a, aId, imovel);

    // Escrita privilegiada, como o webhook e a Sophia fazem: sem auth.uid().
    const mudou = await service.from("imoveis").update({ status: "Perdido" }).eq("id", imovel);
    expect(mudou.error).toBeNull();

    expect(await mensagem(id)).toMatchObject({
      status: "cancelada", cancelamento_motivo: "imovel-indisponivel", cancelamento_origem: "automacao",
    });
    expect(await lembretesAbertos(aId, imovel)).toEqual([]);
    const log = await service.from("log_eventos").select("evento").eq("user_id", aId);
    expect(log.data).toEqual([]);
  });

  it("o trigger também reage a `retirado` e não faz nada em transições dentro do alvo", async () => {
    const imovel = await criarImovel(a, aId, "A", { status: "Angariado" });
    const id = await criarVerificacao(a, aId, imovel);

    expect((await service.from("imoveis").update({ status: "Publicado" }).eq("id", imovel)).error).toBeNull();
    expect((await mensagem(id)).status).toBe("agendada");

    expect((await service.from("imoveis").update({ retirado: true }).eq("id", imovel)).error).toBeNull();
    expect(await mensagem(id)).toMatchObject({ status: "cancelada", cancelamento_origem: "automacao" });
  });

  it("20. a linha já reclamada (`processando`) entra na transição do worker e nunca é enviada", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id = await criarVerificacao(a, aId, imovel);
    expect((await service.from("mensagens_agendadas").update({ status: "processando" }).eq("id", id)).error).toBeNull();

    const semAlvo = await service.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel });
    expect(semAlvo.data).toMatchObject({ mensagens_canceladas: 0 });
    expect((await mensagem(id)).status).toBe("processando");

    const comAlvo = await service.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel, p_mensagem_processando: id });
    expect(comAlvo.data).toMatchObject({ mensagens_canceladas: 1 });
    expect(await mensagem(id)).toMatchObject({ status: "cancelada", cancelamento_origem: "worker" });
  });
});

describe("confirmar: disponibilidade confirmada em E", () => {
  it("3. reagenda a verificação para E + 60 (mesma hora do dia) e reposiciona o lembrete com auditoria", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const lembreteAntigo = await criarLembrete(a, aId, imovel, "2099-09-22");
    const id = await criarVerificacao(a, aId, imovel);

    const { data, error } = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      ok: true, acao: "confirmar", proxima_verificacao: "2099-10-31",
      lembrete_criado: true, lembretes_concluidos: 1, mensagens_reagendadas: 1, mensagens_canceladas: 0,
    });

    const linha = await mensagem(id);
    expect(linha.status).toBe("agendada");
    expect(Date.parse(linha.data_envio)).toBe(Date.parse("2099-10-31T11:00:00.000Z"));
    expect(Date.parse(linha.data_envio_original!)).toBe(Date.parse(ENVIO));
    expect(linha.reagendamento_motivo).toBe("disponibilidade-confirmada");
    expect(linha.reagendada_em).not.toBeNull();

    const lembretes = await lembretesAbertos(aId, imovel);
    expect(lembretes).toHaveLength(2);
    expect(lembretes.find((l) => l.id === lembreteAntigo)).toMatchObject({
      done: true, completion_reason: "disponibilidade-confirmada", completion_origin: "usuario",
    });
    const novo = lembretes.find((l) => l.id !== lembreteAntigo)!;
    expect(novo).toMatchObject({ date: "2099-10-31", done: false, origin: "usuario", reason_code: "disponibilidade-confirmada" });
    expect(String((data as { lembrete_id: string }).lembrete_id)).toBe(novo.id);
  });

  it("4/19. repetir a confirmação não empurra a data de novo nem cria outro lembrete", async () => {
    const imovel = await criarImovel(a, aId, "A");
    await criarLembrete(a, aId, imovel);
    const id = await criarVerificacao(a, aId, imovel);
    await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    const antes = await mensagem(id);
    const lembretesAntes = await lembretesAbertos(aId, imovel);

    const repetida = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    expect(repetida.error).toBeNull();
    expect(repetida.data).toMatchObject({ lembrete_criado: false, lembretes_concluidos: 0, mensagens_reagendadas: 0, mensagens_canceladas: 0 });
    expect(await mensagem(id)).toEqual(antes);
    expect(await lembretesAbertos(aId, imovel)).toEqual(lembretesAntes);
  });

  it("11. duas verificações do mesmo imóvel antes de E + 60: a primeira é reagendada e a outra cancelada, sem duplicar", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id1 = await criarVerificacao(a, aId, imovel, ENVIO);
    const id2 = await criarVerificacao(a, aId, imovel, "2099-09-25T11:00:00.000Z");
    const { data } = await service.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    expect(data).toMatchObject({ mensagens_reagendadas: 1, mensagens_canceladas: 1 });
    expect((await mensagem(id1)).status).toBe("agendada");
    expect(await mensagem(id2)).toMatchObject({ status: "cancelada", cancelamento_motivo: "disponibilidade-confirmada", cancelamento_origem: "worker" });
  });

  it("uma evidência mais antiga que a mensagem já reflete não move nada para trás", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id = await criarVerificacao(a, aId, imovel, "2099-12-01T11:00:00.000Z");
    const lembrete = await criarLembrete(a, aId, imovel, "2099-12-01");
    const { data } = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    expect(data).toMatchObject({ lembrete_criado: false, mensagens_reagendadas: 0 });
    expect(Date.parse((await mensagem(id)).data_envio)).toBe(Date.parse("2099-12-01T11:00:00.000Z"));
    expect(await lembretesAbertos(aId, imovel)).toEqual([expect.objectContaining({ id: lembrete, date: "2099-12-01", done: false })]);
  });

  it("imóvel fora do alvo ignora a confirmação (não reabre cadência de quem saiu)", async () => {
    const imovel = await criarImovel(a, aId, "A", { status: "Perdido" });
    const { data } = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-09-01" });
    expect(data).toMatchObject({ ok: true, acao: "ignorada", motivo: "imovel-fora-do-alvo" });
    expect(await lembretesAbertos(aId, imovel)).toEqual([]);
  });

  it("20. a linha reclamada volta para `agendada` na nova data quando o worker confirma", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id = await criarVerificacao(a, aId, imovel);
    expect((await service.from("mensagens_agendadas").update({ status: "processando" }).eq("id", id)).error).toBeNull();
    const { data } = await service.rpc("registrar_confirmacao_disponibilidade", {
      p_imovel_id: imovel, p_data_confirmacao: "2099-09-01", p_mensagem_processando: id,
    });
    expect(data).toMatchObject({ mensagens_reagendadas: 1 });
    const linha = await mensagem(id);
    expect(linha.status).toBe("agendada");
    expect(Date.parse(linha.data_envio)).toBe(Date.parse("2099-10-31T11:00:00.000Z"));
  });
});

describe("tenant", () => {
  it("15/16. a RPC de um usuário não alcança o imóvel do outro, e a sessão nunca reclama linha `processando`", async () => {
    const imovelB = await criarImovel(b, bId, "B");
    const idB = await criarVerificacao(b, bId, imovelB);
    await criarLembrete(b, bId, imovelB);

    const invasao = await a.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovelB, p_mensagem_processando: idB });
    expect(invasao.error).toBeNull();
    expect(invasao.data).toMatchObject({ ok: false, motivo: "imovel-nao-encontrado" });
    expect((await mensagem(idB)).status).toBe("agendada");
    expect(await lembretesAbertos(bId, imovelB)).toHaveLength(1);

    const confirmacaoAlheia = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovelB, p_data_confirmacao: "2099-09-01" });
    expect(confirmacaoAlheia.data).toMatchObject({ ok: false, motivo: "imovel-nao-encontrado" });
    expect(await lembretesAbertos(bId, imovelB)).toHaveLength(1);
  });

  it("sem sessão e sem service role, a RPC recusa", async () => {
    const anonimo = createClient(url, anonKey, opcoes);
    const imovel = await criarImovel(a, aId, "A");
    const { error } = await anonimo.rpc("encerrar_disponibilidade_imovel", { p_imovel_id: imovel });
    expect(error?.code).toBe("42501");
  });

  it("a função interna não é executável pelo navegador", async () => {
    const { error } = await a.rpc("aplicar_transicao_disponibilidade", {});
    expect(error).not.toBeNull();
  });

  it("DIAS gêmeo: a cadência do banco é a mesma constante do app", async () => {
    const imovel = await criarImovel(a, aId, "A");
    const id = await criarVerificacao(a, aId, imovel, "2099-01-10T11:00:00.000Z");
    const { data } = await a.rpc("registrar_confirmacao_disponibilidade", { p_imovel_id: imovel, p_data_confirmacao: "2099-01-01" });
    const esperado = new Date(Date.UTC(2099, 0, 1 + DIAS)).toISOString().slice(0, 10);
    expect(data).toMatchObject({ proxima_verificacao: esperado });
    expect((await mensagem(id)).data_envio.slice(0, 10)).toBe(esperado);
  });
});

/* ------------------------------------------------------------------
   Consolidação em dois tempos: reserva (`reservada_para_mensagem_id`),
   efetivação atômica (`efetivar_consolidacao_contato`) e varredura de
   reservas órfãs no claim. Tudo contra o Postgres local.
   ------------------------------------------------------------------ */
const dbUrl = process.env.LOCAL_SUPABASE_DB_URL || "";
const temDbUrl = /^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/\w+(\?[\w=&-]*)?$/.test(dbUrl);

/** DDL de teste (gatilho que injeta falha) pelo CLI, só contra o banco local.
    `db query` aceita um comando por chamada: cada instrução vai num arquivo. */
function sqlLocal(instrucoes: string[]) {
  for (const sql of instrucoes) {
    const arquivo = join(tmpdir(), `angario-injecao-${randomUUID()}.sql`);
    writeFileSync(arquivo, sql, "utf8");
    try {
      execSync(`npx --no-install supabase db query --db-url "${dbUrl}" -f "${arquivo}"`, { stdio: "pipe", cwd: process.cwd() });
    } finally {
      rmSync(arquivo, { force: true });
    }
  }
}

async function linha(id: string) {
  const { data, error } = await service.from("mensagens_agendadas")
    .select("status,erro,mensagem,enviado_em,imoveis_consultados,cancelamento_motivo,cancelamento_origem,cancelada_em,consolidada_em_mensagem_id,reservada_para_mensagem_id,updated_at")
    .eq("id", id).single();
  expect(error).toBeNull();
  return data!;
}

async function notasDoImovel(imovelId: string) {
  const { data, error } = await service.from("imoveis").select("notas").eq("id", imovelId).single();
  expect(error).toBeNull();
  return ((data!.notas as Array<{ id: string; texto: string; origem?: string }> | null) ?? []);
}

async function reservar(ancoraId: string, candidataId: string, userId = aId) {
  return service.from("mensagens_agendadas")
    .update({ status: "processando", reservada_para_mensagem_id: ancoraId, updated_at: new Date().toISOString() })
    .eq("id", candidataId).eq("user_id", userId).eq("status", "agendada").select("id");
}

async function reclamar(id: string) {
  const { error } = await service.from("mensagens_agendadas").update({ status: "processando", updated_at: new Date().toISOString() }).eq("id", id);
  expect(error).toBeNull();
}

function nota(externoId: string, texto: string) {
  return { id: `wa:${externoId}`, texto: `Enviado: ${texto}`, data: "2099-09-22T08:00:30", direcao: "enviada", autor: "corretor", tipo: "conversation", origem: "agendamento" };
}

describe("reserva de consolidação: coluna, FK por tenant, autorreserva e estados", () => {
  it("a reserva só nasce de `agendada` → `processando`, aponta para a âncora e o navegador não a forja", async () => {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(a, aId, "B");
    const ancora = await criarVerificacao(a, aId, imA);
    const cand = await criarVerificacao(a, aId, imB, "2099-09-22T11:02:00.000Z");
    await reclamar(ancora);
    const reserva = await reservar(ancora, cand);
    expect(reserva.error).toBeNull();
    expect(reserva.data).toHaveLength(1);
    expect(await linha(cand)).toMatchObject({ status: "processando", reservada_para_mensagem_id: ancora, cancelamento_motivo: null, consolidada_em_mensagem_id: null });
    // Reservar de novo (já não é `agendada`) não pega: 0 linhas.
    const repetida = await reservar(ancora, cand);
    expect(repetida.error).toBeNull();
    expect(repetida.data).toHaveLength(0);
    // O navegador (RLS só escreve agendada/cancelada) nunca consegue uma reserva.
    const outra = await criarVerificacao(a, aId, imB, "2099-09-22T11:04:00.000Z");
    const forjada = await a.from("mensagens_agendadas").update({ reservada_para_mensagem_id: ancora }).eq("id", outra);
    expect(forjada.error).not.toBeNull();
    expect(["42501", "23514"]).toContain(forjada.error?.code);
  });

  it("9. autorreserva é impossível, e uma reserva em `agendada`/`cancelada` também", async () => {
    const im = await criarImovel(a, aId, "A");
    const id = await criarVerificacao(a, aId, im);
    await reclamar(id);
    const auto = await service.from("mensagens_agendadas").update({ reservada_para_mensagem_id: id }).eq("id", id);
    expect(auto.error?.code).toBe("23514");
    const outroId = await criarVerificacao(a, aId, im, "2099-09-22T11:02:00.000Z");
    const emAgendada = await service.from("mensagens_agendadas").update({ reservada_para_mensagem_id: id }).eq("id", outroId);
    expect(emAgendada.error?.code).toBe("23514");
  });

  it("8. cross-user é impossível: a FK composta recusa reserva para âncora de outra conta", async () => {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(b, bId, "B");
    const ancoraDeA = await criarVerificacao(a, aId, imA);
    const candDeB = await criarVerificacao(b, bId, imB, "2099-09-22T11:02:00.000Z");
    await reclamar(ancoraDeA);
    const cruzada = await service.from("mensagens_agendadas")
      .update({ status: "processando", reservada_para_mensagem_id: ancoraDeA })
      .eq("id", candDeB);
    expect(cruzada.error?.code).toBe("23503");
    expect(await linha(candDeB)).toMatchObject({ status: "agendada", reservada_para_mensagem_id: null });
  });
});

describe("efetivar_consolidacao_contato: uma transação, ou nada", () => {
  async function cenarioABC() {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(a, aId, "B");
    const imC = await criarImovel(a, aId, "C");
    const ancora = await criarVerificacao(a, aId, imA);
    const mB = await criarVerificacao(a, aId, imB, "2099-09-22T11:02:00.000Z");
    const mC = await criarVerificacao(a, aId, imC, "2099-09-22T11:04:00.000Z");
    await reclamar(ancora);
    expect((await reservar(ancora, mB)).data).toHaveLength(1);
    expect((await reservar(ancora, mC)).data).toHaveLength(1);
    return { imA, imB, imC, ancora, mB, mC };
  }
  const TEXTO = "Olá! Confirmo a disponibilidade dos imóveis A, B e C?";

  it("2/5. sucesso: A enviada com texto e imoveis_consultados, B/C contato-consolidado apontando para A, reserva limpa e notas wa: nos três, tudo junto", async () => {
    const { imA, imB, imC, ancora, mB, mC } = await cenarioABC();
    const { data, error } = await service.rpc("efetivar_consolidacao_contato", {
      p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC],
      p_notas: [{ imovel_id: imA, nota: nota("ext-1", TEXTO) }, { imovel_id: imB, nota: nota("ext-1", TEXTO) }, { imovel_id: imC, nota: nota("ext-1", TEXTO) }],
      p_enviado_em: "2099-09-22T11:00:30.000Z",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, absorvidas_total: 2, notas_gravadas: 3, notas_falhas: [] });
    expect((data as { absorvidas: string[] }).absorvidas.sort()).toEqual([mB, mC].sort());

    const A = await linha(ancora);
    expect(A).toMatchObject({ status: "enviada", mensagem: TEXTO, imoveis_consultados: [imA, imB, imC], erro: null, reservada_para_mensagem_id: null });
    expect(A.enviado_em).not.toBeNull();
    for (const id of [mB, mC]) {
      expect(await linha(id)).toMatchObject({
        status: "cancelada", cancelamento_motivo: "contato-consolidado", cancelamento_origem: "worker",
        consolidada_em_mensagem_id: ancora, reservada_para_mensagem_id: null,
      });
    }
    for (const im of [imA, imB, imC]) {
      const notas = await notasDoImovel(im);
      expect(notas.map((n) => n.id)).toEqual(["wa:ext-1"]);
      expect(notas[0].origem).toBe("agendamento");
    }
  });

  it("10. reexecutar a RPC não duplica nada: a âncora já não está processando e nada é escrito", async () => {
    const { imA, imB, imC, ancora, mB } = await cenarioABC();
    const params = {
      p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC],
      p_notas: [{ imovel_id: imA, nota: nota("ext-2", TEXTO) }], p_enviado_em: "2099-09-22T11:00:30.000Z",
    };
    expect((await service.rpc("efetivar_consolidacao_contato", params)).data).toMatchObject({ ok: true });
    const antesA = await linha(ancora);
    const antesB = await linha(mB);
    const repetida = await service.rpc("efetivar_consolidacao_contato", { ...params, p_enviado_em: "2099-09-22T11:05:00.000Z", p_notas: [{ imovel_id: imA, nota: nota("ext-3", TEXTO) }] });
    expect(repetida.error).toBeNull();
    expect(repetida.data).toMatchObject({ ok: false, motivo: "ancora-nao-processando", status: "enviada" });
    expect(await linha(ancora)).toEqual(antesA);
    expect(await linha(mB)).toEqual(antesB);
    expect((await notasDoImovel(imA)).map((n) => n.id)).toEqual(["wa:ext-2"]);
    // Mesma nota (mesmo id externo) repetida também não duplica: registrar_nota_imovel deduplica.
  });

  it("8. cross-user é impossível na RPC: p_user_id de outra conta não encontra a âncora, imóvel alheio na lista é recusado, e o navegador não a executa", async () => {
    const { imA, imB, imC, ancora, mB } = await cenarioABC();
    const imDeB = await criarImovel(b, bId, "Z");
    const alheia = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: bId, p_texto: TEXTO, p_imoveis_consultados: [imA] });
    expect(alheia.data).toMatchObject({ ok: false, motivo: "ancora-nao-encontrada" });
    const listaAlheia = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imDeB] });
    expect(listaAlheia.data).toMatchObject({ ok: false, motivo: "imovel-de-outra-conta" });
    const foraDeOrdem = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imB, imA] });
    expect(foraDeOrdem.data).toMatchObject({ ok: false, motivo: "imoveis-consultados-incoerentes" });
    const pelaSessao = await a.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC] });
    expect(pelaSessao.error?.code).toBe("42501");
    // Nada mudou.
    expect(await linha(ancora)).toMatchObject({ status: "processando", imoveis_consultados: null });
    expect(await linha(mB)).toMatchObject({ status: "processando", reservada_para_mensagem_id: ancora });
  });

  it("reserva de OUTRA âncora ou candidata que já não está processando não é absorvida", async () => {
    const { imA, imB, imC, ancora, mB, mC } = await cenarioABC();
    const imD = await criarImovel(a, aId, "D");
    const outraAncora = await criarVerificacao(a, aId, imD, "2099-09-22T11:06:00.000Z");
    const mD2 = await criarVerificacao(a, aId, imD, "2099-09-22T11:08:00.000Z");
    await reclamar(outraAncora);
    expect((await reservar(outraAncora, mD2)).data).toHaveLength(1);
    // C perdeu a reserva (varrida para erro) antes da efetivação.
    expect((await service.from("mensagens_agendadas").update({ status: "erro", erro: "consolidacao-interrompida" }).eq("id", mC)).error).toBeNull();
    const { data } = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC] });
    expect(data).toMatchObject({ ok: true, absorvidas: [mB], absorvidas_total: 1 });
    expect(await linha(mC)).toMatchObject({ status: "erro", erro: "consolidacao-interrompida", reservada_para_mensagem_id: ancora, cancelamento_motivo: null });
    expect(await linha(mD2)).toMatchObject({ status: "processando", reservada_para_mensagem_id: outraAncora });
  });

  it.skipIf(!temDbUrl)("6. falha injetada no fim da transação: A, B/C e as notas continuam exatamente como antes (LOCAL_SUPABASE_DB_URL)", async () => {
    const { imA, imB, imC, ancora, mB, mC } = await cenarioABC();
    const antes = { A: await linha(ancora), B: await linha(mB), C: await linha(mC), notasA: await notasDoImovel(imA) };
    // O gatilho dispara na ÚLTIMA escrita da RPC (âncora → enviada), depois
    // das absorvidas e das notas: se a transação não fosse uma só, elas
    // ficariam gravadas.
    sqlLocal([
      `create or replace function public.__injetar_falha_efetivacao() returns trigger language plpgsql as $$
      begin
        if new.status = 'enviada' and new.id = '${ancora}'::uuid then
          raise exception 'falha injetada pelo teste' using errcode = 'P0001';
        end if;
        return new;
      end $$`,
      "drop trigger if exists __trg_injetar_falha_efetivacao on public.mensagens_agendadas",
      `create trigger __trg_injetar_falha_efetivacao before update on public.mensagens_agendadas
        for each row execute function public.__injetar_falha_efetivacao()`,
    ]);
    try {
      const { data, error } = await service.rpc("efetivar_consolidacao_contato", {
        p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC],
        p_notas: [{ imovel_id: imA, nota: nota("ext-9", TEXTO) }, { imovel_id: imB, nota: nota("ext-9", TEXTO) }],
      });
      expect(data).toBeNull();
      expect(error?.message).toContain("falha injetada");
    } finally {
      sqlLocal([
        "drop trigger if exists __trg_injetar_falha_efetivacao on public.mensagens_agendadas",
        "drop function if exists public.__injetar_falha_efetivacao()",
      ]);
    }
    expect(await linha(ancora)).toEqual(antes.A);
    expect(await linha(mB)).toEqual(antes.B);
    expect(await linha(mC)).toEqual(antes.C);
    expect(await notasDoImovel(imA)).toEqual(antes.notasA);
    expect(await notasDoImovel(imB)).toEqual([]);
    // E depois de remover a injeção, a mesma chamada efetiva tudo.
    const depois = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC], p_notas: [{ imovel_id: imA, nota: nota("ext-9", TEXTO) }] });
    expect(depois.data).toMatchObject({ ok: true, absorvidas_total: 2, notas_gravadas: 1 });
  });

  it("uma nota que falha (imóvel fora da lista) fica em savepoint: o núcleo é gravado e a falha é devolvida", async () => {
    const { imA, imB, imC, ancora, mB } = await cenarioABC();
    const imD = await criarImovel(a, aId, "D");
    const { data } = await service.rpc("efetivar_consolidacao_contato", {
      p_mensagem_id: ancora, p_user_id: aId, p_texto: TEXTO, p_imoveis_consultados: [imA, imB, imC],
      p_notas: [{ imovel_id: imA, nota: nota("ext-4", TEXTO) }, { imovel_id: imD, nota: nota("ext-4", TEXTO) }],
    });
    expect(data).toMatchObject({ ok: true, absorvidas_total: 2, notas_gravadas: 1, notas_falhas: [{ imovel_id: imD, erro: "22023" }] });
    expect(await linha(ancora)).toMatchObject({ status: "enviada" });
    expect(await linha(mB)).toMatchObject({ status: "cancelada", cancelamento_motivo: "contato-consolidado" });
    expect(await notasDoImovel(imD)).toEqual([]);
  });
});

describe("varredura do claim: reserva órfã ≠ envio individual", () => {
  it("4/5/7. crash entre reserva e efetivação: 10 min depois a reserva vira consolidacao-interrompida com o vínculo, a âncora vira processamento-interrompido, e nada volta à fila nem vira contato", async () => {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(a, aId, "B");
    const ancora = await criarVerificacao(a, aId, imA, "2099-09-22T11:00:00.000Z");
    const cand = await criarVerificacao(a, aId, imB, "2099-09-22T11:02:00.000Z");
    await reclamar(ancora);
    expect((await reservar(ancora, cand)).data).toHaveLength(1);
    const antiga = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    expect((await service.from("mensagens_agendadas").update({ updated_at: antiga }).in("id", [ancora, cand])).error).toBeNull();

    const claim = await service.rpc("claim_mensagens_agendadas", { p_limite: 5 });
    expect(claim.error).toBeNull();
    expect((claim.data as Array<{ id: string }>).map((m) => m.id)).not.toContain(cand);

    expect(await linha(cand)).toMatchObject({
      status: "erro", erro: "consolidacao-interrompida", reservada_para_mensagem_id: ancora,
      cancelamento_motivo: null, consolidada_em_mensagem_id: null,
    });
    expect(await linha(ancora)).toMatchObject({ status: "erro", erro: "processamento-interrompido" });
    // Uma segunda varredura não muda nada (idempotente) e não reclama nenhuma das duas.
    const segunda = await service.rpc("claim_mensagens_agendadas", { p_limite: 5 });
    expect((segunda.data as Array<{ id: string }>).map((m) => m.id)).not.toContain(cand);
    expect(await linha(cand)).toMatchObject({ status: "erro", erro: "consolidacao-interrompida" });
    // E a efetivação tardia não transforma isso em contato realizado.
    const tardia = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: ancora, p_user_id: aId, p_texto: "x", p_imoveis_consultados: [imA, imB] });
    expect(tardia.data).toMatchObject({ ok: false, motivo: "ancora-nao-processando", status: "erro" });
    expect(await linha(cand)).toMatchObject({ status: "erro", cancelamento_motivo: null });
  });

  it("uma reserva viva (recente) não é varrida nem reclamada por outro worker", async () => {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(a, aId, "B");
    const ancora = await criarVerificacao(a, aId, imA, "2099-09-22T11:00:00.000Z");
    const cand = await criarVerificacao(a, aId, imB, "2099-09-22T11:02:00.000Z");
    await reclamar(ancora);
    expect((await reservar(ancora, cand)).data).toHaveLength(1);
    const claim = await service.rpc("claim_mensagens_agendadas", { p_limite: 5 });
    expect(claim.error).toBeNull();
    expect((claim.data as Array<{ id: string }>).map((m) => m.id)).not.toContain(cand);
    expect(await linha(cand)).toMatchObject({ status: "processando", reservada_para_mensagem_id: ancora });
  });

  it("1. desistência antes do POST: a reserva volta a `agendada` limpa e pode ser reclamada normalmente depois", async () => {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(a, aId, "B");
    const ancora = await criarVerificacao(a, aId, imA, "2099-09-22T11:00:00.000Z");
    const cand = await criarVerificacao(a, aId, imB, "2099-09-22T11:02:00.000Z");
    await reclamar(ancora);
    expect((await reservar(ancora, cand)).data).toHaveLength(1);
    const liberada = await service.from("mensagens_agendadas")
      .update({ status: "agendada", reservada_para_mensagem_id: null, updated_at: new Date().toISOString() })
      .eq("id", cand).eq("status", "processando").eq("reservada_para_mensagem_id", ancora).select("id");
    expect(liberada.data).toHaveLength(1);
    expect(await linha(cand)).toMatchObject({ status: "agendada", reservada_para_mensagem_id: null, cancelamento_motivo: null });
  });

  it("3. resultado incerto depois do POST: a reserva vira erro próprio, mantém o vínculo, e nunca é reclamada de novo", async () => {
    const imA = await criarImovel(a, aId, "A");
    const imB = await criarImovel(a, aId, "B");
    const ancora = await criarVerificacao(a, aId, imA, "2099-09-22T11:00:00.000Z");
    const cand = await criarVerificacao(a, aId, imB, "2099-09-22T11:02:00.000Z");
    await reclamar(ancora);
    expect((await reservar(ancora, cand)).data).toHaveLength(1);
    const incerta = await service.from("mensagens_agendadas")
      .update({ status: "erro", erro: "consolidacao-resultado-incerto", updated_at: new Date().toISOString() })
      .eq("id", cand).eq("status", "processando").eq("reservada_para_mensagem_id", ancora).select("id");
    expect(incerta.data).toHaveLength(1);
    expect(await linha(cand)).toMatchObject({ status: "erro", erro: "consolidacao-resultado-incerto", reservada_para_mensagem_id: ancora, cancelamento_motivo: null });
    const claim = await service.rpc("claim_mensagens_agendadas", { p_limite: 5 });
    expect((claim.data as Array<{ id: string }>).map((m) => m.id)).not.toContain(cand);
  });

  it("12. mensagens `livre` seguem intocadas por reserva, RPC e varredura", async () => {
    const im = await criarImovel(a, aId, "A");
    const { data, error } = await a.from("mensagens_agendadas").insert({
      user_id: aId, imovel_id: im, nome_proprietario: "x", telefone: "43999999999", mensagem: "Livre",
      data_envio: "2099-09-22T11:00:00.000Z", status: "agendada",
    }).select("id").single();
    expect(error).toBeNull();
    const livre = data!.id as string;
    await reclamar(livre);
    const efetivada = await service.rpc("efetivar_consolidacao_contato", { p_mensagem_id: livre, p_user_id: aId, p_texto: "Livre", p_imoveis_consultados: [im] });
    expect(efetivada.data).toMatchObject({ ok: false, motivo: "ancora-nao-verificacao" });
    expect(await linha(livre)).toMatchObject({ status: "processando", reservada_para_mensagem_id: null, imoveis_consultados: null });
  });
});
