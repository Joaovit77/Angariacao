/* Fase 1a-C2.1b.2 no PostgreSQL + PostgREST locais: a consolidação M3/M4
   dentro da identidade da mensagem por conta.

   Invariante: para a identidade X (user_id + id externo) e o conjunto
   consultado S, ao fim da efetivação sem conflito os imóveis que têm X são
   exatamente S. N cópias em S são deliberadas; nenhuma fora de S. O eco
   `fromMe` dentro de S é substituído, fora de S é removido; qualquer outra
   ocorrência fora de S é conflito, que desfaz SÓ o histórico: o envio já
   aconteceu, então âncora `enviada` e absorvidas `contato-consolidado`
   ficam, exatamente uma vez.

   As chamadas concorrentes são DETERMINÍSTICAS, como na integração da
   1a-C2.1b.1: uma sessão `psql` segura `for update` numa linha, e cada
   chamada só é disparada depois que `pg_stat_activity` mostra a anterior
   esperando lock.

   Como rodar (banco local com o baseline + migrations até a 20260930120000):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     LOCAL_SUPABASE_DB_CONTAINER=supabase_db_<projeto> \
     node node_modules/vitest/vitest.mjs run --config vitest.consolidacao-identidade-supabase-local.config.ts */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
const container = process.env.LOCAL_SUPABASE_DB_CONTAINER || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração da consolidação por conta requer Supabase LOCAL e chaves locais explícitas.");
}
if (!/^supabase_db_[\w-]+$/.test(container)) {
  throw new Error("Integração da consolidação por conta requer LOCAL_SUPABASE_DB_CONTAINER (container do banco local).");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const usuariosCriados: string[] = [];
let userA: string;
let userB: string;
let clienteA: SupabaseClient;

type Nota = Record<string, unknown> & { id: string };
type Efetivacao = {
  ok: boolean;
  motivo?: string;
  absorvidas?: string[];
  absorvidas_total?: number;
  notas_gravadas?: number;
  notas_falhas?: Array<{ imovel_id: string | null; erro: string }>;
  historico?: { resultado: string; imoveis_eco?: string[]; erro?: string } | null;
};

/* ----------------------------------------------------------------
   Acesso direto ao banco local (barreira, inspeção, falha injetada)
   ---------------------------------------------------------------- */
const argsPsql = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];

function psql(sql: string): string {
  return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8" });
}

