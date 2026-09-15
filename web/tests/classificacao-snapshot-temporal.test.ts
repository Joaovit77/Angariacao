/* ================================================================
   C8 — SNAPSHOT TEMPORAL: reprocessar o passado não reescreve o presente

   Só a classificação cujo `avistamento_id` é o `avistamento_corrente_id`
   pode tocar o snapshot da identidade, e isso fica registrado em
   `snapshot_aplicado`. Reclassificar setembro em março grava as etiquetas
   de setembro, marca `false`, e o tipo atual continua o de janeiro.
   Manual e confirmado nunca são sobrescritos; sugestão nula não apaga.
   ================================================================ */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  OUTRO_USUARIO,
  criarApoio,
  limparBanco,
  subirBancoProspeccao,
  type Json,
} from "./fixtures/bancoProspeccao";

let db: PGlite;
const apoio = criarApoio(() => db);
const FECHADO = { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 };
const CASA = { sugerido: "Casa", confianca: 72 };
const SOBRADO = { sugerido: "Sobrado", confianca: 78 };

async function identidadeLida(id: string): Promise<Json> {
  return apoio.linha("public.imoveis_identificados", id);
}

describe.sequential("C8 — snapshot temporal", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("A. classificar o avistamento corrente aplica o snapshot e marca snapshot_aplicado = true", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    expect((await identidadeLida(pai)).avistamento_corrente_id).toBe(av);

    const { claim, conclusao } = await apoio.classificar(av, "a".repeat(64), [FECHADO], CASA);
    expect(conclusao).toMatchObject({ ok: true, snapshot_aplicado: true, tipo_aplicado: true });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Casa", tipo_origem: "ia-texto", tipo_confianca: 72, tipo_estado: "inferido",
      tipo_classificacao_id: claim.run_id, tipo_avistamento_id: av,
      tipo_confirmado_por: null, tipo_confirmado_em: null,
    });
    expect((await identidadeLida(pai)).tipo_definido_em).not.toBeNull();
    expect((await apoio.linha("public.imoveis_identificados_classificacoes", claim.run_id as string)).snapshot_aplicado).toBe(true);
  });

  it("B. AV1 set/Casa, AV2 jan/Sobrado: reclassificar AV1 em março grava as etiquetas de AV1 e NÃO move o presente", async () => {
    const pai = await apoio.identidade();
    const av1 = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Casa térrea fechada.");
    await apoio.classificar(av1, "1".repeat(64), [FECHADO], CASA);
    expect((await identidadeLida(pai)).tipo).toBe("Casa");

    const av2 = await apoio.avistamento(pai, "2027-01-10T12:00:00Z", "Sobrado com placa de aluga-se.");
    expect((await identidadeLida(pai)).avistamento_corrente_id).toBe(av2);
    const jan = await apoio.classificar(av2, "2".repeat(64), [
      { categoria: "sinal-de-prospeccao", codigo: "placa-aluga-se", confianca: 95 },
    ], SOBRADO);
    expect(jan.conclusao).toMatchObject({ snapshot_aplicado: true, tipo_aplicado: true });
    expect(await identidadeLida(pai)).toMatchObject({ tipo: "Sobrado", tipo_avistamento_id: av2 });

    // Março: reclassifica setembro (outro fingerprint = nova execução).
    const marco = await apoio.classificar(av1, "3".repeat(64), [
      FECHADO, { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 88 },
    ], { sugerido: "Terreno", confianca: 99 });
    expect(marco.conclusao).toMatchObject({ ok: true, snapshot_aplicado: false, tipo_aplicado: false, aplicadas: 2 });
    expect((await apoio.linha("public.imoveis_identificados_classificacoes", marco.claim.run_id as string)))
      .toMatchObject({ snapshot_aplicado: false, tipo_sugerido: "Terreno", tipo_confianca: 99, estado: "concluida" });
    // As etiquetas de setembro foram gravadas, no avistamento de setembro.
    expect((await apoio.etiquetas(av1)).filter((e) => e.estado === "inferida").map((e) => e.codigo).sort())
      .toEqual(["imovel-fechado", "mato-alto"]);
    // O presente continua Sobrado, apontando para AV2 e para a execução de janeiro.
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Sobrado", tipo_avistamento_id: av2, tipo_classificacao_id: jan.claim.run_id, tipo_confianca: 78,
    });
  });

  it("C. avistamento retroativo não vira corrente, e a classificação dele não move o presente", async () => {
    const pai = await apoio.identidade();
    const atual = await apoio.avistamento(pai, "2027-01-10T12:00:00Z", "Sobrado com placa de aluga-se.");
    await apoio.classificar(atual, "1".repeat(64), [], SOBRADO);

    const retroativo = await apoio.avistamento(pai, "2026-03-01T12:00:00Z", "Terreno baldio com mato alto.");
    expect((await identidadeLida(pai)).avistamento_corrente_id).toBe(atual);

    const { conclusao } = await apoio.classificar(retroativo, "2".repeat(64), [
      { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 90 },
    ], { sugerido: "Terreno", confianca: 95 });
    expect(conclusao).toMatchObject({ snapshot_aplicado: false, tipo_aplicado: false });
    expect(await identidadeLida(pai)).toMatchObject({ tipo: "Sobrado", tipo_avistamento_id: atual });
    expect((await apoio.etiquetas(retroativo)).map((e) => e.codigo)).toEqual(["mato-alto"]);

    // Um avistamento mais novo que o atual passa a ser o corrente, e só ele toca o snapshot.
    const av3 = await apoio.avistamento(pai, "2027-02-01T12:00:00Z", "Agora parece uma casa comum.");
    expect((await identidadeLida(pai)).avistamento_corrente_id).toBe(av3);
    const { conclusao: c3 } = await apoio.classificar(av3, "3".repeat(64), [], CASA);
    expect(c3).toMatchObject({ snapshot_aplicado: true, tipo_aplicado: true });
    expect(await identidadeLida(pai)).toMatchObject({ tipo: "Casa", tipo_avistamento_id: av3 });
  });

  it("D. tipo manual existente: a IA não sobrescreve, mesmo no avistamento corrente", async () => {
    const pai = await apoio.identidade("Galpão");
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    expect(await identidadeLida(pai)).toMatchObject({ tipo: "Galpão", tipo_origem: "manual", tipo_estado: "declarado" });

    const { conclusao } = await apoio.classificar(av, "1".repeat(64), [FECHADO], CASA);
    expect(conclusao).toMatchObject({ snapshot_aplicado: true, tipo_aplicado: false, aplicadas: 1 });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Galpão", tipo_origem: "manual", tipo_estado: "declarado",
      tipo_confianca: null, tipo_classificacao_id: null, tipo_avistamento_id: null,
    });
  });

  it("E. tipo confirmado existente: a IA não sobrescreve", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const primeira = await apoio.classificar(av, "1".repeat(64), [], CASA);
    const confirmacao = await apoio.comoUsuario("select public.confirmar_tipo_identificado($1) as resultado", [pai]);
    expect(confirmacao.rows[0].resultado).toMatchObject({ ok: true, tipo: "Casa" });

    const { conclusao } = await apoio.classificar(av, "2".repeat(64), [], SOBRADO);
    expect(conclusao).toMatchObject({ snapshot_aplicado: true, tipo_aplicado: false });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Casa", tipo_estado: "confirmado", tipo_origem: "ia-texto",
      tipo_classificacao_id: primeira.claim.run_id, tipo_avistamento_id: av,
    });
  });

  it("F. tipo sugerido nulo não apaga o tipo conhecido", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const primeira = await apoio.classificar(av, "1".repeat(64), [], CASA);
    const { conclusao } = await apoio.classificar(av, "2".repeat(64), [FECHADO], null);
    expect(conclusao).toMatchObject({ snapshot_aplicado: true, tipo_aplicado: false });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Casa", tipo_classificacao_id: primeira.claim.run_id, tipo_confianca: 72,
    });
  });

  it("G. tipo com confiança abaixo de 70 não é etiqueta: o run guarda a sugestão inteira e o snapshot segue só as regras canônicas", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    // Corrente, sem tipo manual/confirmado: a sugestão fraca É aplicada, com a confiança real.
    const fraca = await apoio.classificar(av, "1".repeat(64), [], { sugerido: "Sobrado", confianca: 55 });
    expect(fraca.conclusao).toMatchObject({ snapshot_aplicado: true, tipo_aplicado: true });
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", fraca.claim.run_id as string))
      .toMatchObject({ tipo_sugerido: "Sobrado", tipo_confianca: 55, confianca_minima: 70 });
    expect(await identidadeLida(pai)).toMatchObject({
      tipo: "Sobrado", tipo_origem: "ia-texto", tipo_confianca: 55, tipo_estado: "inferido",
      tipo_classificacao_id: fraca.claim.run_id, tipo_avistamento_id: av,
    });

    // Manual existente: a mesma sugestão fraca fica só no histórico do run.
    const manual = await apoio.identidade("Galpão");
    const avManual = await apoio.avistamento(manual, "2026-09-10T12:00:00Z");
    const emManual = await apoio.classificar(avManual, "1".repeat(64), [], { sugerido: "Sobrado", confianca: 55 });
    expect(emManual.conclusao).toMatchObject({ tipo_aplicado: false });
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", emManual.claim.run_id as string))
      .toMatchObject({ tipo_sugerido: "Sobrado", tipo_confianca: 55 });
    expect((await identidadeLida(manual)).tipo).toBe("Galpão");

    // Avistamento não corrente: também só no histórico.
    const av2 = await apoio.avistamento(pai, "2027-01-10T12:00:00Z", "Agora parece uma casa comum.");
    await apoio.classificar(av2, "2".repeat(64), [], { sugerido: "Casa", confianca: 90 });
    const antigo = await apoio.classificar(av, "3".repeat(64), [], { sugerido: "Terreno", confianca: 40 });
    expect(antigo.conclusao).toMatchObject({ snapshot_aplicado: false, tipo_aplicado: false });
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", antigo.claim.run_id as string))
      .toMatchObject({ tipo_sugerido: "Terreno", tipo_confianca: 40 });
    expect(await identidadeLida(pai)).toMatchObject({ tipo: "Casa", tipo_confianca: 90, tipo_avistamento_id: av2 });
  });

  it("execução de outro usuário ou de outro imóvel não serve de proveniência", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, "1".repeat(64));
    // Outro usuário tentando concluir o run: indistinguível de "não existe".
    await db.exec("savepoint alheio");
    await expect(apoio.concluir(claim, [FECHADO], CASA, {}, OUTRO_USUARIO)).rejects.toThrow(/não encontrad/);
    await db.exec("rollback to savepoint alheio");
    expect(await identidadeLida(pai)).toMatchObject({ tipo: null });

    // Outro imóvel: a RPC lê a identidade a partir do run, nunca do payload —
    // não há como apontar o run para outra identidade por fora.
    const outro = await apoio.identidade();
    await apoio.concluir(claim, [FECHADO], CASA);
    expect((await identidadeLida(outro)).tipo).toBeNull();
    expect((await identidadeLida(pai)).tipo).toBe("Casa");
  });
});
