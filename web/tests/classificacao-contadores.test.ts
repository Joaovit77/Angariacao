/* ================================================================
   DIAGNÓSTICO DOS CONTADORES DE UMA EXECUÇÃO

   O que `concluir_classificacao` grava, lido do SQL efetivo:
     ja_confirmada   = códigos do resultado que já tinham linha `confirmada`
                       no avistamento (não inseridos, não tocados)
     reafirmadas     = códigos do resultado que já tinham linha `inferida`
                       vigente (mantidos na linha antiga, sem nova linha)
     inseridas       = linhas realmente inseridas com classificacao_id = run
     aplicadas       = inseridas + reafirmadas            (gravado)
     sugeridas       = greatest(payload.sugeridas, inseridas + reafirmadas
                       + ja_confirmada)                   (gravado)
     abaixo_do_piso, fora_do_catalogo, sem_evidencia = copiados do payload
   `inseridas` e `reafirmadas` NÃO são gravados. Mas as linhas de um run
   nunca somem (append-only, sem delete, o reuso não as move), então
   count(etiquetas where classificacao_id = run) = inseridas, sempre.

   Daí o predicado de reconstrutibilidade, sem adivinhar:
     aplicadas = count(linhas do run)  ⇔  reafirmadas = 0
     ja_confirmada = 0                  ⇔  nada do resultado ficou numa
                                           linha confirmada alheia ao run
   As duas juntas ⇔ todo código válido do resultado tem linha própria.
   ================================================================ */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { criarApoio, limparBanco, subirBancoProspeccao, type Json } from "./fixtures/bancoProspeccao";

let db: PGlite;
const apoio = criarApoio(() => db);
const A = { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 };
const B = { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 85 };
const C = { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 80 };

async function contadores(runId: string): Promise<Json> {
  const run = await apoio.linha("public.imoveis_identificados_classificacoes", runId);
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int as n from public.imoveis_identificados_etiquetas where classificacao_id = $1", [runId]);
  return {
    sugeridas: run.sugeridas, aplicadas: run.aplicadas, abaixo_do_piso: run.abaixo_do_piso,
    fora_do_catalogo: run.fora_do_catalogo, sem_evidencia: run.sem_evidencia, ja_confirmada: run.ja_confirmada,
    linhas_do_run: rows[0].n,
  };
}

describe.sequential("diagnóstico: o que cada contador significa de fato", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("A. primeiro run A/B sem etiqueta anterior: tudo inserido, linhas = aplicadas", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim, conclusao } = await apoio.classificar(av, "1".repeat(64), [A, B]);
    expect(conclusao).toMatchObject({ inseridas: 2, reafirmadas: 0, ja_confirmada: 0, aplicadas: 2 });
    expect(await contadores(claim.run_id as string)).toEqual({
      sugeridas: 2, aplicadas: 2, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 0, ja_confirmada: 0, linhas_do_run: 2,
    });
  });

  it("B. reclassificação A/B → A/C: A reafirmada fica na linha antiga; o run #2 só tem C como linha própria", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const r1 = await apoio.classificar(av, "1".repeat(64), [A, B]);
    const r2 = await apoio.classificar(av, "2".repeat(64), [A, C]);
    expect(r2.conclusao).toMatchObject({ inseridas: 1, reafirmadas: 1, ja_confirmada: 0, aplicadas: 2 });
    // aplicadas (2) ≠ linhas_do_run (1): o run #2 NÃO é integralmente reconstruível por classificacao_id.
    expect(await contadores(r2.claim.run_id as string)).toEqual({
      sugeridas: 2, aplicadas: 2, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 0, ja_confirmada: 0, linhas_do_run: 1,
    });
    // O run #1 continua com as duas linhas próprias (B agora substituída, mas é linha dele).
    expect(await contadores(r1.claim.run_id as string)).toMatchObject({ aplicadas: 2, linhas_do_run: 2 });
    const linhaA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!;
    expect(linhaA).toMatchObject({ classificacao_id: r1.claim.run_id, estado: "inferida" });
  });

  it("C. resultado contendo código já confirmado: ja_confirmada conta, a linha confirmada é de outro run", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const r1 = await apoio.classificar(av, "1".repeat(64), [A]);
    const idA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [idA]);
    const r2 = await apoio.classificar(av, "2".repeat(64), [A, C]);
    expect(r2.conclusao).toMatchObject({ inseridas: 1, reafirmadas: 0, ja_confirmada: 1, aplicadas: 1 });
    // aplicadas = linhas (1 = 1), mas ja_confirmada = 1: A fazia parte do resultado e não tem linha no run #2.
    expect(await contadores(r2.claim.run_id as string)).toEqual({
      sugeridas: 2, aplicadas: 1, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 0, ja_confirmada: 1, linhas_do_run: 1,
    });
    expect((await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.classificacao_id).toBe(r1.claim.run_id);
  });

  it("D. saída válida com zero etiquetas: concluída, aplicadas 0, zero linhas — reconstrução exata (vazia)", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim } = await apoio.classificar(av, "1".repeat(64), []);
    expect(await contadores(claim.run_id as string)).toEqual({
      sugeridas: 0, aplicadas: 0, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 0, ja_confirmada: 0, linhas_do_run: 0,
    });
  });

  it("E/F/G. abaixo do piso, fora do catálogo e sem evidência vêm do payload da rota e não geram linha", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const claim = await apoio.iniciar(av, "1".repeat(64));
    // A rota já descartou os itens inválidos; a RPC só recebe os contadores.
    await apoio.concluir(claim, [A], null, { sugeridas: 4, abaixo_do_piso: 1, fora_do_catalogo: 1, sem_evidencia: 1 });
    expect(await contadores(claim.run_id as string)).toEqual({
      sugeridas: 4, aplicadas: 1, abaixo_do_piso: 1, fora_do_catalogo: 1, sem_evidencia: 1, ja_confirmada: 0, linhas_do_run: 1,
    });
    // `sugeridas` nunca fica abaixo do que foi efetivamente aplicado/reafirmado/confirmado.
    const outro = await apoio.iniciar(av, "2".repeat(64));
    await apoio.concluir(outro, [A, C], null, { sugeridas: 0 });
    expect(await contadores(outro.run_id as string)).toMatchObject({ sugeridas: 2, aplicadas: 2, linhas_do_run: 1 });
  });

  it("as linhas de um run nunca somem: o reuso insere linhas novas no run de reuso e não move as da origem", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Casa fechada sem placa.");
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", "Casa fechada sem placa.");
    const r1 = await apoio.classificar(setembro, "f".repeat(64), [A, B]);
    const claim = await apoio.iniciar(novembro, "f".repeat(64));
    await apoio.concluir(claim, []);
    expect(await contadores(r1.claim.run_id as string)).toMatchObject({ aplicadas: 2, linhas_do_run: 2 });
    expect(await contadores(claim.run_id as string)).toMatchObject({ aplicadas: 2, linhas_do_run: 2, ja_confirmada: 0 });
  });
});
