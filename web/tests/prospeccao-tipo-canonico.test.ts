/* ================================================================
   C8 — TIPO: uma coluna canônica, três portas nomeadas

   `insert` da identidade (o gatilho força manual/declarado),
   `definir_tipo_manual` (codifica manual e zera a proveniência de IA) e
   `concluir_classificacao` (computa a cadeia ia-texto). `tipo` NÃO está no
   grant de `update` do cliente: o browser não escreve tipo por fora. Confirmar
   mantém a origem IA; manual vence; nulo zera metadados.
   ================================================================ */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  USUARIO,
  criarApoio,
  lerSql,
  limparBanco,
  subirBancoProspeccao,
  type Json,
} from "./fixtures/bancoProspeccao";

let db: PGlite;
const apoio = criarApoio(() => db);
const CASA = { sugerido: "Casa", confianca: 72 };
const GRANTS = lerSql("supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql");

async function identidadeLida(id: string): Promise<Json> {
  return apoio.linha("public.imoveis_identificados", id);
}

describe.sequential("C8 — tipo canônico", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("porta 1: o insert do navegador com tipo vira manual/declarado pelo gatilho, sem metadados de IA", async () => {
    // O cliente nem consegue escrever a proveniência: o grant de insert é por coluna.
    await db.exec("savepoint origem");
    await expect(apoio.comoUsuario(
      `insert into public.imoveis_identificados (user_id, logradouro, tipo, tipo_origem, tipo_estado)
         values ($1, 'Rua X', 'Sobrado', 'ia-texto', 'inferido')`, [USUARIO],
    )).rejects.toThrow(/permission denied/i);
    await db.exec("rollback to savepoint origem");

    const { rows } = await apoio.comoUsuario<{ id: string }>(
      `insert into public.imoveis_identificados (user_id, logradouro, tipo)
         values ($1, 'Rua X', 'Sobrado') returning id`, [USUARIO]);
    expect(await identidadeLida(rows[0].id)).toMatchObject({
      tipo: "Sobrado", tipo_origem: "manual", tipo_estado: "declarado",
      tipo_confianca: null, tipo_classificacao_id: null, tipo_avistamento_id: null,
    });
    expect((await identidadeLida(rows[0].id)).tipo_definido_em).not.toBeNull();
  });

  it("o browser não consegue `update tipo` nem os metadados: a coluna não está no grant", async () => {
    const pai = await apoio.identidade();
    expect(GRANTS).not.toMatch(/grant update \([^)]*\btipo\b/);
    for (const coluna of ["tipo", "tipo_origem", "tipo_estado", "tipo_confianca", "tipo_classificacao_id", "tipo_avistamento_id"]) {
      await db.exec("savepoint grant_tipo");
      await expect(apoio.comoUsuario(
        `update public.imoveis_identificados set ${coluna} = null where id = $1`, [pai],
      )).rejects.toThrow(/permission denied|42501/i);
      await db.exec("rollback to savepoint grant_tipo");
    }
    // Só RPCs: o cliente tem execute nas duas portas do navegador.
    const { rows } = await db.query<{ fn: string; permitido: boolean }>(`
      select fn, has_function_privilege('authenticated', fn, 'execute') as permitido
        from unnest(array['public.definir_tipo_manual(uuid,text)', 'public.confirmar_tipo_identificado(uuid)']) as fn`);
    expect(rows.every((r) => r.permitido)).toBe(true);
  });

  it("porta 3: concluir_classificacao grava a proveniência ia-texto que ela própria computa", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim } = await apoio.classificar(av, "1".repeat(64), [], CASA);
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Casa", tipo_origem: "ia-texto", tipo_estado: "inferido", tipo_confianca: 72,
      tipo_classificacao_id: claim.run_id, tipo_avistamento_id: av,
      tipo_confirmado_por: null, tipo_confirmado_em: null,
    });
    // O CHECK de coerência exige a cadeia inteira para ia-texto.
    await db.exec("savepoint check_ia");
    await expect(db.query(
      "update public.imoveis_identificados set tipo_classificacao_id = null where id = $1", [pai],
    )).rejects.toThrow(/check/i);
    await db.exec("rollback to savepoint check_ia");
  });

  it("confirmar_tipo_identificado assina mantendo a origem IA e os ids", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim } = await apoio.classificar(av, "1".repeat(64), [], CASA);

    const primeira = await apoio.comoUsuario("select public.confirmar_tipo_identificado($1) as resultado", [pai]);
    expect(primeira.rows[0].resultado).toEqual({ ok: true, repetida: false, tipo: "Casa" });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Casa", tipo_estado: "confirmado", tipo_origem: "ia-texto", tipo_confianca: 72,
      tipo_classificacao_id: claim.run_id, tipo_avistamento_id: av, tipo_confirmado_por: USUARIO,
    });
    expect((await identidadeLida(pai)).tipo_confirmado_em).not.toBeNull();
    // Idempotente, e não vira manual.
    const segunda = await apoio.comoUsuario("select public.confirmar_tipo_identificado($1) as resultado", [pai]);
    expect(segunda.rows[0].resultado).toEqual({ ok: true, repetida: true });
    expect((await identidadeLida(pai)).tipo_origem).toBe("ia-texto");
  });

  it("confirmar sem inferência da IA é recusado com código fechado", async () => {
    const semTipo = await apoio.identidade();
    const manual = await apoio.identidade("Casa");
    for (const id of [semTipo, manual]) {
      const { rows } = await apoio.comoUsuario("select public.confirmar_tipo_identificado($1) as resultado", [id]);
      expect(rows[0].resultado).toEqual({ ok: false, codigo: "tipo_nao_inferido" });
    }
  });

  it("porta 2: definir_tipo_manual vence a IA e zera a proveniência dela", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await apoio.classificar(av, "1".repeat(64), [], CASA);
    await apoio.comoUsuario("select public.confirmar_tipo_identificado($1)", [pai]);

    const { rows } = await apoio.comoUsuario("select public.definir_tipo_manual($1, 'Terreno') as resultado", [pai]);
    expect(rows[0].resultado).toMatchObject({ ok: true });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Terreno", tipo_origem: "manual", tipo_estado: "declarado",
      tipo_confianca: null, tipo_classificacao_id: null, tipo_avistamento_id: null,
      tipo_confirmado_por: null, tipo_confirmado_em: null,
    });
    // E a IA não passa por cima do manual depois.
    const { conclusao } = await apoio.classificar(av, "2".repeat(64), [], { sugerido: "Sobrado", confianca: 99 });
    expect(conclusao).toMatchObject({ tipo_aplicado: false });
    expect((await identidadeLida(pai)).tipo).toBe("Terreno");
  });

  it("tipo nulo pela porta manual zera todos os metadados", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await apoio.classificar(av, "1".repeat(64), [], CASA);
    const { rows } = await apoio.comoUsuario("select public.definir_tipo_manual($1, null) as resultado", [pai]);
    expect(rows[0].resultado).toMatchObject({ ok: true });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: null, tipo_origem: null, tipo_estado: null, tipo_confianca: null, tipo_definido_em: null,
      tipo_classificacao_id: null, tipo_avistamento_id: null, tipo_confirmado_por: null, tipo_confirmado_em: null,
    });
    // Sem tipo manual no caminho, a IA volta a poder sugerir.
    const { conclusao } = await apoio.classificar(av, "2".repeat(64), [], { sugerido: "Sobrado", confianca: 80 });
    expect(conclusao).toMatchObject({ tipo_aplicado: true });
    expect((await identidadeLida(pai)).tipo).toBe("Sobrado");
  });

  it("a IA não sobrescreve manual nem confirmado, e uma execução guarda o que sugeriu mesmo sem aplicar", async () => {
    const manual = await apoio.identidade("Galpão");
    const avManual = await apoio.avistamento(manual, "2026-09-10T12:00:00Z");
    const execManual = await apoio.classificar(avManual, "1".repeat(64), [], CASA);
    expect((await identidadeLida(manual)).tipo).toBe("Galpão");
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", execManual.claim.run_id as string))
      .toMatchObject({ tipo_sugerido: "Casa", tipo_confianca: 72, snapshot_aplicado: true });

    const inferido = await apoio.identidade();
    const avInferido = await apoio.avistamento(inferido, "2026-09-10T12:00:00Z");
    await apoio.classificar(avInferido, "1".repeat(64), [], CASA);
    await apoio.comoUsuario("select public.confirmar_tipo_identificado($1)", [inferido]);
    await apoio.classificar(avInferido, "2".repeat(64), [], { sugerido: "Sobrado", confianca: 99 });
    expect(await identidadeLida(inferido)).toMatchObject({ tipo: "Casa", tipo_estado: "confirmado" });
  });
});