async function esperar(condicao: () => boolean, rotulo: string, limiteMs = 15_000) {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) throw new Error(`barreira: tempo esgotado esperando ${rotulo}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Sessões paradas em lock (linha ou advisory) executando uma das RPCs. */
function esperandoLock(): number {
  const saida = psql(
    "select count(*) from pg_stat_activity where wait_event_type = 'Lock' " +
      "and (query ilike '%registrar_nota_whatsapp%' or query ilike '%efetivar_consolidacao_contato%') " +
      "and pid <> pg_backend_pid();",
  );
  return Number(saida.trim());
}

/** Segura `for update` nas linhas; dispara as ações uma a uma, só depois de
    a anterior estar esperando lock; libera; devolve os resultados. */
async function comBarreira<T>(
  tabela: "imoveis" | "mensagens_agendadas",
  ids: string[],
  acoes: Array<() => Promise<T>>,
): Promise<T[]> {
  const holder: ChildProcessWithoutNullStreams = spawn("docker", argsPsql);
  let saida = "";
  holder.stdout.on("data", (d) => (saida += String(d)));
  holder.stderr.on("data", (d) => (saida += String(d)));
  const lista = ids.map((id) => `'${id}'`).join(",");
  holder.stdin.write(`begin;\nselect id from public.${tabela} where id in (${lista}) for update;\nselect 'barreira-pronta';\n`);
  await esperar(() => saida.includes("barreira-pronta"), "a barreira travar as linhas");

  const promessas: Promise<T>[] = [];
  for (let i = 0; i < acoes.length; i += 1) {
    promessas.push(acoes[i]());
    await esperar(() => esperandoLock() >= i + 1, `a chamada ${i + 1} esperar lock`);
  }
  holder.stdin.write("commit;\n\\q\n");
  await new Promise((r) => holder.on("close", r));
  return Promise.all(promessas);
}

/* ----------------------------------------------------------------
   Dados
   ---------------------------------------------------------------- */
async function novoUsuario() {
  const email = `consolidacao-identidade-${randomUUID()}@example.invalid`;
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

async function novoImovel(userId: string, notas: Nota[] = []): Promise<string> {
  const r = await service
    .from("imoveis")
    .insert({
      user_id: userId,
      endereco: `Rua Consolidação ${randomUUID().slice(0, 8)}, 10`,
      status: "Publicado",
      proprietario_nome: "Proprietário local",
      proprietario_telefone: "43999999999",
      notas,
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

async function novaVerificacao(userId: string, imovelId: string, status: "agendada" | "processando") {
  const r = await service
    .from("mensagens_agendadas")
    .insert({
      user_id: userId,
      imovel_id: imovelId,
      nome_proprietario: "substituído pelo trigger",
      telefone: "43999999999",
      mensagem: "Verificação de teste local",
      data_envio: "2099-09-22T11:00:00.000Z",
      status: "agendada",
      tipo: "verificacao-disponibilidade",
    })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  const id = r.data!.id as string;
  if (status === "processando") {
    const claim = await service.from("mensagens_agendadas").update({ status: "processando" }).eq("id", id);
    expect(claim.error).toBeNull();
  }
  return id;
}

/** A consolidação pronta para efetivar: âncora `processando` no primeiro
    imóvel, uma candidata reservada para cada um dos outros. */
async function cenario(imoveis: string[], userId = userA) {
  const ancora = await novaVerificacao(userId, imoveis[0], "processando");
  const absorvidas: string[] = [];
  for (const imovel of imoveis.slice(1)) {
    const candidata = await novaVerificacao(userId, imovel, "agendada");
    const reserva = await service
      .from("mensagens_agendadas")
      .update({ status: "processando", reservada_para_mensagem_id: ancora })
      .eq("id", candidata)
      .select("id");
    expect(reserva.error).toBeNull();
    expect(reserva.data).toHaveLength(1);
    absorvidas.push(candidata);
  }
  return { ancora, absorvidas };
}

async function linha(id: string) {
  const r = await service
    .from("mensagens_agendadas")
    .select("status,erro,mensagem,imoveis_consultados,cancelamento_motivo,consolidada_em_mensagem_id,reservada_para_mensagem_id")
    .eq("id", id)
    .single();
  expect(r.error).toBeNull();
  return r.data!;
}

async function notas(imovelId: string): Promise<Nota[]> {
  const r = await service.from("imoveis").select("notas").eq("id", imovelId).single();
  expect(r.error).toBeNull();
  return ((r.data!.notas as Nota[] | null) || []) as Nota[];
}

/** Onde a mensagem existe na conta: `imóvel|id da nota|origem`, ordenado. */
function ondeEsta(userId: string, mid: string): string[] {
  const saida = psql(
    `select i.id::text || '|' || (n.nota->>'id') || '|' || coalesce(n.nota->>'origem','') from public.imoveis i, ` +
      `jsonb_array_elements(coalesce(i.notas,'[]'::jsonb)) n(nota) where i.user_id = '${userId}' ` +
      `and public.whatsapp_mensagem_externa_id(n.nota->>'id') = '${mid}' order by 1;`,
  );
  return saida.split("\n").filter(Boolean);
}

const mid = () => `3EB0${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`;
const TEXTO = "Olá! Os imóveis continuam disponíveis?";
const consolidada = (id: string): Nota => ({
  id: `wa-enviada:${id}`, texto: `Mensagem enviada pelo WhatsApp: ${TEXTO}`, data: "2099-09-22T08:00:30",
  direcao: "enviada", autor: "corretor", tipo: "conversation", origem: "agendamento",
});
const eco = (id: string): Nota => ({
  id: `wa-enviada:${id}`, texto: `Mensagem enviada pelo WhatsApp: ${TEXTO}`, data: "2099-09-22T08:00:31",
  direcao: "enviada", autor: "corretor", tipo: "conversation", origem: "webhook-evolution",
  atribuicao: { versao: 1, autoridade: "motor", estado: "resolvido", nivel: "N4" },
});
const manual = (n: number): Nota => ({ id: `manual-${n}`, texto: `anotação ${n}`, data: "2099-09-20T10:00:00" });
/** Onde cada imóvel de S deveria estar ao fim: a nota da consolidação. */
const emS = (imoveis: string[], id: string) =>
  [...new Set(imoveis)].map((im) => `${im}|wa-enviada:${id}|agendamento`).sort();

async function efetivar(ancora: string, imoveis: string[], nota: Nota | null, userId = userA, extra: Record<string, unknown> = {}) {
  const r = await service.rpc("efetivar_consolidacao_contato", {
    p_mensagem_id: ancora,
    p_user_id: userId,
    p_texto: TEXTO,
    p_imoveis_consultados: imoveis,
    p_notas: nota ? imoveis.map((imovel_id) => ({ imovel_id, nota })) : [],
    p_enviado_em: "2099-09-22T11:00:30.000Z",
    ...extra,
  });
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  return r.data as Efetivacao;
}

async function conta(userId: string, imovelId: string, nota: Nota) {
  const r = await service.rpc("registrar_nota_whatsapp_conta", { p_user_id: userId, p_imovel_id: imovelId, p_nota: nota });
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  return r.data as string;
}

/** Os efeitos do envio, que acontecem exatamente uma vez com ou sem histórico. */
async function efeitosAplicados(ancora: string, absorvidas: string[], imoveis: string[]) {
  expect(await linha(ancora)).toMatchObject({ status: "enviada", mensagem: TEXTO, imoveis_consultados: imoveis, erro: null });
  for (const id of absorvidas) {
    expect(await linha(id)).toMatchObject({
      status: "cancelada", cancelamento_motivo: "contato-consolidado", consolidada_em_mensagem_id: ancora, reservada_para_mensagem_id: null,
    });
  }
}

beforeAll(async () => {
  const a = await novoUsuario();
  userA = a.id;
  clienteA = a.cliente;
  userB = (await novoUsuario()).id;
});

afterAll(async () => {
  await service.from("mensagens_agendadas").delete().in("user_id", usuariosCriados);
  await service.from("imoveis").delete().in("user_id", usuariosCriados);
  for (const id of usuariosCriados) await service.auth.admin.deleteUser(id);
});

/* ================================================================
   SEQUENCIAL
   ================================================================ */
describe("efetivação da consolidação pela identidade por conta (Postgres real)", () => {
  it("1. nada na conta: X em A, B e C (N cópias deliberadas), efeitos uma vez", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const { ancora, absorvidas } = await cenario(S);
    const id = mid();
    const r = await efetivar(ancora, S, consolidada(id));
    expect(r).toMatchObject({ ok: true, absorvidas_total: 2, notas_gravadas: 3, notas_falhas: [], historico: { resultado: "gravada", imoveis_eco: [] } });
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    for (const im of S) expect(await notas(im)).toEqual([consolidada(id)]);
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("2. reexecução: recusada pela âncora, nada duplicado, nenhum efeito repetido", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA)];
    const { ancora, absorvidas } = await cenario(S);
    const id = mid();
    expect((await efetivar(ancora, S, consolidada(id))).ok).toBe(true);
    const antes = { ancora: await linha(ancora), absorvida: await linha(absorvidas[0]) };
    expect(await efetivar(ancora, S, consolidada(id))).toMatchObject({ ok: false, motivo: "ancora-nao-processando" });
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    expect(await linha(ancora)).toEqual(antes.ancora);
    expect(await linha(absorvidas[0])).toEqual(antes.absorvida);
  });

  it("3. eco em D (fora de S) antes: D perde SÓ o eco, S completo, reconciliação informada", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const id = mid();
    const D = await novoImovel(userA, [manual(1), eco(id), manual(2)]);
    const { ancora, absorvidas } = await cenario(S);
    const r = await efetivar(ancora, S, consolidada(id));
    expect(r).toMatchObject({ ok: true, notas_gravadas: 3, notas_falhas: [], historico: { resultado: "origem-reconciliou-eco", imoveis_eco: [D] } });
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    expect(await notas(D)).toEqual([manual(1), manual(2)]);
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("4/14. consolidação antes, eco depois: o webhook entende as N cópias legítimas e não cria D", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const D = await novoImovel(userA);
    const { ancora } = await cenario(S);
    const id = mid();
    expect((await efetivar(ancora, S, consolidada(id))).historico).toMatchObject({ resultado: "gravada" });
    expect(await conta(userA, D, eco(id))).toBe("duplicada-outro-imovel");
    expect(await conta(userA, S[1], eco(id))).toBe("duplicada-mesmo-imovel");
    expect(await conta(userA, S[2], eco(id))).toBe("duplicada-mesmo-imovel");
    expect(await notas(D)).toEqual([]);
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
  });

  it("5. eco em B (dentro de S) antes: substituído no lugar pela nota da origem, sem `atribuicao`", async () => {
    const id = mid();
    const A = await novoImovel(userA);
    const B = await novoImovel(userA, [manual(1), eco(id), manual(2)]);
    const C = await novoImovel(userA);
    const S = [A, B, C];
    const { ancora, absorvidas } = await cenario(S);
    const r = await efetivar(ancora, S, consolidada(id));
    expect(r).toMatchObject({ ok: true, notas_gravadas: 3, historico: { resultado: "origem-reconciliou-eco", imoveis_eco: [] } });
    expect(await notas(B)).toEqual([manual(1), consolidada(id), manual(2)]);
    expect(await notas(A)).toEqual([consolidada(id)]);
    expect(await notas(C)).toEqual([consolidada(id)]);
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("eco dentro E fora de S ao mesmo tempo: os dois reconciliados numa efetivação", async () => {
    const id = mid();
    const A = await novoImovel(userA);
    const B = await novoImovel(userA, [eco(id)]);
    const D = await novoImovel(userA, [eco(id)]);
    const S = [A, B];
    const { ancora } = await cenario(S);
    const r = await efetivar(ancora, S, consolidada(id));
    expect(r.historico).toEqual({ resultado: "origem-reconciliou-eco", imoveis_eco: [D] });
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    expect(await notas(D)).toEqual([]);
  });

  it.each([
    ["recebida `wa:`", (id: string): Nota => ({ id: `wa:${id}`, texto: "Resposta pelo WhatsApp: oi", data: "2099-09-22T08:00:00", direcao: "recebida", origem: "webhook-evolution" })],
    ["importada `wa-contexto-enviada:`", (id: string): Nota => ({ id: `wa-contexto-enviada:${id}`, texto: "importada", data: "2099-09-22T08:00:00", direcao: "enviada", origem: "importacao-conversa" })],
    ["importada `wa-contexto-recebida:`", (id: string): Nota => ({ id: `wa-contexto-recebida:${id}`, texto: "importada", data: "2099-09-22T08:00:00", direcao: "recebida", origem: "importacao-conversa" })],
    ["enviada pelo painel (api-evolution)", (id: string): Nota => ({ ...consolidada(id), origem: "api-evolution" })],
    ["enviada por outro agendamento", (id: string): Nota => ({ ...consolidada(id), data: "2099-09-21T08:00:00" })],
    ["sem origem", (id: string): Nota => ({ id: `wa-enviada:${id}`, texto: "sem origem", data: "2099-09-22T08:00:00" })],
  ])("6/19. %s fora de S: conflito, histórico intocado em TODOS os imóveis, efeitos do envio aplicados uma vez", async (_, ocorrencia) => {
    const id = mid();
    const A = await novoImovel(userA);
    const B = await novoImovel(userA, [eco(id)]); // eco em S: NÃO pode ser substituído
    const D = await novoImovel(userA, [eco(id)]); // eco reconciliável fora de S: NÃO pode ser removido
    const E = await novoImovel(userA, [manual(1), ocorrencia(id)]);
    const S = [A, B];
    const antes = { A: await notas(A), B: await notas(B), D: await notas(D), E: await notas(E) };
    const { ancora, absorvidas } = await cenario(S);
    const r = await efetivar(ancora, S, consolidada(id));
    expect(r).toMatchObject({
      ok: true, absorvidas_total: 1, notas_gravadas: 0,
      notas_falhas: [{ imovel_id: null, erro: "conflito" }],
      historico: { resultado: "conflito", imoveis_eco: [] },
    });
    expect({ A: await notas(A), B: await notas(B), D: await notas(D), E: await notas(E) }).toEqual(antes);
    // O envio foi confirmado: nada de resultado incerto.
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("decisão 2: ocorrência não-eco DENTRO de S conta como presente e é preservada", async () => {
    const id = mid();
    const importada: Nota = { id: `wa-contexto-enviada:${id}`, texto: "importada", data: "2099-09-22T08:00:00", direcao: "enviada", origem: "importacao-conversa" };
    const A = await novoImovel(userA);
    const B = await novoImovel(userA, [importada]);
    const C = await novoImovel(userA);
    const S = [A, B, C];
    const { ancora } = await cenario(S);
    const r = await efetivar(ancora, S, consolidada(id));
    expect(r).toMatchObject({ ok: true, notas_gravadas: 3, historico: { resultado: "gravada" } });
    expect(await notas(B)).toEqual([importada]);
    expect(await notas(A)).toEqual([consolidada(id)]);
    expect(await notas(C)).toEqual([consolidada(id)]);
  });

  it("7. mesmo id externo em outra conta: intocado, e não conta como ocorrência", async () => {
    const id = mid();
    const deB = await novoImovel(userB, [eco(id)]);
    const S = [await novoImovel(userA), await novoImovel(userA)];
    const { ancora } = await cenario(S);
    expect((await efetivar(ancora, S, consolidada(id))).historico).toEqual({ resultado: "gravada", imoveis_eco: [] });
    expect(await notas(deB)).toEqual([eco(id)]);
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
  });

  it("8/10. imóvel de outra conta ou inexistente em S: recusa ANTES de qualquer escrita (efeitos e histórico)", async () => {
    const id = mid();
    const A = await novoImovel(userA);
    const B = await novoImovel(userA);
    const deB = await novoImovel(userB);
    for (const intruso of [deB, randomUUID()]) {
      const { ancora, absorvidas } = await cenario([A, B]);
      const r = await efetivar(ancora, [A, B, intruso], consolidada(id));
      expect(r).toEqual({ ok: false, motivo: "imovel-de-outra-conta" });
      expect(await linha(ancora)).toMatchObject({ status: "processando", imoveis_consultados: null });
      expect(await linha(absorvidas[0])).toMatchObject({ status: "processando", reservada_para_mensagem_id: ancora });
      expect(ondeEsta(userA, id)).toEqual([]);
      expect(await notas(deB)).toEqual([]);
      // Libera para a próxima volta do laço.
      await service.from("mensagens_agendadas").update({ status: "erro", reservada_para_mensagem_id: null }).in("id", [ancora, ...absorvidas]);
    }
  });

  it("9. imóvel repetido no conjunto: uma nota por imóvel; `imoveis_consultados` fica como veio", async () => {
    const A = await novoImovel(userA);
    const B = await novoImovel(userA);
    const C = await novoImovel(userA);
    const { ancora } = await cenario([A, B, C]);
    const id = mid();
    const lista = [A, B, B, C];
    const r = await efetivar(ancora, lista, consolidada(id));
    expect(r).toMatchObject({ ok: true, notas_gravadas: 3, notas_falhas: [] });
    expect(ondeEsta(userA, id)).toEqual(emS([A, B, C], id));
    expect(await notas(B)).toEqual([consolidada(id)]);
    expect((await linha(ancora)).imoveis_consultados).toEqual(lista);
  });

  it("11. fallback interno (`agendamento:<uuid>`): N notas deliberadas, lock próprio, sem correlação com eco", async () => {
    const interno = `agendamento:${randomUUID()}`;
    const S = [await novoImovel(userA), await novoImovel(userA)];
    const { ancora } = await cenario(S);
    const r = await efetivar(ancora, S, consolidada(interno));
    expect(r).toMatchObject({ ok: true, notas_gravadas: 2, historico: { resultado: "gravada" } });
    expect(ondeEsta(userA, interno)).toEqual(emS(S, interno));
  });

  it("sem notas: efeitos gravados e nenhum histórico (contrato anterior preservado)", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA)];
    const { ancora, absorvidas } = await cenario(S);
    const r = await efetivar(ancora, S, null);
    expect(r).toMatchObject({ ok: true, absorvidas_total: 1, notas_gravadas: 0, notas_falhas: [], historico: null });
    await efeitosAplicados(ancora, absorvidas, S);
    for (const im of S) expect(await notas(im)).toEqual([]);
  });

  it("notas diferentes para a mesma mensagem: nenhum histórico, efeitos gravados", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA)];
    const { ancora, absorvidas } = await cenario(S);
    const id = mid();
    const r = await efetivar(ancora, S, null, userA, {
      p_notas: [{ imovel_id: S[0], nota: consolidada(id) }, { imovel_id: S[1], nota: { ...consolidada(id), texto: "outro" } }],
    });
    expect(r).toMatchObject({
      ok: true, notas_gravadas: 0,
      notas_falhas: [{ imovel_id: S[1], erro: "22023" }],
      historico: { resultado: "notas-incoerentes" },
    });
    expect(ondeEsta(userA, id)).toEqual([]);
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("falha SQL no MEIO do histórico: nenhuma cópia parcial fica, os efeitos ficam, a falha volta", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const alvo = [...S].sort()[2]; // o último na ordem de id: os outros já foram gravados quando ele falha
    const { ancora, absorvidas } = await cenario(S);
    const id = mid();
    psql(`create or replace function public.__injetar_falha_historico() returns trigger language plpgsql as $$
      begin
        if new.id = '${alvo}'::uuid then raise exception 'falha injetada no histórico' using errcode = 'P0001'; end if;
        return new;
      end $$;
      create trigger __trg_injetar_falha_historico before update on public.imoveis
        for each row execute function public.__injetar_falha_historico();\n`);
    let r: Efetivacao;
    try {
      r = await efetivar(ancora, S, consolidada(id));
    } finally {
      psql("drop trigger if exists __trg_injetar_falha_historico on public.imoveis;\ndrop function if exists public.__injetar_falha_historico();\n");
    }
    expect(r).toMatchObject({
      ok: true, notas_gravadas: 0,
      notas_falhas: [{ imovel_id: null, erro: "falha" }],
      historico: { resultado: "falha", erro: "P0001" },
    });
    expect(ondeEsta(userA, id)).toEqual([]);
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("segurança: continua definer, search_path vazio, só service_role; o navegador não executa", async () => {
    const S = [await novoImovel(userA)];
    const { ancora } = await cenario(S);
    const pelaSessao = await clienteA.rpc("efetivar_consolidacao_contato", {
      p_mensagem_id: ancora, p_user_id: userA, p_texto: TEXTO, p_imoveis_consultados: S, p_notas: [],
    });
    expect(pelaSessao.error?.code).toBe("42501");
    expect(await linha(ancora)).toMatchObject({ status: "processando" });
    expect(psql(
      "select p.prosecdef::text || '|' || array_to_string(p.proconfig, ',') || '|' || " +
        "has_function_privilege('anon', p.oid, 'execute')::text || '|' || has_function_privilege('authenticated', p.oid, 'execute')::text || '|' || " +
        "has_function_privilege('service_role', p.oid, 'execute')::text from pg_proc p where p.proname = 'efetivar_consolidacao_contato';",
    ).trim()).toBe('true|search_path=""|false|false|true');
  });
});

/* ================================================================
   CONCORRÊNCIA COM BARREIRA
   ================================================================ */
describe("concorrência com barreira", () => {
  it("12A. consolidação pega o lock primeiro × eco em D: termina em S, D nunca é criado", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const D = await novoImovel(userA);
    const { ancora } = await cenario(S);
    const id = mid();
    // A barreira segura uma linha de S: a efetivação pega o advisory lock e
    // para nela; o eco chega depois e para no advisory lock.
    const [efetivacao, webhook] = await comBarreira<unknown>("imoveis", [S[0]], [
      () => efetivar(ancora, S, consolidada(id)),
      () => conta(userA, D, eco(id)),
    ]);
    expect((efetivacao as Efetivacao).historico).toEqual({ resultado: "gravada", imoveis_eco: [] });
    expect(webhook).toBe("duplicada-outro-imovel");
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
  });

  it("12B. eco em D pega o lock primeiro × consolidação: D removido, termina em S", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const D = await novoImovel(userA);
    const { ancora } = await cenario(S);
    const id = mid();
    // A barreira segura D: o webhook pega o advisory lock e para em D; a
    // efetivação chega depois e para no advisory lock.
    const [webhook, efetivacao] = await comBarreira<unknown>("imoveis", [D], [
      () => conta(userA, D, eco(id)),
      () => efetivar(ancora, S, consolidada(id)),
    ]);
    expect(webhook).toBe("gravada");
    expect((efetivacao as Efetivacao).historico).toEqual({ resultado: "origem-reconciliou-eco", imoveis_eco: [D] });
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    expect(await notas(D)).toEqual([]);
  });

  it("12C. eco em B (dentro de S) pega o lock primeiro × consolidação: B substituído, termina em S", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const B = S[1];
    const { ancora } = await cenario(S);
    const id = mid();
    const [webhook, efetivacao] = await comBarreira<unknown>("imoveis", [B], [
      () => conta(userA, B, eco(id)),
      () => efetivar(ancora, S, consolidada(id)),
    ]);
    expect(webhook).toBe("gravada");
    expect((efetivacao as Efetivacao).historico).toEqual({ resultado: "origem-reconciliou-eco", imoveis_eco: [] });
    expect(await notas(B)).toEqual([consolidada(id)]);
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
  });

  it("13. duas efetivações simultâneas da mesma âncora: uma efetiva, a outra é recusada; notas e efeitos uma vez", async () => {
    const S = [await novoImovel(userA), await novoImovel(userA), await novoImovel(userA)];
    const { ancora, absorvidas } = await cenario(S);
    const id = mid();
    const resultados = await comBarreira<Efetivacao>("mensagens_agendadas", [ancora], [
      () => efetivar(ancora, S, consolidada(id)),
      () => efetivar(ancora, S, consolidada(id)),
    ]);
    const [primeira, segunda] = resultados;
    expect(primeira).toMatchObject({ ok: true, absorvidas_total: 2, historico: { resultado: "gravada" } });
    expect(segunda).toMatchObject({ ok: false, motivo: "ancora-nao-processando" });
    expect(ondeEsta(userA, id)).toEqual(emS(S, id));
    await efeitosAplicados(ancora, absorvidas, S);
  });

  it("lock order: consolidação (mensagem → advisory → imóveis) × origem do painel em imóvel de S com outra mensagem, sem deadlock", async () => {
    // Duas identidades diferentes disputando a mesma linha de imóvel: nenhuma
    // das duas segura linha de `mensagens_agendadas` que a outra queira.
    const S = [await novoImovel(userA), await novoImovel(userA)];
    const { ancora } = await cenario(S);
    const x = mid();
    const y = mid();
    const [efetivacao, painel] = await comBarreira<unknown>("imoveis", [S[1]], [
      () => efetivar(ancora, S, consolidada(x)),
      async () => {
        const r = await service.rpc("registrar_nota_whatsapp_origem", {
          p_user_id: userA, p_imovel_ids: [S[1]], p_nota: { ...consolidada(y), origem: "api-evolution" },
        });
        return r.error ? `erro:${r.error.code}` : (r.data as { resultado: string }).resultado;
      },
    ]);
    expect((efetivacao as Efetivacao).ok).toBe(true);
    expect(painel).toBe("gravada");
    expect(ondeEsta(userA, x)).toEqual(emS(S, x));
    expect(ondeEsta(userA, y)).toEqual([`${S[1]}|wa-enviada:${y}|api-evolution`]);
  });
});
