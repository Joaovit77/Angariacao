/* Fase 1a-C2.1b.1 no PostgreSQL + PostgREST locais: identidade da mensagem
   do WhatsApp por conta e precedência da origem sobre o eco `fromMe`.
   Opt-in, só contra Supabase LOCAL, como os outros `*-supabase-local`.

   As chamadas concorrentes são DETERMINÍSTICAS, não "Promise.all e torcer":
   uma sessão `psql` segura `for update` nas linhas dos imóveis, e cada
   chamada só é disparada depois que `pg_stat_activity` mostra a anterior
   esperando lock. Na liberação, a ordem de quem tem o advisory lock é a
   ordem em que foram disparadas.

   Como rodar (banco local com o baseline + migrations + a migration nova):
     LOCAL_SUPABASE_URL=http://127.0.0.1:54321 \
     LOCAL_SUPABASE_ANON_KEY=... LOCAL_SUPABASE_SERVICE_ROLE_KEY=... \
     LOCAL_SUPABASE_DB_CONTAINER=supabase_db_<projeto> \
     node node_modules/vitest/vitest.mjs run --config vitest.whatsapp-identidade-supabase-local.config.ts */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
const container = process.env.LOCAL_SUPABASE_DB_CONTAINER || "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração de identidade do WhatsApp requer Supabase LOCAL e chaves locais explícitas.");
}
if (!/^supabase_db_[\w-]+$/.test(container)) {
  throw new Error("Integração de identidade do WhatsApp requer LOCAL_SUPABASE_DB_CONTAINER (container do banco local).");
}

const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const usuariosCriados: string[] = [];
let userA: string;
let userB: string;
let clienteA: SupabaseClient;

type Nota = Record<string, unknown> & { id: string };

/* ----------------------------------------------------------------
   Acesso direto ao banco local (só para barreira, inspeção e o
   controle "sem lock")
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

/** Quantas sessões estão paradas em lock executando uma das RPCs (ou o
    controle sem lock). É o que torna a ordem determinística. */
function esperandoLock(): number {
  const saida = psql(
    "select count(*) from pg_stat_activity where wait_event_type = 'Lock' " +
      "and query ilike '%registrar_nota_whatsapp%' and pid <> pg_backend_pid();",
  );
  return Number(saida.trim());
}

/** Segura `for update` nas linhas; dispara as ações uma a uma, só depois de
    a anterior estar esperando lock; libera; devolve os resultados. */
async function comBarreira<T>(imoveis: string[], acoes: Array<() => Promise<T>>): Promise<T[]> {
  const holder: ChildProcessWithoutNullStreams = spawn("docker", argsPsql);
  let saida = "";
  holder.stdout.on("data", (d) => (saida += String(d)));
  holder.stderr.on("data", (d) => (saida += String(d)));
  const lista = imoveis.map((id) => `'${id}'`).join(",");
  holder.stdin.write(`begin;\nselect id from public.imoveis where id in (${lista}) for update;\nselect 'barreira-pronta';\n`);
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
  const email = `wa-identidade-${randomUUID()}@example.invalid`;
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
    .insert({ user_id: userId, endereco: `Rua Identidade ${randomUUID().slice(0, 8)}, 10`, status: "Publicado", notas })
    .select("id")
    .single();
  expect(r.error).toBeNull();
  return r.data!.id as string;
}

async function notas(imovelId: string): Promise<Nota[]> {
  const r = await service.from("imoveis").select("notas").eq("id", imovelId).single();
  expect(r.error).toBeNull();
  return ((r.data!.notas as Nota[] | null) || []) as Nota[];
}

/** Onde a mensagem existe na conta (qualquer prefixo da família). */
function ondeEsta(userId: string, mid: string): string[] {
  const saida = psql(
    `select i.id::text || '|' || (n.nota->>'id') || '|' || coalesce(n.nota->>'origem','') from public.imoveis i, ` +
      `jsonb_array_elements(coalesce(i.notas,'[]'::jsonb)) n(nota) where i.user_id = '${userId}' ` +
      `and public.whatsapp_mensagem_externa_id(n.nota->>'id') = '${mid}' order by 1;`,
  );
  return saida.split("\n").filter(Boolean);
}

