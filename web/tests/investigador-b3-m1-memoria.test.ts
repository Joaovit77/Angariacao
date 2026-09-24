/* ================================================================
   INVESTIGADOR — B3-M1: higiene de gravação da memória

   Regra: só resultados de faixa muito forte ou forte podem gerar novas
   hipóteses na memória do imóvel (C13B). Possível e indício continuam na
   investigação, na UI, no B2 e no B3.1, mas não gravam atributo.

   O que NÃO muda: `resultados_total` é o que a pesquisa achou (a lista
   inteira chega à ponte e à RPC); ficar de fora por faixa não é recusa
   (`recusados_total` só conta forma, PII e duplicidade); a investigação é
   registrada e `ultima_investigacao_em` anda mesmo com zero atributos; a
   `confianca` factual segue `null`; nada antigo é apagado.

   Os resultados vêm da análise real do Investigador (as faixas não são
   forçadas) e passam pela ponte real (`persistirMemoriaDaInvestigacao`)
   até a RPC real do C13A, num Postgres local (PGlite).
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analisarCorrespondenciasInvestigacao,
  extrairCamposInvestigacao,
  triarCorrespondenciasInvestigacao,
  type CorrespondenciaInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { extrairAfirmacoesDaInvestigacao } from "@/lib/calculo/memoriaIdentidade";
import {
  atributosParaRpc,
  persistirMemoriaDaInvestigacao,
  RPC_REGISTRAR_INVESTIGACAO,
} from "@/lib/servidor/memoriaIdentidade";

const RAIZ = join(import.meta.dirname, "..", "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8").replace(/\r\n/g, "\n");
const USUARIO = "10000000-0000-4000-8000-000000000001";
type Json = Record<string, unknown>;

function resultadoWeb(url: string, titulo: string, descricao: string): ResultadoWebInvestigacao {
  return {
    titulo, url, dominio: new URL(url).hostname.replace(/^www\./, ""), descricao, consultas: ["q"],
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}

const CONSULTA = "Rua das Palmeiras, 120, Centro, Londrina, PR, Casa, Residencial Aurora, 85 m², 3 quartos";
// Domínios distintos: cada anúncio é uma fonte separada (mesmo domínio com
// texto quase idêntico seria, corretamente, fundido pela deduplicação).
const MUITO_FORTE = resultadoWeb("https://portal-mf.test/anuncio/1", "Casa no Residencial Aurora", "Casa com 85 m², 3 quartos, 2 vagas.");
const FORTE = resultadoWeb("https://portal-fo.test/anuncio/2", "Residencial Aurora – casa", "Casa com 3 quartos, 2 vagas.");
const POSSIVEL = resultadoWeb("https://portal-po.test/anuncio/3", "Casa em Londrina Centro", "Casa com 85 m², 3 quartos, 2 vagas.");
const POSSIVEL_2 = resultadoWeb("https://portal-po2.test/anuncio/5", "Casa na Rua das Palmeiras", "Casa com 85 m², 3 quartos, 2 vagas.");
const INDICIO = resultadoWeb("https://portal-in.test/anuncio/4", "Casa na Rua das Palmeiras em Londrina", "3 quartos, 1 vaga.");
const INDICIO_2 = resultadoWeb("https://portal-in2.test/anuncio/6", "Casa no Residencial Aurora", "Condomínio fechado.");
/** Ruído do B2: mesma rua, outro número. */
const IRRELEVANTE = resultadoWeb("https://portal-ir.test/anuncio/7", "Casa na Rua das Palmeiras, 450", "Casa com 200 m², 5 quartos, 4 vagas. Ref: ZZ-9999.");

function analisar(...itens: ResultadoWebInvestigacao[]): CorrespondenciaInvestigacao[] {
  return analisarCorrespondenciasInvestigacao(CONSULTA, itens).map((c) => ({ ...c, comparavelId: null }));
}
function daFonte(resultados: CorrespondenciaInvestigacao[], anuncio: ResultadoWebInvestigacao) {
  const encontrada = resultados.find((item) => item.url === anuncio.url);
  if (!encontrada) throw new Error(`fonte ausente: ${anuncio.url}`);
  return encontrada;
}
const dominioDe = (anuncio: ResultadoWebInvestigacao) => anuncio.dominio;

