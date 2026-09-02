import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { agoraTimestamp, partesDataHoraLocal, dataHoraLocalParaIso } from "@/lib/datas";

vi.mock("server-only", () => ({}));
import { GET } from "@/app/api/cron/mercados/route";
import { executarMonitorRadar } from "@/lib/servidor/monitorRadarAngariacao";
import { carregarComparaveisMercadoComCliente } from "@/lib/persistencia/comparaveisMercado";
import type { EntradaAvaliacao } from "@/lib/calculo/avaliacao";

const url = process.env.LOCAL_SUPABASE_URL || "";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY || "";
if (!/^http:\/\/127\.0\.0\.1:54321$/.test(url) || !serviceKey || !anonKey) {
  throw new Error("Integração requer Supabase LOCAL em 127.0.0.1:54321 e chaves locais explícitas.");
}
const opcoes = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, serviceKey, opcoes);
const anon = createClient(url, anonKey, opcoes);
let a: SupabaseClient; let b: SupabaseClient; let aId: string; let bId: string;
let servidor: Server; let cronUrl: string;
const fetchReal = globalThis.fetch;
const dia = 86_400_000;
const iso = (delta = 0) => {
  const { data, hora } = partesDataHoraLocal(undefined, delta);
  return dataHoraLocalParaIso(data, hora)!;
};
const usuariosCriados: string[] = [];
let chamadasPagas = 0; let chamadasSaldo = 0;
const preco = 2400;
const idAnuncio = "990051234567";
const html = () => `<section class="olx-adcard"><a data-testid="adcard-link" title="Apartamento 70 m² 2 quartos" href="https://pr.olx.com.br/imoveis/apartamento-${idAnuncio}">Apartamento</a><span class="olx-adcard__price">R$ ${preco.toLocaleString("pt-BR")}</span><span class="olx-adcard__location">Londrina, Centro</span></section>`;

