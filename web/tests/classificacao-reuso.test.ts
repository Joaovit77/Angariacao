/* ================================================================
   REUSO — economiza token, nunca evento

   A fonte do reuso é a EXECUÇÃO apontada por `reusada_de_classificacao_id`,
   escolhida por `iniciar_classificacao` (mesmo usuário, mesmo imóvel, mesmo
   fingerprint, concluída). `concluir_classificacao` reconstrói a saída
   daquela execução num run NOVO, ancorado no `classificacao_id` de origem:
   o estado atual de cada linha histórica (desatualizada, substituida,
   contestada…) é ciclo de vida da afirmação, não identidade do resultado.
   A cópia nasce sempre `inferida`; ação humana antiga não atravessa.

   Estrutural sobre a migration corretiva, comportamental no PGlite, e
   zero-IA no módulo de servidor com executor falso.
   ================================================================ */
import { readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const registro = vi.hoisted(() => ({ registrarEvento: vi.fn(), registrarUsoIa: vi.fn() }));
vi.mock("@/lib/servidor/registro", () => registro);

import { CONFIGURACAO_IA_PADRAO } from "@/lib/ia/configuracao";
import { classificarAvistamento, type DependenciasClassificacao } from "@/lib/servidor/classificacaoProspeccao";
import {
  OUTRO_USUARIO,
  USUARIO,
  criarApoio,
  lerSql,
  limparBanco,
  subirBancoProspeccao,
  type Json,
} from "./fixtures/bancoProspeccao";

const PASTA = "supabase/migrations/";
const ARQUIVO = "20260914130000_prospeccao_reuso_reconstroi_execucao.sql";
const ARQUIVO_FONTE = "20260914140000_prospeccao_reuso_fonte_reconstruivel.sql";
const MIGRATION = lerSql(PASTA + ARQUIVO);
const MIGRATION_FONTE = lerSql(PASTA + ARQUIVO_FONTE);
const PADRAO = /create or replace function public\.concluir_classificacao\([\s\S]*?\n\$\$;/g;
const PADRAO_INICIAR = /create or replace function public\.iniciar_classificacao\([\s\S]*?\n\$\$;/g;
const RAIZ_MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
const ARQUIVOS = readdirSync(RAIZ_MIGRATIONS).filter((nome) => nome.endsWith(".sql")).sort();
const definicoes = (padrao: RegExp) =>
  ARQUIVOS.flatMap((nome) => [...lerSql(PASTA + nome).matchAll(padrao)].map(([sql]) => ({ nome, sql })));
const DEFINICOES = definicoes(PADRAO);
const HISTORICA = DEFINICOES[0].sql;
const ATUAL = DEFINICOES.at(-1)!;
const DEFINICOES_INICIAR = definicoes(PADRAO_INICIAR);
const INICIAR_HISTORICA = DEFINICOES_INICIAR[0].sql;
const INICIAR_ATUAL = DEFINICOES_INICIAR.at(-1)!;
const ramoReuso = (sql: string) => sql.slice(sql.indexOf("if v_run.modo = 'reuso' then"), sql.indexOf("\n  else\n"));
const buscaReuso = (sql: string) => sql.slice(sql.indexOf("select c.id into v_reuso"), sql.indexOf("v_modo := case"));

const A = { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 };
const B = { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 85 };
const C = { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 80 };
const FP = "f".repeat(64);
const TEXTO = "Casa fechada sem placa.";

describe("migration corretiva — contrato estrutural da definição efetiva", () => {
  it("é a última definição de concluir_classificacao, redefine só ela e é espelhada no schema uma vez, depois da histórica", () => {
    expect(ATUAL.nome).toBe(ARQUIVO);
    expect(DEFINICOES).toHaveLength(2);
    expect([...MIGRATION.matchAll(/create or replace function ([\w.]+)/gi)].map((m) => m[1]))
      .toEqual(["public.concluir_classificacao"]);
    expect(MIGRATION).not.toMatch(/\b(?:grant|revoke|drop|alter|create table|create policy|create trigger|create (?:unique )?index)\b/i);
    const schema = lerSql("supabase-schema.sql");
    expect(schema.split(MIGRATION.trim())).toHaveLength(2);
    expect([...schema.matchAll(PADRAO)].at(-1)?.[0]).toBe(ATUAL.sql);
    expect(schema.indexOf(ATUAL.sql)).toBeGreaterThan(schema.indexOf(HISTORICA));
  });

  it("a origem do reuso é o classificacao_id da execução reutilizada, sem filtrar pelo estado mutável da linha", () => {
    const antes = ramoReuso(HISTORICA);
    const depois = ramoReuso(ATUAL.sql);
    expect(antes).toMatch(/and e\.estado in \('inferida', 'confirmada'\)/);
    expect(depois).toMatch(/where e\.classificacao_id = v_run\.reusada_de_classificacao_id;/);
    expect(depois).not.toMatch(/e\.estado/);
    expect(depois).not.toMatch(/p_etiquetas|p_tipo_sugerido|confirmada_por|confirmada_em/);
  });

  it("fora do ramo de reuso a função é idêntica à do C2d: assinatura, ramo modelo, ja_confirmada, supersessão e snapshot", () => {
    const semRamo = (sql: string) => sql.replace(/if v_run\.modo = 'reuso' then[\s\S]*?\n  else\n/, "");
    expect(semRamo(ATUAL.sql)).toBe(semRamo(HISTORICA));
    expect(ATUAL.sql).toMatch(/'ia-texto', d\.confianca, 'inferida'/);
    expect(ATUAL.sql).toMatch(/ja_confirmada = v_ja_confirmada/);
  });
});

describe("migration da fonte reconstruível — contrato estrutural de iniciar_classificacao", () => {
  it("é a última definição de iniciar_classificacao, redefine só ela e é espelhada no schema uma vez, depois da histórica", () => {
    expect(INICIAR_ATUAL.nome).toBe(ARQUIVO_FONTE);
    expect(DEFINICOES_INICIAR).toHaveLength(2);
    expect([...MIGRATION_FONTE.matchAll(/create or replace function ([\w.]+)/gi)].map((m) => m[1]))
      .toEqual(["public.iniciar_classificacao"]);
    expect(MIGRATION_FONTE).not.toMatch(/\b(?:grant|revoke|drop|alter|create table|create policy|create trigger|create (?:unique )?index)\b/i);
    const schema = lerSql("supabase-schema.sql");
    expect(schema.split(MIGRATION_FONTE.trim())).toHaveLength(2);
    expect([...schema.matchAll(PADRAO_INICIAR)].at(-1)?.[0]).toBe(INICIAR_ATUAL.sql);
    expect(schema.indexOf(INICIAR_ATUAL.sql)).toBeGreaterThan(schema.indexOf(INICIAR_HISTORICA));
  });

  it("a candidata precisa provar reconstrução integral: ja_confirmada = 0 e aplicadas = linhas próprias; a mais recente entre as seguras", () => {
    const busca = buscaReuso(INICIAR_ATUAL.sql);
    expect(busca).toMatch(/c\.user_id = p_user_id/);
    expect(busca).toMatch(/c\.imovel_identificado_id = v_avistamento\.imovel_identificado_id/);
    expect(busca).toMatch(/c\.fingerprint = p_fingerprint/);
    expect(busca).toMatch(/c\.estado = 'concluida'/);
    expect(busca).toMatch(/c\.ja_confirmada = 0/);
    expect(busca).toMatch(/c\.aplicadas = \(\s*select count\(\*\)\s+from public\.imoveis_identificados_etiquetas e\s+where e\.classificacao_id = c\.id\s*\)/);
    expect(busca).toMatch(/order by c\.concluida_em desc nulls last, c\.iniciada_em desc\s+limit 1/);
    expect(buscaReuso(INICIAR_HISTORICA)).not.toMatch(/ja_confirmada|count\(\*\)/);
  });

  it("fora da busca de reuso a função é idêntica à do C2d: claim, lease, lock, idempotência, exclusão", () => {
    const semBusca = (sql: string) => sql
      .replace(/  -- Reuso:[\s\S]*?select c\.id into v_reuso[\s\S]*?limit 1;\n/, "");
    expect(semBusca(INICIAR_ATUAL.sql)).toBe(semBusca(INICIAR_HISTORICA));
    expect(semBusca(INICIAR_ATUAL.sql)).not.toContain("v_reuso :=");
    expect(INICIAR_ATUAL.sql).toContain("now() + interval '2 minutes'");
    expect(INICIAR_ATUAL.sql.match(/pg_catalog\.pg_advisory_xact_lock\(/g)).toHaveLength(1);
  });
});

let db: PGlite;
const apoio = criarApoio(() => db);

async function corrigir(av: string, texto: string) {
  await apoio.comoUsuario("update public.imoveis_identificados_avistamentos set observacao = $2 where id = $1", [av, texto]);
}

describe.sequential("reuso no PostgreSQL local", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("a definição efetiva preserva execute só para service_role", async () => {
    const { rows } = await db.query<{ papel: string; permitido: boolean }>(`select papel,
      has_function_privilege(papel, 'public.concluir_classificacao(uuid,uuid,uuid,text,smallint,jsonb,jsonb)', 'execute') as permitido
      from unnest(array['anon', 'authenticated', 'service_role']) as papel`);
    expect(rows).toEqual([
      { papel: "anon", permitido: false }, { papel: "authenticated", permitido: false }, { papel: "service_role", permitido: true },
    ]);
  });

  it("A. reuso normal entre dois avistamentos: run novo, origem apontada, etiquetas próprias com o observado_em do novo, inferidas", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(setembro, FP, [A, B], { sugerido: "Casa", confianca: 72 });

    const claim = await apoio.iniciar(novembro, FP);
    expect(claim).toMatchObject({ ok: true, repetida: false, modo: "reuso", reusada_de: r1.claim.run_id });
    const conclusao = await apoio.concluir(claim, []);
    expect(conclusao).toMatchObject({ ok: true, modo: "reuso", aplicadas: 2, inseridas: 2, snapshot_aplicado: true });

    const run = await apoio.linha("public.imoveis_identificados_classificacoes", claim.run_id as string);
    expect(run.id).not.toBe(r1.claim.run_id);
    expect(run).toMatchObject({ estado: "concluida", modo: "reuso", reusada_de_classificacao_id: r1.claim.run_id, avistamento_id: novembro });
    expect(run.concluida_em).not.toBeNull();
    expect(run.iniciada_em).not.toBeNull();

    const copiadas = await apoio.etiquetas(novembro);
    expect(copiadas.map((e) => e.codigo).sort()).toEqual([A.codigo, B.codigo].sort());
    for (const etiqueta of copiadas) {
      expect(etiqueta).toMatchObject({
        classificacao_id: claim.run_id, avistamento_id: novembro, estado: "inferida", origem: "ia-texto",
        modelo: "gpt-5.6-luna", versao_catalogo: 1, versao_classificador: 1, revisao_observacao: 1,
        confirmada_por: null, confirmada_em: null,
      });
      expect(Date.parse(etiqueta.observado_em as string)).toBe(Date.parse("2026-11-10T12:00:00Z"));
    }
    expect(copiadas.map((e) => e.confianca).sort()).toEqual([85, 90]);
    // A origem fica intacta.
    expect((await apoio.etiquetas(setembro)).map((e) => e.estado)).toEqual(["inferida", "inferida"]);
  });

  it("B/C. rev 1 → rev 2 → volta ao texto da rev 1: reuso de R1 reconstrói A/B para a revisão 3, mesmo com a origem `desatualizada`", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(av, FP, [A, B]);
    await corrigir(av, "Casa fechada.");
    expect((await apoio.etiquetas(av)).map((e) => e.estado)).toEqual(["desatualizada", "desatualizada"]);
    await corrigir(av, TEXTO);
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", av)).observacao_revisao).toBe(3);

    const claim = await apoio.iniciar(av, FP);
    expect(claim).toMatchObject({ ok: true, repetida: false, modo: "reuso", reusada_de: r1.claim.run_id });
    const conclusao = await apoio.concluir(claim, []);
    expect(conclusao).toMatchObject({ ok: true, modo: "reuso", aplicadas: 2, inseridas: 2 });

    const todas = await apoio.etiquetas(av);
    expect(todas).toHaveLength(4);
    const deR1 = todas.filter((e) => e.classificacao_id === r1.claim.run_id);
    const deR3 = todas.filter((e) => e.classificacao_id === claim.run_id);
    // Histórico intacto: as linhas de R1/rev 1 continuam lá, desatualizadas.
    expect(deR1.map((e) => [e.codigo, e.estado, e.revisao_observacao]).sort())
      .toEqual([[A.codigo, "desatualizada", 1], [B.codigo, "desatualizada", 1]].sort());
    expect(deR1.every((e) => e.desatualizada_em !== null)).toBe(true);
    // A/B materializadas de novo, pertencendo a R3 e à revisão 3.
    expect(deR3.map((e) => [e.codigo, e.estado, e.revisao_observacao]).sort())
      .toEqual([[A.codigo, "inferida", 3], [B.codigo, "inferida", 3]].sort());
    for (const e of deR3) expect(Date.parse(e.observado_em as string)).toBe(Date.parse("2026-09-10T12:00:00Z"));
    expect(await apoio.linha("public.imoveis_identificados_avistamentos", av)).toMatchObject({
      classificacao_estado: "concluida", classificacao_id: claim.run_id, fingerprint: FP, observacao_revisao: 3,
    });
    const execucoes = await apoio.execucoes(av);
    expect(execucoes.map((e) => e.observacao_revisao).sort()).toEqual([1, 3]);
  });

  it("D. origem cujas linhas viraram `substituida` ou `contestada` continua reconstruível pelo run: a saída é do classificacao_id", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(setembro, FP, [A, B]);
    // Outra execução (outro fingerprint, mesmo avistamento) substitui B; um humano contesta A.
    const r2 = await apoio.classificar(setembro, "2".repeat(64), [A]);
    const linhas = await apoio.etiquetas(setembro);
    expect(linhas.find((e) => e.codigo === B.codigo)).toMatchObject({ estado: "substituida", substituida_por_classificacao_id: r2.claim.run_id });
    const idA = linhas.find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'contestada')", [idA]);

    // Novembro, mesmo texto ⇒ o fingerprint de R1 ⇒ reuso de R1 (a mais recente concluída com esse fingerprint).
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    const claim = await apoio.iniciar(novembro, FP);
    expect(claim).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
    await apoio.concluir(claim, []);
    const copiadas = await apoio.etiquetas(novembro);
    expect(copiadas.map((e) => [e.codigo, e.estado]).sort()).toEqual([[A.codigo, "inferida"], [B.codigo, "inferida"]].sort());
    // As ações humanas e a supersessão ficaram onde estavam: no avistamento de setembro.
    expect((await apoio.etiquetas(setembro)).map((e) => e.estado).sort()).toEqual(["contestada", "substituida"]);
  });

  it("E/F. a cópia nasce inferida e a confirmação antiga da origem não atravessa", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    await apoio.classificar(setembro, FP, [A, B]);
    const idA = (await apoio.etiquetas(setembro)).find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [idA]);

    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    await apoio.concluir(await apoio.iniciar(novembro, FP), []);
    const copiadas = await apoio.etiquetas(novembro);
    expect(copiadas).toHaveLength(2);
    for (const e of copiadas) expect(e).toMatchObject({ estado: "inferida", confirmada_por: null, confirmada_em: null });
    expect((await apoio.etiquetas(setembro)).find((e) => e.codigo === A.codigo)).toMatchObject({ estado: "confirmada", confirmada_por: USUARIO });
  });

  it("G. confirmada já existente no destino é preservada, não duplicada, e conta em ja_confirmada", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(av, FP, [A, B]);
    const idA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [idA]);
    await corrigir(av, "Casa fechada.");
    // A confirmada sobrevive; B ficou desatualizada; o avistamento acusa o conflito.
    expect((await apoio.linha("public.imoveis_identificados_avistamentos", av)).revisao_conflito_em).not.toBeNull();
    await corrigir(av, TEXTO);

    const claim = await apoio.iniciar(av, FP);
    expect(claim).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
    const conclusao = await apoio.concluir(claim, []);
    expect(conclusao).toMatchObject({ ok: true, ja_confirmada: 1, inseridas: 1, aplicadas: 1 });
    const linhasA = (await apoio.etiquetas(av)).filter((e) => e.codigo === A.codigo);
    expect(linhasA).toHaveLength(1);
    expect(linhasA[0]).toMatchObject({ id: idA, estado: "confirmada", confirmada_por: USUARIO, revisao_observacao: 1 });
    expect((await apoio.etiquetas(av)).filter((e) => e.codigo === B.codigo && e.estado === "inferida"))
      .toHaveLength(1);
  });

  it("H. payload fabricado em modo reuso é ignorado: só a saída da origem entra, e o tipo vem da origem", async () => {
    const pai = await apoio.identidade();
    const setembro = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(setembro, FP, [A], { sugerido: "Casa", confianca: 72 });
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    const claim = await apoio.iniciar(novembro, FP);
    const conclusao = await apoio.concluir(claim, [C, { ...A, confianca: 99 }], { sugerido: "Galpão", confianca: 99 }, { sugeridas: 50, fora_do_catalogo: 9 });
    expect(conclusao).toMatchObject({ aplicadas: 1, inseridas: 1 });
    const copiadas = await apoio.etiquetas(novembro);
    expect(copiadas.map((e) => [e.codigo, e.confianca])).toEqual([[A.codigo, 90]]);
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", claim.run_id as string)).toMatchObject({
      tipo_sugerido: "Casa", tipo_confianca: 72, reusada_de_classificacao_id: r1.claim.run_id,
    });
    // O tipo no snapshot é o da origem, com as regras temporais (novembro é o corrente).
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({
      tipo: "Casa", tipo_confianca: 72, tipo_classificacao_id: claim.run_id, tipo_avistamento_id: novembro,
    });
  });

  it("K/L. outro imóvel e outro usuário não reutilizam, mesmo com o mesmo fingerprint", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    await apoio.classificar(av, FP, [A]);
    const outroImovel = await apoio.identidade();
    expect(await apoio.iniciar(await apoio.avistamento(outroImovel, "2026-10-01T12:00:00Z", TEXTO), FP))
      .toMatchObject({ modo: "modelo", reusada_de: null });
    const deOutro = await apoio.identidade(null, OUTRO_USUARIO);
    const avOutro = await apoio.avistamento(deOutro, "2026-10-01T12:00:00Z", TEXTO, OUTRO_USUARIO);
    expect(await apoio.iniciar(avOutro, FP, { usuario: OUTRO_USUARIO })).toMatchObject({ modo: "modelo", reusada_de: null });
  });

  it("M. snapshot temporal no reuso: avistamento não corrente grava etiquetas e não move o presente", async () => {
    const pai = await apoio.identidade();
    const av1 = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    await apoio.classificar(av1, FP, [A], { sugerido: "Casa", confianca: 72 });
    const av2 = await apoio.avistamento(pai, "2027-01-10T12:00:00Z", "Sobrado com placa.");
    const jan = await apoio.classificar(av2, "2".repeat(64), [], { sugerido: "Sobrado", confianca: 78 });
    // Um terceiro avistamento, RETROATIVO, com o texto de setembro: reuso, mas não corrente.
    const av0 = await apoio.avistamento(pai, "2026-03-01T12:00:00Z", TEXTO);
    const claim = await apoio.iniciar(av0, FP);
    expect(claim.modo).toBe("reuso");
    expect(await apoio.concluir(claim, [])).toMatchObject({ aplicadas: 1, snapshot_aplicado: false, tipo_aplicado: false });
    expect((await apoio.etiquetas(av0)).map((e) => e.codigo)).toEqual([A.codigo]);
    expect(await apoio.linha("public.imoveis_identificados", pai)).toMatchObject({ tipo: "Sobrado", tipo_classificacao_id: jan.claim.run_id, tipo_avistamento_id: av2 });
  });

  it("caso crítico: R1 F1 A/B → R2 F2 A/C (A reafirmada) → F2 de novo: R2 não é reutilizada, cai para o modelo", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(av, "1".repeat(64), [A, B]);
    const r2 = await apoio.classificar(av, "2".repeat(64), [A, C]);
    expect(r2.conclusao).toMatchObject({ inseridas: 1, reafirmadas: 1, aplicadas: 2 });
    // Só C é linha própria de R2: o banco não prova A por R2.
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    const claim = await apoio.iniciar(novembro, "2".repeat(64));
    expect(claim).toMatchObject({ ok: true, modo: "modelo", reusada_de: null });
    expect(await apoio.execucoes(novembro)).toHaveLength(1);
    // O modelo produz de novo a saída completa; nada parcial foi gravado.
    const conclusao = await apoio.concluir(claim, [A, C]);
    expect(conclusao).toMatchObject({ modo: "modelo", aplicadas: 2, inseridas: 2 });
    expect((await apoio.etiquetas(novembro)).map((e) => e.codigo).sort()).toEqual([A.codigo, C.codigo].sort());
    // R1 (F1), por sua vez, segue reconstruível.
    const dezembro = await apoio.avistamento(pai, "2026-12-10T12:00:00Z", TEXTO);
    expect(await apoio.iniciar(dezembro, "1".repeat(64))).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
  });

  it("caso crítico: run cujo resultado tinha código já confirmado (ja_confirmada > 0) não é fonte de reuso", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    await apoio.classificar(av, "1".repeat(64), [A]);
    const idA = (await apoio.etiquetas(av)).find((e) => e.codigo === A.codigo)!.id as number;
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [idA]);
    const r2 = await apoio.classificar(av, "2".repeat(64), [A, C]);
    expect(r2.conclusao).toMatchObject({ ja_confirmada: 1, inseridas: 1 });
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    expect(await apoio.iniciar(novembro, "2".repeat(64))).toMatchObject({ modo: "modelo", reusada_de: null });
  });

  it("candidato anterior seguro: entre concluídas com o mesmo fingerprint, escolhe a mais recente DENTRE AS SEGURAS", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    // R1 (F): A/B inseridas — segura.
    const r1 = await apoio.classificar(av, FP, [A, B]);
    // Em outro avistamento do mesmo imóvel, A/B já vigentes por outro fingerprint (G); depois F reusa R1
    // e só REAFIRMA: R2 (F) fica sem linha própria — a candidata F mais recente é INSEGURA.
    const outro = await apoio.avistamento(pai, "2027-01-10T12:00:00Z", TEXTO);
    await apoio.classificar(outro, "g".repeat(64), [A, B]);
    const r2claim = await apoio.iniciar(outro, FP);
    expect(r2claim).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
    expect(await apoio.concluir(r2claim, [])).toMatchObject({ reafirmadas: 2, inseridas: 0, aplicadas: 2 });
    // Nova busca por F: a mais recente concluída é R2 (insegura); a escolha recua para R1, a mais recente segura.
    const mais = await apoio.avistamento(pai, "2027-02-10T12:00:00Z", TEXTO);
    const r3claim = await apoio.iniciar(mais, FP);
    expect(r3claim).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
    expect(await apoio.concluir(r3claim, [])).toMatchObject({ inseridas: 2, aplicadas: 2 });
    expect((await apoio.etiquetas(mais)).map((e) => e.codigo).sort()).toEqual([A.codigo, B.codigo].sort());
  });

  it("estados posteriores das linhas da fonte não a tornam insegura: só reafirmação e confirmação prévia contam", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const r1 = await apoio.classificar(av, FP, [A, B]);
    const [linhaA, linhaB] = await apoio.etiquetas(av);
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [linhaA.id]);
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'contestada')", [linhaB.id]);
    const novembro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    const claim = await apoio.iniciar(novembro, FP);
    expect(claim).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
    await apoio.concluir(claim, []);
    expect((await apoio.etiquetas(novembro)).map((e) => [e.codigo, e.estado]).sort()).toEqual([[A.codigo, "inferida"], [B.codigo, "inferida"]].sort());
  });

  it("run concluído com saída vazia é reconstruível (vazio fiel): reuso sem modelo e sem etiquetas", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Nada de relevante hoje, só passei.");
    const r1 = await apoio.classificar(av, "0".repeat(64), []);
    const outro = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", "Nada de relevante hoje, só passei.");
    const claim = await apoio.iniciar(outro, "0".repeat(64));
    expect(claim).toMatchObject({ modo: "reuso", reusada_de: r1.claim.run_id });
    expect(await apoio.concluir(claim, [])).toMatchObject({ aplicadas: 0 });
  });

  it("três estados distinguíveis: não processado, processado por IA, resultado reutilizado", async () => {
    const pai = await apoio.identidade();
    const nunca = await apoio.avistamento(pai, "2026-08-01T12:00:00Z", "Outro texto qualquer, sem classificar.");
    const modelo = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", TEXTO);
    const reuso = await apoio.avistamento(pai, "2026-11-10T12:00:00Z", TEXTO);
    await apoio.classificar(modelo, FP, [A]);
    await apoio.concluir(await apoio.iniciar(reuso, FP), []);
    const estado = async (av: string) => {
      const concluidas = (await apoio.execucoes(av)).filter((e) => e.estado === "concluida");
      if (!concluidas.length) return "nao-processado";
      return concluidas[0].modo === "reuso" && concluidas[0].reusada_de_classificacao_id ? "reutilizado" : "modelo";
    };
    expect([await estado(nunca), await estado(modelo), await estado(reuso)]).toEqual(["nao-processado", "modelo", "reutilizado"]);
  });
});

