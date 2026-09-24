/* ================================================================
   INVESTIGADOR — B3-M3: marcar uma informação da memória como incorreta

   Terceiro estado, `rejeitada`, decisão humana final como `confirmada`:
   hipótese → confirmada ou rejeitada; nada volta nem troca. A linha fica
   (append-only): valor, fonte, investigação, `observado_em`, `created_at`
   e confiança não mudam. Rejeitada nunca é vigente nem divergência ativa;
   atributo só com rejeitadas sai para `atributosSemVigente`, com o
   histórico inteiro. Confirmada segue soberana; o desempate do B3-M2 segue
   valendo entre as hipóteses válidas; o B3-M1 segue filtrando na gravação.

   Tudo contra o PostgreSQL local (PGlite) com as migrations reais, as RPCs
   reais e o store real (`obterMemoriaIdentificado`, `rejeitarAtributo…`,
   `confirmarAtributo…`) por um cliente mínimo que executa como
   `authenticated` com o `sub` da sessão, como o navegador. Cada caso usa o
   seu imóvel; as chamadas são autocommit (instantes distintos).
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extrairCamposInvestigacao,
  triarCorrespondenciasInvestigacao,
  type CorrespondenciaInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { lerMemoria, type IdentificadoParaLeitura } from "@/lib/calculo/leituraMemoria";
import {
  ESTADOS_CANDIDATOS_VIGENCIA,
  afirmacaoAtiva,
  derivarAtributosSemVigente,
  derivarMemoriaAtual,
  montarMemoriaIdentidade,
  type AfirmacaoRegistrada,
} from "@/lib/calculo/memoriaIdentidade";
import {
  confirmarAtributoIdentificado,
  obterMemoriaIdentificado,
  rejeitarAtributoIdentificado,
  type DetalheImovelIdentificado,
} from "@/lib/prospeccao";
import { persistirMemoriaDaInvestigacao } from "@/lib/servidor/memoriaIdentidade";

const RAIZ = join(import.meta.dirname, "..", "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8").replace(/\r\n/g, "\n");
const USUARIO = "10000000-0000-4000-8000-000000000001";
const OUTRO_USUARIO = "10000000-0000-4000-8000-000000000002";
type Json = Record<string, unknown>;

const MIGRATIONS_C13 = [
  "20260910184310_prospeccao_campo.sql", "20260910190155_prospeccao_campo_rls_grants.sql",
  "20260910193412_prospeccao_campo_triggers.sql", "20260910211045_prospeccao_campo_rpcs_navegador.sql",
  "20260913162604_prospeccao_merge_contrato_transacional.sql", "20260915190000_prospeccao_memoria_identidade.sql",
];
const MIGRATION_B3M3 = "20260924210000_prospeccao_memoria_rejeicao.sql";

async function novoBanco(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema private; create schema storage;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${USUARIO}'), ('${OUTRO_USUARIO}');
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant usage on schema public to authenticated, service_role, anon;
    create function public.set_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at := now(); return new; end; $$;
    create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
    create table storage.objects (id uuid primary key, bucket_id text, name text);
  `);
  for (const nome of MIGRATIONS_C13) await db.exec(ler("supabase/migrations/" + nome));
  return db;
}

function resultadoWeb(url: string, titulo: string, descricao: string): ResultadoWebInvestigacao {
  return {
    titulo, url, dominio: new URL(url).hostname.replace(/^www\./, ""), descricao, consultas: ["q"],
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}
const CONSULTA = "Rua das Palmeiras, 120, Centro, Londrina, PR, Casa, Residencial Aurora, 3 quartos";
const MELHOR = resultadoWeb("https://portal-a.test/anuncio/1", "Casa na Rua das Palmeiras, 120 – Residencial Aurora", "Casa com 85 m², 3 quartos, 2 vagas.");
const SEGUNDA = resultadoWeb("https://portal-b.test/anuncio/2", "Casa Rua das Palmeiras 120", "Casa com 95 m².");
const TERCEIRA = resultadoWeb("https://portal-c.test/anuncio/3", "Residencial Aurora – casa", "Casa com 70 m², 3 quartos.");
const FRACA = resultadoWeb("https://portal-d.test/anuncio/4", "Casa em Londrina Centro", "Casa com 85 m², 3 quartos, 2 vagas.");

describe.sequential("B3-M3 — rejeição humana (RPCs reais, store real, PGlite)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await novoBanco();
    await db.exec(ler("supabase/migrations/" + MIGRATION_B3M3));
  }, 60_000);
  beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });
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
  function clienteDoNavegador(sub: string | null) {
    function consulta(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      const ordens: string[] = [];
      let colunas = "*";
      const executar = async () => {
        const where = filtros.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
        const sql = `select to_jsonb(t) as linha from (select ${colunas} from public.${tabela}${where ? ` where ${where}` : ""}${ordens.length ? ` order by ${ordens.join(", ")}` : ""}) t`;
        try {
          const r = await como<{ linha: Json }>("authenticated", sub, sql, filtros.map(([, v]) => v));
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
          const r = await como<{ resultado: Json }>("authenticated", sub,
            `select public.${nome}(${chaves.map((c, i) => `${c} => $${i + 1}`).join(", ")}) as resultado`, Object.values(parametros));
          return { data: r.rows[0].resultado, error: null };
        } catch (erro) {
          return { data: null, error: erro };
        }
      },
    } as never;
  }
  const navegador = clienteDoNavegador(USUARIO);
  const rpc = (nome: string, id: number, sub: string | null = USUARIO) =>
    como<{ r: Json }>("authenticated", sub, `select public.${nome}($1) as r`, [id]).then((x) => x.rows[0].r);

  async function identidade(usuario = USUARIO) {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua das Palmeiras')", [id, usuario]);
    return id;
  }
  /** Hipóteses do Investigador pela RPC de servidor, na ordem dada (= ordem do B2). */
  async function investigar(imovel: string, atributos: Json[], usuario = USUARIO) {
    const execucao = randomUUID();
    await como("service_role", null,
      "select public.registrar_investigacao_identificado($1, $2, $3, $4, 0, $5::jsonb)",
      [usuario, execucao, imovel, atributos.length, JSON.stringify(atributos)]);
    return execucao;
  }
  const area = (valor: number, dominio: string) => ({ atributo: "area_m2", valor_num: valor, fonte_url: `https://${dominio}/anuncio`, fonte_dominio: dominio });
  const brutas = async (imovel: string) =>
    (await db.query<{ l: Json }>("select to_jsonb(t) as l from public.imoveis_identificados_atributos t where imovel_identificado_id = $1 order by id", [imovel])).rows.map((r) => r.l);
  const idDe = async (imovel: string, valor: number) =>
    (await brutas(imovel)).find((l) => Number(l.valor_num) === valor)!.id as number;
  /** A memória como a tela a monta: store real → núcleo → read model. */
  async function memoriaDe(imovel: string, identificado: Partial<IdentificadoParaLeitura> = {}) {
    const carregada = await obterMemoriaIdentificado(imovel, navegador);
    const detalhe = {
      identificado: { id: imovel, tipo: null, tipoDefinidoEm: null, tipoEstado: null, promovidoEm: null },
      avistamentos: [],
    } as unknown as DetalheImovelIdentificado;
    const memoria = montarMemoriaIdentidade(detalhe, carregada.investigacoes, carregada.atributos);
    const leitura = lerMemoria(memoria, {
      situacao: "identificado", exclusaoSolicitadaEm: null, ultimaInvestigacaoEm: "2026-09-24T00:00:00Z",
      primeiroAvistamentoEm: null, ultimoAvistamentoEm: null, avistamentosTotal: 0, ...identificado,
    });
    return { carregada, memoria, leitura };
  }
  const visaoArea = (m: Awaited<ReturnType<typeof memoriaDe>>) => m.memoria.atributos.find((v) => v.atributo === "area_m2");

  it("A. hipótese → rejeitada: só estado, rejeitado_por e rejeitado_em mudam; confirmação fica nula", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test")]);
    const id = await idDe(imovel, 36);
    expect(await rejeitarAtributoIdentificado(id, navegador)).toEqual({ repetida: false });
    const [linha] = await brutas(imovel);
    expect(linha).toMatchObject({ estado: "rejeitada", rejeitado_por: USUARIO, confirmado_por: null, confirmado_em: null });
    expect(linha.rejeitado_em).toBeTruthy();
  });

  it("B. rejeitar a vigente: a próxima hipótese válida assume", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test"), area(95, "portal-b.test")]);
    expect(visaoArea(await memoriaDe(imovel))!.vigente.valorNum).toBe(85);
    await rejeitarAtributoIdentificado(await idDe(imovel, 85), navegador);
    const depois = visaoArea(await memoriaDe(imovel))!;
    expect(depois.vigente).toMatchObject({ valorNum: 95, estado: "hipotese" });
    expect(depois.historico.map((a) => [a.valorNum, a.estado])).toEqual([[85, "rejeitada"], [95, "hipotese"]]);
  });

  it("C. todas rejeitadas: o atributo sai de `atributos` e vai para `atributosSemVigente`, com o histórico", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test"), area(25, "zap.test"), { atributo: "quartos", valor_num: 3, fonte_url: "https://a.test/1", fonte_dominio: "a.test" }]);
    await rejeitarAtributoIdentificado(await idDe(imovel, 36), navegador);
    await rejeitarAtributoIdentificado(await idDe(imovel, 25), navegador);
    const m = await memoriaDe(imovel);
    expect(m.memoria.atributos.map((v) => v.atributo)).toEqual(["quartos"]);
    expect(m.memoria.atributosSemVigente.map((v) => [v.atributo, v.historico.map((a) => [a.valorNum, a.estado])])).toEqual([
      ["area_m2", [[36, "rejeitada"], [25, "rejeitada"]]],
    ]);
    expect(m.leitura.fatos.map((f) => f.atributo)).toEqual(["quartos"]);
    expect(m.leitura.semVigente.map((f) => [f.atributo, f.incorretas.map((a) => [a.valor, a.rotuloEstado, a.podeConfirmar, a.podeRejeitar])])).toEqual([
      ["area_m2", [["36 m²", "Incorreta", false, false], ["25 m²", "Incorreta", false, false]]],
    ]);
    // `atributos` e `atributosSemVigente` particionam os atributos com histórico, sem sobreposição.
    const linhas = m.carregada.atributos;
    expect(new Set([...derivarMemoriaAtual(linhas), ...derivarAtributosSemVigente(linhas)].map((v) => v.atributo)))
      .toEqual(new Set(linhas.map((a) => a.atributo)));
  });

  it("D. a rejeitada permanece no histórico, na leitura (Marcadas como incorretas) e ganha evento próprio", async () => {
    const imovel = await identidade();
    const inv = await investigar(imovel, [area(304, "vivareal.test"), area(36, "crv.test")]);
    await rejeitarAtributoIdentificado(await idDe(imovel, 36), navegador);
    const m = await memoriaDe(imovel);
    expect(visaoArea(m)!.historico.map((a) => a.valorNum)).toEqual([304, 36]);
    const fato = m.leitura.fatos.find((f) => f.atributo === "area_m2")!;
    expect(fato.incorretas.map((a) => [a.valor, a.estado, a.rotuloEstado, a.fonte.rotulo])).toEqual([["36 m²", "rejeitada", "Incorreta", "crv.test"]]);
    expect(fato.incorretas[0].rejeitadoEmTexto).toBeTruthy();
    const eventos = m.leitura.historico.map((e) => [e.tipo, e.titulo, e.detalhe]);
    expect(eventos).toContainEqual(["rejeicao", "Área marcada como incorreta por você", "36 m² · Fonte: crv.test"]);
    expect(eventos.some(([tipo]) => tipo === "investigacao")).toBe(true); // o evento da investigação continua
    expect(m.memoria.linhaDoTempo.find((e) => e.tipo === "investigacao")!.referencia).toBe(inv);
  });

  it("E. rejeitada não conta para divergência ativa: 304 válida × 36 incorreta → vigente 304, sem divergência", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(304, "vivareal.test"), area(36, "crv.test")]);
    expect(visaoArea(await memoriaDe(imovel))!.divergente).toBe(true);
    await rejeitarAtributoIdentificado(await idDe(imovel, 36), navegador);
    const m = await memoriaDe(imovel);
    expect(visaoArea(m)).toMatchObject({ valoresDistintos: 2, valoresAtivos: 1, divergente: false });
    expect(visaoArea(m)!.vigente.valorNum).toBe(304);
    const fato = m.leitura.fatos.find((f) => f.atributo === "area_m2")!;
    expect([fato.divergente, fato.divergentes, fato.outros]).toEqual([false, [], []]);
    expect(fato.incorretas.map((a) => a.valor)).toEqual(["36 m²"]);
    expect(m.memoria.divergentes).toEqual([]);
    expect(m.leitura.historico.some((e) => e.tipo === "divergencia")).toBe(false);
  });

  it("F. confirmada continua soberana, mesmo com hipóteses mais novas e rejeitadas ao lado", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test"), area(95, "portal-b.test"), area(36, "crv.test")]);
    await confirmarAtributoIdentificado(await idDe(imovel, 95), navegador);
    await rejeitarAtributoIdentificado(await idDe(imovel, 36), navegador);
    await investigar(imovel, [area(120, "novo.test")]); // hipótese mais nova
    const visao = visaoArea(await memoriaDe(imovel))!;
    expect(visao.vigente).toMatchObject({ valorNum: 95, estado: "confirmada" });
    expect(visao).toMatchObject({ valoresAtivos: 3, valoresDistintos: 4, divergente: true });
  });

  it("G. rejeitar uma confirmada devolve `decisao_existente` e não muda nada", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test")]);
    const id = await idDe(imovel, 85);
    await confirmarAtributoIdentificado(id, navegador);
    const antes = await brutas(imovel);
    expect(await rpc("rejeitar_atributo_identificado", id)).toEqual({ ok: false, codigo: "decisao_existente" });
    await expect(rejeitarAtributoIdentificado(id, navegador)).rejects.toMatchObject({ codigo: "decisao_existente" });
    expect(await brutas(imovel)).toEqual(antes);
  });

  it("H. confirmar uma rejeitada devolve `decisao_existente` (sem cair no CHECK) e não muda nada", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test")]);
    const id = await idDe(imovel, 36);
    await rejeitarAtributoIdentificado(id, navegador);
    const antes = await brutas(imovel);
    expect(await rpc("confirmar_atributo_identificado", id)).toEqual({ ok: false, codigo: "decisao_existente" });
    await expect(confirmarAtributoIdentificado(id, navegador)).rejects.toMatchObject({ codigo: "decisao_existente" });
    expect(await brutas(imovel)).toEqual(antes);
    // A confirmação de sempre segue igual para hipótese.
    const outro = await identidade();
    await investigar(outro, [area(85, "portal-a.test")]);
    expect(await rpc("confirmar_atributo_identificado", await idDe(outro, 85))).toMatchObject({ ok: true, repetida: false });
  });

  it("I. outra conta não rejeita nem descobre que a linha existe (mesmo erro de id inexistente)", async () => {
    const alheio = await identidade(OUTRO_USUARIO);
    await investigar(alheio, [area(85, "portal-a.test")], OUTRO_USUARIO);
    const id = await idDe(alheio, 85);
    const antes = await brutas(alheio);
    const deOutro = await rpc("rejeitar_atributo_identificado", id).catch((e) => ({ code: e.code, message: e.message }));
    const inexistente = await rpc("rejeitar_atributo_identificado", 999_999_999).catch((e) => ({ code: e.code, message: e.message }));
    expect(deOutro).toEqual({ code: "P0002", message: "Atributo não encontrado." });
    expect(inexistente).toEqual(deOutro);
    expect(await brutas(alheio)).toEqual(antes);
  });

  it("J. sem sessão não rejeita; anon e service_role não têm execute; só authenticated", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(85, "portal-a.test")]);
    const id = await idDe(imovel, 85);
    await expect(rpc("rejeitar_atributo_identificado", id, null)).rejects.toMatchObject({ code: "42501" });
    await expect(como("anon", null, "select public.rejeitar_atributo_identificado($1)", [id])).rejects.toMatchObject({ code: "42501" });
    await expect(como("service_role", null, "select public.rejeitar_atributo_identificado($1)", [id])).rejects.toMatchObject({ code: "42501" });
    const privilegios = (await db.query<Json>(`select r as papel,
        has_function_privilege(r, 'public.rejeitar_atributo_identificado(bigint)', 'execute') as rejeitar,
        has_function_privilege(r, 'public.confirmar_atributo_identificado(bigint)', 'execute') as confirmar
      from unnest(array['anon', 'authenticated', 'service_role']) r`)).rows;
    expect(privilegios).toEqual([
      { papel: "anon", rejeitar: false, confirmar: false },
      { papel: "authenticated", rejeitar: true, confirmar: true },
      { papel: "service_role", rejeitar: false, confirmar: false },
    ]);
    const definer = (await db.query<Json>(`select proname, prosecdef, proconfig from pg_proc
      where proname in ('rejeitar_atributo_identificado', 'confirmar_atributo_identificado') order by proname`)).rows;
    expect(definer.every((f) => f.prosecdef === true && JSON.stringify(f.proconfig).includes("search_path="))).toBe(true);
    // Nenhuma escrita direta pelo navegador: sem UPDATE para authenticated.
    await expect(como("authenticated", USUARIO, "update public.imoveis_identificados_atributos set estado = 'rejeitada' where id = $1", [id]))
      .rejects.toMatchObject({ code: "42501" });
    expect((await brutas(imovel))[0].estado).toBe("hipotese");
  });

  it("K. rejeitar de novo é idempotente e mantém o instante original", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test")]);
    const id = await idDe(imovel, 36);
    const primeira = await rpc("rejeitar_atributo_identificado", id);
    const antes = await brutas(imovel);
    const segunda = await rpc("rejeitar_atributo_identificado", id);
    expect(primeira).toMatchObject({ ok: true, repetida: false, atributo_id: id });
    expect(segunda).toMatchObject({ ok: true, repetida: true, atributo_id: id });
    expect(new Date(segunda.rejeitado_em as string).getTime()).toBe(new Date(antes[0].rejeitado_em as string).getTime());
    expect(await rejeitarAtributoIdentificado(id, navegador)).toEqual({ repetida: true });
    expect(await brutas(imovel)).toEqual(antes);
  });

  it("L. valor, fonte, domínio, investigação, observado_em, created_at e confiança ficam idênticos", async () => {
    const imovel = await identidade();
    await investigar(imovel, [{ atributo: "condominio", valor_texto: "residencial ou comercial para ...Read more", fonte_url: "https://chaves.test/x", fonte_dominio: "chaves.test" }]);
    const [antes] = await brutas(imovel);
    await rejeitarAtributoIdentificado(antes.id as number, navegador);
    const [depois] = await brutas(imovel);
    const semDecisao = ({ estado, rejeitado_por, rejeitado_em, ...resto }: Json) => { void estado; void rejeitado_por; void rejeitado_em; return resto; };
    expect(semDecisao(depois)).toEqual(semDecisao(antes));
    expect([antes.estado, depois.estado]).toEqual(["hipotese", "rejeitada"]);
  });

  describe("com a análise real e a ponte real do Investigador", () => {
    const servico = {
      rpc: async (_nome: string, p: Json) => {
        const r = await como<{ resultado: Json }>("service_role", null,
          "select public.registrar_investigacao_identificado($1, $2, $3, $4, $5, $6::jsonb) as resultado",
          [p.p_user_id, p.p_investigacao_id, p.p_imovel_identificado_id, p.p_resultados_total, p.p_recusados_total, JSON.stringify(p.p_atributos)]);
        return { data: r.rows[0].resultado, error: null };
      },
    } as never;
    const triar = (...itens: ResultadoWebInvestigacao[]): CorrespondenciaInvestigacao[] =>
      triarCorrespondenciasInvestigacao(CONSULTA, itens).mantidos.map((c) => ({ ...c, comparavelId: null }));
    async function persistir(imovel: string, resultados: CorrespondenciaInvestigacao[]) {
      const execucaoId = randomUUID();
      await persistirMemoriaDaInvestigacao({ userId: USUARIO, execucaoId, imovelIdentificadoId: imovel, resultados }, { servico });
      return execucaoId;
    }

    it("M. B3-M2 entre as hipóteses válidas: rejeitada a melhor, assume a SEGUNDA da ordem B2, não a última", async () => {
      const imovel = await identidade();
      const resultados = triar(TERCEIRA, SEGUNDA, MELHOR);
      expect(resultados.map((r) => [r.dominio, r.confianca, r.area])).toEqual([
        ["portal-a.test", "muito-forte", 85], ["portal-b.test", "muito-forte", 95], ["portal-c.test", "forte", 70],
      ]);
      await persistir(imovel, resultados);
      expect(visaoArea(await memoriaDe(imovel))!.vigente).toMatchObject({ valorNum: 85, fonteDominio: "portal-a.test" });
      await rejeitarAtributoIdentificado(await idDe(imovel, 85), navegador);
      expect(visaoArea(await memoriaDe(imovel))!.vigente).toMatchObject({ valorNum: 95, fonteDominio: "portal-b.test" });
    });

    it("N. B3-M1 intacto: faixa fraca não grava; rejeitar não mexe nos totais da investigação", async () => {
      const imovel = await identidade();
      const resultados = triar(FRACA, MELHOR);
      const fraca = resultados.find((r) => r.dominio === "portal-d.test")!;
      expect(["possivel", "indicio"]).toContain(fraca.confianca);
      const inv = await persistir(imovel, resultados);
      const linhas = await brutas(imovel);
      expect(new Set(linhas.map((l) => l.fonte_dominio))).toEqual(new Set(["portal-a.test"]));
      expect(linhas.every((l) => l.confianca === null)).toBe(true);
      const totais = async () => (await db.query<Json>("select resultados_total, atributos_total, recusados_total from public.imoveis_identificados_investigacoes where id = $1", [inv])).rows[0];
      const antes = await totais();
      expect(antes).toEqual({ resultados_total: 2, atributos_total: linhas.length, recusados_total: 0 });
      await rejeitarAtributoIdentificado(linhas[0].id as number, navegador);
      expect(await totais()).toEqual(antes);
    });
  });

  it("O. estado desconhecido nunca vira hipótese: o store descarta a linha", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test"), area(85, "portal-a.test")]);
    const id36 = await idDe(imovel, 36);
    // Só dentro de uma transação desfeita: tira os CHECKs e grava um estado que não existe.
    await db.exec("begin");
    try {
      await db.exec(`alter table public.imoveis_identificados_atributos
        drop constraint imoveis_identificados_atributos_estado_check,
        drop constraint imoveis_identificados_atributos_decisao_check`);
      await db.query("update public.imoveis_identificados_atributos set estado = 'arquivada' where id = $1", [id36]);
      const m = await memoriaDe(imovel);
      expect(m.carregada.atributos.map((a) => [a.valorNum, a.estado])).toEqual([[85, "hipotese"]]);
      expect(m.carregada.atributos.some((a) => a.id === id36)).toBe(false);
      expect(visaoArea(m)).toMatchObject({ vigente: { valorNum: 85 }, divergente: false });
    } finally {
      await db.exec("rollback");
    }
    expect((await brutas(imovel)).find((l) => l.id === id36)!.estado).toBe("hipotese");
    // Allowlist do núcleo: só confirmada e hipótese são candidatas (e contexto futuro).
    expect([...ESTADOS_CANDIDATOS_VIGENCIA]).toEqual(["confirmada", "hipotese"]);
    expect(afirmacaoAtiva({ estado: "rejeitada" })).toBe(false);
    expect(afirmacaoAtiva({ estado: "arquivada" } as unknown as AfirmacaoRegistrada)).toBe(false);
  });

  it("P. fusão preserva a rejeição: mesma linha, mesmo id, mesma decisão, novo pai", async () => {
    const sobrevivente = await identidade();
    const absorvido = await identidade();
    await investigar(absorvido, [area(36, "crv.test")]);
    const id = await idDe(absorvido, 36);
    await rejeitarAtributoIdentificado(id, navegador);
    const [antes] = await brutas(absorvido);
    expect((await como<{ r: Json }>("authenticated", USUARIO, "select public.fundir_imoveis_identificados($1, $2) as r", [sobrevivente, absorvido])).rows[0].r).toMatchObject({ ok: true });
    expect(await brutas(absorvido)).toEqual([]);
    const [depois] = await brutas(sobrevivente);
    expect(depois).toEqual({ ...antes, imovel_identificado_id: sobrevivente });
    expect((await memoriaDe(sobrevivente)).memoria.atributosSemVigente.map((v) => v.atributo)).toEqual(["area_m2"]);
  });

  it("Q. exclusão: pendente recusa a decisão; o registro apagado leva a rejeitada junto (cascata)", async () => {
    const imovel = await identidade();
    await investigar(imovel, [area(36, "crv.test"), area(85, "portal-a.test")]);
    const id36 = await idDe(imovel, 36);
    const id85 = await idDe(imovel, 85);
    await rejeitarAtributoIdentificado(id36, navegador);
    await db.query("update public.imoveis_identificados set exclusao_solicitada_em = now() where id = $1", [imovel]);
    expect(await rpc("rejeitar_atributo_identificado", id85)).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
    expect(await rpc("confirmar_atributo_identificado", id85)).toEqual({ ok: false, codigo: "exclusao_em_andamento" });
    expect((await memoriaDe(imovel, { exclusaoSolicitadaEm: "2026-09-24T00:00:00Z" })).leitura.fatos[0].vigente)
      .toMatchObject({ podeConfirmar: false, podeRejeitar: false });
    await db.query("delete from public.imoveis_identificados where id = $1", [imovel]);
    expect(await brutas(imovel)).toEqual([]);
    expect((await db.query<Json>("select count(*)::int as n from public.imoveis_identificados_atributos where id = any($1)", [[id36, id85]])).rows[0]).toEqual({ n: 0 });
  });

  it("R. CHECK recusa combinações inválidas de estado e decisão", async () => {
    const imovel = await identidade();
    const inv = await investigar(imovel, []);
    const inserir = (colunas: string, valores: string) => db.query(
      `insert into public.imoveis_identificados_atributos (user_id, imovel_identificado_id, investigacao_id, atributo, valor_num, fonte_url, fonte_dominio, observado_em, ${colunas})
       values ($1, $2, $3, 'area_m2', 1, 'https://x.test/1', 'x.test', now(), ${valores})`, [USUARIO, imovel, inv],
    ).then(() => "ok", (e) => e.code);
    const U = `'${USUARIO}'`;
    expect(await inserir("estado", "'arquivada'")).toBe("23514");
    expect(await inserir("estado", "'rejeitada'")).toBe("23514"); // sem autor/instante
    expect(await inserir("estado, rejeitado_por", `'rejeitada', ${U}`)).toBe("23514"); // sem instante
    expect(await inserir("estado, rejeitado_por, rejeitado_em, confirmado_por, confirmado_em", `'rejeitada', ${U}, now(), ${U}, now()`)).toBe("23514");
    expect(await inserir("estado, rejeitado_por, rejeitado_em", `'hipotese', ${U}, now()`)).toBe("23514");
    expect(await inserir("estado, confirmado_por, confirmado_em, rejeitado_por, rejeitado_em", `'confirmada', ${U}, now(), ${U}, now()`)).toBe("23514");
    expect(await inserir("estado, confirmado_por, confirmado_em", `'rejeitada', ${U}, now()`)).toBe("23514");
    // As três formas válidas passam.
    expect(await inserir("estado", "'hipotese'")).toBe("ok");
    expect(await inserir("estado, confirmado_por, confirmado_em", `'confirmada', ${U}, now()`)).toBe("ok");
    expect(await inserir("estado, rejeitado_por, rejeitado_em", `'rejeitada', ${U}, now()`)).toBe("ok");
  });
});

