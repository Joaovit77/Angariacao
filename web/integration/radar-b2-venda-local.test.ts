import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { oferta } from "../tests/fixtures/bancoOfertasMercado";
vi.mock("server-only", () => ({}));
import { extrairAnunciosFirecrawl } from "../lib/servidor/firecrawlCentralAngariacao";
import { finalizarColetaCentralAngariacao } from "../lib/servidor/finalizacaoCentralAngariacao";
import { carregarIdsComparaveisDosAnunciosComCliente } from "../lib/persistencia/referenciasInvestigador";

const url = process.env.B2_LOCAL_URL, anon = process.env.B2_LOCAL_ANON;
if (url !== "http://127.0.0.1:56421" || !anon || process.env.B2_LOCAL_SMOKE !== "DESCARTAVEL") throw Error("Exige stack descartável B2.");
const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
let a: SupabaseClient, b: SupabaseClient, aId: string, bId: string, token: string, tokenB: string, locacao: string, venda: string;
const evidencias: Record<string, unknown>[] = [];
async function conta() {
  const c = createClient(url!, anon!, opcoes);
  const r = await c.auth.signUp({ email: `radar-b2-${randomUUID()}@example.test`, password: `B2-${randomUUID()}` });
  expect(r.error).toBeNull(); expect(r.data.session).not.toBeNull();
  return { c, id: r.data.user!.id, token: r.data.session!.access_token };
}
async function registrar(dados = oferta(), c = a) {
  const r = await c.rpc("registrar_comparavel_mercado", { p_dados: dados });
  expect(r.error).toBeNull(); return r.data[0].id as string;
}
beforeAll(async () => {
  const ca = await conta(), cb = await conta();
  a = ca.c; aId = ca.id; token = ca.token; b = cb.c; bId = cb.id; tokenB = cb.token;
}, 30000);