const mid = () => `3EB0${randomUUID().replace(/-/g, "").slice(0, 18).toUpperCase()}`;
const recebida = (id: string): Nota => ({
  id: `wa:${id}`, texto: "Resposta pelo WhatsApp: oi", data: "2026-09-29T10:00:00",
  direcao: "recebida", autor: "proprietario", tipo: "conversation", origem: "webhook-evolution",
});
const eco = (id: string, extra: Record<string, unknown> = {}): Nota => ({
  id: `wa-enviada:${id}`, texto: "Mensagem enviada pelo WhatsApp: olá", data: "2026-09-29T10:00:00",
  direcao: "enviada", autor: "corretor", tipo: "conversation", origem: "webhook-evolution",
  atribuicao: { versao: 1, autoridade: "legado", estado: "pendente", legadoImovelId: "x" }, ...extra,
});
const daOrigem = (id: string, origem: "api-evolution" | "agendamento" = "api-evolution"): Nota => ({
  id: `wa-enviada:${id}`, texto: "Mensagem enviada pelo WhatsApp: olá", data: "2026-09-29T10:00:01",
  direcao: "enviada", autor: "corretor", tipo: "conversation", origem,
  ...(origem === "api-evolution" ? { confirmacaoVisita: { data: "2026-10-02", hora: "10:00" } } : {}),
});

async function conta(userId: string, imovelId: string, nota: Nota) {
  const r = await service.rpc("registrar_nota_whatsapp_conta", { p_user_id: userId, p_imovel_id: imovelId, p_nota: nota });
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  return r.data as string;
}

async function origem(userId: string, imovelIds: string[], nota: Nota) {
  const r = await service.rpc("registrar_nota_whatsapp_origem", { p_user_id: userId, p_imovel_ids: imovelIds, p_nota: nota });
  expect(r.error, JSON.stringify(r.error)).toBeNull();
  return r.data as { resultado: string; imoveis_eco: string[] };
}

beforeAll(async () => {
  const a = await novoUsuario();
  userA = a.id;
  clienteA = a.cliente;
  userB = (await novoUsuario()).id;
});

afterAll(async () => {
  for (const id of usuariosCriados) await service.auth.admin.deleteUser(id);
});

/* ================================================================
   RPC DO WEBHOOK
   ================================================================ */
