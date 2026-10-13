import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { A, B, bancoAnterior, ler, migrationB0, oferta, registrar } from "./fixtures/bancoOfertasMercado";
import { anunciosRepresentamMesmaOferta, baseFingerprintAnuncio, baseFingerprintOferta } from "@/lib/calculo/comparaveisMercado";

let db: PGlite;
beforeAll(async () => { db = await bancoAnterior(); }, 30000);
afterAll(async () => { await db?.close(); });

it("migration preserva Locação antiga e seu histórico", async () => {
  const antiga = await registrar(db, oferta());
  const antes = (await db.query("select * from observacoes_comparaveis_mercado")).rows;
  await db.exec(ler(migrationB0));
  expect((await db.query("select * from observacoes_comparaveis_mercado")).rows).toEqual(antes);
  expect((await registrar(db, oferta())).id).toBe(antiga.id);
});

it("dupla finalidade mantém duas ofertas, reobservações e preços independentes", async () => {
  const locacao = await registrar(db, oferta());
  const venda = await registrar(db, oferta("venda"));
  expect(venda.id).not.toBe(locacao.id);
  expect((await registrar(db, oferta())).id).toBe(locacao.id);
  expect((await registrar(db, oferta("venda"))).id).toBe(venda.id);
  expect((await db.query("select count(*)::int n from comparaveis_mercado")).rows).toEqual([{n:2}]);
  expect((await db.query("select count(*)::int n from observacoes_comparaveis_mercado")).rows).toEqual([{n:2}]);
  await registrar(db, oferta("locacao", 3300));
  expect((await db.query("select valor_anunciado from comparaveis_mercado where finalidade='venda'")).rows).toEqual([{valor_anunciado:"650000"}]);
  await registrar(db, oferta("venda", 640000));
  expect((await db.query("select finalidade,valor_anunciado from comparaveis_mercado order by finalidade")).rows).toEqual([
    {finalidade:"locacao",valor_anunciado:"3300"}, {finalidade:"venda",valor_anunciado:"640000"},
  ]);
  const historico = (await db.query("select c.finalidade,o.valor_anunciado from observacoes_comparaveis_mercado o join comparaveis_mercado c on c.id=o.comparavel_id order by c.finalidade,o.id")).rows;
  expect(historico).toEqual([
    {finalidade:"locacao",valor_anunciado:"3200"}, {finalidade:"locacao",valor_anunciado:"3300"},
    {finalidade:"venda",valor_anunciado:"650000"}, {finalidade:"venda",valor_anunciado:"640000"},
  ]);
});

it.each(["url", "fingerprint"])("%s sozinho continua deduplicando somente dentro da finalidade", async (criterio) => {
  for (const finalidade of ["locacao", "venda"]) {
    const primeira = await registrar(db, oferta(finalidade, undefined, {
      id_externo: `${criterio}-${finalidade}`, url_canonica: `https://example.test/${criterio}`,
      anuncio_fingerprint: `fisico-${criterio}`, fingerprint_forte: criterio === "fingerprint",
    }));
    const outra = await registrar(db, oferta(finalidade, undefined, {
      id_externo: `alias-${criterio}-${finalidade}`,
      url_canonica: criterio === "url" ? `https://example.test/${criterio}` : `https://example.test/alias-${finalidade}`,
      anuncio_fingerprint: `fisico-${criterio}`, fingerprint_forte: criterio === "fingerprint",
    }));
    expect(outra.id).toBe(primeira.id);
  }
  expect((await db.query("select count(*)::int n from comparaveis_mercado where id_externo like $1", [`${criterio}-%`])).rows).toEqual([{n:2}]);
});

it("RLS permite catálogo e impede alterações, autoria forjada e mutação de finalidade", async () => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [B]);
  await db.exec("set role authenticated");
  try {
    expect((await db.query("select id from comparaveis_mercado where user_id=$1", [A])).rows.length).toBeGreaterThan(0);
    expect((await db.query("update comparaveis_mercado set valor_anunciado=999 where user_id=$1 returning id", [A])).rows).toEqual([]);
    await expect(db.query("insert into comparaveis_mercado(user_id,portal,id_externo,url,titulo,cidade,cidade_chave,valor_anunciado) values ($1,'zap','forjado','x','x','x','x',999)",[A])).rejects.toThrow(/row-level security/);
  } finally { await db.exec("reset role"); }
  const chamadaB = registrar(db, oferta("venda", 900000, {user_id:A}), B);
  await expect(chamadaB).resolves.toMatchObject({criado:true});
  const deB = await chamadaB;
  expect((await db.query("select user_id from comparaveis_mercado where id=$1",[deB.id])).rows).toEqual([{user_id:B}]);
  await expect(db.query("update comparaveis_mercado set finalidade='venda' where user_id=$1 and finalidade='locacao'",[A])).rejects.toThrow(/imutáveis/);
  expect((await db.query("select valor_anunciado from comparaveis_mercado where user_id=$1 and finalidade='venda' and id_externo='SYNTHETIC-123'",[A])).rows).toEqual([{valor_anunciado:"640000"}]);
});

it.each([
  oferta("venda", 650000, {finalidade_observada:"locacao"}),
  oferta("locacao", 3200, {finalidade_observada:"venda"}),
  oferta("venda", 650000, {finalidade_observada:null}),
  oferta("venda", 650000, {dados_originais:{finalidade:"locacao"}}),
  oferta("venda", 650000, {dados_originais:{finalidadeObservada:"locacao"}}),
  oferta("locacao", 3200, {dados_originais:{finalidadeObservada:"venda"}}),
])("finalidade conflitante ou Venda não observada falha fechado", async (dados) => {
  await expect(registrar(db, dados)).rejects.toThrow(/Finalidade observada/);
});

it("Locação legada sem finalidade observada mantém a identidade", async () => {
  const atual = await registrar(db, oferta());
  expect((await registrar(db, oferta("locacao", 3200, {finalidade_observada:undefined, finalidade:undefined}))).id).toBe(atual.id);
});

describe("fingerprint físico e identidade da oferta", () => {
  const sinais = {portal:"zap",idExterno:"SYNTHETIC-123",url:"https://example.test/123",estado:"PR",cidade:"Londrina",endereco:"Rua Sintética, 123",tipo:"Apartamento",areaM2:80,quartos:2};
  it("preserva sinais físicos e distingue as duas finalidades", () => {
    const locacao = {...sinais,finalidade:"locacao" as const}, venda = {...sinais,finalidade:"venda" as const};
    expect(baseFingerprintAnuncio(locacao)).toBe(baseFingerprintAnuncio(venda));
    expect(baseFingerprintOferta(locacao)).not.toBe(baseFingerprintOferta(venda));
    expect(anunciosRepresentamMesmaOferta(locacao,venda)).toBe(false);
    expect(anunciosRepresentamMesmaOferta(locacao,{...locacao,idExterno:"alias",url:"https://example.test/alias"})).toBe(true);
  });
});
