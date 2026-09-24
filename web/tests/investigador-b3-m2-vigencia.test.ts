/* ================================================================
   INVESTIGADOR — B3-M2: vigência de hipóteses empatadas no tempo

   A RPC grava todas as afirmações de uma investigação no mesmo instante
   (`observado_em` e `created_at` = now() da transação), em sequência, na
   ordem do B2 (melhor correspondência primeiro). Antes, o desempate era
   `id` desc também dentro da investigação: a ÚLTIMA inserida, a pior,
   virava a vigente. Agora, com instantes empatados, dentro da mesma
   investigação vence a primeira inserida (`id` asc); entre investigações
   diferentes, continua `id` desc.

   Invariantes: confirmação humana acima de hipótese (e a mais recente
   entre confirmações); investigação mais recente acima da anterior;
   histórico append-only e inteiro; `divergente`/`valoresDistintos`
   intactos; nada do score B3.1 chega à memória.

   Resultados da análise real, ponte real (`persistirMemoriaDaInvestigacao`)
   e RPCs reais do C13A num Postgres local (PGlite). Cada caso usa o seu
   próprio imóvel; as chamadas são autocommit (instantes distintos), salvo
   onde o caso exige transação única (instantes empatados).
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extrairCamposInvestigacao,
  ordenarMantidosInvestigacao,
  triarCorrespondenciasInvestigacao,
  type CorrespondenciaInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import {
  derivarMemoriaAtual,
  valorCanonico,
  type AfirmacaoRegistrada,
  type VisaoAtributoMemoria,
} from "@/lib/calculo/memoriaIdentidade";
import { persistirMemoriaDaInvestigacao } from "@/lib/servidor/memoriaIdentidade";

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

/* A consulta não informa área: 85 × 95 não é contradição (ausência é
   neutra), então as duas fontes seguem elegíveis e divergem. */
const CONSULTA = "Rua das Palmeiras, 120, Centro, Londrina, PR, Casa, Residencial Aurora, 3 quartos";
const CONSULTA_SO_ENDERECO = "Rua das Palmeiras, 120, Londrina, Casa";
/** Endereço idêntico + condomínio + características: a melhor fonte. */
const MELHOR = resultadoWeb("https://portal-a.test/anuncio/1", "Casa na Rua das Palmeiras, 120 – Residencial Aurora", "Casa com 85 m², 3 quartos, 2 vagas.");
/** Só condomínio + quartos: `forte`, com outra área. */
const FORTE_PIOR = resultadoWeb("https://portal-b.test/anuncio/2", "Residencial Aurora – casa", "Casa com 95 m², 3 quartos.");
/** Endereço idêntico, menos sinais: `muito-forte`, mas abaixo da melhor. */
const MUITO_FORTE_PIOR = resultadoWeb("https://portal-b.test/anuncio/3", "Casa Rua das Palmeiras 120", "Casa com 95 m².");
/** Par empatado em faixa, sinais e score (só o título decide a ordem B2). */
const EMPATE_A = resultadoWeb("https://portal-a.test/anuncio/4", "Casa na Rua das Palmeiras, 120 – Residencial Aurora", "Casa com 85 m², 3 quartos, 2 vagas. Ref: CA-7781.");
const EMPATE_B = resultadoWeb("https://portal-b.test/anuncio/5", "Casa Rua das Palmeiras 120", "Casa com 95 m², 3 quartos.");

function triar(consulta: string, ...itens: ResultadoWebInvestigacao[]) {
  const triagem = triarCorrespondenciasInvestigacao(consulta, itens);
  const resultados: CorrespondenciaInvestigacao[] = triagem.mantidos.map((c) => ({ ...c, comparavelId: null }));
  return { triagem, resultados };
}

