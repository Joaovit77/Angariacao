/* ================================================================
   C9 — REVISÃO DA OBSERVAÇÃO: invalidação atômica pelo único before update

   Corrigir `observacao` é um UPDATE comum (o cliente tem `update (observacao)`
   e só isso). Tudo acontece em `private.proteger_avistamento`, no mesmo
   UPDATE: revisão +1; classificação volta a `pendente` com os ids zerados;
   inferidas viram `desatualizada`; confirmadas ficam e o avistamento acusa
   `revisao_conflito_em`; o tipo `ia-texto/inferido` que se apoiava naquele
   texto é limpo (manual e confirmado não). Nada disso depende de RPC, de
   UI ou de ordem entre gatilhos — e o histórico não encolhe.
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

const TRIGGERS = lerSql("supabase/migrations/20260910193412_prospeccao_campo_triggers.sql");
const A = { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 };
const B = { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 85 };
const ORIGINAL = "Casa fechada sem placa.";
const CORRIGIDO = "Casa fechada.";

let db: PGlite;
const apoio = criarApoio(() => db);

async function corrigir(av: string, texto: string, usuario = USUARIO) {
  return apoio.comoUsuario(
    "update public.imoveis_identificados_avistamentos set observacao = $2 where id = $1", [av, texto], usuario);
}
const avistamentoLido = (av: string) => apoio.linha("public.imoveis_identificados_avistamentos", av);

describe("estrutura: um único before update no avistamento", () => {
  it("existe exatamente um `before update` na tabela, e é proteger_avistamento", () => {
    const gatilhos = [...TRIGGERS.matchAll(/create trigger (\w+)\s+before update on public\.imoveis_identificados_avistamentos[\s\S]*?execute function ([\w.]+)\(\)/g)]
      .map((m) => ({ nome: m[1], funcao: m[2] }));
    expect(gatilhos).toEqual([{ nome: "trg_identificados_avistamentos_proteger", funcao: "private.proteger_avistamento" }]);
    // Nenhuma migration posterior cria outro before update nessa tabela.
    for (const nome of [
      "20260910201530_prospeccao_campo_rpcs_classificacao.sql", "20260910211045_prospeccao_campo_rpcs_navegador.sql",
      "20260911115908_prospeccao_campo_exclusao_storage.sql", "20260913162604_prospeccao_merge_contrato_transacional.sql",
      "20260914130000_prospeccao_reuso_reconstroi_execucao.sql", "20260914140000_prospeccao_reuso_fonte_reconstruivel.sql",
    ]) {
      expect(lerSql(`supabase/migrations/${nome}`)).not.toMatch(/before update on public\.imoveis_identificados_avistamentos/);
    }
  });
});

describe.sequential("revisão da observação no PostgreSQL local", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  async function classificado(): Promise<{ pai: string; av: string; run: Json }> {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", ORIGINAL);
    const { claim } = await apoio.classificar(av, "f".repeat(64), [A, B], { sugerido: "Casa", confianca: 72 });
    return { pai, av, run: claim };
  }

  it("1–7. um único UPDATE: revisão +1, classificação pendente com ids/fingerprint zerados, inferidas desatualizadas com instante", async () => {
    const { av, run } = await classificado();
    expect(await avistamentoLido(av)).toMatchObject({ observacao_revisao: 1, classificacao_estado: "concluida", classificacao_id: run.run_id });

    await corrigir(av, CORRIGIDO);

    expect(await avistamentoLido(av)).toMatchObject({
      observacao: CORRIGIDO, observacao_revisao: 2,
      classificacao_estado: "pendente", classificacao_id: null, classificacao_em: null, fingerprint: null,
      revisao_conflito_em: null,
    });
    const etiquetas = await apoio.etiquetas(av);
    expect(etiquetas).toHaveLength(2);
    for (const e of etiquetas) {
      expect(e).toMatchObject({ estado: "desatualizada", revisao_observacao: 1, classificacao_id: run.run_id });
      expect(e.desatualizada_em).not.toBeNull();
      expect(e.substituida_em).toBeNull();
      expect(e.substituida_por_classificacao_id).toBeNull();
    }
    // A execução continua no histórico, concluída.
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", run.run_id as string)).toMatchObject({ estado: "concluida" });
  });

  it("8–9. confirmada NÃO é revogada, mantém a revisão que a originou, e o avistamento acusa revisao_conflito_em", async () => {
    const { av } = await classificado();
    const idA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [idA]);

    await corrigir(av, CORRIGIDO);

    const linhaA = (await apoio.etiquetas(av)).find((e) => e.id === idA)!;
    expect(linhaA).toMatchObject({ estado: "confirmada", revisao_observacao: 1, confirmada_por: USUARIO, desatualizada_em: null });
    expect(linhaA.confirmada_em).not.toBeNull();
    const avistamento = await avistamentoLido(av);
    expect(avistamento.revisao_conflito_em).not.toBeNull();
    expect(avistamento.observacao_revisao).toBe(2);
    // A outra (inferida) desatualizou normalmente.
    expect((await apoio.etiquetas(av)).find((e) => e.codigo === B.codigo)).toMatchObject({ estado: "desatualizada" });
  });

  it("sem confirmada não há conflito; update que não muda o texto não mexe em nada", async () => {
    const { av, run } = await classificado();
    await corrigir(av, ORIGINAL);
    expect(await avistamentoLido(av)).toMatchObject({
      observacao_revisao: 1, classificacao_estado: "concluida", classificacao_id: run.run_id, revisao_conflito_em: null,
    });
    expect((await apoio.etiquetas(av)).map((e) => e.estado)).toEqual(["inferida", "inferida"]);
  });

  it("10. o UPDATE direto na tabela (dono do banco, sem RLS) sofre a mesma invalidação: é gatilho, não RPC nem UI", async () => {
    const { av } = await classificado();
    await db.query("update public.imoveis_identificados_avistamentos set observacao = $2 where id = $1", [av, CORRIGIDO]);
    expect(await avistamentoLido(av)).toMatchObject({ observacao_revisao: 2, classificacao_estado: "pendente", classificacao_id: null });
    expect((await apoio.etiquetas(av)).map((e) => e.estado)).toEqual(["desatualizada", "desatualizada"]);
  });

  it("12. invariante: nenhuma inferida vigente com revisão diferente da atual; a confirmada antiga é exatamente o conflito sinalizado", async () => {
    const { av } = await classificado();
    const idA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [idA]);
    await corrigir(av, CORRIGIDO);
    await corrigir(av, "Casa fechada, mato alto.");
    const { rows } = await db.query<{ estado: string; revisao_observacao: number; atual: number; conflito: string | null }>(`
      select e.estado, e.revisao_observacao, a.observacao_revisao as atual, a.revisao_conflito_em::text as conflito
        from public.imoveis_identificados_etiquetas e
        join public.imoveis_identificados_avistamentos a on a.id = e.avistamento_id
       where e.avistamento_id = $1 and e.estado in ('inferida', 'confirmada')`, [av]);
    expect(rows.filter((r) => r.estado === "inferida" && r.revisao_observacao !== r.atual)).toEqual([]);
    for (const r of rows.filter((r) => r.estado === "confirmada" && r.revisao_observacao !== r.atual)) {
      expect(r.conflito).not.toBeNull();
    }
    expect(rows).toEqual([{ estado: "confirmada", revisao_observacao: 1, atual: 3, conflito: expect.any(String) }]);
  });

  it("13. o cliente só altera `observacao`: qualquer outra coluna junto é recusada por privilégio, e o texto não muda", async () => {
    const { av } = await classificado();
    for (const coluna of ["observado_em = now()", "classificacao_estado = 'concluida'", "observacao_revisao = 9", "revisao_conflito_em = null", "latitude = -23.3"]) {
      await db.exec("savepoint col");
      await expect(apoio.comoUsuario(
        `update public.imoveis_identificados_avistamentos set observacao = $2, ${coluna} where id = $1`, [av, CORRIGIDO],
      )).rejects.toThrow(/permission denied|42501/i);
      await db.exec("rollback to savepoint col");
    }
    expect(await avistamentoLido(av)).toMatchObject({ observacao: ORIGINAL, observacao_revisao: 1 });
    // Alheio: a RLS não devolve a linha, o UPDATE não atinge nada.
    const { rows } = await corrigir(av, CORRIGIDO, "10000000-0000-4000-8000-000000000002");
    void rows;
    expect(await avistamentoLido(av)).toMatchObject({ observacao: ORIGINAL, observacao_revisao: 1 });
  });

  it("14–16. voltar ao texto original: revisão nova, run novo em modo reuso (zero token) e etiquetas materializadas para a revisão", async () => {
    const { av, run } = await classificado();
    await corrigir(av, CORRIGIDO);
    await corrigir(av, ORIGINAL);
    expect(await avistamentoLido(av)).toMatchObject({ observacao_revisao: 3, classificacao_estado: "pendente" });

    const claim = await apoio.iniciar(av, "f".repeat(64));
    expect(claim).toMatchObject({ ok: true, repetida: false, modo: "reuso", reusada_de: run.run_id });
    expect(claim.run_id).not.toBe(run.run_id);
    const conclusao = await apoio.concluir(claim, []);
    expect(conclusao).toMatchObject({ ok: true, modo: "reuso", aplicadas: 2 });
    expect((await apoio.etiquetas(av)).filter((e) => e.estado === "inferida").map((e) => [e.codigo, e.revisao_observacao, e.classificacao_id]).sort())
      .toEqual([[A.codigo, 3, claim.run_id], [B.codigo, 3, claim.run_id]].sort());
    expect(await avistamentoLido(av)).toMatchObject({ classificacao_estado: "concluida", classificacao_id: claim.run_id, fingerprint: "f".repeat(64) });
    // O run de reuso é distinguível do run por modelo e nenhum ia_uso nasce dele (a RPC não escreve ia_uso).
    const execucoes = await apoio.execucoes(av);
    expect(execucoes.map((e) => [e.modo, e.estado]).sort()).toEqual([["modelo", "concluida"], ["reuso", "concluida"]]);
  });

  it("17. tipo inferido pela IA a partir deste avistamento é limpo com a correção; a execução guarda a sugestão", async () => {
    const { pai, av, run } = await classificado();
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({ tipo: "Casa", tipo_origem: "ia-texto", tipo_estado: "inferido", tipo_avistamento_id: av });
    await corrigir(av, CORRIGIDO);
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({
      tipo: null, tipo_origem: null, tipo_confianca: null, tipo_estado: null, tipo_definido_em: null,
      tipo_classificacao_id: null, tipo_avistamento_id: null, tipo_confirmado_por: null, tipo_confirmado_em: null,
    });
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", run.run_id as string)).toMatchObject({ tipo_sugerido: "Casa", tipo_confianca: 72 });
  });

  it("18. tipo manual não é limpo pela correção", async () => {
    const pai = await apoio.identidade("Galpão");
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", ORIGINAL);
    await apoio.classificar(av, "f".repeat(64), [A], { sugerido: "Casa", confianca: 72 });
    await corrigir(av, CORRIGIDO);
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({ tipo: "Galpão", tipo_origem: "manual", tipo_estado: "declarado" });
  });

  it("19. tipo confirmado não é limpo pela correção, e mantém a proveniência da IA", async () => {
    const { pai, av, run } = await classificado();
    await apoio.comoUsuario("select public.confirmar_tipo_identificado($1)", [pai]);
    await corrigir(av, CORRIGIDO);
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({
      tipo: "Casa", tipo_origem: "ia-texto", tipo_estado: "confirmado", tipo_classificacao_id: run.run_id, tipo_avistamento_id: av,
    });
  });

  it("a inferência de tipo vinda de OUTRO avistamento não é limpa quando este é corrigido", async () => {
    const pai = await apoio.identidade();
    const av1 = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", ORIGINAL);
    const av2 = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", "Sobrado com placa.");
    await apoio.classificar(av2, "2".repeat(64), [], { sugerido: "Sobrado", confianca: 78 });
    await apoio.classificar(av1, "1".repeat(64), [A], { sugerido: "Casa", confianca: 72 });
    await corrigir(av1, CORRIGIDO);
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({ tipo: "Sobrado", tipo_avistamento_id: av2 });
  });

  it("20. o histórico continua intacto: execuções, etiquetas desatualizadas e substituídas nunca são apagadas", async () => {
    const { av, run } = await classificado();
    const r2 = await apoio.classificar(av, "2".repeat(64), [A]);          // B substituída por R2
    await corrigir(av, CORRIGIDO);                                          // A (reafirmada em R1) desatualizada
    await corrigir(av, ORIGINAL);
    await apoio.concluir(await apoio.iniciar(av, "f".repeat(64)), []);      // reuso de R1: A/B para a rev 3
    const etiquetas = await apoio.etiquetas(av);
    expect(etiquetas.map((e) => [e.codigo, e.estado, e.revisao_observacao]).sort()).toEqual([
      [A.codigo, "desatualizada", 1], [A.codigo, "inferida", 3],
      [B.codigo, "inferida", 3], [B.codigo, "substituida", 1],
    ].sort());
    expect(etiquetas.find((e) => e.estado === "substituida")).toMatchObject({ substituida_por_classificacao_id: r2.claim.run_id, desatualizada_em: null });
    expect(etiquetas.find((e) => e.estado === "desatualizada")).toMatchObject({ substituida_por_classificacao_id: null });
    expect((await apoio.execucoes(av)).map((e) => e.estado)).toEqual(["concluida", "concluida", "concluida"]);
    expect((await apoio.execucoes(av)).some((e) => e.id === run.run_id)).toBe(true);
  });

  it("exclusão em andamento no pai congela a correção (contrato do C5b, sem exceção para reuso)", async () => {
    const { pai, av } = await classificado();
    await apoio.marcarExclusao(pai);
    await db.exec("savepoint exc");
    await expect(corrigir(av, CORRIGIDO)).rejects.toThrow(/exclusão em andamento|42501/);
    await db.exec("rollback to savepoint exc");
    expect(await avistamentoLido(av)).toMatchObject({ observacao: ORIGINAL, observacao_revisao: 1 });
  });
});
