/* M3/M4 no PostgreSQL + PostgREST locais: a função interna única de
   transição de disponibilidade, as duas RPCs que a autorizam e o trigger
   que a chama com NEW.id + NEW.user_id. Opt-in, só contra Supabase LOCAL. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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