/* Pré-condição de todo o arquivo: as faixas vêm da análise real. */
describe("B3-M1 — fixtures: as faixas saem da análise real, não são forçadas", () => {
  it("muito forte, forte, possível e indício com dados estruturados válidos", () => {
    const todos = analisar(MUITO_FORTE, FORTE, POSSIVEL, POSSIVEL_2, INDICIO, INDICIO_2);
    expect([MUITO_FORTE, FORTE, POSSIVEL, POSSIVEL_2, INDICIO, INDICIO_2].map((a) => daFonte(todos, a).confianca))
      .toEqual(["muito-forte", "forte", "possivel", "possivel", "indicio", "indicio"]);
    // Os fracos têm, sim, o que gravar: se fossem fortes, virariam afirmação.
    for (const fraco of [POSSIVEL, POSSIVEL_2, INDICIO, INDICIO_2]) {
      const c = daFonte(todos, fraco);
      expect(extrairAfirmacoesDaInvestigacao([{ ...c, confianca: "forte" }]).afirmacoes.length).toBeGreaterThan(0);
    }
  });
});

describe.sequential("B3-M1 — elegibilidade por faixa na ponte real + RPC real (PGlite)", () => {
  const PASTA = "supabase/migrations/";
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
    ]) await db.exec(ler(PASTA + nome));
  }, 30_000);
  beforeEach(async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await db.exec("reset role; truncate public.imoveis_identificados cascade; begin");
  });
  afterEach(async () => {
    await db.exec("rollback; reset role");
    vi.restoreAllMocks();
  });
  afterAll(async () => { await db?.close(); });

  async function identidade() {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua das Palmeiras')", [id, USUARIO]);
    return id;
  }
  /** Cliente de serviço cujo `.rpc` executa a RPC real como service_role. */
  function servicoPGlite() {
    const rpc = vi.fn(async (nome: string, p: Json) => {
      expect(nome).toBe(RPC_REGISTRAR_INVESTIGACAO);
      await db.exec("savepoint rpc");
      try {
        await db.query("select set_config('request.jwt.claim.sub', '', false)");
        await db.exec("set role service_role");
        const r = await db.query<{ resultado: Json }>(
          "select public.registrar_investigacao_identificado($1, $2, $3, $4, $5, $6::jsonb) as resultado",
          [p.p_user_id, p.p_investigacao_id, p.p_imovel_identificado_id, p.p_resultados_total, p.p_recusados_total, JSON.stringify(p.p_atributos)],
        );
        await db.exec("reset role; release savepoint rpc");
        return { data: r.rows[0].resultado, error: null };
      } catch (erro) {
        await db.exec("rollback to savepoint rpc; reset role");
        return { data: null, error: { code: (erro as { code?: string }).code ?? "erro" } };
      }
    });
    return { servico: { rpc } as never, rpc };
  }
  async function persistir(imovel: string, resultados: CorrespondenciaInvestigacao[]) {
    const { servico, rpc } = servicoPGlite();
    const execucaoId = randomUUID();
    const memoria = await persistirMemoriaDaInvestigacao(
      { userId: USUARIO, execucaoId, imovelIdentificadoId: imovel, resultados },
      { servico },
    );
    return { memoria, execucaoId, parametros: rpc.mock.calls[0]?.[1] as Json };
  }
  const linhas = async (tabela: string, imovel: string) =>
    (await db.query<{ l: Json }>(`select to_jsonb(t) as l from public.${tabela} t where imovel_identificado_id = $1 order by id`, [imovel])).rows.map((r) => r.l);
  const evento = async (imovel: string, execucao: string) =>
    (await linhas("imoveis_identificados_investigacoes", imovel)).find((e) => e.id === execucao) as Json;
  const identificado = async (imovel: string) =>
    (await db.query<{ l: Json }>("select to_jsonb(i) as l from public.imoveis_identificados i where id = $1", [imovel])).rows[0].l;
  const dominiosGravados = async (imovel: string) =>
    [...new Set((await linhas("imoveis_identificados_atributos", imovel)).map((a) => a.fonte_dominio))].sort();

  it("A. muito forte: os atributos persistem como hipótese, com fonte", async () => {
    const imovel = await identidade();
    const resultados = analisar(MUITO_FORTE);
    expect(resultados[0].confianca).toBe("muito-forte");
    const { memoria, execucaoId } = await persistir(imovel, resultados);
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 4, atributosRecusados: 0 });
    const atributos = await linhas("imoveis_identificados_atributos", imovel);
    expect(atributos.map((a) => [a.atributo, a.valor_num ?? a.valor_texto])).toEqual([
      ["area_m2", 85], ["quartos", 3], ["vagas", 2], ["condominio", resultados[0].condominio],
    ]);
    expect(atributos.every((a) => a.estado === "hipotese" && a.fonte_dominio === "portal-mf.test")).toBe(true);
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 1, atributos_total: 4, recusados_total: 0 });
  });

  it("B. forte: os atributos persistem como hipótese, com fonte", async () => {
    const imovel = await identidade();
    const resultados = analisar(FORTE);
    expect(resultados[0].confianca).toBe("forte");
    const { memoria, execucaoId } = await persistir(imovel, resultados);
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 2, atributosRecusados: 0 });
    const atributos = await linhas("imoveis_identificados_atributos", imovel);
    expect(atributos.map((a) => [a.atributo, a.valor_num, a.fonte_dominio, a.estado])).toEqual([
      ["quartos", 3, "portal-fo.test", "hipotese"], ["vagas", 2, "portal-fo.test", "hipotese"],
    ]);
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 1, atributos_total: 2, recusados_total: 0 });
  });

  it("C. possível: dados estruturados válidos, zero atributos, investigação registrada, sem contar como recusa", async () => {
    const imovel = await identidade();
    const resultados = analisar(POSSIVEL);
    expect(resultados[0]).toMatchObject({ confianca: "possivel", area: 85, quartos: 3, vagas: 2 });
    const { memoria, execucaoId, parametros } = await persistir(imovel, resultados);
    expect(parametros).toMatchObject({ p_resultados_total: 1, p_recusados_total: 0, p_atributos: [] });
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 0, atributosRecusados: 0 });
    expect(await linhas("imoveis_identificados_atributos", imovel)).toEqual([]);
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 1, atributos_total: 0, recusados_total: 0 });
  });

  it("D. indício: dados estruturados válidos, zero atributos, investigação registrada, sem contar como recusa", async () => {
    const imovel = await identidade();
    const resultados = analisar(INDICIO);
    expect(resultados[0]).toMatchObject({ confianca: "indicio", quartos: 3, vagas: 1 });
    const { memoria, execucaoId, parametros } = await persistir(imovel, resultados);
    expect(parametros).toMatchObject({ p_resultados_total: 1, p_recusados_total: 0, p_atributos: [] });
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 0, atributosRecusados: 0 });
    expect(await linhas("imoveis_identificados_atributos", imovel)).toEqual([]);
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 1, atributos_total: 0, recusados_total: 0 });
  });

  it("E. mistura: `resultados_total` conta todos; só muito forte e forte viram atributo; o log é só de contagens", async () => {
    const imovel = await identidade();
    const resultados = analisar(MUITO_FORTE, FORTE, POSSIVEL, POSSIVEL_2, INDICIO, INDICIO_2);
    expect(resultados).toHaveLength(6);
    const { memoria, execucaoId, parametros } = await persistir(imovel, resultados);
    expect(parametros.p_resultados_total).toBe(6);
    expect(parametros.p_recusados_total).toBe(0);
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 6, atributosRecusados: 0 });
    expect(await dominiosGravados(imovel)).toEqual([dominioDe(FORTE), dominioDe(MUITO_FORTE)].sort());
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 6, atributos_total: 6, recusados_total: 0 });

    // Observabilidade: agregados, sem URL, domínio, endereço, título, trecho ou valor.
    const logs = vi.mocked(console.info).mock.calls;
    const triagem = logs.find(([rotulo]) => rotulo === "[investigador-imoveis] triagem da memória")?.[1] as Json;
    expect(triagem).toEqual({ execucao: execucaoId, resultados: 6, elegiveis: 2, ignoradosPorFaixa: 4, aceitas: 6, descartadas: 0 });
    const registrada = logs.find(([rotulo]) => rotulo === "[investigador-imoveis] memória registrada")?.[1] as Json;
    expect(registrada).toEqual({ ...triagem, estado: "salva", salvos: 6, recusados: 0 });
    expect(JSON.stringify(logs)).not.toMatch(/https?:|portal-|\.test|Palmeiras|Aurora|Londrina|Centro|quartos|vaga|m²/i);
  });

  it("F. nenhum elegível: investigação salva com zero atributos, `ultima_investigacao_em` atualizada, histórico antigo intacto", async () => {
    const imovel = await identidade();
    expect((await identificado(imovel)).ultima_investigacao_em).toBeNull();
    // Hipóteses antigas (de uma investigação elegível anterior) não são tocadas.
    await persistir(imovel, analisar(MUITO_FORTE));
    const antigas = await linhas("imoveis_identificados_atributos", imovel);
    expect(antigas).toHaveLength(4);
    // O ensaio roda numa transação só (now() é fixo nela): recua a marca
    // para provar que é a investigação sem elegíveis que a move. O gatilho
    // da identidade normaliza essa coluna para now(); só este preparo o pula.
    await db.exec("set local session_replication_role = replica");
    await db.query("update public.imoveis_identificados set ultima_investigacao_em = '2020-01-01T00:00:00Z' where id = $1", [imovel]);
    await db.exec("set local session_replication_role = origin");
    expect(new Date((await identificado(imovel)).ultima_investigacao_em as string).getUTCFullYear()).toBe(2020);

    const { memoria, execucaoId } = await persistir(imovel, analisar(POSSIVEL, POSSIVEL_2, INDICIO, INDICIO_2));
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 0, atributosRecusados: 0 });
    const registrada = await evento(imovel, execucaoId);
    expect(registrada).toMatchObject({ resultados_total: 4, atributos_total: 0, recusados_total: 0 });
    const depois = (await identificado(imovel)).ultima_investigacao_em as string;
    expect(new Date(depois).getUTCFullYear()).not.toBe(2020);
    expect(new Date(depois).getTime()).toBe(new Date(registrada.concluida_em as string).getTime());
    expect(await linhas("imoveis_identificados_investigacoes", imovel)).toHaveLength(2);
    expect(await linhas("imoveis_identificados_atributos", imovel)).toEqual(antigas);
  });

  it("G. PII num resultado elegível continua recusada e contada; o resto do mesmo resultado persiste", async () => {
    const imovel = await identidade();
    const [mf] = analisar(MUITO_FORTE);
    const contaminado = { ...mf, condominio: "Residencial Aurora, falar com Maria 43 99999-0000", referencia: "CPF 123.456.789-00" };
    const { memoria, execucaoId, parametros } = await persistir(imovel, [contaminado]);
    expect(parametros.p_recusados_total).toBe(2);
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 3 });
    const atributos = await linhas("imoveis_identificados_atributos", imovel);
    expect(atributos.map((a) => a.atributo)).toEqual(["area_m2", "quartos", "vagas"]);
    expect(JSON.stringify(atributos)).not.toMatch(/Maria|99999|CPF|123\.456/);
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 1, atributos_total: 3, recusados_total: 2 });
  });

  it("H. duplicidade: a mesma afirmação da mesma fonte conta uma vez (recusa); fontes distintas ficam; fraco repetido não vira recusa", async () => {
    const imovel = await identidade();
    const todos = analisar(MUITO_FORTE, FORTE, POSSIVEL);
    const [mf, fo, po] = [daFonte(todos, MUITO_FORTE), daFonte(todos, FORTE), daFonte(todos, POSSIVEL)];
    const { memoria, execucaoId } = await persistir(imovel, [mf, fo, mf, po, po]);
    expect(memoria).toMatchObject({ estado: "salva", atributosSalvos: 6 });
    const quartos = (await linhas("imoveis_identificados_atributos", imovel)).filter((a) => a.atributo === "quartos");
    expect(quartos.map((a) => [a.valor_num, a.fonte_dominio]).sort()).toEqual([[3, "portal-fo.test"], [3, "portal-mf.test"]]);
    // As 4 do `mf` repetido são recusa (duplicidade); os dois `po` não são nem aceitos nem recusados.
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 5, atributos_total: 6, recusados_total: 4 });
  });

  it("I. irrelevante do B2 continua sem chegar à memória", async () => {
    const imovel = await identidade();
    const triagem = triarCorrespondenciasInvestigacao(CONSULTA, [MUITO_FORTE, IRRELEVANTE, POSSIVEL]);
    expect(triagem.mantidos.map((m) => m.url)).toEqual([MUITO_FORTE.url, POSSIVEL.url]);
    const { execucaoId } = await persistir(imovel, triagem.mantidos.map((c) => ({ ...c, comparavelId: null })));
    expect(await dominiosGravados(imovel)).toEqual(["portal-mf.test"]);
    const tudo = JSON.stringify(await linhas("imoveis_identificados_atributos", imovel));
    expect(tudo).not.toMatch(/portal-ir|ZZ-9999|"valor_num":\s*200/);
    expect(await evento(imovel, execucaoId)).toMatchObject({ resultados_total: 2, atributos_total: 4, recusados_total: 0 });
  });

  it("J. confiança factual continua null para muito forte e forte, no payload e no banco", async () => {
    const imovel = await identidade();
    const resultados = analisar(MUITO_FORTE, FORTE, POSSIVEL, INDICIO);
    const { parametros } = await persistir(imovel, resultados);
    const payload = parametros.p_atributos as Json[];
    expect(payload.length).toBeGreaterThan(0);
    expect(payload.every((a) => a.confianca === null)).toBe(true);
    expect(atributosParaRpc(extrairAfirmacoesDaInvestigacao(resultados).afirmacoes).every((a) => a.confianca === null)).toBe(true);
    const atributos = await linhas("imoveis_identificados_atributos", imovel);
    expect(atributos.length).toBe(payload.length);
    expect(atributos.every((a) => a.confianca === null)).toBe(true);
  });
});