async function novoUsuario() {
  const email = `fase5b-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const criado = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(criado.error).toBeNull();
  const id = criado.data.user!.id; usuariosCriados.push(id);
  const cliente = createClient(url, anonKey, opcoes);
  const login = await cliente.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  return { id, cliente };
}
async function inserir(parcial: Record<string, unknown> = {}, cliente = service) {
  const r = await cliente.from("mercados_monitorados").insert({
    user_id: aId, cidade: "Londrina", estado: "PR", finalidade: "locacao", segmento: "residencial", ...parcial,
  }).select().single();
  expect(r.error).toBeNull(); return r.data!;
}
async function claim(limite = 1, cliente = service) {
  const r = await cliente.rpc("claim_mercados_monitorados", { p_limite: limite });
  expect(r.error).toBeNull(); return r.data as Array<Record<string, unknown>>;
}
async function concluir(m: Record<string, unknown>, sucesso = true, erro: string | null = null, token = m.lease_token) {
  const r = await service.rpc("concluir_mercado_monitorado", {
    p_mercado_id: m.id, p_lease_token: token, p_sucesso: sucesso, p_erro_codigo: erro,
  });
  expect(r.error).toBeNull(); return r.data;
}
async function ler(id: unknown) {
  const r = await service.from("mercados_monitorados").select().eq("id", id).single();
  expect(r.error).toBeNull(); return r.data!;
}
async function cron(segredo = true) {
  return fetchReal(`${cronUrl}?user_id=${bId}&limite=999`, {
    headers: segredo ? { authorization: "Bearer cron-local-fase5b" } : {},
  });
}

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
  vi.stubEnv("FIRECRAWL_API_KEY", "firecrawl-mock-local");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("CRON_SECRET", "cron-local-fase5b");
  // Únicas saídas permitidas: API local e Firecrawl simulado. Nenhum crédito real.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const destino = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (destino.startsWith(`${url}/`)) return fetchReal(input, init);
    if (destino === "https://api.firecrawl.dev/v2/team/credit-usage") {
      chamadasSaldo++;
      return Response.json({ success: true, data: { remainingCredits: 100, planCredits: 100 } });
    }
    if (destino === "https://api.firecrawl.dev/v2/scrape") {
      chamadasPagas++;
      const body = JSON.parse(String(init?.body));
      expect(body.proxy).toBe("basic");
      const pagina = String(body.url).includes("olx.com.br") ? html() : "<html><body>Sem anúncios na amostra</body></html>";
      return Response.json({ success: true, data: { rawHtml: pagina, metadata: { statusCode: 200 } } });
    }
    throw new Error("Saída externa bloqueada no smoke local.");
  });
  const ua = await novoUsuario(); a = ua.cliente; aId = ua.id;
  const ub = await novoUsuario(); b = ub.cliente; bId = ub.id;
  servidor = createServer(async (req, res) => {
    try {
      const r = await GET(new Request(`http://127.0.0.1${req.url}`, {
        headers: req.headers.authorization ? { authorization: req.headers.authorization } : {},
      }));
      res.writeHead(r.status, { "Content-Type": "application/json" }); res.end(await r.text());
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const endereco = servidor.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor local indisponível.");
  cronUrl = `http://127.0.0.1:${endereco.port}/api/cron/mercados`;
});
beforeEach(async () => {
  const r = await service.from("mercados_monitorados").delete().in("user_id", [aId, bId]);
  expect(r.error).toBeNull(); chamadasPagas = 0; chamadasSaldo = 0;
});
afterAll(async () => {
  if (servidor) await new Promise<void>((resolve) => servidor.close(() => resolve()));
  for (const id of usuariosCriados) {
    const r = await service.auth.admin.deleteUser(id); expect(r.error).toBeNull();
  }
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("claim/conclusão em PostgreSQL + PostgREST reais", () => {
  it("duas requisições concorrentes reclamam o mesmo mercado uma única vez", async () => {
    const m = await inserir();
    const resultados = await Promise.all([claim(), claim()]);
    expect(resultados.flat().map((r) => r.id)).toEqual([m.id]);
    const atual = await ler(m.id);
    expect(atual.ultima_tentativa_em).toBeTruthy();
    expect(Date.parse(atual.lease_expira_em) - agoraTimestamp()).toBeGreaterThan(9 * 60_000);
  });
  it.each([2, 999])("limite %s nunca reclama mais de dois entre cinco vencidos", async (limite) => {
    for (let i = 0; i < 5; i++) await inserir({ cidade: `Mercado ${i}` });
    expect(await claim(limite)).toHaveLength(2);
  });
  it("lease válido, futuro e inativo não são elegíveis; expirado é recuperável", async () => {
    await inserir({ cidade: "Válido", lease_token: randomUUID(), lease_expira_em: iso(dia) });
    await inserir({ cidade: "Futuro", proxima_execucao_em: iso(dia) });
    await inserir({ cidade: "Inativo", ativo: false });
    const expirado = await inserir({ cidade: "Expirado", lease_token: randomUUID(), lease_expira_em: iso(-dia) });
    const [m] = await claim(2); expect(m.id).toBe(expirado.id);
    expect(m.lease_token).not.toBe(expirado.lease_token);
    expect(await claim()).toHaveLength(0);
  });
  it("token errado não conclui; correto limpa falhas e agenda frequência normal", async () => {
    await inserir({ falhas_consecutivas: 3, ultimo_erro_codigo: "falha_total" });
    const [m] = await claim();
    expect(await concluir(m, true, null, randomUUID())).toBe(false);
    expect((await ler(m.id)).lease_token).toBe(m.lease_token);
    expect(await concluir(m)).toBe(true);
    const atual = await ler(m.id);
    expect(atual).toMatchObject({ falhas_consecutivas: 0, ultimo_erro_codigo: null, lease_token: null, lease_expira_em: null });
    expect(atual.ultimo_sucesso_em).toBeTruthy();
    expect(Math.round((Date.parse(atual.proxima_execucao_em) - agoraTimestamp()) / dia)).toBe(30);
    expect(await concluir(m)).toBe(false);
  });
  it.each([[0, 1], [1, 2], [2, 4], [3, 7], [15, 7]])("falha anterior %s resulta em backoff %s dias e erro sanitizado", async (falhas, dias) => {
    await inserir({ falhas_consecutivas: falhas }); const [m] = await claim();
    expect(await concluir(m, false, "https://url.com?token=segredo")).toBe(true);
    const atual = await ler(m.id);
    expect(atual).toMatchObject({ falhas_consecutivas: falhas + 1, ultimo_erro_codigo: "falha_total", lease_token: null, ultimo_sucesso_em: null });
    expect(Math.round((Date.parse(atual.proxima_execucao_em) - agoraTimestamp()) / dia)).toBe(dias);
  });
  it("conclusão não ressuscita mercado excluído nem lease expirado", async () => {
    await inserir(); const [m] = await claim();
    expect((await service.from("mercados_monitorados").update({ lease_expira_em: iso(-1000) }).eq("id", m.id)).error).toBeNull();
    expect(await concluir(m)).toBe(false);
    expect((await service.from("mercados_monitorados").delete().eq("id", m.id)).error).toBeNull();
    expect(await concluir(m)).toBe(false);
    expect((await service.from("mercados_monitorados").select().eq("id", m.id)).data).toEqual([]);
  });
  it("desativação durante execução permite conclusão, mas impede novo claim", async () => {
    await inserir(); const [m] = await claim();
    expect((await a.from("mercados_monitorados").update({ ativo: false }).eq("id", m.id)).error).toBeNull();
    expect(await concluir(m, false, "firecrawl_429")).toBe(true);
    expect((await service.from("mercados_monitorados").update({ proxima_execucao_em: iso(-dia) }).eq("id", m.id)).error).toBeNull();
    expect(await claim()).toEqual([]);
  });
});

describe("RLS e proteção operacional pelo contexto autenticado normal", () => {
  it("A cria/lista/edita/desativa/exclui; B não acessa nem escolhe owner A", async () => {
    const m = await inserir({ proxima_execucao_em: null }, a);
    expect(m.frequencia_dias).toBe(30);
    expect((await b.from("mercados_monitorados").select().eq("id", m.id)).data).toEqual([]);
    expect((await b.from("mercados_monitorados").update({ cidade: "Invadido" }).eq("id", m.id).select()).data).toEqual([]);
    expect((await b.from("mercados_monitorados").delete().eq("id", m.id).select()).data).toEqual([]);
    expect((await b.from("mercados_monitorados").insert({ user_id: aId, cidade: "Curitiba", estado: "PR" })).error?.code).toBe("42501");
    expect((await a.from("mercados_monitorados").update({ ativo: false, cidade: "Curitiba", updated_at: iso() }).eq("id", m.id)).error).toBeNull();
    expect((await ler(m.id)).cidade).toBe("Curitiba");
    expect((await a.from("mercados_monitorados").delete().eq("id", m.id)).error).toBeNull();
  });
  it("anon e authenticated não executam claim ou conclusão", async () => {
    for (const cliente of [anon, a, b]) {
      expect((await cliente.rpc("claim_mercados_monitorados", { p_limite: 2 })).error).toBeTruthy();
      expect((await cliente.rpc("concluir_mercado_monitorado", { p_mercado_id: randomUUID(), p_lease_token: randomUUID(), p_sucesso: true })).error).toBeTruthy();
    }
  });
  it.each([
    { proxima_execucao_em: "2020-01-01T00:00:00Z" }, { falhas_consecutivas: 5 },
    { ultimo_erro_codigo: "forjado" }, { ultimo_sucesso_em: "2020-01-01T00:00:00Z" },
    { ultima_tentativa_em: "2020-01-01T00:00:00Z" }, { lease_token: "00000000-0000-0000-0000-000000000001", lease_expira_em: "2030-01-01T00:00:00Z" },
  ])("browser não manipula campo operacional %j", async (campos) => {
    const m = await inserir({}, a);
    expect((await a.from("mercados_monitorados").update(campos).eq("id", m.id)).error?.code).toBe("42501");
    expect((await a.from("mercados_monitorados").insert({ user_id: aId, cidade: "Curitiba", estado: "PR", ...campos })).error?.code).toBe("42501");
  });
  it("constraints e chave normalizada da 5A permanecem", async () => {
    const m = await inserir({ cidade: " São   José ", estado: "SC" }, a);
    expect(m.cidade_chave).toBe("sao jose");
    expect((await a.from("mercados_monitorados").insert({ user_id: aId, cidade: "São José", estado: "SC" })).error?.code).toBe("23505");
    await inserir({ cidade: "São José", estado: "PR" }, a);
    await inserir({ cidade: "São José", estado: "SC", segmento: "comercial" }, a);
    await inserir({ cidade: "São José", estado: "SC", finalidade: "venda" }, a);
    for (const campos of [{ estado: "XX" }, { estado: "" }, { cidade: "" }, { frequencia_dias: 0 }, { frequencia_dias: 366 }]) {
      expect((await a.from("mercados_monitorados").insert({ user_id: aId, cidade: "Inválido", estado: "SP", ...campos })).error?.code).toBe("23514");
    }
  });
});

describe("cron HTTP local, pipeline e histórico reais; Firecrawl simulado", () => {
  it("criar não coleta; sem segredo é recusado; segredo válido processa só um owner do claim", async () => {
    await inserir({}, a);
    await inserir({ cidade: "Campinas", estado: "SP" }, a);
    expect(chamadasPagas).toBe(0);
    expect((await cron(false)).status).toBe(401);
    expect(chamadasPagas).toBe(0);
    const r = await cron(); expect(r.status).toBe(200);
    const resultado = await r.json();
    expect(resultado.mercadosReclamados).toBe(1);
    expect(resultado.mercados[0]).toMatchObject({ status: "sucesso", comparaveisFinalizados: 1, chamadasFirecrawl: 4 });
    expect(chamadasSaldo).toBe(1); expect(chamadasPagas).toBe(4);
    expect((await service.from("comparaveis_mercado").select("user_id,estado,cidade_chave").eq("id_externo", idAnuncio)).data)
      .toEqual([{ user_id: aId, estado: "PR", cidade_chave: "londrina" }]);
    expect((await service.from("radar_anuncios").select("id").eq("user_id", aId)).data).toEqual([]);
  });
  it("Radar e mercado convergem no mesmo comparável e cache; ausência não altera status/histórico", async () => {
    // Independente da ordem: prepara o mesmo comparável pelo cron se necessário.
    await inserir({}, a);
    expect((await cron()).status).toBe(200);
    chamadasPagas = 0;
    const antes = await service.from("comparaveis_mercado").select("id,status_anuncio").eq("user_id", aId).eq("id_externo", idAnuncio).single();
    expect(antes.error).toBeNull();
    const obsAntes = await service.from("observacoes_comparaveis_mercado").select("id").eq("comparavel_id", antes.data!.id);
    const radar = await service.from("radar_buscas").insert({ user_id: aId, nome: "Smoke local", filtros: { portal: "olx", cidade: "Londrina", estado: "PR", tipo: "Apartamento" }, ativo: true }).select("id").single();
    expect(radar.error).toBeNull();
    const resultadoRadar = await executarMonitorRadar();
    expect(resultadoRadar.falhas).toBe(0);
    expect(chamadasPagas).toBe(0);
    expect((await service.from("comparaveis_mercado").select("id").eq("user_id", aId).eq("id_externo", idAnuncio)).data).toEqual([{ id: antes.data!.id }]);
    const anunciosRadar = await service.from("radar_anuncios").select("id").eq("user_id", aId);
    expect(anunciosRadar.data).toHaveLength(1);
    // Campinas tem somente amostras vazias simuladas: não implica retirada em Londrina.
    await inserir({ cidade: "Campinas", estado: "SP" }, a);
    const r = await cron(); const resultado = await r.json();
    expect(resultado.mercados[0].erro).toBe("sem_resultados");
    expect((await service.from("comparaveis_mercado").select("id,status_anuncio").eq("id", antes.data!.id)).data).toEqual([antes.data]);
    expect((await service.from("observacoes_comparaveis_mercado").select("id").eq("comparavel_id", antes.data!.id)).data).toEqual(obsAntes.data);
    expect((await service.from("radar_anuncios").select("id").eq("user_id", aId)).data).toEqual(anunciosRadar.data);
  });
});

async function registrarSintetico(idExterno: string, estado: string | null, extras: Record<string, unknown> = {}) {
  const r = await service.rpc("registrar_comparavel_mercado", { p_dados: {
    user_id: aId, portal: "olx", id_externo: idExterno,
    url: `https://pr.olx.com.br/imoveis/${idExterno}`, titulo: "Apartamento de teste local",
    finalidade: "locacao", cidade: "Homônima 5B", cidade_chave: "homonima 5b", estado,
    tipo: "Apartamento", tipo_familia: "apartamento", area_m2: 70, area_privativa_m2: 70,
    quartos: 2, banheiros: 1, vagas: 1, valor_anunciado: 2100,
    observado_em: iso(), ...extras,
  } });
  expect(r.error).toBeNull(); return r.data[0].id as string;
}

describe("geografia e histórico da 5A preservados no banco", () => {
  it("UF + cidade isola estruturado/vetorial; NULL permanece excluído e overload antigo responde", async () => {
    const ids: string[] = [];
    const vetor = [1, ...Array(511).fill(0)];
    for (const estado of ["PR", "SP", null]) {
      const id = await registrarSintetico(randomUUID(), estado); ids.push(id);
      expect((await service.from("comparaveis_mercado").update({
        embedding: vetor, embedding_modelo: "text-embedding-3-small", embedding_dimensoes: 512,
      }).eq("id", id)).error).toBeNull();
    }
    const entrada: EntradaAvaliacao = { finalidade: "locacao", endereco: "", cidade: "Homônima 5B", estado: "SP",
      tipo: "Apartamento", areaM2: 70, quartos: 2, vagas: 1, conservacao: "Bom" };
    expect((await carregarComparaveisMercadoComCliente(a, aId, entrada)).map((c) => c.id)).toEqual([ids[1]]);
    expect(await carregarComparaveisMercadoComCliente(a, aId, { ...entrada, estado: null })).toEqual([]);
    const parametros = { p_query_embedding: vetor, p_embedding_modelo: "text-embedding-3-small", p_embedding_dimensoes: 512,
      p_finalidade: "locacao", p_cidade_chave: "homonima 5b", p_tipo_familia: "apartamento",
      p_area_min: 30, p_area_max: 110, p_quartos_min: 1, p_quartos_max: 3, p_limite: 80 };
    const antiga = await a.rpc("buscar_comparaveis_mercado_hibridos", parametros);
    expect(antiga.status).toBe(200);
    const nova = await a.rpc("buscar_comparaveis_mercado_hibridos", { ...parametros, p_estado: "SP" });
    expect(nova.status).toBe(200);
    expect(nova.data.map((c: { id: string; estado: string }) => ({ id: c.id, estado: c.estado }))).toEqual([{ id: ids[1], estado: "SP" }]);
    expect((await service.from("comparaveis_mercado").select("estado").eq("id", ids[2]).single()).data?.estado).toBeNull();
  });
  it("mesma identidade reobservada gera histórico existente sem duplicidade lógica", async () => {
    const externo = randomUUID();
    const id = await registrarSintetico(externo, "PR", { observado_em: iso(-3 * dia) });
    expect(await registrarSintetico(externo, "PR", { observado_em: iso(-2 * dia) })).toBe(id);
    expect(await registrarSintetico(externo, "PR", { observado_em: iso(-dia), valor_anunciado: 2300 })).toBe(id);
    const r = await service.from("observacoes_comparaveis_mercado").select("tipo_evento,dados_snapshot").eq("comparavel_id", id).order("observado_em");
    expect(r.error).toBeNull();
    expect(r.data?.map((o) => o.tipo_evento)).toEqual(["novo", "reobservado", "preco_alterado"]);
    expect(r.data?.every((o) => o.dados_snapshot.estado === "PR")).toBe(true);
  });
});