describe("registrar_nota_whatsapp_conta (Postgres real)", () => {
  it("1. reentrega no mesmo imóvel: uma nota", async () => {
    const A = await novoImovel(userA);
    const id = mid();
    expect(await conta(userA, A, recebida(id))).toBe("gravada");
    expect(await conta(userA, A, recebida(id))).toBe("duplicada-mesmo-imovel");
    expect(ondeEsta(userA, id)).toEqual([`${A}|wa:${id}|webhook-evolution`]);
  });

  it("2-3. primeira em A, segunda resolve B: duplicada-outro-imovel e só A", async () => {
    const A = await novoImovel(userA);
    const B = await novoImovel(userA);
    const id = mid();
    expect(await conta(userA, A, recebida(id))).toBe("gravada");
    expect(await conta(userA, B, recebida(id))).toBe("duplicada-outro-imovel");
    expect(ondeEsta(userA, id)).toEqual([`${A}|wa:${id}|webhook-evolution`]);
    expect(await notas(B)).toEqual([]);
  });

  it("4. mesmo id em outra conta é independente", async () => {
    const A = await novoImovel(userA);
    const Z = await novoImovel(userB);
    const id = mid();
    expect(await conta(userA, A, recebida(id))).toBe("gravada");
    expect(await conta(userB, Z, recebida(id))).toBe("gravada");
    expect(ondeEsta(userA, id)).toHaveLength(1);
    expect(ondeEsta(userB, id)).toHaveLength(1);
  });

  it("5. nota antiga já no JSONB é detectada sem backfill", async () => {
    const id = mid();
    const antiga = await novoImovel(userA, [{ id: `wa:${id}`, texto: "Resposta pelo WhatsApp: antiga", data: "2026-08-01T09:00" }]);
    const B = await novoImovel(userA);
    expect(await conta(userA, B, recebida(id))).toBe("duplicada-outro-imovel");
    expect(ondeEsta(userA, id)).toEqual([`${antiga}|wa:${id}|`]);
  });

  it("6. importada (wa-contexto) em outro imóvel: webhook não duplica", async () => {
    const id = mid();
    await novoImovel(userA, [{ id: `wa-contexto-recebida:${id}`, texto: "Resposta pelo WhatsApp: oi", data: "2026-09-01T09:00" }]);
    const B = await novoImovel(userA);
    expect(await conta(userA, B, recebida(id))).toBe("duplicada-outro-imovel");
  });

  it("7. wa:<id>:encerrado não ocupa a identidade da wa:<id>", async () => {
    const id = mid();
    const A = await novoImovel(userA, [{ id: `wa:${id}:encerrado`, texto: "Encerrado", data: "2026-09-01T09:00" }]);
    expect(await conta(userA, A, recebida(id))).toBe("gravada");
    expect(psql(`select public.whatsapp_mensagem_externa_id('wa:${id}:encerrado') is null;`).trim()).toBe("t");
  });

  it("10. imóvel inexistente ou de outra conta: imovel-inexistente, nada gravado", async () => {
    const Z = await novoImovel(userB);
    const id = mid();
    expect(await conta(userA, randomUUID(), recebida(id))).toBe("imovel-inexistente");
    expect(await conta(userA, Z, recebida(id))).toBe("imovel-inexistente");
    expect(await notas(Z)).toEqual([]);
  });

  it("recusa nota que não é ingresso do webhook", async () => {
    const A = await novoImovel(userA);
    for (const id of [`wa-contexto-recebida:${mid()}`, `wa:${mid()}:encerrado`, "sophia:1", "wa:"]) {
      const r = await service.rpc("registrar_nota_whatsapp_conta", {
        p_user_id: userA, p_imovel_id: A, p_nota: { id, texto: "x", data: "2026-09-29T10:00" },
      });
      expect(r.error, id).not.toBeNull();
    }
  });
});

/* ================================================================
   8-9. PERMISSÃO E SEARCH_PATH
   ================================================================ */
describe("8-9. segurança", () => {
  const funcoes = ["whatsapp_mensagem_externa_id", "registrar_nota_whatsapp_conta", "registrar_nota_whatsapp_origem"];

  it("8. anon e authenticated não executam; service_role executa", async () => {
    const A = await novoImovel(userA);
    const anon = createClient(url, anonKey, opcoes);
    for (const cliente of [anon, clienteA]) {
      const c = await cliente.rpc("registrar_nota_whatsapp_conta", { p_user_id: userA, p_imovel_id: A, p_nota: recebida(mid()) });
      expect(c.error).not.toBeNull();
      const o = await cliente.rpc("registrar_nota_whatsapp_origem", { p_user_id: userA, p_imovel_ids: [A], p_nota: daOrigem(mid()) });
      expect(o.error).not.toBeNull();
    }
    expect(await notas(A)).toEqual([]);
    for (const nome of funcoes) {
      const linha = psql(
        `select has_function_privilege('anon', p.oid, 'execute')::text || has_function_privilege('authenticated', p.oid, 'execute')::text || has_function_privilege('service_role', p.oid, 'execute')::text ` +
          `from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${nome}';`,
      ).trim();
      expect(linha, nome).toBe("falsefalsetrue");
    }
  });

  it("9. search_path vazio e security invoker", () => {
    for (const nome of funcoes) {
      const linha = psql(
        `select p.prosecdef::text || '|' || array_to_string(p.proconfig, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace ` +
          `where n.nspname = 'public' and p.proname = '${nome}';`,
      ).trim();
      expect(linha, nome).toBe('false|search_path=""');
    }
  });
});

/* ================================================================
   ORIGEM × ECO
   ================================================================ */
