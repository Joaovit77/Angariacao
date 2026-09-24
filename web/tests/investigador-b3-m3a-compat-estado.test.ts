/* ================================================================
   INVESTIGADOR — B3-M3a: escudo de compatibilidade do estado da memória

   Antes da migration do B3-M3 (que passará a aceitar `rejeitada`), a
   leitura desta versão precisa ser fail-closed: aceita só `hipotese` e
   `confirmada`; qualquer outro estado é DESCARTADO, nunca convertido em
   hipótese. Sem isso, uma Production antiga leria `rejeitada` e a
   ressuscitaria como candidata a vigente.

   Contra o schema ATUAL (só as migrations do C13), com o store real
   (`obterMemoriaIdentificado`, `confirmarAtributoIdentificado`) por um
   cliente mínimo que executa como `authenticated`, como o navegador. Os
   estados que o schema atual não aceita são gravados dentro de uma
   transação desfeita, com os CHECKs retirados só ali.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerMemoria } from "@/lib/calculo/leituraMemoria";
import { derivarMemoriaAtual, montarMemoriaIdentidade } from "@/lib/calculo/memoriaIdentidade";
import {
  confirmarAtributoIdentificado,
  obterMemoriaIdentificado,
  type DetalheImovelIdentificado,
} from "@/lib/prospeccao";

const RAIZ = join(import.meta.dirname, "..", "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8").replace(/\r\n/g, "\n");
const USUARIO = "10000000-0000-4000-8000-000000000001";
type Json = Record<string, unknown>;

describe.sequential("B3-M3a — leitura fail-closed do estado da memória (schema atual, store real, PGlite)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create schema private; create schema storage;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${USUARIO}');
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant usage on schema public to authenticated, service_role, anon;
      create function public.set_updated_at() returns trigger language plpgsql
        as $$ begin new.updated_at := now(); return new; end; $$;
      create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
      create table storage.objects (id uuid primary key, bucket_id text, name text);
    `);
    for (const nome of [
      "20260910184310_prospeccao_campo.sql", "20260910190155_prospeccao_campo_rls_grants.sql",
      "20260910193412_prospeccao_campo_triggers.sql", "20260910211045_prospeccao_campo_rpcs_navegador.sql",
      "20260913162604_prospeccao_merge_contrato_transacional.sql", "20260915190000_prospeccao_memoria_identidade.sql",
    ]) await db.exec(ler("supabase/migrations/" + nome));
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  async function como<T extends Json>(papel: string, sub: string | null, sql: string, parametros: unknown[] = []) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
    await db.exec(`set role ${papel}`);
    try {
      return await db.query<T>(sql, parametros);
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }
  /** O navegador: `from().select().eq().order()` e `rpc()` como `authenticated`. */
  const navegador = (() => {
    function consulta(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      const ordens: string[] = [];
      let colunas = "*";
      const executar = async () => {
        const where = filtros.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
        const sql = `select to_jsonb(t) as linha from (select ${colunas} from public.${tabela}${where ? ` where ${where}` : ""}${ordens.length ? ` order by ${ordens.join(", ")}` : ""}) t`;
        try {
          const r = await como<{ linha: Json }>("authenticated", USUARIO, sql, filtros.map(([, v]) => v));
          return { data: r.rows.map((l) => l.linha), error: null };
        } catch (erro) {
          return { data: null, error: erro };
        }
      };
      const construtor = {
        select(c: string) { colunas = c; return construtor; },
        eq(coluna: string, valor: unknown) { filtros.push([coluna, valor]); return construtor; },
        order(coluna: string, opcoes: { ascending: boolean }) { ordens.push(`${coluna} ${opcoes.ascending ? "asc" : "desc"}`); return construtor; },
        then<R>(resolver: (r: { data: Json[] | null; error: unknown }) => R, rejeitar?: (e: unknown) => R) { return executar().then(resolver, rejeitar); },
      };
      return construtor;
    }
    return {
      from: consulta,
      rpc: async (nome: string, parametros: Record<string, unknown>) => {
        const chaves = Object.keys(parametros);
        try {
          const r = await como<{ resultado: Json }>("authenticated", USUARIO,
            `select public.${nome}(${chaves.map((c, i) => `${c} => $${i + 1}`).join(", ")}) as resultado`, Object.values(parametros));
          return { data: r.rows[0].resultado, error: null };
        } catch (erro) {
          return { data: null, error: erro };
        }
      },
    } as never;
  })();

  async function identidade() {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua das Palmeiras')", [id, USUARIO]);
    return id;
  }
  /** Hipóteses pela RPC de servidor, na ordem dada (= ordem do B2). */
  async function investigar(imovel: string, atributos: Json[]) {
    await como("service_role", null,
      "select public.registrar_investigacao_identificado($1, $2, $3, $4, 0, $5::jsonb)",
      [USUARIO, randomUUID(), imovel, atributos.length, JSON.stringify(atributos)]);
  }
  const area = (valor: number, dominio: string) => ({ atributo: "area_m2", valor_num: valor, fonte_url: `https://${dominio}/anuncio`, fonte_dominio: dominio });
  const idDe = async (imovel: string, valor: number) =>
    (await db.query<{ id: number }>("select id from public.imoveis_identificados_atributos where imovel_identificado_id = $1 and valor_num = $2", [imovel, valor])).rows[0].id;
  /** Grava estados que o schema atual não aceita, lê pelo store e desfaz tudo. */
  async function comEstadosForaDoSchema<T>(estados: Record<number, string>, ler: () => Promise<T>): Promise<T> {
    await db.exec("begin");
    try {
      await db.exec(`alter table public.imoveis_identificados_atributos
        drop constraint imoveis_identificados_atributos_estado_check,
        drop constraint imoveis_identificados_atributos_confirmacao_check`);
      for (const [id, estado] of Object.entries(estados)) {
        await db.query("update public.imoveis_identificados_atributos set estado = $1 where id = $2", [estado, Number(id)]);
      }
      return await ler();
    } finally {
      await db.exec("rollback");
    }
  }
  const detalhe = (imovel: string) => ({
    identificado: { id: imovel, tipo: null, tipoDefinidoEm: null, tipoEstado: null, promovidoEm: null },
    avistamentos: [],
  }) as unknown as DetalheImovelIdentificado;
  const identificadoParaLeitura = {
    situacao: "identificado" as const, exclusaoSolicitadaEm: null, ultimaInvestigacaoEm: "2026-09-24T00:00:00Z",
    primeiroAvistamentoEm: null, ultimoAvistamentoEm: null, avistamentosTotal: 0,
  };

  it("contrato: a leitura usa só colunas que o schema atual tem (nada do B3-M3)", async () => {
    expect(ler("web/lib/prospeccao.ts")).not.toMatch(/rejeitado_por|rejeitado_em|rejeitad/);
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test")]);
    await expect(obterMemoriaIdentificado(imovel, navegador)).resolves.toMatchObject({ atributos: [{ valorNum: 85 }] });
  });

  it("A. hipótese continua sendo lida normalmente", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test")]);
    const { atributos } = await obterMemoriaIdentificado(imovel, navegador);
    expect(atributos).toHaveLength(1);
    expect(atributos[0]).toMatchObject({ valorNum: 85, estado: "hipotese", confirmadoPor: null, confirmadoEm: null, fonteDominio: "portal-a.test" });
  });

  it("B. confirmada continua sendo lida normalmente", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test")]);
    await db.query("update public.imoveis_identificados_atributos set estado = 'confirmada', confirmado_por = $1, confirmado_em = now() where imovel_identificado_id = $2", [USUARIO, imovel]);
    const { atributos } = await obterMemoriaIdentificado(imovel, navegador);
    expect(atributos).toHaveLength(1);
    expect(atributos[0]).toMatchObject({ valorNum: 85, estado: "confirmada", confirmadoPor: USUARIO });
    expect(atributos[0].confirmadoEm).toBeTruthy();
  });

  it("C. estado desconhecido (`arquivada`) não vira hipótese: a linha é descartada", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test")]);
    const id = await idDe(imovel, 36);
    const { atributos } = await comEstadosForaDoSchema({ [id]: "arquivada" }, () => obterMemoriaIdentificado(imovel, navegador));
    expect(atributos).toEqual([]);
  });

  it("D. `rejeitada` (que o schema atual ainda não aceita) é ignorada, não vira hipótese", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test")]);
    const id = await idDe(imovel, 36);
    const { atributos } = await comEstadosForaDoSchema({ [id]: "rejeitada" }, () => obterMemoriaIdentificado(imovel, navegador));
    expect(atributos).toEqual([]);
    expect(atributos.some((a) => a.id === id)).toBe(false);
  });

  it("E. hipótese válida + linha rejeitada/desconhecida: o vigente vem só da válida", async () => {
    const imovel = await identidade();
    // A rejeitada entra PRIMEIRO na investigação: se fosse lida como hipótese, o B3-M2 a faria vigente.
    await investigar(imovel, [area(36, "crv.test"), area(304, "vivareal.test"), area(25, "zap.test")]);
    const [id36, id25] = [await idDe(imovel, 36), await idDe(imovel, 25)];
    const { atributos } = await comEstadosForaDoSchema({ [id36]: "rejeitada", [id25]: "arquivada" }, () => obterMemoriaIdentificado(imovel, navegador));
    expect(atributos.map((a) => [a.valorNum, a.estado])).toEqual([[304, "hipotese"]]);
    const [visao] = derivarMemoriaAtual(atributos);
    expect(visao).toMatchObject({ atributo: "area_m2", vigente: { valorNum: 304, estado: "hipotese" }, valoresDistintos: 1, divergente: false });
    expect(visao.historico.map((a) => a.valorNum)).toEqual([304]);
  });

  it("F. todas as linhas com estado desconhecido: nenhuma afirmação ativa, sem crash e sem hipótese inventada", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test"), area(25, "zap.test"), { atributo: "quartos", valor_num: 3, fonte_url: "https://a.test/1", fonte_dominio: "a.test" }]);
    const ids = await Promise.all([36, 25].map((v) => idDe(imovel, v)));
    const idQuartos = (await db.query<{ id: number }>("select id from public.imoveis_identificados_atributos where imovel_identificado_id = $1 and atributo = 'quartos'", [imovel])).rows[0].id;
    const carregada = await comEstadosForaDoSchema(
      { [ids[0]]: "rejeitada", [ids[1]]: "arquivada", [idQuartos]: "" },
      () => obterMemoriaIdentificado(imovel, navegador),
    );
    expect(carregada.atributos).toEqual([]);
    expect(carregada.investigacoes).toHaveLength(1); // o evento da investigação continua
    const memoria = montarMemoriaIdentidade(detalhe(imovel), carregada.investigacoes, carregada.atributos);
    expect(memoria.atributos).toEqual([]);
    expect(memoria.divergentes).toEqual([]);
    const leitura = lerMemoria(memoria, identificadoParaLeitura);
    expect(leitura.fatos).toEqual([]);
    expect(leitura.resumo.texto).toBeNull();
  });

  it("G. confirmar uma hipótese continua funcionando como hoje", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test")]);
    const id = await idDe(imovel, 85);
    expect(await confirmarAtributoIdentificado(id, navegador)).toEqual({ repetida: false });
    expect(await confirmarAtributoIdentificado(id, navegador)).toEqual({ repetida: true });
    const { atributos } = await obterMemoriaIdentificado(imovel, navegador);
    expect(atributos[0]).toMatchObject({ id, estado: "confirmada", confirmadoPor: USUARIO, valorNum: 85 });
    expect(derivarMemoriaAtual(atributos)[0].vigente).toMatchObject({ id, estado: "confirmada" });
  });

  it("H. B3-M2 continua entre as linhas válidas: na mesma investigação vence a primeira válida inserida", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test"), area(95, "portal-b.test")]);
    expect(derivarMemoriaAtual((await obterMemoriaIdentificado(imovel, navegador)).atributos)[0].vigente.valorNum).toBe(85);
    // Com uma linha de estado desconhecido à frente, ela não ocupa o lugar: vence a primeira VÁLIDA.
    const outro = await identidade();
    await investigar(outro, [area(36, "crv.test"), area(85, "portal-a.test"), area(95, "portal-b.test")]);
    const id36 = await idDe(outro, 36);
    const { atributos } = await comEstadosForaDoSchema({ [id36]: "rejeitada" }, () => obterMemoriaIdentificado(outro, navegador));
    const [visao] = derivarMemoriaAtual(atributos);
    expect(visao.vigente).toMatchObject({ valorNum: 85, fonteDominio: "portal-a.test" });
    expect(visao.historico.map((a) => a.valorNum)).toEqual([85, 95]);
  });
});
