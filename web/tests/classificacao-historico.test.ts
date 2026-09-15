/* ================================================================
   C8 — HISTÓRICO: reclassificar não apaga nada

   Execução #1 → A/B; #2 → A/C, no MESMO avistamento. B continua na tabela
   como `substituida`, com quando e por qual execução; A não é duplicada;
   a etiqueta confirmada por um humano sobrevive e conta em `ja_confirmada`;
   execução com zero etiquetas fica `concluida` com `aplicadas = 0` — o que
   distingue "classificado, nada se aplicava" de "nunca classificado".
   ================================================================ */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { criarApoio, limparBanco, subirBancoProspeccao } from "./fixtures/bancoProspeccao";

let db: PGlite;
const apoio = criarApoio(() => db);
const A = { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 };
const B = { categoria: "estado-visual", codigo: "aparenta-vago", confianca: 80 };
const C = { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 85 };

describe.sequential("C8 — histórico da classificação", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("#1 → A/B, #2 → A/C: B vira `substituida` e continua na tabela; A não é duplicada", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const primeira = await apoio.classificar(av, "1".repeat(64), [A, B]);
    expect(primeira.conclusao).toMatchObject({ ok: true, aplicadas: 2, inseridas: 2, reafirmadas: 0 });

    const segunda = await apoio.classificar(av, "2".repeat(64), [A, C]);
    expect(segunda.conclusao).toMatchObject({ ok: true, aplicadas: 2, inseridas: 1, reafirmadas: 1 });

    const etiquetas = await apoio.etiquetas(av);
    expect(etiquetas).toHaveLength(3);
    const b = etiquetas.find((e) => e.codigo === B.codigo)!;
    expect(b.estado).toBe("substituida");
    expect(b.substituida_em).not.toBeNull();
    expect(b.substituida_por_classificacao_id).toBe(segunda.claim.run_id);
    expect(b.classificacao_id).toBe(primeira.claim.run_id);
    // A continua vigente na linha da PRIMEIRA execução (reafirmada, não duplicada).
    const linhasA = etiquetas.filter((e) => e.codigo === A.codigo);
    expect(linhasA).toHaveLength(1);
    expect(linhasA[0]).toMatchObject({ estado: "inferida", classificacao_id: primeira.claim.run_id });
    expect(etiquetas.find((e) => e.codigo === C.codigo)).toMatchObject({
      estado: "inferida", classificacao_id: segunda.claim.run_id,
    });
    // As duas execuções permanecem, ambas concluídas.
    const execucoes = await apoio.execucoes(av);
    expect(execucoes.map((e) => e.estado)).toEqual(["concluida", "concluida"]);
    // O avistamento aponta para a execução mais recente.
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", av)).classificacao_id).toBe(segunda.claim.run_id);
  });

  it("um vigente por (avistamento, categoria, código): o índice parcial recusa duplicata direta", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim } = await apoio.classificar(av, "1".repeat(64), [A]);
    await db.exec("savepoint dup");
    await expect(db.query(`insert into public.imoveis_identificados_etiquetas
      (imovel_identificado_id, avistamento_id, classificacao_id, user_id, categoria, codigo, origem,
       confianca, estado, modelo, versao_catalogo, versao_classificador, revisao_observacao, observado_em)
      values ($1, $2, $3, $4, $5, $6, 'ia-texto', 88, 'inferida', 'm', 1, 1, 1, now())`,
    [pai, av, claim.run_id, "10000000-0000-4000-8000-000000000001", A.categoria, A.codigo]))
      .rejects.toThrow(/unique|duplicate/i);
    await db.exec("rollback to savepoint dup");
  });

  it("etiqueta confirmada sobrevive à reclassificação, não é duplicada e conta em `ja_confirmada`", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    await apoio.classificar(av, "1".repeat(64), [A, B]);
    const idA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.id as number;
    const confirmacao = await apoio.comoUsuario(
      "select public.definir_estado_etiqueta($1, 'confirmada') as resultado", [idA]);
    expect(confirmacao.rows[0].resultado).toMatchObject({ ok: true });

    // #2 reafirma A (já confirmada) e não menciona B.
    const segunda = await apoio.classificar(av, "2".repeat(64), [A, C]);
    expect(segunda.conclusao).toMatchObject({ ok: true, ja_confirmada: 1, inseridas: 1, reafirmadas: 0 });

    const etiquetas = await apoio.etiquetas(av);
    const a = etiquetas.filter((e) => e.codigo === A.codigo);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ estado: "confirmada", confirmada_por: "10000000-0000-4000-8000-000000000001" });
    expect(a[0].confirmada_em).not.toBeNull();
    expect(etiquetas.find((e) => e.codigo === B.codigo)!.estado).toBe("substituida");
    expect((await apoio.linha("public.imoveis_identificados_classificacoes", segunda.claim.run_id as string)))
      .toMatchObject({ ja_confirmada: 1, aplicadas: 1, sugeridas: 2 });

    // #3 não menciona A: a confirmada NÃO é rebaixada a substituída.
    await apoio.classificar(av, "3".repeat(64), [C]);
    expect((await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.estado).toBe("confirmada");
  });

  it("execução com zero etiquetas fica `concluida` com aplicadas = 0, distinguível de nunca classificado", async () => {
    const pai = await apoio.identidade();
    const semNada = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Nada de relevante hoje, só passei.");
    const nunca = await apoio.avistamento(pai, "2026-09-11T12:00:00Z", "Outro avistamento, sem classificar.");
    const { claim, conclusao } = await apoio.classificar(semNada, "0".repeat(64), []);
    expect(conclusao).toMatchObject({ ok: true, aplicadas: 0 });

    const execucao = await apoio.linha("public.imoveis_identificados_classificacoes", claim.run_id as string);
    expect(execucao).toMatchObject({ estado: "concluida", aplicadas: 0, sugeridas: 0 });
    expect(execucao.concluida_em).not.toBeNull();
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", semNada))).toMatchObject({
      classificacao_estado: "concluida", classificacao_id: claim.run_id,
    });
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", nunca))).toMatchObject({
      classificacao_estado: "pendente", classificacao_id: null,
    });
    expect(await apoio.execucoes(nunca)).toHaveLength(0);
  });

  it("os contadores da validação ficam gravados na execução, e `sugeridas` nunca fica abaixo do aplicado", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, "1".repeat(64));
    await apoio.concluir(claim, [A], null, { sugeridas: 5, abaixo_do_piso: 2, fora_do_catalogo: 1, sem_evidencia: 1 });
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", claim.run_id as string)).toMatchObject({
      sugeridas: 5, aplicadas: 1, abaixo_do_piso: 2, fora_do_catalogo: 1, sem_evidencia: 1, ja_confirmada: 0,
      confianca_minima: 70, modelo: "gpt-5.6-luna", esforco: "low", versao_catalogo: 1, versao_classificador: 1,
    });
    // Sem contadores informados, `sugeridas` cobre ao menos o que foi gravado.
    const outra = await apoio.iniciar(av, "2".repeat(64));
    await apoio.concluir(outra, [A, C]);
    expect((await apoio.linha("public.imoveis_identificados_classificacoes", outra.run_id as string)).sugeridas).toBe(2);
  });

  it("concluir duas vezes a mesma execução é idempotente: nada duplica", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, "1".repeat(64));
    await apoio.concluir(claim, [A]);
    expect(await apoio.concluir(claim, [A, B])).toEqual({ ok: true, repetida: true, run_id: claim.run_id });
    expect(await apoio.etiquetas(av)).toHaveLength(1);
  });
});
