/* ================================================================
   C8 — CLASSIFICAÇÃO É DE AVISTAMENTO, NUNCA DE IMÓVEL

   Dois avistamentos com o texto EXATAMENTE igual ("Casa fechada.") em
   setembro e novembro são dois eventos: duas execuções `concluida`, cada
   uma com o seu `avistamento_id`; duas linhas de etiqueta por código, cada
   uma com o `observado_em` do seu avistamento; nenhuma marcada
   `substituida` pela outra; e "este avistamento foi classificado?" responde
   sim para os dois. Reuso economiza token, nunca evento.
   ================================================================ */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { USUARIO, criarApoio, limparBanco, subirBancoProspeccao } from "./fixtures/bancoProspeccao";

let db: PGlite;
const apoio = criarApoio(() => db);
const FECHADO = { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 };
const FP = "c".repeat(64);
const SETEMBRO = "2026-09-10T12:00:00Z";
const NOVEMBRO = "2026-11-10T12:00:00Z";

describe.sequential("C8 — um evento por avistamento", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("texto igual em setembro e novembro: dois runs, duas etiquetas, nenhuma substitui a outra", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, SETEMBRO, "Casa fechada.");
    const novembro = await apoio.avistamento(pai, NOVEMBRO, "Casa fechada.");

    const primeiro = await apoio.classificar(setembro, FP, [FECHADO]);
    // O mesmo fingerprint no mesmo imóvel vira REUSO (decisão do banco): zero
    // token, mas um run real, com etiquetas próprias copiadas por dentro.
    const segundo = await apoio.classificar(novembro, FP, []);
    expect(segundo.claim).toMatchObject({ modo: "reuso", reusada_de: primeiro.claim.run_id });
    expect(segundo.conclusao).toMatchObject({ ok: true, modo: "reuso", aplicadas: 1 });

    const execucoes = [
      ...(await apoio.execucoes(setembro)),
      ...(await apoio.execucoes(novembro)),
    ];
    expect(execucoes).toHaveLength(2);
    expect(execucoes.map((e) => e.estado)).toEqual(["concluida", "concluida"]);
    expect(new Set(execucoes.map((e) => e.avistamento_id))).toEqual(new Set([setembro, novembro]));
    expect(new Set(execucoes.map((e) => e.id))).toEqual(new Set([primeiro.claim.run_id, segundo.claim.run_id]));
    for (const execucao of execucoes) expect(execucao.concluida_em).not.toBeNull();

    const deSetembro = await apoio.etiquetas(setembro);
    const deNovembro = await apoio.etiquetas(novembro);
    expect(deSetembro).toHaveLength(1);
    expect(deNovembro).toHaveLength(1);
    expect(deSetembro[0]).toMatchObject({
      codigo: FECHADO.codigo, estado: "inferida", avistamento_id: setembro,
      classificacao_id: primeiro.claim.run_id, origem: "ia-texto",
    });
    expect(deNovembro[0]).toMatchObject({
      codigo: FECHADO.codigo, estado: "inferida", avistamento_id: novembro,
      classificacao_id: segundo.claim.run_id, origem: "ia-texto",
    });
    // Cada etiqueta carrega o observado_em do SEU avistamento — não o do original.
    expect(Date.parse(deSetembro[0].observado_em as string)).toBe(Date.parse(SETEMBRO));
    expect(Date.parse(deNovembro[0].observado_em as string)).toBe(Date.parse(NOVEMBRO));
    expect(deSetembro[0].id).not.toBe(deNovembro[0].id);

    // "Este avistamento foi classificado?" — sim para os dois.
    for (const id of [setembro, novembro]) {
      expect((await apoio.linha("public.imoveis_identificados_avistamentos", id)).classificacao_estado).toBe("concluida");
    }
  });

  it("o único parcial de vigência não conflita entre avistamentos diferentes, e proíbe o terceiro idêntico no mesmo", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, SETEMBRO, "Casa fechada.");
    const novembro = await apoio.avistamento(pai, NOVEMBRO, "Casa fechada.");
    const primeiro = await apoio.classificar(setembro, FP, [FECHADO]);
    await apoio.classificar(novembro, FP, []);

    // Vigência: mesmo código vigente nos dois avistamentos é legítimo.
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.imoveis_identificados_etiquetas
        where imovel_identificado_id = $1 and codigo = $2 and estado in ('inferida','confirmada')`, [pai, FECHADO.codigo]);
    expect(rows[0].n).toBe(2);

    // Idempotência: (avistamento, revisão, fingerprint) concluída duas vezes é recusada pelo índice.
    await db.exec("savepoint terceiro");
    await expect(db.query(`insert into public.imoveis_identificados_classificacoes
      (avistamento_id, imovel_identificado_id, user_id, estado, modo, observacao_revisao, fingerprint,
       modelo, versao_catalogo, versao_classificador, confianca_minima, concluida_em)
      values ($1, $2, $3, 'concluida', 'modelo', 1, $4, 'm', 1, 1, 70, now())`,
    [setembro, pai, USUARIO, FP])).rejects.toThrow(/unique|duplicate/i);
    await db.exec("rollback to savepoint terceiro");
    expect(await apoio.iniciar(setembro, FP)).toEqual({ ok: true, repetida: true, run_id: primeiro.claim.run_id });
  });

  it("classificar um avistamento não apaga nem substitui as etiquetas do outro", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, SETEMBRO, "Casa fechada e mato alto na calçada.");
    const novembro = await apoio.avistamento(pai, NOVEMBRO, "Placa de aluga-se na janela.");
    await apoio.classificar(setembro, "1".repeat(64), [
      FECHADO, { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 85 },
    ]);
    const antes = await apoio.etiquetas(setembro);

    await apoio.classificar(novembro, "2".repeat(64), [
      { categoria: "sinal-de-prospeccao", codigo: "placa-aluga-se", confianca: 95 },
    ]);
    expect(await apoio.etiquetas(setembro)).toEqual(antes);
    expect((await apoio.etiquetas(novembro)).map((e) => e.codigo)).toEqual(["placa-aluga-se"]);
  });

  it("reuso nunca cruza imóveis: o mesmo fingerprint em OUTRA identidade chama o modelo", async () => {
    const um = await apoio.identidade();
    const outro = await apoio.identidade();
    const a = await apoio.avistamento(um, SETEMBRO, "Casa fechada.");
    const b = await apoio.avistamento(outro, NOVEMBRO, "Casa fechada.");
    await apoio.classificar(a, FP, [FECHADO]);
    expect(await apoio.iniciar(b, FP)).toMatchObject({ ok: true, modo: "modelo", reusada_de: null });
  });
});