describe.sequential("B3-M3 — migration aditiva sobre dados existentes e FK do autor", () => {
  it("linhas antigas (hipótese e confirmada) atravessam a migration sem reclassificação nem backfill", { timeout: 60_000 }, async () => {
    const db = await novoBanco();
    try {
      const imovel = randomUUID();
      const inv = randomUUID();
      await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua')", [imovel, USUARIO]);
      await db.query("insert into public.imoveis_identificados_investigacoes (id, user_id, imovel_identificado_id) values ($1, $2, $3)", [inv, USUARIO, imovel]);
      await db.query(`insert into public.imoveis_identificados_atributos
        (user_id, imovel_identificado_id, investigacao_id, atributo, valor_num, estado, confirmado_por, confirmado_em, fonte_url, fonte_dominio, observado_em)
        values ($1, $2, $3, 'area_m2', 85, 'hipotese', null, null, 'https://a.test/1', 'a.test', now()),
               ($1, $2, $3, 'quartos', 3, 'confirmada', $1, now(), 'https://a.test/1', 'a.test', now())`, [USUARIO, imovel, inv]);
      const antes = (await db.query<Json>("select to_jsonb(t) as l from public.imoveis_identificados_atributos t order by id")).rows;
      await db.exec(ler("supabase/migrations/" + MIGRATION_B3M3));
      const depois = (await db.query<{ l: Json }>("select to_jsonb(t) as l from public.imoveis_identificados_atributos t order by id")).rows;
      expect(depois.map((r) => r.l)).toEqual(antes.map((r) => ({ ...(r.l as Json), rejeitado_por: null, rejeitado_em: null })));
    } finally {
      await db.close();
    }
  });

  it("FK de `rejeitado_por` (NO ACTION): excluir a conta dona leva as linhas; excluir um autor que não é o dono é recusado", { timeout: 60_000 }, async () => {
    const db = await novoBanco();
    try {
      await db.exec(ler("supabase/migrations/" + MIGRATION_B3M3));
      const regra = (await db.query<{ confdeltype: string }>(`select confdeltype from pg_constraint
        where conrelid = 'public.imoveis_identificados_atributos'::regclass and contype = 'f'
          and conkey = array[(select attnum from pg_attribute where attrelid = 'public.imoveis_identificados_atributos'::regclass and attname = 'rejeitado_por')]`)).rows;
      expect(regra).toEqual([{ confdeltype: "a" }]); // a = NO ACTION
      async function rejeitadaDe(dono: string, autor: string) {
        const imovel = randomUUID(); const inv = randomUUID();
        await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua')", [imovel, dono]);
        await db.query("insert into public.imoveis_identificados_investigacoes (id, user_id, imovel_identificado_id) values ($1, $2, $3)", [inv, dono, imovel]);
        await db.query(`insert into public.imoveis_identificados_atributos
          (user_id, imovel_identificado_id, investigacao_id, atributo, valor_num, estado, rejeitado_por, rejeitado_em, fonte_url, fonte_dominio, observado_em)
          values ($1, $2, $3, 'area_m2', 36, 'rejeitada', $4, now(), 'https://x.test/1', 'x.test', now())`, [dono, imovel, inv, autor]);
      }
      // Autor ≠ dono (impossível pela RPC; simulado direto): excluir o autor é recusado e a linha fica.
      await rejeitadaDe(USUARIO, OUTRO_USUARIO);
      await expect(db.query("delete from auth.users where id = $1", [OUTRO_USUARIO])).rejects.toMatchObject({ code: "23503" });
      expect((await db.query<Json>("select count(*)::int as n from public.imoveis_identificados_atributos where rejeitado_por = $1", [OUTRO_USUARIO])).rows[0]).toEqual({ n: 1 });
      // Autor = dono (o caso real): excluir a conta funciona e leva as linhas pela cascata de user_id.
      await rejeitadaDe(OUTRO_USUARIO, OUTRO_USUARIO);
      await db.query("delete from public.imoveis_identificados_atributos where user_id = $1 and rejeitado_por = $2", [USUARIO, OUTRO_USUARIO]);
      await db.query("delete from auth.users where id = $1", [OUTRO_USUARIO]);
      expect((await db.query<Json>("select count(*)::int as n from public.imoveis_identificados_atributos where user_id = $1", [OUTRO_USUARIO])).rows[0]).toEqual({ n: 0 });
    } finally {
      await db.close();
    }
  });
});
