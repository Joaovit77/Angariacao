import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: () => ({ get: async () => null, set: async () => {} }) }));
import { buscarColetaPaginadaRadar } from "@/lib/servidor/paginacaoRadar";
import { criarOrcamentoRadar } from "@/lib/servidor/orcamentoRadar";
import { paginaRadar } from "./fixtures/paginacaoRadar";
import { filtrosPopulacaoChaves, paginasPopulacaoChaves } from "./fixtures/populacaoChavesRadar";
import { persistirColetaRadar, filtrosGlobaisRadar, qualificarOfertaRadar } from "@/lib/servidor/ingestaoRadar";
import { avaliarCoberturaRadar, type AquisicaoPortalRadar } from "@/lib/servidor/coberturaRadar";
import { urlUniversoRadar } from "@/lib/servidor/universoRadar";
import { chaveBairroRadar } from "@/lib/calculo/bairroUniversoRadar";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";

const raiz = new URL("../../", import.meta.url);
const ler = (nome: string) => readFileSync(new URL(nome, raiz), "utf8").replace(/\r\n/g, "\n");
const A = "20261014111445_radar_r6_1_fundacao_global_ofertas.sql";
const B = "20261014130154_radar_r6_1_b_invariantes_globais.sql";
const C = "20261021120000_radar_baseline_cobertura_novos.sql";
const schema = ler("supabase-schema.sql");
let db: PGlite;
let contador = 0;
type Dados = Record<string, unknown>;
const usuarioA = "11111111-1111-4111-8111-111111111111";
const usuarioB = "22222222-2222-4222-8222-222222222222";
const contexto = { portal: "chaves-na-mao", finalidade: "locacao", uf: "PR", cidade: "londrina", tipo_recorte: "casa", versao_semantica: 2 };
const filtros = { portal: "chaves-na-mao", finalidade: "locacao", estado: "PR", cidade: "Londrina", tipoRecorte: "casa" };
async function tentar<T>(acao: () => Promise<T>): Promise<T> {
  const nome = `tentativa_${++contador}`;
  await db.exec(`savepoint ${nome}`);
  try { return await acao(); }
  catch (erro) { await db.exec(`rollback to savepoint ${nome}`); throw erro; }
  finally { await db.exec(`release savepoint ${nome}`); }
}
const consultar = (sql: string, valores: unknown[] = []) => tentar(() => db.query<Dados>(sql, valores));
async function busca(user = usuarioA, extras: Dados = {}) {
  return String((await consultar("insert into radar_buscas(user_id,nome,filtros) values($1,'Busca isolada',$2) returning id", [user, { ...filtros, ...extras }])).rows[0].id);
}
function anuncio(id = "100001", extras: Dados = {}) {
  return { idExterno: id, portal: "chaves-na-mao", finalidade: "locacao", tipo: "casa", tipoDeclarado: "casa",
    cidade: "Londrina", estado: "PR", bairro: "Centro", preco: 1200, titulo: "Casa em Londrina", anunciante: "incerto",
    url: `https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-${id}/`, ...extras };
}
async function aquisicao(anuncios: Dados[], extras: Dados = {}) {
  const em = (await consultar("select clock_timestamp()::text as em")).rows[0].em;
  return { id: randomUUID(), em, origem: "fixture_local", confiavel: true, cobertura: "completa", total: anuncios.length,
    evidencia: "itemlist_total_integral_v1", contagem_bruta: anuncios.length, paginas_lidas: 1, paginas_planejadas: 1, ...extras };
}
async function coletar(id: string, anuncios: Dados[], opcoes: { user?: string; contexto?: Dados; origem?: string; aquisicao?: Dados } = {}) {
  const origem = opcoes.aquisicao ?? await aquisicao(anuncios);
  return (await consultar("select registrar_coleta_radar($1,$2,$3,$4,$5,$6) as resultado",
    [opcoes.user ?? usuarioA, id, opcoes.contexto ?? contexto, origem, anuncios, opcoes.origem ?? "manual"])).rows[0].resultado as Dados;
}
async function papel<T>(role: string, acao: () => Promise<T>, user = usuarioA) {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  await db.exec(`set local role ${role}`);
  try { return await acao(); } finally { await db.exec("reset role"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;`);
  const legado = schema.slice(schema.indexOf("create table if not exists radar_buscas ("), schema.indexOf("create table if not exists central_anuncios_visualizados ("));
  await db.exec(legado);
  await db.exec(`create table central_anuncios_visualizados(user_id uuid,portal text,id_externo text,primary key(user_id,portal,id_externo));
    alter table central_anuncios_visualizados enable row level security;
    create policy propria on central_anuncios_visualizados for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);`);
  for (const nome of [A, B, C, "20261022180000_radar_chaves_populacao_qualificada.sql"]) await db.exec(ler("supabase/migrations/" + nome));
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into auth.users values($1),($2)", [usuarioA, usuarioB]);
});
afterEach(async () => { await db.exec("rollback; reset role"); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await db?.close(); });

describe("Radar — contrato de produto A–I no banco isolado", () => {
  it("A: primeira coleta válida forma baseline e gera zero Novos", async () => {
    const id = await busca();
    expect(await coletar(id, [anuncio()])).toMatchObject({ novos: 0, baselineFormada: true, cobertura: "completa" });
    expect((await consultar("select baseline_varredura_id is not null as formada from radar_universos")).rows).toEqual([{ formada: true }]);
    expect((await consultar("select visto,novidade_varredura_id from radar_anuncios")).rows).toEqual([{ visto: false, novidade_varredura_id: null }]);
  });
  it("B: segunda coleta igual gera zero Novos", async () => {
    const id = await busca(); await coletar(id, [anuncio()]);
    expect(await coletar(id, [anuncio()])).toMatchObject({ novos: 0, baselineFormada: false });
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{ n: 1 }]);
  });
  it("C: um ID nativo inédito em coleta válida gera exatamente um Novo", async () => {
    const id = await busca(); await coletar(id, [anuncio()]);
    expect(await coletar(id, [anuncio(), anuncio("100002")])).toMatchObject({ novos: 1 });
    const pendentes = await papel("authenticated", () => consultar("select * from candidatos_pendentes_radar()"));
    expect(pendentes.rows.map((r) => r.id_externo)).toEqual(["100002"]);
  });
  it.each(["parcial", "desconhecida", "truncada"])("D: %s não forma baseline nem Novo", async (cobertura) => {
    const id = await busca();
    await coletar(id, [anuncio()], { aquisicao: await aquisicao([anuncio()], { cobertura }) });
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{ baseline_varredura_id: null }]);
    await coletar(id, [anuncio()]);
    const a = [anuncio(), anuncio("100002")];
    expect(await coletar(id, a, { aquisicao: await aquisicao(a, { cobertura }) })).toMatchObject({ novos: 0 });
    // A identidade conhecida na parcial nunca é promovida retroativamente.
    expect(await coletar(id, a)).toMatchObject({ novos: 0 });
  });
  it("E: reordenação e repetição entre páginas não duplicam anúncio nem Novo", async () => {
    const id = await busca(); await coletar(id, [anuncio(), anuncio("100002")]);
    const a = [anuncio("100002"), anuncio(), anuncio("100002")];
    expect(await coletar(id, a, { aquisicao: await aquisicao(a, { total: 2, contagem_bruta: 2 }) })).toMatchObject({ novos: 0 });
    expect((await consultar("select count(*)::int as n from radar_anuncios")).rows).toEqual([{ n: 2 }]);
  });
  it("F: last_seen avança, first_seen permanece e reaparecimento conserva histórico", async () => {
    const id = await busca(); await coletar(id, [anuncio()]);
    const primeiro = (await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais")).rows[0].em;
    await coletar(id, [anuncio("100002")]); await coletar(id, [anuncio()]);
    const atual = (await consultar("select primeiro_visto_em::text as em,ultimo_visto_em>primeiro_visto_em as avancou from radar_anuncios_globais where id_externo='100001'")).rows[0];
    expect(atual).toEqual({ em: primeiro, avancou: true });
  });
  it("G: usuário novo recebe Base não revisada, nunca a baseline inteira como Novo", async () => {
    const id = await busca(); await coletar(id, [anuncio()]);
    const nova = await busca(usuarioB);
    expect(await coletar(nova, [anuncio(), anuncio("100002")], { user: usuarioB })).toMatchObject({ novos: 0 });
    expect((await consultar("select novidade_varredura_id from radar_anuncios where user_id=$1", [usuarioB])).rows).toEqual([
      { novidade_varredura_id: null }, { novidade_varredura_id: null },
    ]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where user_id=$1 and novidade_varredura_id is not null", [usuarioA])).rows).toEqual([{ n: 1 }]);
  });
  it("H: Casa/Apartamento e Locação/Venda preservam contextos e identidades", async () => {
    for (const [tipo, finalidade, n] of [["casa","locacao","100001"],["apartamento","locacao","100002"],["casa","venda","100001"]]) {
      const id = await busca(usuarioA, { tipoRecorte: tipo, finalidade });
      const a = anuncio(n, { tipo, tipoDeclarado: tipo, finalidade });
      expect(await coletar(id, [a], { contexto: { ...contexto, tipo_recorte: tipo, finalidade } })).toMatchObject({ novos: 0 });
    }
    expect((await consultar("select count(*)::int as n from radar_universos")).rows).toEqual([{ n: 3 }]);
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{ n: 3 }]);
  });
  it("I: visto e visualização são privados; cliente não forja novidade nem consulta global", async () => {
    const id = await busca(), outro = await busca(usuarioB);
    await coletar(id, [anuncio()]); await coletar(id, [anuncio(), anuncio("100002")]);
    await papel("authenticated", async () => {
      expect((await consultar("select distinct user_id from radar_anuncios")).rows).toEqual([{ user_id: usuarioA }]);
      await consultar("update radar_anuncios set visto=true");
      await expect(consultar("update radar_anuncios set dados='{}'::jsonb")).rejects.toThrow(/reservad/);
      await expect(consultar("update radar_buscas set comparacao_desde_em=now() where id=$1", [id])).rejects.toThrow(/reservad/);
      await expect(consultar("select * from radar_anuncios_globais")).rejects.toThrow();
      await expect(coletar(outro, [anuncio()], { user: usuarioB })).rejects.toThrow();
      await consultar("insert into central_anuncios_visualizados values($1,'chaves-na-mao','100002')", [usuarioA]);
    });
    expect((await papel("authenticated", () => consultar("select * from candidatos_pendentes_radar()"), usuarioB)).rows).toHaveLength(1);
    expect((await consultar("select bool_and(not visto) as privado from radar_anuncios where user_id=$1", [usuarioB])).rows).toEqual([{ privado: true }]);
  });
});

describe("Radar — atomicidade, proveniência e segurança", () => {
  it("migration possui espelho exato e não altera A/B", () => {
    const bloco = schema.split("-- BEGIN RADAR BASELINE COBERTURA NOVOS\n")[1].split("-- END RADAR BASELINE COBERTURA NOVOS")[0];
    expect(bloco.trim()).toBe(ler("supabase/migrations/" + C).trim());
  });
  it("retry da mesma aquisição é idempotente e não renotifica", async () => {
    const id = await busca(); await coletar(id, [anuncio()]);
    const a = [anuncio(), anuncio("100002")], origem = await aquisicao(a);
    expect(await coletar(id, a, { aquisicao: origem })).toMatchObject({ novos: 1 });
    expect(await coletar(id, a, { aquisicao: origem, origem: "cron" })).toMatchObject({ novos: 0, anuncios: [] });
    expect((await consultar("select count(*)::int as n from radar_varreduras")).rows).toEqual([{ n: 2 }]);
    await expect(coletar(id, [anuncio()], { aquisicao: origem })).rejects.toThrow(/divergente/);
  });
  it("cache mantém aquisição original; assinatura posterior recebe base no replay", async () => {
    const id = await busca(), a = [anuncio()], origem = await aquisicao(a);
    await coletar(id, a, { aquisicao: origem });
    const outro = await busca(usuarioB);
    expect(await coletar(outro, a, { user: usuarioB, aquisicao: origem })).toMatchObject({ novos: 0 });
    expect((await consultar("select count(*)::int as n from radar_varreduras")).rows).toEqual([{ n: 1 }]);
  });
  it("falha na segunda identidade desfaz a rodada inteira, inclusive a primeira oferta", async () => {
    const id = await busca();
    await expect(coletar(id, [anuncio(), anuncio("chaves-na-mao-1-posicao")])).rejects.toThrow(/qualificada/);
    for (const tabela of ["radar_universos","radar_varreduras","radar_anuncios_globais","radar_presencas","radar_anuncios"]) {
      expect((await consultar(`select count(*)::int as n from ${tabela}`)).rows).toEqual([{ n: 0 }]);
    }
  });
  it("replay distribui o snapshot do recorte original após observação global em outro recorte", async () => {
    const casa = await busca(), listaCasa = [anuncio()], origem = await aquisicao(listaCasa);
    await coletar(casa, listaCasa, { aquisicao: origem });
    const apartamento = await busca(usuarioB, { tipoRecorte: "apartamento" });
    await coletar(apartamento, [anuncio("100001", { tipo: "apartamento", tipoDeclarado: "apartamento" })], {
      user: usuarioB, contexto: { ...contexto, tipo_recorte: "apartamento" },
    });
    const novaCasa = await busca(usuarioB);
    expect(await coletar(novaCasa, listaCasa, { user: usuarioB, aquisicao: origem })).toMatchObject({ novos: 0 });
    expect((await consultar("select dados->>'tipoDeclarado' as tipo from radar_anuncios where busca_id=$1", [novaCasa])).rows).toEqual([{ tipo: "casa" }]);
    expect((await consultar("select dados_objetivos->>'tipoDeclarado' as tipo from radar_anuncios_globais")).rows).toEqual([{ tipo: "apartamento" }]);
  });
  it("visualização de Locação não oculta a oferta de Venda com mesmo ID nativo", async () => {
    const locacao = await busca(), venda = await busca(usuarioA, { finalidade: "venda" });
    await coletar(locacao, [anuncio()]);
    await coletar(venda, [anuncio("100002", { finalidade: "venda" })], { contexto: { ...contexto, finalidade: "venda" } });
    await coletar(venda, [anuncio("100001", { finalidade: "venda" })], { contexto: { ...contexto, finalidade: "venda" } });
    await papel("authenticated", async () => {
      await consultar("insert into central_anuncios_visualizados values($1,'chaves-na-mao','100001')", [usuarioA]);
      await consultar("update radar_anuncios set visto=true where busca_id=$1", [locacao]);
      expect((await consultar("select id_externo from candidatos_pendentes_radar()")).rows).toEqual([{ id_externo: "100001" }]);
    });
  });
  it("falha durante a distribuição desfaz também a baseline e a ingestão global", async () => {
    const id = await busca();
    await db.exec(`create function public.falhar_distribuicao_local() returns trigger language plpgsql as $$ begin raise exception 'falha isolada na distribuição'; end; $$;
      create trigger falha_local before insert on radar_anuncios for each row execute function public.falhar_distribuicao_local();`);
    await expect(coletar(id, [anuncio()])).rejects.toThrow("falha isolada");
    for (const tabela of ["radar_universos","radar_varreduras","radar_anuncios_globais","radar_presencas","radar_anuncios"]) {
      expect((await consultar(`select count(*)::int as n from ${tabela}`)).rows).toEqual([{ n: 0 }]);
    }
  });
  it("o oráculo de regressão detecta um mutante que libera Novo na coleta parcial", async () => {
    const id = await busca(); await coletar(id, [anuncio()]);
    const exigirZero = (resultado: Dados) => expect(resultado.novos).toBe(0);
    const parcial = [anuncio(), anuncio("100002")];
    exigirZero(await coletar(id, parcial, { aquisicao: await aquisicao(parcial, { cobertura: "parcial" }) }));
    const sql = ler("supabase/migrations/" + C);
    const inicio = sql.indexOf("create function public.registrar_coleta_radar(");
    const fim = sql.indexOf("\n$$;", inicio) + 4;
    const mutante = sql.slice(inicio,fim).replace("create function", "create or replace function")
      .replace("payload:=jsonb_build_object", "valida:=true;\n  payload:=jsonb_build_object");
    await db.exec(mutante);
    const novos = [anuncio(), anuncio("100003")];
    const quebrado = await coletar(id, novos, { aquisicao: await aquisicao(novos, { cobertura: "parcial" }) });
    expect(() => exigirZero(quebrado)).toThrow();
  });
  it("service role exige dono correto e assinatura compatível", async () => {
    const id = await busca();
    await papel("service_role", async () => {
      await expect(coletar(id, [anuncio()], { user: usuarioB })).rejects.toThrow(/incompatível/);
      await expect(coletar(id, [anuncio()], { contexto: { ...contexto, tipo_recorte: "apartamento" } })).rejects.toThrow(/incompatível/);
      expect(await coletar(id, [anuncio()])).toMatchObject({ novos: 0 });
    });
  });
  it("filtros privados distribuem o mesmo global somente às buscas elegíveis", async () => {
    const id = await busca(), caro = await busca(usuarioB, { valorMin: 2000 });
    await coletar(id, [anuncio()]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1", [caro])).rows).toEqual([{ n: 0 }]);
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{ n: 1 }]);
  });
});


/** Contrato local completo: evidência HTML -> qualificação -> gate -> RPC real -> distribuição. */
describe("Radar — ponte servidora com banco isolado", () => {
  const filtro: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" };
  const cliente = { rpc: async (nome: string, p: Record<string, unknown>) => {
    expect(nome).toBe("registrar_coleta_radar");
    const r = await consultar("select registrar_coleta_radar($1,$2,$3,$4,$5,$6,$7) as resultado",
      [p.p_user_id,p.p_busca_id,p.p_contexto,p.p_aquisicao,p.p_anuncios,p.p_origem,p.p_anuncios_base ?? []]);
    return { data: r.rows[0].resultado, error: null };
  } } as unknown as SupabaseClient;
  async function rodada(id: string, ids: string[], opcoes: { total?: number; user?: string; filtros?: FiltrosCentralAngariacao; confiavel?: boolean; anuncios?: AnuncioCentralAngariacao[] } = {}) {
    const f = opcoes.filtros ?? filtro;
    const anuncios = opcoes.anuncios ?? ids.map((n) => anuncio(n)) as unknown as AnuncioCentralAngariacao[];
    const origem = await aquisicao(anuncios as unknown as Dados[]);
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "RealEstateListing", url: urlDaPesquisa(f),
      offers: { "@type": "ItemList", numberOfItems: opcoes.total ?? ids.length, itemListElement: anuncios.map((a) => ({ "@type": "Offer", url: a.url })) } })}</script>`;
    const aquisicaoPortal: AquisicaoPortalRadar = { id: String(origem.id), em: String(origem.em), html, origem: "http_direto", confiavel: opcoes.confiavel ?? true };
    return persistirColetaRadar(cliente, { id, user_id: opcoes.user ?? usuarioA }, f, anuncios, aquisicaoPortal, "manual");
  }
  async function paginada(id: string, quantidade: number, limite = 10, user = usuarioA) {
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-local-sem-api-real");
    const ids = Array.from({length:quantidade},(_,i)=>String(200000+i));
    const fetchLocal = vi.fn(async (destino: string, init?: RequestInit) => {
      expect(destino).toBe("https://api.firecrawl.dev/v2/scrape");
      const pagina = Number(new URL(JSON.parse(String(init?.body)).url).searchParams.get("pg") || 1);
      const html = paginaRadar(filtro,pagina,ids.slice((pagina-1)*50,pagina*50),quantidade,pagina*50<quantidade);
      return new Response(JSON.stringify({success:true,data:{rawHtml:html,metadata:{statusCode:200,sourceURL:JSON.parse(String(init?.body)).url,url:JSON.parse(String(init?.body)).url}}}));
    });
    vi.stubGlobal("fetch",fetchLocal);
    const coleta = await buscarColetaPaginadaRadar(filtro,{restanteMs:()=>300000,
      orcamento:criarOrcamentoRadar({maxPaginas:limite,maxChamadasPagas:10})});
    const resultado = await persistirColetaRadar(cliente,{id,user_id:user},filtro,coleta.anuncios,coleta.aquisicao,"manual");
    return {resultado,coleta,fetchLocal};
  }
  it("I/J: 45 raw/33 qualificados certificam baseline zero; repetição zero e inédita um Novo, preservando Sobrado e extras", async () => {
    const f=filtrosPopulacaoChaves,id=await busca(usuarioA,{bairro:f.bairro});
    async function executar(adicional=false, parcial=false) {
      const htmls=paginasPopulacaoChaves(33,0,false,adicional);
      vi.stubEnv("FIRECRAWL_API_KEY","fixture-local");
      vi.stubGlobal("fetch",vi.fn(async(_destino:string,init?:RequestInit)=>{
        const url=JSON.parse(String(init?.body)).url,p=Number(new URL(url).searchParams.get("pg")||1);
        return Response.json({success:true,data:{rawHtml:htmls[p-1],metadata:{statusCode:200,url,sourceURL:url}}});
      }));
      const c=await buscarColetaPaginadaRadar(f,{restanteMs:()=>120000,orcamento:criarOrcamentoRadar({maxPaginas:parcial?2:10,maxChamadasPagas:10})});
      if (!parcial) expect(c.resumo.populacao).toEqual({raw_count:45+(adicional?1:0),qualified_count:33+(adicional?1:0),out_of_scope_count:12,indeterminate_count:0,declared_total:33+(adicional?1:0)});
      return persistirColetaRadar(cliente,{id,user_id:usuarioA},f,c.anuncios,c.aquisicao,"manual");
    }
    expect(await executar(false,true)).toMatchObject({baselineFormada:false,novos:0,cobertura:"parcial"});
    const antiga=(await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='47187345'")).rows[0].em;
    expect(await executar()).toMatchObject({baselineFormada:true,novos:0,cobertura:"completa"});
    expect((await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='47187345'")).rows).toEqual([{em:antiga}]);
    expect((await consultar("select status from radar_varreduras order by iniciada_em limit 1")).rows).toEqual([{status:"partial"}]);
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{n:45}]);
    expect((await consultar("select count(*)::int as n from radar_anuncios")).rows).toEqual([{n:33}]);
    expect((await consultar("select dados_objetivos->>'tipoDeclarado' as tipo from radar_anuncios_globais where id_externo='45735542'")).rows).toEqual([{tipo:"Sobrado"}]);
    const primeira=(await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='45735542'")).rows[0].em;
    await consultar("update radar_anuncios set visto=true where id_externo='45735542'");
    expect(await executar()).toMatchObject({novos:0,cobertura:"completa"});
    const outra=await busca(usuarioB,{bairro:f.bairro});
    expect(await executar(true)).toMatchObject({novos:1,cobertura:"completa"});
    expect((await consultar("select id_externo from radar_anuncios where novidade_varredura_id is not null")).rows).toEqual([{id_externo:"990001"}]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1 and novidade_varredura_id is not null",[outra])).rows).toEqual([{n:0}]);
    expect((await consultar("select primeiro_visto_em::text as em,ultimo_visto_em>primeiro_visto_em as avancou from radar_anuncios_globais where id_externo='45735542'")).rows).toEqual([{em:primeira,avancou:true}]);
    expect((await consultar("select visto from radar_anuncios where busca_id=$1 and id_externo='45735542'",[id])).rows).toEqual([{visto:true}]);
  });
  it.each(["qualified_count","raw_count","ids_qualificados","ids_fora","indeterminado","bairro_ausente","id_omitido","proxima"])("SQL não certifica população adulterada: %s",async(falha)=>{
    const f=filtrosPopulacaoChaves,id=await busca(usuarioA,{bairro:f.bairro}),htmls=paginasPopulacaoChaves();
    vi.stubEnv("FIRECRAWL_API_KEY","fixture-local");
    vi.stubGlobal("fetch",vi.fn(async(_u:string,init?:RequestInit)=>{const url=JSON.parse(String(init?.body)).url,p=Number(new URL(url).searchParams.get("pg")||1);return Response.json({success:true,data:{rawHtml:htmls[p-1],metadata:{statusCode:200,url,sourceURL:url}}});}));
    const c=await buscarColetaPaginadaRadar(f,{restanteMs:()=>120000});
    let parametros: Record<string,unknown>={};
    await persistirColetaRadar({rpc:async(_n:string,p:Record<string,unknown>)=>{parametros=structuredClone(p);return {data:{novos:0},error:null};}} as unknown as SupabaseClient,{id,user_id:usuarioA},f,c.anuncios,c.aquisicao,"manual");
    const a=parametros.p_aquisicao as {populacao:Record<string,number>;paginas:Array<Record<string,unknown>>},ultima=a.paginas[2];
    if(falha==="qualified_count")a.populacao.qualified_count=34;
    if(falha==="raw_count")a.populacao.raw_count=44;
    if(falha==="ids_qualificados")ultima.ids_qualificados=[];
    if(falha==="ids_fora")ultima.ids_fora_universo=[];
    if(falha==="indeterminado")ultima.ids_indeterminados=["45735542"];
    if(falha==="bairro_ausente")(parametros.p_anuncios as Array<Record<string,unknown>>).find(x=>x.idExterno==="44062904")!.bairro=null;
    if(falha==="id_omitido")ultima.ids=(ultima.ids as string[]).slice(1);
    if(falha==="proxima")ultima.proxima=true;
    const r=await cliente.rpc("registrar_coleta_radar",parametros as never);
    expect(r.data).toMatchObject({novos:0,baselineFormada:false,cobertura:"parcial"});
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{baseline_varredura_id:null}]);
  });
  it("paginação A–I: transporte → 60 ofertas → baseline → repetição → um Novo e base privada do novo usuário", async () => {
    const id = await busca();
    expect((await paginada(id,60)).resultado).toMatchObject({novos:0,baselineFormada:true,cobertura:"completa"});
    const primeira = (await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='200000'")).rows[0].em;
    expect((await paginada(id,60)).resultado.novos).toBe(0);
    const outro = await busca(usuarioB);
    expect((await paginada(id,61)).resultado.novos).toBe(1);
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1 and novidade_varredura_id is null",[outro])).rows).toEqual([{n:61}]);
    expect((await consultar("select primeiro_visto_em::text as em,ultimo_visto_em>primeiro_visto_em as avancou from radar_anuncios_globais where id_externo='200000'")).rows).toEqual([{em:primeira,avancou:true}]);
    expect((await consultar("select paginas_lidas,paginas_planejadas,contagem_admitida,status from radar_varreduras order by iniciada_em desc limit 1")).rows)
      .toEqual([{paginas_lidas:2,paginas_planejadas:2,contagem_admitida:61,status:"success"}]);
  });
  it("Chaves documental na base: parcial 30/33 → P3 → baseline zero → repetição zero → um Novo, com patrocinado repetido", async () => {
    const id = await busca();
    let quantidade = 33;
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-local-sem-api-real");
    vi.stubGlobal("fetch", vi.fn(async (destino: string, init?: RequestInit) => {
      expect(destino).toBe("https://api.firecrawl.dev/v2/scrape");
      const url = JSON.parse(String(init?.body)).url;
      const pagina = Number(new URL(url).searchParams.get("pg") || 1);
      const ids = Array.from({ length: quantidade }, (_, i) => String(290000 + i));
      const nesta = ids.slice((pagina - 1) * 15, pagina * 15);
      if (pagina === 2) nesta.unshift(ids[0]);
      const html = paginaRadar(filtro, pagina, nesta, quantidade, pagina === 1)
        .replace(`"url":"${url}"`, `"url":"${urlDaPesquisa(filtro)}"`);
      return Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: 200, sourceURL: url, url } } });
    }));
    async function executar(limite = 10) {
      const c = await buscarColetaPaginadaRadar(filtro, { restanteMs: () => 300_000,
        orcamento: criarOrcamentoRadar({ maxPaginas: limite, maxChamadasPagas: 10 }) });
      return persistirColetaRadar(cliente, { id, user_id: usuarioA }, filtro, c.anuncios, c.aquisicao, "manual");
    }
    expect(await executar(2)).toMatchObject({ baselineFormada: false, novos: 0, cobertura: "parcial" });
    expect((await consultar("select count(*)::int as n from radar_anuncios where novidade_varredura_id is null")).rows).toEqual([{ n: 30 }]);
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{ baseline_varredura_id: null }]);
    const first = (await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='290000'")).rows[0].em;
    expect(await executar()).toMatchObject({ baselineFormada: true, novos: 0, cobertura: "completa" });
    expect(await executar()).toMatchObject({ baselineFormada: false, novos: 0, cobertura: "completa" });
    quantidade = 34;
    expect(await executar()).toMatchObject({ baselineFormada: false, novos: 1, cobertura: "completa" });
    expect((await consultar("select primeiro_visto_em::text as em,ultimo_visto_em>primeiro_visto_em as avancou from radar_anuncios_globais where id_externo='290000'")).rows).toEqual([{ em: first, avancou: true }]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where novidade_varredura_id is not null")).rows).toEqual([{ n: 1 }]);
    const payload = (await consultar("select payload_coleta from radar_varreduras order by iniciada_em desc limit 1")).rows[0].payload_coleta as Dados;
    const origem = payload.aquisicao as Dados | undefined;
    // A prova persistida preserva o aviso e os IDs observados sem relaxar o validador SQL.
    expect(JSON.stringify(origem ?? payload)).toContain("portal_document_url_not_pagination_aware");
  });
  it("página em cache não oculta um Novo observado na outra página após a baseline", async () => {
    const id=await busca(); const inicial=await paginada(id,60);
    const paginaAntiga=inicial.coleta.aquisicao!.paginas![0];
    const primeira=(await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='200000'")).rows[0].em;
    const ids=Array.from({length:60},(_,i)=>String(i===59?200060:200000+i));
    const html=paginaRadar(filtro,2,ids.slice(50),60,false);
    const em=String((await consultar("select clock_timestamp()::text as em")).rows[0].em);
    const aquisicao: AquisicaoPortalRadar={id:randomUUID(),em:paginaAntiga.em,origem:"firecrawl",html:"",confiavel:true,
      paginasLidas:2,motivoTermino:"fim_comprovado",paginas:[paginaAntiga,
        {id:randomUUID(),em,origem:"firecrawl",html,confiavel:true,url:urlDaPesquisa(filtro)+"?pg=2",
          transporte:{urlSolicitada:urlDaPesquisa(filtro)+"?pg=2",urlEfetiva:urlDaPesquisa(filtro)+"?pg=2",statusHttp:200,statusPortalHttp:200,redirecionada:false}}]};
    const anuncios=ids.map((n)=>anuncio(n)) as unknown as AnuncioCentralAngariacao[];
    expect(await persistirColetaRadar(cliente,{id,user_id:usuarioA},filtro,anuncios,aquisicao,"manual"))
      .toMatchObject({novos:1,cobertura:"completa"});
    expect((await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais where id_externo='200000'")).rows).toEqual([{em:primeira}]);
    expect((await consultar("select primeiro_visto_em=$1::timestamptz as propria_pagina from radar_anuncios_globais where id_externo='200060'",[em])).rows)
      .toEqual([{propria_pagina:true}]);
  });
  it("atingir o teto antes do fim não forma baseline nem Novo no SQL real", async () => {
    const id=await busca();
    const {resultado,coleta}=await paginada(id,60,1);
    expect(coleta.resumo.motivoTermino).toBe("limite_paginas");
    expect(resultado).toMatchObject({novos:0,baselineFormada:false,cobertura:"parcial"});
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{baseline_varredura_id:null}]);
    expect((await consultar("select status,paginas_lidas,paginas_planejadas from radar_varreduras")).rows)
      .toEqual([{status:"partial",paginas_lidas:1,paginas_planejadas:2}]);
    expect((await paginada(id,60)).resultado).toMatchObject({novos:0,baselineFormada:true});
  });
  it("baseline existente continua fechando Novo quando a rodada paginada é parcial", async () => {
    const id=await busca(); await paginada(id,1);
    expect((await paginada(id,60,1)).resultado).toMatchObject({novos:0,cobertura:"parcial"});
    expect((await consultar("select count(*)::int as n from radar_anuncios where novidade_varredura_id is not null")).rows).toEqual([{n:0}]);
  });
  it.each(["motivo","sequencia","proxima","total","ids","contagem","contagem_ausente"])("SQL recusa certificação multipágina adulterada: %s", async (falha) => {
    const id=await busca(); await coletar(id,[anuncio()]);
    const anuncios=[anuncio(),anuncio("100002")];
    const origem: Dados=await aquisicao(anuncios,{evidencia:"itemlist_paginado_integral_v1",paginas_lidas:2,paginas_planejadas:2,motivo_termino:"fim_comprovado"});
    origem.paginas=anuncios.map((a,i)=>({numero:i+1,total:2,ids:[a.idExterno],proxima:i===0,aquisicao_id:randomUUID(),em:origem.em,confiavel:true}));
    const paginas=origem.paginas as Dados[];
    if(falha==="motivo") origem.motivo_termino="limite_paginas";
    if(falha==="sequencia") paginas[1].numero=3;
    if(falha==="proxima") paginas[1].proxima=true;
    if(falha==="total") paginas[1].total=3;
    if(falha==="ids") paginas[1].ids=["100001"];
    if(falha==="contagem") origem.paginas_planejadas=3;
    if(falha==="contagem_ausente") delete origem.paginas_lidas;
    expect(await coletar(id,anuncios,{aquisicao:origem})).toMatchObject({novos:0,cobertura:"parcial"});
  });
  it("coleta parcial mantém a oferta consultável com link direto e sem certificação", async () => {
    const id=await busca(); const r=await rodada(id,["100001"],{total:20});
    expect(r).toMatchObject({novos:0,baselineFormada:false,cobertura:"parcial",anuncios:[]});
    expect(r.anunciosColetados).toHaveLength(1);
    const linhas=await papel("authenticated",()=>consultar("select url,cobertura_coleta,novidade_varredura_id from radar_anuncios where busca_id=$1",[id]));
    expect(linhas.rows).toEqual([{url:anuncio().url,cobertura_coleta:"parcial",novidade_varredura_id:null}]);
  });
  it("HTML sem proveniência mantém consulta privada sem ingestão global ou vazamento", async () => {
    const id=await busca(); await busca(usuarioB);
    const r=await rodada(id,["100001"],{confiavel:false});
    expect(r).toMatchObject({novos:0,baselineFormada:false,anuncios:[]}); expect(r.anunciosColetados).toHaveLength(1);
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{n:0}]);
    expect((await papel("authenticated",()=>consultar("select url,anuncio_global_id,cobertura_coleta from radar_anuncios"))).rows)
      .toEqual([{url:anuncio().url,anuncio_global_id:null,cobertura_coleta:"desconhecida"}]);
    expect((await papel("authenticated",()=>consultar("select * from radar_anuncios"),usuarioB)).rows).toEqual([]);
  });
  it("fallback posicional continua acessível somente na base privada", async () => {
    const id=await busca(); const a={...anuncio(),idExterno:"chaves-na-mao-1-posicao"} as unknown as AnuncioCentralAngariacao;
    const r=await rodada(id,[a.idExterno],{anuncios:[a]});
    expect(r.novos).toBe(0); expect(r.anunciosColetados).toHaveLength(1);
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{n:0}]);
    expect((await consultar("select url,anuncio_global_id from radar_anuncios")).rows).toEqual([{url:anuncio().url,anuncio_global_id:null}]);
  });
  it("cliente não pode falsificar cobertura da cópia privada", async () => {
    const id=await busca(); await rodada(id,["100001"],{total:20});
    await papel("authenticated",async()=>{
      await expect(consultar("update radar_anuncios set cobertura_coleta='completa'")).rejects.toThrow(/reservad/);
      await consultar("update radar_anuncios set visto=true");
    });
    expect((await consultar("select visto,cobertura_coleta from radar_anuncios")).rows).toEqual([{visto:true,cobertura_coleta:"parcial"}]);
  });
  it("falha ao gravar observação só privada desfaz também a ingestão global", async () => {
    const id=await busca();
    await db.exec(`create function public.falhar_base_local() returns trigger language plpgsql as $$ begin if new.anuncio_global_id is null then raise exception 'falha privada isolada'; end if; return new; end; $$;
      create trigger falha_base_local before insert on radar_anuncios for each row execute function public.falhar_base_local();`);
    const a=[anuncio(),{...anuncio("100002"),idExterno:"chaves-na-mao-2-posicao"}] as unknown as AnuncioCentralAngariacao[];
    await expect(rodada(id,["100001","100002"],{anuncios:a})).rejects.toThrow("falha privada isolada");
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{n:0}]);
    expect((await consultar("select count(*)::int as n from radar_anuncios")).rows).toEqual([{n:0}]);
  });
  it("A–G: ciclo funcional completa baseline, comparação e distribuição com zero/zero/um Novo", async () => {
    const id = await busca();
    expect(await rodada(id, ["100001"])).toMatchObject({ novos: 0, baselineFormada: true });
    expect(await rodada(id, ["100001"])).toMatchObject({ novos: 0 });
    const novoUsuario = await busca(usuarioB);
    expect(await rodada(id, ["100002","100001"])).toMatchObject({ novos: 1 });
    expect((await consultar("select count(*)::int as n from radar_anuncios where user_id=$1 and novidade_varredura_id is not null", [usuarioB])).rows).toEqual([{ n: 0 }]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1", [novoUsuario])).rows).toEqual([{ n: 2 }]);
    expect(await rodada(id, ["100001","100002","100003"], { total: 20 })).toMatchObject({ novos: 0, cobertura: "parcial" });
    expect(await rodada(id, ["100003","100001","100002"])).toMatchObject({ novos: 0 });
    expect((await consultar("select bool_and(ultimo_visto_em>primeiro_visto_em) as avancou from radar_anuncios_globais where id_externo in ('100001','100002')")).rows).toEqual([{ avancou: true }]);
  });
  it("distribuição reaplica filtros privados; bairro pertence a outro universo", async () => {
    const id = await busca();
    const assinaturas: string[] = [];
    const outroUniverso = await busca(usuarioB, { bairro: "Bela Suíça" });
    for (const criterio of [{ valorMin: 2000 }, { regiao: "Zona Sul" },
      { somenteProprietario: true }, { diasPublicacao: 7 }]) assinaturas.push(await busca(usuarioB, criterio));
    await rodada(id, ["100001"]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where user_id=$1", [usuarioB])).rows).toEqual([{ n: 0 }]);
    const publicada = String((await consultar("select (clock_timestamp()-interval '1 day')::text as em")).rows[0].em);
    const anuncios = [anuncio(), anuncio("100002", { preco: 2500, bairro: "Bela Suíça", anunciante: "proprietario", publicadoEm: publicada })] as unknown as AnuncioCentralAngariacao[];
    expect(await rodada(id, ["100001","100002"], { anuncios })).toMatchObject({ novos: 1 });
    for (const assinatura of assinaturas) {
      expect((await consultar("select id_externo,novidade_varredura_id is not null as novo from radar_anuncios where busca_id=$1", [assinatura])).rows)
        .toEqual([{ id_externo: "100002", novo: true }]);
    }
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1",[outroUniverso])).rows).toEqual([{n:0}]);
  });
  it("um coletor privado não pode formar uma baseline global", async () => {
    const id = await busca();
    await expect(rodada(id, ["100001"], { filtros: { ...filtro, valorMin: 1000 } })).rejects.toThrow("sem filtros privados");
    expect((await consultar("select count(*)::int as n from radar_universos")).rows).toEqual([{ n: 0 }]);
  });
  it("HTML sem proveniência confiável e truncamento jamais passam pelo gate", async () => {
    const id = await busca();
    expect(await rodada(id, ["100001"], { confiavel: false })).toMatchObject({ novos: 0 });
    expect((await consultar("select count(*)::int as n from radar_anuncios_globais")).rows).toEqual([{ n: 0 }]);
    expect(await rodada(id, ["100001"], { total: 100 })).toMatchObject({ novos: 0, cobertura: "truncada" });
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{ baseline_varredura_id: null }]);
  });
  it("identidade posicional, finalidade e tipo inferidos não entram no global", async () => {
    const valido = anuncio() as unknown as AnuncioCentralAngariacao;
    expect(qualificarOfertaRadar({ ...valido, idExterno: "chaves-na-mao-1-posicao" }, filtro)).toBeNull();
    expect(qualificarOfertaRadar({ ...valido, tipoDeclarado: undefined }, filtro)).toBeNull();
    expect(qualificarOfertaRadar({ ...valido, finalidade: "venda" }, filtro)).toBeNull();
    expect(qualificarOfertaRadar({ ...valido, url: valido.url.replace("chavesnamao.com.br", "exemplo.invalid") }, filtro)).toBeNull();
  });
  it("dados globais não recebem contato, descrição, ações privadas ou exclusão de imobiliária", () => {
    const bruto = { ...anuncio(), titulo: "Contato 43999999999", descricao: "nome@example.com", salvo: true, investigado: true,
      anunciante: "imobiliaria", imobiliaria: "Imobiliária Atual" } as unknown as AnuncioCentralAngariacao;
    const qualificado = qualificarOfertaRadar(bruto, filtro);
    expect(qualificado).toMatchObject({ anunciante: "imobiliaria", titulo: "Casa em Londrina" });
    expect(JSON.stringify(qualificado)).not.toMatch(/43999999999|example.com|salvo|investigado|Imobiliária Atual/);
  });
  it("aquisição preserva bairro como dimensão e remove os demais filtros privados", () => {
    expect(filtrosGlobaisRadar({ ...filtro, bairro: "Centro", valorMin: 2000, somenteProprietario: true, diasPublicacao: 7 }))
      .toEqual({ ...filtro, bairro: "centro" });
  });
  it("fixture real de 3.080 resultados é truncada e nunca uma baseline", () => {
    const f = { ...filtro, tipoRecorte: "apartamento" as const };
    const origem = { id: "fixture", em: "2026-10-21T12:00:00Z", origem: "http_direto" as const, confiavel: true,
      html: ler("web/tests/fixtures/locacao-chaves-wimoveis/chaves-apartamento.html") };
    expect(avaliarCoberturaRadar(origem, f, urlDaPesquisa(f), [])).toMatchObject({ cobertura: "truncada", total: 3080 });
  });
});