describe("origem vence o eco (sequencial)", () => {
  it("A. painel em A primeiro, eco em B depois: só A, com a nota da origem", async () => {
    const A = await novoImovel(userA);
    const B = await novoImovel(userA);
    const id = mid();
    expect((await origem(userA, [A], daOrigem(id))).resultado).toBe("gravada");
    expect(await conta(userA, B, eco(id))).toBe("duplicada-outro-imovel");
    expect(ondeEsta(userA, id)).toEqual([`${A}|wa-enviada:${id}|api-evolution`]);
  });

  it("B. eco em B primeiro, painel em A depois: B perde o eco, A recebe a nota rica da origem", async () => {
    const outra = { id: "manual-1", texto: "Nota do corretor", data: "2026-09-29T08:00" };
    const A = await novoImovel(userA);
    const B = await novoImovel(userA, [outra]);
    const id = mid();
    expect(await conta(userA, B, eco(id))).toBe("gravada");
    const r = await origem(userA, [A], daOrigem(id));
    expect(r).toEqual({ resultado: "origem-reconciliou-eco", imoveis_eco: [B] });
    expect(await notas(B)).toEqual([outra]); // o resto de B intacto, na ordem
    const final = (await notas(A)).find((n) => n.id === `wa-enviada:${id}`)!;
    expect(final.origem).toBe("api-evolution");
    expect(final.confirmacaoVisita).toEqual({ data: "2026-10-02", hora: "10:00" });
    expect(final).not.toHaveProperty("atribuicao");
  });

  it("C-D. cron: origem primeiro e eco primeiro terminam só em A", async () => {
    for (const ecoPrimeiro of [false, true]) {
      const A = await novoImovel(userA);
      const B = await novoImovel(userA);
      const id = mid();
      if (ecoPrimeiro) await conta(userA, B, eco(id));
      await origem(userA, [A], daOrigem(id, "agendamento"));
      if (!ecoPrimeiro) await conta(userA, B, eco(id));
      expect(ondeEsta(userA, id), `ecoPrimeiro=${ecoPrimeiro}`).toEqual([`${A}|wa-enviada:${id}|agendamento`]);
    }
  });

  it("E. eco resolvido para o próprio A: a origem o substitui no lugar", async () => {
    const antes = { id: "manual-0", texto: "antes", data: "2026-09-29T08:00" };
    const depois = { id: "manual-2", texto: "depois", data: "2026-09-29T11:00" };
    const A = await novoImovel(userA, [antes]);
    const id = mid();
    await conta(userA, A, eco(id));
    await service.from("imoveis").update({ notas: [...(await notas(A)), depois] }).eq("id", A);
    const r = await origem(userA, [A], daOrigem(id));
    expect(r).toEqual({ resultado: "origem-reconciliou-eco", imoveis_eco: [] });
    const lista = await notas(A);
    expect(lista.map((n) => n.id)).toEqual(["manual-0", `wa-enviada:${id}`, "manual-2"]);
    expect(lista[1].origem).toBe("api-evolution");
    expect(lista[1]).not.toHaveProperty("atribuicao");
  });

  it("E2. estado anômalo no mesmo imóvel (nota de origem + eco do mesmo id): só o eco é substituído", async () => {
    // O fluxo normal não produz isto (o dedupe por linha recusa o segundo
    // `wa-enviada:<id>` no mesmo imóvel), mas o banco não tem constraint que
    // o impeça: dado antigo ou edição manual chegam aqui. A nota que NÃO é
    // eco (outra origem, com campos próprios) tem que sair intacta; é o
    // filtro `origem = 'webhook-evolution'` na substituição que garante isso.
    const id = mid();
    const origemPreExistente: Nota = {
      id: `wa-enviada:${id}`, texto: "Mensagem enviada pelo WhatsApp: agendada antes", data: "2026-09-29T09:00:00",
      direcao: "enviada", autor: "corretor", tipo: "conversation", origem: "agendamento",
    };
    const ecoAnomalo = eco(id, { data: "2026-09-29T09:00:05" });
    const vizinha = { id: "manual-9", texto: "nota do corretor", data: "2026-09-29T12:00" };
    const A = await novoImovel(userA, [origemPreExistente, ecoAnomalo, vizinha]);
    const nova = daOrigem(id); // api-evolution, com confirmacaoVisita

    const r = await origem(userA, [A], nova);

    expect(r).toEqual({ resultado: "origem-reconciliou-eco", imoveis_eco: [] });
    const lista = await notas(A);
    // Mesmo tamanho: nada removido e nada duplicado além do que já existia.
    expect(lista).toHaveLength(3);
    // A nota de origem pré-existente continua exatamente igual, no lugar.
    expect(lista[0]).toEqual(origemPreExistente);
    // Só o eco foi trocado, no lugar, pela nota da origem.
    expect(lista[1]).toEqual(nova);
    expect(lista[1]).not.toHaveProperty("atribuicao");
    expect(lista[2]).toEqual(vizinha);
    // Nenhum eco sobrou e a ocorrência que não é eco foi preservada.
    expect(lista.filter((n) => n.origem === "webhook-evolution")).toHaveLength(0);
    expect(lista.filter((n) => n.origem === "agendamento")).toEqual([origemPreExistente]);
    expect(ondeEsta(userA, id)).toEqual([
      `${A}|wa-enviada:${id}|agendamento`,
      `${A}|wa-enviada:${id}|api-evolution`,
    ]);
  });

  it("F. fora do conjunto há algo que não é eco: conflito, nada removido nem gravado", async () => {
    const casos: Array<(id: string) => Nota> = [
      (id) => recebida(id),
      (id) => ({ id: `wa-contexto-enviada:${id}`, texto: "importada", data: "2026-09-01T09:00" }),
      (id) => daOrigem(id, "agendamento"),
      (id) => ({ id: `wa-enviada:${id}`, texto: "sem origem", data: "2026-09-01T09:00" }),
    ];
    for (const caso of casos) {
      const id = mid();
      const nota = caso(id);
      const A = await novoImovel(userA);
      const B = await novoImovel(userA, [nota]);
      const r = await origem(userA, [A], daOrigem(id));
      expect(r.resultado, nota.id).toBe("conflito");
      expect(await notas(A), nota.id).toEqual([]);
      expect(await notas(B), nota.id).toEqual([nota]);
    }
  });

  it("G. fromMe digitado no celular (sem origem): webhook normal, sem reconciliação", async () => {
    const B = await novoImovel(userA);
    const id = mid();
    expect(await conta(userA, B, eco(id))).toBe("gravada");
    expect(await conta(userA, B, eco(id))).toBe("duplicada-mesmo-imovel");
    expect(ondeEsta(userA, id)).toEqual([`${B}|wa-enviada:${id}|webhook-evolution`]);
  });

  it("origem repetida é idempotente; reconciliação nunca atravessa conta", async () => {
    const A = await novoImovel(userA);
    const Zb = await novoImovel(userB);
    const id = mid();
    await conta(userB, Zb, eco(id)); // mesmo id, OUTRA conta
    expect((await origem(userA, [A], daOrigem(id))).resultado).toBe("gravada");
    expect((await origem(userA, [A], daOrigem(id))).resultado).toBe("duplicada");
    expect(ondeEsta(userB, id)).toEqual([`${Zb}|wa-enviada:${id}|webhook-evolution`]);
  });

  it("fallback interno (api:<uuid>): grava, sem correlacionar com o eco de id real", async () => {
    const A = await novoImovel(userA);
    const B = await novoImovel(userA);
    const real = mid();
    await conta(userA, B, eco(real));
    const interno = `api:${randomUUID()}`;
    expect((await origem(userA, [A], daOrigem(interno))).resultado).toBe("gravada");
    // O eco real continua onde estava: nada inventou que eram a mesma mensagem.
    expect(ondeEsta(userA, real)).toEqual([`${B}|wa-enviada:${real}|webhook-evolution`]);
    expect(ondeEsta(userA, interno)).toEqual([`${A}|wa-enviada:${interno}|api-evolution`]);
  });

  it("conjunto com imóvel de outra conta: imovel-inexistente, nada tocado", async () => {
    const Zb = await novoImovel(userB);
    const r = await origem(userA, [Zb], daOrigem(mid()));
    expect(r.resultado).toBe("imovel-inexistente");
    expect(await notas(Zb)).toEqual([]);
  });
});

