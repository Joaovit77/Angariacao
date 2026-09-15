/* ================================================================
   C8 — CLAIM ATÔMICO DA CLASSIFICAÇÃO

   O banco é a autoridade do claim: uma execução `processando` por
   avistamento, idempotência por (avistamento, revisão, fingerprint), lease
   de 2 minutos e advisory lock transacional por usuário|avistamento. A rota
   só lê a decisão. Estes testes exercitam o SQL real num PGlite e, onde
   PGlite não alcança (duas sessões de verdade), amarram a estrutura.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  OUTRO_USUARIO,
  USUARIO,
  criarApoio,
  lerSql,
  limparBanco,
  subirBancoProspeccao,
  type Json,
} from "./fixtures/bancoProspeccao";

const MIGRATION = lerSql("supabase/migrations/20260910201530_prospeccao_campo_rpcs_classificacao.sql");
const INICIAR = MIGRATION.match(/create or replace function public\.iniciar_classificacao\([\s\S]*?\n\$\$;/)![0];

let db: PGlite;
const apoio = criarApoio(() => db);
const FP = "a".repeat(64);

describe.sequential("C8 — claim no PostgreSQL local", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("só o servidor alcança as três RPCs: authenticated e anon não executam", async () => {
    const { rows } = await db.query<{ fn: string; papel: string; permitido: boolean }>(`
      select fn, papel, has_function_privilege(papel, fn, 'execute') as permitido
        from unnest(array[
          'public.iniciar_classificacao(uuid,uuid,text,text,text,integer,integer,smallint)',
          'public.concluir_classificacao(uuid,uuid,uuid,text,smallint,jsonb,jsonb)',
          'public.falhar_classificacao(uuid,uuid,uuid,text)'
        ]) as fn, unnest(array['anon', 'authenticated', 'service_role']) as papel
       order by fn, papel`);
    for (const linha of rows) expect(linha.permitido).toBe(linha.papel === "service_role");
  });

  it("duas requisições sobre o MESMO avistamento: a segunda recebe ocupado, sem nova execução", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");

    const primeira = await apoio.iniciar(av, FP);
    expect(primeira).toMatchObject({ ok: true, repetida: false, ocupado: false, modo: "modelo" });
    expect(typeof primeira.run_id).toBe("string");
    expect(typeof primeira.lease_token).toBe("string");

    const segunda = await apoio.iniciar(av, FP);
    expect(segunda).toEqual({ ok: false, ocupado: true, run_id: primeira.run_id });
    expect(await apoio.execucoes(av)).toHaveLength(1);
    // O avistamento continua `pendente`: `processando` é estado da EXECUÇÃO.
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", av)).classificacao_estado).toBe("pendente");
  });

  it("o índice único parcial recusa uma segunda `processando` mesmo por insert direto", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await apoio.iniciar(av, FP);
    await db.exec("savepoint direto");
    await expect(db.query(`insert into public.imoveis_identificados_classificacoes
      (avistamento_id, imovel_identificado_id, user_id, estado, modo, observacao_revisao, fingerprint,
       modelo, versao_catalogo, versao_classificador, confianca_minima, lease_token, lease_expira_em)
      values ($1, $2, $3, 'processando', 'modelo', 1, 'outro-fp', 'm', 1, 1, 70, gen_random_uuid(), now() + interval '2 minutes')`,
    [av, pai, USUARIO])).rejects.toThrow(/unique|duplicate/i);
    await db.exec("rollback to savepoint direto");
  });

  it("dois avistamentos DIFERENTES do mesmo imóvel rodam em paralelo", async () => {
    const pai = await apoio.identidade();
    const a = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Casa fechada, jardim alto.");
    const b = await apoio.avistamento(pai, "2026-09-11T12:00:00Z", "Sobrado com placa de aluga-se.");
    expect((await apoio.iniciar(a, "f".repeat(64))).ok).toBe(true);
    expect((await apoio.iniciar(b, "e".repeat(64))).ok).toBe(true);
    expect(await apoio.execucoes(a)).toHaveLength(1);
    expect(await apoio.execucoes(b)).toHaveLength(1);
  });

  it("o lease é de 2 minutos, e o lease_token só existe junto de lease_expira_em", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, FP);
    const { rows } = await db.query<{ segundos: number }>(
      `select extract(epoch from (lease_expira_em - iniciada_em))::int as segundos
         from public.imoveis_identificados_classificacoes where id = $1`, [claim.run_id as string]);
    expect(rows[0].segundos).toBe(120);
    expect(INICIAR).toContain("now() + interval '2 minutes'");
    expect(INICIAR).not.toMatch(/interval '10 minutes'/);
    // A bicondicional do CHECK vale nos quatro estados: token sem prazo é recusado.
    await db.exec("savepoint lease");
    await expect(db.query(
      "update public.imoveis_identificados_classificacoes set lease_expira_em = null where id = $1",
      [claim.run_id as string],
    )).rejects.toThrow(/lease_check|check constraint/i);
    await db.exec("rollback to savepoint lease");
  });

  it("lease expirado: a execução presa vira `abandonada` e o novo claim prossegue", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const presa = await apoio.iniciar(av, FP);
    await db.query(
      "update public.imoveis_identificados_classificacoes set lease_expira_em = now() - interval '1 second' where id = $1",
      [presa.run_id as string],
    );

    const nova = await apoio.iniciar(av, FP);
    expect(nova).toMatchObject({ ok: true, repetida: false, ocupado: false });
    expect(nova.run_id).not.toBe(presa.run_id);

    const execucoes = await apoio.execucoes(av);
    expect(execucoes).toHaveLength(2);
    const antiga = execucoes.find((e) => e.id === presa.run_id)!;
    expect(antiga).toMatchObject({ estado: "abandonada", lease_token: null, lease_expira_em: null });
    // Histórico não encolhe: a abandonada continua na tabela.
  });

  it("exclusão pendente no pai: recusa com `exclusao_em_andamento` e não cria execução", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await apoio.marcarExclusao(pai);
    expect(await apoio.iniciar(av, FP)).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
    expect(await apoio.execucoes(av)).toHaveLength(0);
  });

  it("idempotência: mesma revisão + mesmo fingerprint já concluídos ⇒ repetida:true, sem nova execução", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim } = await apoio.classificar(av, FP, [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
    ]);
    expect(await apoio.iniciar(av, FP)).toEqual({ ok: true, repetida: true, run_id: claim.run_id });
    expect(await apoio.execucoes(av)).toHaveLength(1);
    // Fingerprint diferente (outro modelo, outro piso…) é outra entrada: novo evento.
    expect(await apoio.iniciar(av, "b".repeat(64))).toMatchObject({ ok: true, repetida: false });
  });

  it("revisão diferente com o MESMO texto continua sendo evento diferente", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Casa fechada, sem placa na frente.");
    const { claim: primeira } = await apoio.classificar(av, FP, [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
    ]);
    // Corrige e volta ao texto original: o gatilho do C2c sobe a revisão duas vezes.
    await apoio.comoUsuario(
      "update public.imoveis_identificados_avistamentos set observacao = $2 where id = $1", [av, "Casa aberta."]);
    await apoio.comoUsuario(
      "update public.imoveis_identificados_avistamentos set observacao = $2 where id = $1",
      [av, "Casa fechada, sem placa na frente."]);
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", av)).observacao_revisao).toBe(3);

    const segunda = await apoio.iniciar(av, FP);
    expect(segunda).toMatchObject({ ok: true, repetida: false });
    expect(segunda.run_id).not.toBe(primeira.run_id);
    const execucoes = await apoio.execucoes(av);
    // Dentro de uma transação `now()` não avança: ordena pela revisão, não pelo instante.
    expect(execucoes.map((e) => e.observacao_revisao).sort()).toEqual([1, 3]);
  });

  it("concluir com lease_token errado não grava nada; falhar com token errado também não", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, FP);
    const falso = { ...claim, lease_token: randomUUID() };
    expect(await apoio.concluir(falso, [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
    ])).toEqual({ ok: false, codigo: "lease_invalido" });
    expect(await apoio.falhar(falso, "falha-ia")).toEqual({ ok: false, codigo: "lease_invalido" });
    expect(await apoio.etiquetas(av)).toHaveLength(0);
    expect((await apoio.execucoes(av))[0]).toMatchObject({ estado: "processando" });
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", av)).classificacao_estado).toBe("pendente");
  });

  it("falha no meio não deixa classificação parcial: `falhou` com código fechado e avistamento sem os três campos", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, FP);
    expect(await apoio.falhar(claim, "indisponivel")).toMatchObject({
      ok: true, repetida: false, falha_codigo: "indisponivel", estado_avistamento: "indisponivel",
    });
    const avistamento = await apoio.linha("public.imoveis_identificados_avistamentos", av);
    expect(avistamento).toMatchObject({
      classificacao_estado: "indisponivel", classificacao_id: null, classificacao_em: null, fingerprint: null,
    });
    expect((await apoio.execucoes(av))[0]).toMatchObject({ estado: "falhou", falha_codigo: "indisponivel", snapshot_aplicado: false });
    // Código fora da lista fechada cai em 'falha-ia' — texto livre nunca é persistido.
    const outro = await apoio.iniciar(av, "c".repeat(64));
    expect((await apoio.falhar(outro, "Error: chave vazou 'sk-…'")).falha_codigo).toBe("falha-ia");
  });

  it("advisory lock transacional por usuário|avistamento, um só, liberado no commit", async () => {
    expect(INICIAR.match(/pg_catalog\.pg_advisory_xact_lock\(/g)).toHaveLength(1);
    expect(INICIAR).not.toMatch(/\bpg_advisory_lock\(/);
    expect(INICIAR).toMatch(/hashtextextended\('classificar:' \|\| p_user_id::text \|\| ':' \|\| p_avistamento_id::text, 0\)/);
    // O lock vem ANTES de qualquer leitura do avistamento.
    expect(INICIAR.indexOf("pg_advisory_xact_lock")).toBeLessThan(INICIAR.indexOf("select a.* into v_avistamento"));

    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await apoio.iniciar(av, FP);
    const locks = () => db.query("select mode, granted from pg_locks where locktype = 'advisory'");
    expect((await locks()).rows).toEqual([{ mode: "ExclusiveLock", granted: true }]);
    await db.exec("commit");
    expect((await locks()).rows).toEqual([]);
    await db.exec("begin");
  });

  it("a chave do lock separa usuários e avistamentos", async () => {
    const expressao = "pg_catalog.hashtextextended('classificar:' || p_user_id::text || ':' || p_avistamento_id::text, 0)";
    const a = randomUUID(); const b = randomUUID();
    async function chave(usuario: string, avistamento: string) {
      return (await db.query<{ chave: string }>(`select (${expressao})::text as chave
        from (select $1::uuid as p_user_id, $2::uuid as p_avistamento_id) entrada`, [usuario, avistamento])).rows[0].chave;
    }
    const ua = await chave(USUARIO, a);
    expect(await chave(USUARIO, a)).toBe(ua);
    expect(await chave(USUARIO, b)).not.toBe(ua);
    expect(await chave(OUTRO_USUARIO, a)).not.toBe(ua);
  });

  it("modelo de identidade Servidor: p_user_id obrigatório, avistamento alheio é 'não existe'", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await db.exec("savepoint identidade");
    await expect(apoio.iniciar(av, FP, { usuario: OUTRO_USUARIO })).rejects.toThrow(/não encontrado/);
    await db.exec("rollback to savepoint identidade");
    await expect(db.query(
      "select public.iniciar_classificacao(null::uuid, $1::uuid, $2::text, 'm'::text, 'low'::text, 1, 1, 70::smallint)", [av, FP],
    )).rejects.toThrow(/obrigatório/);
    await db.exec("rollback to savepoint identidade");
    // JWT presente e divergente do p_user_id também é recusado (42501).
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [OUTRO_USUARIO]);
    await expect(apoio.iniciar(av, FP)).rejects.toThrow(/divergente/);
    await db.exec("rollback to savepoint identidade");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  });

  it("`processando` não existe no avistamento: o CHECK só admite os quatro estados de produto", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await db.exec("savepoint estado");
    await expect(db.query(
      "update public.imoveis_identificados_avistamentos set classificacao_estado = 'processando' where id = $1", [av],
    )).rejects.toThrow(/check/i);
    await db.exec("rollback to savepoint estado");
    const resultado: Json = await apoio.linha("public.imoveis_identificados_avistamentos", av);
    expect(resultado.classificacao_estado).toBe("pendente");
  });
});