/* ---------------- Módulo de servidor: zero IA, zero ia_uso ---------------- */

const AV = "20000000-0000-4000-8000-000000000001";
const PAI = "30000000-0000-4000-8000-000000000001";

function construtor(resolver: () => { data: unknown; error: null }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "order", "update", "limit"]) c[m] = vi.fn(() => c);
  c.maybeSingle = async () => resolver();
  c.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, erro);
  return c;
}

describe("módulo de servidor em modo reuso", () => {
  it("I/J. não chama o executor, não registra uso e não consulta ia_uso; conclui direto com payload vazio", async () => {
    const rpc = vi.fn<(nome: string, parametros: Record<string, unknown>) => Promise<{ data: unknown; error: null }>>(async (nome) => {
      if (nome === "iniciar_classificacao") return { data: { ok: true, repetida: false, ocupado: false, run_id: "r", lease_token: "l", modo: "reuso", reusada_de: "r1" }, error: null };
      if (nome === "concluir_classificacao") return { data: { ok: true, repetida: false, run_id: "r", modo: "reuso", aplicadas: 2, snapshot_aplicado: true }, error: null };
      throw new Error(nome);
    });
    const tabelasDoServico: string[] = [];
    const chamador = { from: vi.fn((tabela: string) => construtor(() => {
      if (tabela === "imoveis_identificados_avistamentos") return { data: { id: AV, imovel_identificado_id: PAI, observacao: "Casa fechada sem placa.", observacao_revisao: 3, classificacao_estado: "pendente" }, error: null };
      if (tabela === "imoveis_identificados") return { data: { id: PAI, exclusao_solicitada_em: null, tipo: null, tipo_origem: null }, error: null };
      if (tabela === "imoveis_identificados_etiquetas") return { data: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }], error: null };
      if (tabela === "imoveis_identificados_classificacoes") return { data: { tipo_sugerido: "Casa", tipo_confianca: 72 }, error: null };
      throw new Error(tabela);
    })) };
    const servico = { rpc, from: vi.fn((tabela: string) => { tabelasDoServico.push(tabela); return construtor(() => ({ data: null, error: null })); }) };
    const executor = { executar: vi.fn() };
    const deps: DependenciasClassificacao = {
      chamador: chamador as never, servico: servico as never, userId: USUARIO, executor,
      configuracao: { ...CONFIGURACAO_IA_PADRAO, versao: null, criadoEm: null, alteradoPor: null, origem: "padrao" },
      tetoDiario: { maximo: 0, desde: "2026-09-14T03:00:00.000Z" },
    };
    const resposta = await classificarAvistamento(deps, AV);
    expect(resposta).toEqual({
      ok: true, estado: "concluida", modo: "reuso",
      etiquetas: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }],
      tipo: { sugerido: "Casa", confianca: 72 }, snapshotAplicado: true,
    });
    expect(executor.executar).not.toHaveBeenCalled();
    expect(registro.registrarUsoIa).not.toHaveBeenCalled();
    expect(tabelasDoServico).toEqual([]);
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["iniciar_classificacao", "concluir_classificacao"]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_etiquetas: [], p_tipo_sugerido: null, p_tipo_confianca: null });
    const evento = registro.registrarEvento.mock.calls.at(-1)?.[0] as Json;
    expect(evento).toMatchObject({ categoria: "ia", evento: "ia-classificacao-concluida" });
    expect(String(evento.detalhe)).toContain("modo=reuso");
  });
});