/* ================================================================
   CONCORRÊNCIA DETERMINÍSTICA
   ================================================================ */
describe("concorrência com barreira", () => {
  it("duas entregas do webhook em A e B, nas duas ordens: uma nota só na conta", async () => {
    for (const primeiroA of [true, false]) {
      const A = await novoImovel(userA);
      const B = await novoImovel(userA);
      const id = mid();
      const [p, s] = primeiroA ? [A, B] : [B, A];
      const resultados = await comBarreira([A, B], [
        () => conta(userA, p, recebida(id)),
        () => conta(userA, s, recebida(id)),
      ]);
      expect(resultados, `primeiroA=${primeiroA}`).toEqual(["gravada", "duplicada-outro-imovel"]);
      expect(ondeEsta(userA, id)).toEqual([`${p}|wa:${id}|webhook-evolution`]);
    }
  });

  it("origem A × eco B, qualquer um com o lock primeiro: sempre UMA nota, no imóvel A", async () => {
    for (const ecoPrimeiro of [false, true]) {
      const A = await novoImovel(userA);
      const B = await novoImovel(userA);
      const id = mid();
      const acaoOrigem = () => origem(userA, [A], daOrigem(id)).then((r) => r.resultado);
      const acaoEco = () => conta(userA, B, eco(id));
      const resultados = await comBarreira([A, B], ecoPrimeiro ? [acaoEco, acaoOrigem] : [acaoOrigem, acaoEco]);
      expect(ondeEsta(userA, id), `ecoPrimeiro=${ecoPrimeiro}`).toEqual([`${A}|wa-enviada:${id}|api-evolution`]);
      expect(resultados).toEqual(ecoPrimeiro ? ["gravada", "origem-reconciliou-eco"] : ["gravada", "duplicada-outro-imovel"]);
    }
  });

  it("controle: a MESMA função sem o advisory lock deixa a corrida duplicar (a barreira detecta)", async () => {
    // A função de controle é a da migration, idêntica, menos o lock. Só
    // existe durante este teste, e só no banco local.
    const migration = readFileSync(
      new URL("../../supabase/migrations/20260929210000_registrar_nota_whatsapp_conta.sql", import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const inicio = migration.indexOf("create or replace function public.registrar_nota_whatsapp_conta(");
    const fim = migration.indexOf("$$;", migration.indexOf("$$", inicio) + 2) + 3;
    const lock =
      "  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended('wa-msg:' || p_user_id::text || ':' || v_mid, 0)\n  );\n";
    const original = migration.slice(inicio, fim);
    expect(original).toContain(lock);
    const semLock = original
      .replace(lock, "")
      .replace("public.registrar_nota_whatsapp_conta(", "public.teste_registrar_nota_whatsapp_sem_lock(");
    psql(semLock + "\n");
    try {
      const A = await novoImovel(userA);
      const B = await novoImovel(userA);
      const id = mid();
      const chamar = (imovel: string) => () =>
        new Promise<string>((resolve, reject) => {
          const p = spawn("docker", argsPsql);
          let saida = "";
          p.stdout.on("data", (d) => (saida += String(d)));
          p.on("close", (codigo) => (codigo === 0 ? resolve(saida.trim()) : reject(new Error(saida))));
          p.stdin.end(
            `select public.teste_registrar_nota_whatsapp_sem_lock('${userA}', '${imovel}', '${JSON.stringify(recebida(id))}'::jsonb);\n`,
          );
        });
      const resultados = await comBarreira([A, B], [chamar(A), chamar(B)]);
      expect(resultados).toEqual(["gravada", "gravada"]);
      expect(ondeEsta(userA, id)).toHaveLength(2); // a duplicação que o lock impede
    } finally {
      psql("drop function if exists public.teste_registrar_nota_whatsapp_sem_lock(uuid, uuid, jsonb);\n");
    }
  });
});