describe.sequential("B3-M2 — vigência com instantes empatados (ponte real + RPC real, PGlite)", () => {
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
    // Memória é append-only: fora a confirmação humana (pela RPC), nenhum
    // UPDATE nem DELETE pode acontecer durante o ensaio.
    await db.exec(`
      create table private.escritas_memoria (op text, estado_antes text, estado_depois text);
      create function private.auditar_memoria() returns trigger language plpgsql as $$
      begin
        insert into private.escritas_memoria values (tg_op, old.estado, case when tg_op = 'UPDATE' then new.estado end);
        return coalesce(new, old);
      end; $$;
      create trigger auditar_memoria after update or delete on public.imoveis_identificados_atributos
        for each row execute function private.auditar_memoria();
    `);
  }, 30_000);
  beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => {
    // Nenhuma escrita além das confirmações humanas dos casos F/G.
    const escritas = (await db.query<Json>("select op, estado_antes, estado_depois from private.escritas_memoria")).rows;
    expect(escritas).toHaveLength(3); // F: 1, G: 2
    expect(escritas.every((e) => e.op === "UPDATE" && e.estado_antes === "hipotese" && e.estado_depois === "confirmada")).toBe(true);
    await db?.close();
  });

  async function identidade() {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua das Palmeiras')", [id, USUARIO]);
    return id;
  }
  const servico = {
    rpc: async (_nome: string, p: Json) => {
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      await db.exec("set role service_role");
      try {
        const r = await db.query<{ resultado: Json }>(
          "select public.registrar_investigacao_identificado($1, $2, $3, $4, $5, $6::jsonb) as resultado",
          [p.p_user_id, p.p_investigacao_id, p.p_imovel_identificado_id, p.p_resultados_total, p.p_recusados_total, JSON.stringify(p.p_atributos)],
        );
        return { data: r.rows[0].resultado, error: null };
      } finally {
        await db.exec("reset role");
      }
    },
  } as never;
  async function investigar(imovel: string, resultados: CorrespondenciaInvestigacao[]) {
    const execucaoId = randomUUID();
    const memoria = await persistirMemoriaDaInvestigacao({ userId: USUARIO, execucaoId, imovelIdentificadoId: imovel, resultados }, { servico });
    expect(memoria.estado).toBe("salva");
    return execucaoId;
  }
  async function confirmar(id: number) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USUARIO]);
    await db.exec("set role authenticated");
    try {
      return (await db.query<{ r: Json }>("select public.confirmar_atributo_identificado($1) as r", [id])).rows[0].r;
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }
  /** Leitura como a do store (`lib/prospeccao.ts`: order observado_em desc, id desc; `mapearAtributoMemoria`). */
  async function registradas(imovel: string): Promise<AfirmacaoRegistrada[]> {
    const r = await db.query<Json>(
      "select * from public.imoveis_identificados_atributos where imovel_identificado_id = $1 order by observado_em desc, id desc",
      [imovel],
    );
    return r.rows.map((l) => ({
      id: Number(l.id), imovelIdentificadoId: String(l.imovel_identificado_id), investigacaoId: String(l.investigacao_id),
      atributo: l.atributo as AfirmacaoRegistrada["atributo"],
      valorTexto: typeof l.valor_texto === "string" ? l.valor_texto : null,
      valorNum: l.valor_num == null ? null : Number(l.valor_num),
      origem: "investigador-web", estado: l.estado as AfirmacaoRegistrada["estado"],
      confianca: l.confianca as AfirmacaoRegistrada["confianca"],
      fonteUrl: String(l.fonte_url), fonteDominio: String(l.fonte_dominio),
      observadoEm: new Date(l.observado_em as string).toISOString(),
      confirmadoPor: (l.confirmado_por as string | null) ?? null,
      confirmadoEm: l.confirmado_em ? new Date(l.confirmado_em as string).toISOString() : null,
      criadoEm: new Date(l.created_at as string).toISOString(),
    }));
  }
  const area = (linhas: AfirmacaoRegistrada[]): VisaoAtributoMemoria =>
    derivarMemoriaAtual(linhas).find((v) => v.atributo === "area_m2")!;
  const embaralhar = <T,>(lista: T[]) => [...lista].reverse();

  /** Pré-condições comuns: mesma investigação, instantes empatados, a melhor fonte inserida primeiro. */
  function empatadasNaMesmaInvestigacao(linhas: AfirmacaoRegistrada[]) {
    const areas = linhas.filter((l) => l.atributo === "area_m2").sort((x, y) => x.id - y.id);
    expect(areas).toHaveLength(2);
    expect(new Set(areas.map((l) => l.investigacaoId)).size).toBe(1);
    expect(new Set(areas.map((l) => l.observadoEm)).size).toBe(1);
    expect(new Set(areas.map((l) => l.criadoEm)).size).toBe(1);
    return areas;
  }

  it("A. muito forte (85) entra primeiro, forte (95) depois, mesma investigação: vigente 85", async () => {
    const imovel = await identidade();
    const { resultados } = triar(CONSULTA, FORTE_PIOR, MELHOR);
    expect(resultados.map((r) => [r.dominio, r.confianca, r.area])).toEqual([["portal-a.test", "muito-forte", 85], ["portal-b.test", "forte", 95]]);
    await investigar(imovel, resultados);
    const linhas = await registradas(imovel);
    const [primeira, segunda] = empatadasNaMesmaInvestigacao(linhas);
    expect([primeira.valorNum, segunda.valorNum]).toEqual([85, 95]);
    expect(area(linhas).vigente).toMatchObject({ id: primeira.id, valorNum: 85, fonteDominio: "portal-a.test", estado: "hipotese" });
    expect(area(embaralhar(linhas)).vigente.id).toBe(primeira.id); // não depende da ordem de leitura
  });

  it("B. dois muito fortes empatados em faixa, sinais e score: vence o que entrou primeiro (A)", async () => {
    const imovel = await identidade();
    const { triagem, resultados } = triar(CONSULTA_SO_ENDERECO, EMPATE_B, EMPATE_A);
    expect(resultados.map((r) => [r.dominio, r.confianca])).toEqual([["portal-a.test", "muito-forte"], ["portal-b.test", "muito-forte"]]);
    const pontos = ordenarMantidosInvestigacao(triagem, resultados).map((x) => x.pontuacao.pontos);
    expect(pontos[0]).toBe(pontos[1]);
    await investigar(imovel, resultados);
    const linhas = await registradas(imovel);
    const [primeira] = empatadasNaMesmaInvestigacao(linhas);
    expect(primeira.fonteDominio).toBe("portal-a.test");
    expect(area(linhas).vigente).toMatchObject({ id: primeira.id, valorNum: 85, fonteDominio: "portal-a.test" });
  });

  it("C. dois muito fortes, A melhor pela ordem B2: vigente A", async () => {
    const imovel = await identidade();
    const { resultados } = triar(CONSULTA, MUITO_FORTE_PIOR, MELHOR);
    expect(resultados.map((r) => [r.dominio, r.confianca, r.evidencias.length > 0])).toEqual([["portal-a.test", "muito-forte", true], ["portal-b.test", "muito-forte", true]]);
    expect(resultados[0].evidencias.length).toBeGreaterThan(resultados[1].evidencias.length);
    await investigar(imovel, resultados);
    const linhas = await registradas(imovel);
    const [primeira] = empatadasNaMesmaInvestigacao(linhas);
    expect(area(linhas).vigente).toMatchObject({ id: primeira.id, valorNum: 85, fonteDominio: "portal-a.test" });
  });

  it("D. investigações em instantes diferentes: a mais recente continua vencendo, mesmo com fonte pior", async () => {
    const imovel = await identidade();
    const antiga = await investigar(imovel, triar(CONSULTA, MELHOR).resultados);
    const nova = await investigar(imovel, triar(CONSULTA, FORTE_PIOR).resultados);
    const linhas = await registradas(imovel);
    const [daAntiga, daNova] = [linhas.find((l) => l.atributo === "area_m2" && l.investigacaoId === antiga)!, linhas.find((l) => l.atributo === "area_m2" && l.investigacaoId === nova)!];
    expect(daNova.observadoEm > daAntiga.observadoEm).toBe(true);
    expect(area(linhas).vigente).toMatchObject({ id: daNova.id, valorNum: 95, investigacaoId: nova });
  });

  it("E. investigações diferentes com instantes empatados: desempate determinístico por id desc", async () => {
    const imovel = await identidade();
    await db.exec("begin");
    let primeira: string, segunda: string;
    try {
      primeira = await investigar(imovel, triar(CONSULTA, MELHOR).resultados);
      segunda = await investigar(imovel, triar(CONSULTA, FORTE_PIOR).resultados);
      await db.exec("commit");
    } catch (erro) {
      await db.exec("rollback");
      throw erro;
    }
    const linhas = await registradas(imovel);
    const areas = linhas.filter((l) => l.atributo === "area_m2");
    expect(new Set(areas.map((l) => l.investigacaoId))).toEqual(new Set([primeira, segunda]));
    expect(new Set(areas.map((l) => l.observadoEm)).size).toBe(1);
    expect(new Set(areas.map((l) => l.criadoEm)).size).toBe(1);
    const maiorId = Math.max(...areas.map((l) => l.id));
    for (const ordem of [linhas, embaralhar(linhas)]) {
      expect(area(ordem).vigente).toMatchObject({ id: maiorId, investigacaoId: segunda, valorNum: 95 });
    }
  });

  it("F. fonte pior confirmada por humano: a confirmada vence a hipótese melhor", async () => {
    const imovel = await identidade();
    await investigar(imovel, triar(CONSULTA, FORTE_PIOR, MELHOR).resultados);
    const [, pior] = empatadasNaMesmaInvestigacao(await registradas(imovel));
    expect(await confirmar(pior.id)).toMatchObject({ ok: true });
    const visao = area(await registradas(imovel));
    expect(visao.vigente).toMatchObject({ id: pior.id, valorNum: 95, estado: "confirmada" });
  });

  it("G. fonte melhor confirmada: vence; entre confirmações, a mais recente continua vencendo", async () => {
    const imovel = await identidade();
    await investigar(imovel, triar(CONSULTA, FORTE_PIOR, MELHOR).resultados);
    const [melhor, pior] = empatadasNaMesmaInvestigacao(await registradas(imovel));
    await confirmar(melhor.id);
    expect(area(await registradas(imovel)).vigente).toMatchObject({ id: melhor.id, valorNum: 85, estado: "confirmada" });
    // Confirmação posterior da outra fonte: a confirmação mais recente vence.
    await confirmar(pior.id);
    const linhas = await registradas(imovel);
    expect(linhas.find((l) => l.id === pior.id)!.confirmadoEm! > linhas.find((l) => l.id === melhor.id)!.confirmadoEm!).toBe(true);
    expect(area(linhas).vigente).toMatchObject({ id: pior.id, valorNum: 95, estado: "confirmada" });
  });

  it("H. `divergente` e `valoresDistintos` continuam sobre todo o histórico", async () => {
    const imovel = await identidade();
    await investigar(imovel, triar(CONSULTA, FORTE_PIOR, MELHOR).resultados);
    await investigar(imovel, triar(CONSULTA, MELHOR).resultados);
    const linhas = await registradas(imovel);
    for (const visao of derivarMemoriaAtual(linhas)) {
      const doAtributo = linhas.filter((l) => l.atributo === visao.atributo);
      const distintos = new Set(doAtributo.map(valorCanonico)).size;
      expect(visao.valoresDistintos).toBe(distintos);
      expect(visao.divergente).toBe(distintos > 1);
    }
    expect(area(linhas)).toMatchObject({ valoresDistintos: 2, divergente: true });
  });

  it("I. todo o histórico continua presente; na mesma investigação, melhor fonte → pior fonte; investigação nova primeiro", async () => {
    const imovel = await identidade();
    const antiga = await investigar(imovel, triar(CONSULTA, FORTE_PIOR, MELHOR).resultados);
    const nova = await investigar(imovel, triar(CONSULTA, FORTE_PIOR, MELHOR).resultados);
    const linhas = await registradas(imovel);
    const visoes = derivarMemoriaAtual(linhas);
    expect(visoes.reduce((n, v) => n + v.historico.length, 0)).toBe(linhas.length);
    const historico = area(linhas).historico.map((l) => [l.investigacaoId, l.fonteDominio, l.valorNum]);
    expect(historico).toEqual([
      [nova, "portal-a.test", 85], [nova, "portal-b.test", 95],
      [antiga, "portal-a.test", 85], [antiga, "portal-b.test", 95],
    ]);
  });

  it("J. a vigência não depende do score/ordem B3.1: vem das linhas gravadas na ordem do B2", async () => {
    const imovel = await identidade();
    const { triagem, resultados } = triar(CONSULTA, FORTE_PIOR, MELHOR);
    await investigar(imovel, resultados); // a rota persiste `resultados` (B2), nunca a cópia exibida
    const linhas = await registradas(imovel);
    const antes = area(linhas).vigente;
    // Qualquer reordenação da exibição (B3.1 ou outra) não toca o que foi gravado nem o derivado.
    const exibidos = ordenarMantidosInvestigacao(triagem, resultados).map((x) => x.correspondencia);
    for (const exibicao of [exibidos, [...exibidos].reverse()]) {
      expect(exibicao.map((c) => c.url).sort()).toEqual(resultados.map((c) => c.url).sort());
      expect(area(await registradas(imovel)).vigente).toEqual(antes);
    }
    expect(antes).toMatchObject({ valorNum: 85, fonteDominio: "portal-a.test" });
    // Contrato estrutural: memória recebe `resultados` (B2); só o cliente recebe `exibidos` (B3.1);
    // a derivação não conhece score nem ordenação do B3.1.
    const rota = ler("web/app/api/investigador-imoveis/route.ts");
    expect(rota).toMatch(/persistirMemoriaDaInvestigacao\(\{ userId, execucaoId, imovelIdentificadoId, resultados \}\)/);
    expect(rota).toMatch(/resultados: exibidos,/);
    const nucleo = ler("web/lib/calculo/memoriaIdentidade.ts");
    expect(nucleo).not.toMatch(/import[^;]*(pontua|ordenarMantidos)|pontuacao\.|\bpontos\b|LD-/);
  });
});