describe("B2 — Next/Auth/PostgREST/RPC/RLS reais locais", () => {
  for (const portal of ["zap", "viva-real", "chaves-na-mao", "olx", "wimoveis"] as const) for (const tipoRecorte of ["casa", "apartamento"] as const) {
    it(`${portal}/${tipoRecorte}: endpoint, parser, normalização e persistência Venda`, async () => {
      const filtros = { portal, tipoRecorte, finalidade: "venda" as const, cidade: "Londrina", estado: "PR" };
      const r = await fetch("http://127.0.0.1:56430/api/central-angariacao/buscar", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(filtros) });
      expect(r.status).toBe(200); const corpo = await r.json();
      expect(corpo.ok).toBe(true); expect(corpo.aviso).toBeUndefined(); expect(corpo.anuncios).toHaveLength(1);
      const anuncio = corpo.anuncios[0]; expect(anuncio.finalidadeObservada).toBe("venda");
      const registros = await a.from("comparaveis_mercado").select("id,finalidade,valor_anunciado").eq("user_id", aId).eq("portal", portal).eq("id_externo", anuncio.idExterno);
      expect(registros.error).toBeNull(); expect(registros.data).toHaveLength(1);
      expect(registros.data![0]).toMatchObject({ finalidade: "venda", valor_anunciado: anuncio.preco });
      const id = registros.data![0].id;
      const historico = await a.from("observacoes_comparaveis_mercado").select("comparavel_id,valor_anunciado").eq("comparavel_id", id);
      expect(historico.data).toEqual([{ comparavel_id: id, valor_anunciado: anuncio.preco }]);
      expect((await finalizarColetaCentralAngariacao(a, aId, corpo.anuncios, filtros)).comparaveisSalvos).toBe(1);
      expect((await a.from("comparaveis_mercado").select("id").eq("user_id", aId).eq("portal", portal).eq("id_externo", anuncio.idExterno).eq("finalidade", "venda")).data).toHaveLength(1);
      const html = readFileSync(new URL(`../tests/fixtures/radar-venda-${portal === "olx" || portal === "wimoveis" ? "b2" : "b1"}/${portal}-${tipoRecorte}.html`, import.meta.url), "utf8");
      expect(extrairAnunciosFirecrawl(html, filtros)[0].preco).toBe(anuncio.preco);
      for (const finalidadeObservada of [undefined, "locacao"] as const) {
        expect((await finalizarColetaCentralAngariacao(a, aId, [{ ...anuncio, finalidadeObservada }], filtros)).comparaveisSalvos).toBe(0);
      }
      if (portal === "olx" || portal === "wimoveis") {
        const aluguel = { ...anuncio, finalidade: "locacao" as const, finalidadeObservada: "locacao" as const, preco: 3200,
          evidenciaLocacaoOlx: portal === "olx" ? { idExterno: anuncio.idExterno, url: anuncio.url, tipoDeclarado: anuncio.tipoDeclarado, finalidade: "locacao" as const, preco: 3200 } : undefined };
        const filtrosAluguel = { ...filtros, finalidade: "locacao" as const };
        expect((await finalizarColetaCentralAngariacao(a, aId, [aluguel], filtrosAluguel)).comparaveisSalvos).toBe(1);
        const rent = await a.from("comparaveis_mercado").select("id").eq("user_id", aId).eq("portal", portal).eq("id_externo", anuncio.idExterno).eq("finalidade", "locacao").single();
        expect(rent.error).toBeNull(); expect(rent.data!.id).not.toBe(id);
        const rentId = rent.data!.id;
        const atualizado = { ...aluguel, preco: 3300, evidenciaLocacaoOlx: aluguel.evidenciaLocacaoOlx ? { ...aluguel.evidenciaLocacaoOlx, preco: 3300 } : undefined };
        expect((await finalizarColetaCentralAngariacao(a, aId, [atualizado], filtrosAluguel)).comparaveisSalvos).toBe(1);
        expect((await finalizarColetaCentralAngariacao(a, aId, [{ ...anuncio, preco: anuncio.preco - 1000 }], filtros)).comparaveisSalvos).toBe(1);
        const separados = await a.from("comparaveis_mercado").select("id,finalidade,valor_anunciado").eq("user_id", aId).eq("portal", portal).eq("id_externo", anuncio.idExterno).order("finalidade");
        expect(separados.data).toEqual([{ id: rentId, finalidade: "locacao", valor_anunciado: 3300 }, { id, finalidade: "venda", valor_anunciado: anuncio.preco - 1000 }]);
        const hs = await a.from("observacoes_comparaveis_mercado").select("comparavel_id,valor_anunciado").eq("user_id", aId).in("comparavel_id", [rentId, id]).order("id");
        expect(hs.data).toEqual([{ comparavel_id: id, valor_anunciado: anuncio.preco }, { comparavel_id: rentId, valor_anunciado: 3200 }, { comparavel_id: rentId, valor_anunciado: 3300 }, { comparavel_id: id, valor_anunciado: anuncio.preco - 1000 }]);
        evidencias.push({ portal, tipoRecorte, ofertas: separados.data, historicos: hs.data });
      }
      evidencias.push({ portal, tipoRecorte, id, finalidade: "venda", preco: anuncio.preco });
    });
  }
  it("mesma identidade física mantém dois UUIDs, dois históricos e preços independentes", async () => {
    locacao = await registrar(); venda = await registrar(oferta("venda")); expect(venda).not.toBe(locacao);
    expect(await registrar()).toBe(locacao); expect(await registrar(oferta("venda"))).toBe(venda);
    await registrar(oferta("locacao", 3300)); await registrar(oferta("venda", 640000));
    const dados = await a.from("comparaveis_mercado").select("id,finalidade,valor_anunciado").eq("user_id", aId).eq("id_externo", "SYNTHETIC-123").order("finalidade");
    expect(dados.data).toEqual([{ id: locacao, finalidade: "locacao", valor_anunciado: 3300 }, { id: venda, finalidade: "venda", valor_anunciado: 640000 }]);
    const h = await a.from("observacoes_comparaveis_mercado").select("comparavel_id,valor_anunciado").eq("user_id", aId).in("comparavel_id", [locacao, venda]).order("id");
    expect(h.data).toEqual([{ comparavel_id: locacao, valor_anunciado: 3200 }, { comparavel_id: venda, valor_anunciado: 650000 }, { comparavel_id: locacao, valor_anunciado: 3300 }, { comparavel_id: venda, valor_anunciado: 640000 }]);
    evidencias.push({ colisao: dados.data, historico: h.data });
  });
  it("conta B não escreve A; RPC ignora autoria forjada e histórico permanece privado", async () => {
    const r = await b.from("comparaveis_mercado").update({ valor_anunciado: 999 }).eq("id", locacao).select("id");
    expect(r.error).toBeNull(); expect(r.data).toEqual([]);
    const forjado = await registrar(oferta("venda", 900000, { user_id: aId }), b);
    expect((await b.from("comparaveis_mercado").select("user_id").eq("id", forjado).single()).data?.user_id).toBe(bId);
    expect((await b.from("observacoes_comparaveis_mercado").select("id").eq("user_id", aId)).data).toEqual([]);
    expect((await b.from("comparaveis_mercado").insert({ user_id: aId, portal: "zap", id_externo: "forjado", url: "x", titulo: "x", cidade: "x", cidade_chave: "x", valor_anunciado: 999 })).error?.code).toBe("42501");
    expect((await a.from("comparaveis_mercado").update({ finalidade: "venda" }).eq("id", locacao)).error?.code).toBe("22023");
    for (const finalidade_observada of [null, "locacao"]) expect((await a.rpc("registrar_comparavel_mercado", { p_dados: oferta("venda", 650000, { finalidade_observada }) })).error?.code).toBe("22023");
  });
  it("Locação 10/10 preserva finalização, reobservação e isolamento da finalidade", async () => {
    for (const portal of ["olx", "zap", "viva-real", "chaves-na-mao", "wimoveis"] as const) for (const tipoRecorte of ["casa", "apartamento"] as const) {
      const tipo = tipoRecorte === "casa" ? "Casa" : "Apartamento", idExterno = tipoRecorte === "casa" ? "999999991" : "999999992";
      const url = portal === "olx" ? `https://pr.olx.com.br/regiao-de-londrina/imoveis/sintetico-${idExterno}` : portal === "viva-real" ? `https://www.vivareal.com.br/imovel/sintetico-id-${idExterno}/` : `https://example.test/${portal}/${idExterno}`;
      const anuncio = { portal, idExterno, url, titulo: tipo + " sintético", tipo, tipoDeclarado: tipo, finalidade: "locacao" as const, preco: 2200, cidade: "Londrina", estado: "PR", anunciante: "incerto" as const,
        evidenciaLocacaoOlx: portal === "olx" ? { idExterno, url, tipoDeclarado: tipo, finalidade: "locacao" as const, preco: 2200 } : undefined,
        evidenciaLocacaoVivaReal: portal === "viva-real" ? { idExterno, url, preco: 2200 } : undefined };
      const filtros = { portal, tipoRecorte, tipo, finalidade: "locacao" as const, cidade: "Londrina", estado: "PR" };
      expect((await finalizarColetaCentralAngariacao(a, aId, [anuncio], filtros)).comparaveisSalvos).toBe(1);
      expect((await finalizarColetaCentralAngariacao(a, aId, [anuncio], filtros)).comparaveisSalvos).toBe(1);
      expect((await a.from("comparaveis_mercado").select("id").eq("user_id", aId).eq("portal", portal).eq("id_externo", idExterno).eq("finalidade", "locacao")).data).toHaveLength(1);
    }
  });
  it("handoff de Avaliação escolhe Locação quando Venda da mesma identidade é mais recente", async () => {
    const anuncio = { portal: "zap" as const, idExterno: "SYNTHETIC-123", titulo: "Oferta sintética", url: oferta().url, anunciante: "incerto" as const };
    const ids = await carregarIdsComparaveisDosAnunciosComCliente(a, aId, [anuncio]); expect(ids.get("zap:SYNTHETIC-123")).toBe(locacao);
    const busca = await a.from("radar_buscas").insert({ user_id: aId, nome: "B2 sintético", filtros: { portal: "zap", finalidade: "locacao", tipoRecorte: "apartamento", cidade: "Londrina", estado: "PR" } }).select("id").single();
    expect(busca.error).toBeNull();
    const radar = await a.from("radar_anuncios").insert({ user_id: aId, busca_id: busca.data!.id, portal: "zap", id_externo: "SYNTHETIC-123", url: oferta().url, dados: { finalidade: "locacao", cidade: "Londrina", estado: "PR" } }).select("id").single();
    expect(radar.error).toBeNull(); await registrar(oferta("venda", 640000, { observado_em: "2026-10-14T12:00:00Z" }));
    const r = await fetch(`http://127.0.0.1:56430/api/avaliacao/contexto?radarAnuncio=${radar.data!.id}`, { headers: { authorization: `Bearer ${token}` } });
    expect(r.status).toBe(200); const corpo = await r.json(); expect(corpo.origemExterna.comparavelId).toBe(locacao); expect(corpo.prefill.finalidade).toBe("locacao");
    const proibido = await fetch(`http://127.0.0.1:56430/api/avaliacao/contexto?comparavel=${locacao}`, { headers: { authorization: `Bearer ${tokenB}` } }); expect(proibido.status).toBe(404);
    writeFileSync("node_modules/.cache/b2/evidencias-local.json", JSON.stringify(evidencias, null, 2));
  });
});