/** A–J: contrato de bairro pela ponte real, com banco/HTML/transportes exclusivamente locais. */
describe("Radar — bairro como dimensão opcional do universo A–J", () => {
  const cidade: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" };
  const bairro = { ...cidade, bairro: "Jardim Tókio" };
  const urlBairro = "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/";
  const cliente = { rpc: async (nome: string, p: Record<string, unknown>) => {
    expect(nome).toBe("registrar_coleta_radar");
    const r = await consultar("select registrar_coleta_radar($1,$2,$3,$4,$5,$6,$7) as resultado",
      [p.p_user_id,p.p_busca_id,p.p_contexto,p.p_aquisicao,p.p_anuncios,p.p_origem,p.p_anuncios_base]);
    return { data: r.rows[0].resultado, error: null };
  } } as unknown as SupabaseClient;
  const oferta = (id: string) => anuncio(id, { bairro: "Jardim Tókio",
    url: `https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-jardim-tokio/id-${id}/` }) as unknown as AnuncioCentralAngariacao;
  async function rodadaBairro(id: string, f = bairro as FiltrosCentralAngariacao,
    opcoes: { user?: string; ids?: string[]; parcial?: boolean; rotaPublicada?: boolean } = {}) {
    const filtros = filtrosGlobaisRadar(f), anuncios = (opcoes.ids ?? ["700001"]).map(oferta);
    const url = urlUniversoRadar(filtros) ?? "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/bairro-sem-rota/";
    const fonte = await aquisicao(anuncios as unknown as Dados[]);
    const html = `<link rel="canonical" href="${url}">`
      + `<script type="application/ld+json">${JSON.stringify({ "@type": "RealEstateListing", url: opcoes.rotaPublicada === false ? urlDaPesquisa(cidade) : url,
        offers: { "@type": "ItemList", numberOfItems: opcoes.parcial ? anuncios.length+5 : anuncios.length,
          itemListElement: anuncios.map((a) => ({ "@type": "Offer", url: a.url })) } })}</script>`;
    const a: AquisicaoPortalRadar = { id: String(fonte.id), em: String(fonte.em), origem: "http_direto", confiavel: true, html };
    return persistirColetaRadar(cliente,{ id,user_id: opcoes.user ?? usuarioA },filtros,anuncios,a,"manual");
  }
  async function cadastra(f = bairro as FiltrosCentralAngariacao, user = usuarioA) { return busca(user, { ...f }); }

  it("A: cidade inteira e bairro têm identidades distintas, inclusive com bairro NULL", async () => {
    const c = await cadastra(cidade), b = await cadastra();
    await rodadaBairro(c,cidade); await rodadaBairro(b);
    expect((await consultar("select bairro,count(*)::int as n from radar_universos group by bairro order by bairro nulls first")).rows)
      .toEqual([{bairro:null,n:1},{bairro:"jardim tokio",n:1}]);
    expect((await consultar("select count(distinct universo_id)::int as n from radar_buscas")).rows).toEqual([{n:2}]);
  });
  it("B: dois usuários do mesmo bairro reutilizam universo e recebem cópias privadas próprias", async () => {
    const a=await cadastra(), b=await cadastra(bairro,usuarioB);
    await rodadaBairro(a); await rodadaBairro(b,bairro,{user:usuarioB});
    expect((await consultar("select count(*)::int as n from radar_universos")).rows).toEqual([{n:1}]);
    expect((await consultar("select count(distinct user_id)::int as n from radar_anuncios")).rows).toEqual([{n:2}]);
  });
  it("C: baseline de Jardim Tókio não certifica nem distribui para cidade inteira", async () => {
    const c=await cadastra(cidade), b=await cadastra();
    await rodadaBairro(b);
    expect((await consultar("select universo_id,comparacao_desde_varredura_id from radar_buscas where id=$1",[c])).rows)
      .toEqual([{universo_id:null,comparacao_desde_varredura_id:null}]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1",[c])).rows).toEqual([{n:0}]);
    expect(await rodadaBairro(c,cidade,{parcial:true})).toMatchObject({novos:0,baselineFormada:false});
    expect((await consultar("select bairro,baseline_varredura_id is not null as formada from radar_universos order by bairro nulls first")).rows)
      .toEqual([{bairro:null,formada:false},{bairro:"jardim tokio",formada:true}]);
  });
  it("D: baseline da cidade inteira não certifica nem distribui para Jardim Tókio", async () => {
    const c=await cadastra(cidade), b=await cadastra();
    await rodadaBairro(c,cidade);
    expect((await consultar("select universo_id,comparacao_desde_varredura_id from radar_buscas where id=$1",[b])).rows)
      .toEqual([{universo_id:null,comparacao_desde_varredura_id:null}]);
    expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1",[b])).rows).toEqual([{n:0}]);
    expect(await rodadaBairro(b,bairro,{parcial:true})).toMatchObject({novos:0,baselineFormada:false});
    expect((await consultar("select bairro,baseline_varredura_id is not null as formada from radar_universos order by bairro nulls first")).rows)
      .toEqual([{bairro:null,formada:true},{bairro:"jardim tokio",formada:false}]);
  });
  it("E: o mesmo native ID nos dois universos é uma oferta global com duas presenças", async () => {
    const c=await cadastra(cidade), b=await cadastra();
    await rodadaBairro(c,cidade);
    const primeira=(await consultar("select primeiro_visto_em::text as em from radar_anuncios_globais")).rows[0].em;
    await rodadaBairro(b);
    expect((await consultar("select count(*)::int as n,min(primeiro_visto_em)::text as em,bool_and(ultimo_visto_em>primeiro_visto_em) as avancou from radar_anuncios_globais")).rows)
      .toEqual([{n:1,em:primeira,avancou:true}]);
    expect((await consultar("select count(*)::int as n,count(distinct anuncio_global_id)::int as ofertas from radar_presencas")).rows)
      .toEqual([{n:2,ofertas:1}]);
  });
  it("F: case, acento, espaços e slug de bairro convergem no servidor e no SQL", async () => {
    for (const nome of ["Jardim Tókio","  JARDIM   TOKIO  ","jardim-tokio","jardim tókio"]) {
      expect(chaveBairroRadar(nome)).toBe("jardim tokio");
      const f={...bairro,bairro:nome}, id=await cadastra(f);
      await rodadaBairro(id,f);
      const ads=[oferta("700001")];
      expect(await coletar(id,ads as unknown as Dados[],{contexto:{...contexto,bairro:nome},
        aquisicao:await aquisicao(ads as unknown as Dados[],{bairro_rota_comprovada:true,url_universo:urlBairro})})).toMatchObject({novos:0,baselineFormada:false});
      expect((await consultar("select radar_integridade.chave_bairro($1) as chave",[nome])).rows).toEqual([{chave:"jardim tokio"}]);
    }
    expect((await consultar("select count(*)::int as n from radar_universos")).rows).toEqual([{n:1}]);
  });
  it("G: bairro sem rota qualificada não chama transporte nem certifica coleta fornecida", async () => {
    const f={...bairro,bairro:"Bairro sem rota"}, id=await cadastra(f), enviar=vi.fn();
    vi.stubGlobal("fetch",enviar);
    expect(urlUniversoRadar(f)).toBeNull();
    expect(await buscarColetaPaginadaRadar(f,{restanteMs:()=>300000})).toMatchObject({anuncios:[],resumo:{paginasLidas:0,motivoTermino:"bairro_sem_rota_canonica"}});
    expect(enviar).not.toHaveBeenCalled();
    expect(await rodadaBairro(id,f)).toMatchObject({novos:0,baselineFormada:false,cobertura:"desconhecida"});
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{baseline_varredura_id:null}]);
  });
  it("G: rota cadastrada sem listagem publicada do bairro no HTML também fecha coverage", async () => {
    const id=await cadastra();
    expect(await rodadaBairro(id,bairro,{rotaPublicada:false})).toMatchObject({novos:0,baselineFormada:false,cobertura:"desconhecida"});
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{baseline_varredura_id:null}]);
  });
  it("H: bairro parcial conserva anúncio consultável, link direto e Base não revisada", async () => {
    const id=await cadastra(), r=await rodadaBairro(id,bairro,{parcial:true});
    expect(r).toMatchObject({novos:0,baselineFormada:false,cobertura:"parcial",anuncios:[]});
    expect(r.anunciosColetados).toEqual([expect.objectContaining({busca_id:id,user_id:usuarioA,
      novidade_varredura_id:null,cobertura_coleta:"parcial",url:oferta("700001").url})]);
    expect((await papel("authenticated",()=>consultar("select url,visto from radar_anuncios"))).rows)
      .toEqual([{url:oferta("700001").url,visto:false}]);
  });
  it("I: visto e dados privados de um usuário não alteram a cópia de outro", async () => {
    const a=await cadastra(), b=await cadastra(bairro,usuarioB); await rodadaBairro(a);
    await papel("authenticated",async()=>{
      await expect(consultar("update radar_anuncios set visto=true,dados=dados || '{\"salvo\":true,\"descartado\":true,\"investigado\":true,\"interesse\":true}'::jsonb where busca_id=$1",[a])).rejects.toThrow("Identidade do Radar reservada ao servidor");
      await consultar("update radar_anuncios set visto=true where busca_id=$1",[a]);
      expect((await consultar("select count(*)::int as n from radar_anuncios where busca_id=$1",[b])).rows).toEqual([{n:0}]);
    });
    await papel("authenticated",async()=>{
      expect((await consultar("select visto,dados ? 'salvo' as privado from radar_anuncios where busca_id=$1",[b])).rows)
        .toEqual([{visto:false,privado:false}]);
    },usuarioB);
    expect((await consultar("select dados_objetivos ? 'salvo' as privado from radar_anuncios_globais")).rows).toEqual([{privado:false}]);
  });
  it("J: transitar entre cidade/bairro inicia comparação própria, sem falsos Novos", async () => {
    const id=await cadastra(cidade); await rodadaBairro(id,cidade);
    await consultar("update radar_buscas set filtros=$2 where id=$1",[id,bairro]);
    expect(await rodadaBairro(id,bairro,{ids:["700001","700002"]})).toMatchObject({novos:0,baselineFormada:true});
    expect(await rodadaBairro(id,bairro,{ids:["700001","700002","700003"]})).toMatchObject({novos:1});
    await consultar("update radar_buscas set filtros=$2 where id=$1",[id,cidade]);
    expect(await rodadaBairro(id,cidade,{ids:["700001","700002","700003","700004"]})).toMatchObject({novos:0,baselineFormada:false});
    expect((await consultar("select count(*)::int as n from radar_anuncios where novidade_varredura_id is not null")).rows).toEqual([{n:0}]);
    const v=(await consultar("select universo_id from radar_buscas where id=$1",[id])).rows[0].universo_id;
    expect((await consultar("select r.universo_id=b.universo_id as mesma from radar_buscas b join radar_varreduras r on r.id=b.comparacao_desde_varredura_id where b.id=$1",[id])).rows)
      .toEqual([{mesma:true}]);
    expect((await consultar("select bairro from radar_universos where id=$1",[v])).rows).toEqual([{bairro:null}]);
  });
  it("a dimensão bairro é imutável, e NULL não duplica universos da cidade", async () => {
    const id=await cadastra(cidade); await rodadaBairro(id,cidade); await rodadaBairro(id,cidade);
    expect((await consultar("select count(*)::int as n from radar_universos")).rows).toEqual([{n:1}]);
    await expect(consultar("update radar_universos set bairro='jardim tokio'")).rejects.toThrow("Bairro do universo imutável");
  });
  it("a RPC rebaixa cobertura completa de bairro sem prova da rota", async () => {
    const id=await cadastra(), ads=[oferta("700001")];
    const r=await coletar(id,ads as unknown as Dados[],{contexto:{...contexto,bairro:"Jardim Tókio"}});
    expect(r).toMatchObject({novos:0,baselineFormada:false,cobertura:"desconhecida"});
  });
  it.each([
    "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/",
    "https://www.chavesnamao.com.br/casas-para-alugar/sc-londrina/jardim-tokio/",
    "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/outro-bairro/",
  ])("a RPC não aceita prova da rota de outro contexto: %s", async (url) => {
    const id=await cadastra(), ads=[oferta("700001")];
    const r=await coletar(id,ads as unknown as Dados[],{contexto:{...contexto,bairro:"jardim tokio"},
      aquisicao:await aquisicao(ads as unknown as Dados[],{bairro_rota_comprovada:true,url_universo:url})});
    expect(r).toMatchObject({novos:0,baselineFormada:false,cobertura:"desconhecida"});
    expect((await consultar("select baseline_varredura_id from radar_universos")).rows).toEqual([{baseline_varredura_id:null}]);
  });
  it("o schema recusa bairro branco como uma segunda identidade da cidade inteira", async () => {
    await expect(consultar("insert into radar_universos(portal,finalidade,uf,cidade,tipo_recorte,anunciante_recorte,versao_semantica,bairro) values('chaves-na-mao','locacao','PR','londrina','casa','todos',2,'   ')")).rejects.toThrow("radar_universos_bairro_canonico");
  });
  it("paginação integrada do bairro: URL publicada → baseline zero → repetição zero → um Novo", async () => {
    const id=await cadastra(); vi.stubEnv("FIRECRAWL_API_KEY","fixture-local-sem-api-real");
    let ids=Array.from({length:19},(_,i)=>String(710000+i));
    const urls:string[]=[];
    const enviar=vi.fn(async(destino:string,init?:RequestInit)=>{
      expect(destino).toBe("https://api.firecrawl.dev/v2/scrape");
      const url=JSON.parse(String(init?.body)).url; urls.push(url);
      const pagina=Number(new URL(url).searchParams.get("pg")||1);
      const html=paginaRadar(bairro,pagina,ids.slice((pagina-1)*10,pagina*10),ids.length,pagina*10<ids.length);
      return new Response(JSON.stringify({success:true,data:{rawHtml:html,metadata:{statusCode:200,sourceURL:JSON.parse(String(init?.body)).url,url:JSON.parse(String(init?.body)).url}}}));
    });
    vi.stubGlobal("fetch",enviar);
    async function executar(){
      const f=filtrosGlobaisRadar(bairro), c=await buscarColetaPaginadaRadar(f,{restanteMs:()=>300000});
      expect(c.resumo).toMatchObject({paginasLidas:2,motivoTermino:"fim_comprovado"});
      return persistirColetaRadar(cliente,{id,user_id:usuarioA},f,c.anuncios,c.aquisicao,"manual");
    }
    expect(await executar()).toMatchObject({novos:0,baselineFormada:true,cobertura:"completa"});
    expect(urls.slice(0,2)).toEqual([urlBairro,urlBairro+"?pg=2"]);
    expect(await executar()).toMatchObject({novos:0,baselineFormada:false});
    ids=[...ids,"710019"];
    expect(await executar()).toMatchObject({novos:1});
    expect((await consultar("select count(*)::int as n from radar_universos where bairro='jardim tokio'")).rows).toEqual([{n:1}]);
  });
});
