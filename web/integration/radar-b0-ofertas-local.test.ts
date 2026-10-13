import { beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { oferta } from "../tests/fixtures/bancoOfertasMercado";
vi.mock("server-only", () => ({}));
import { salvarComparaveisMercado } from "../lib/servidor/comparaveisMercado";
import { finalizarColetaCentralAngariacao } from "../lib/servidor/finalizacaoCentralAngariacao";
import { carregarIdsComparaveisDosAnunciosComCliente } from "../lib/persistencia/referenciasInvestigador";
import { capacidadeAquisicaoRadar } from "../lib/calculo/aquisicaoRadar";

const url = process.env.B0_LOCAL_URL;
const anon = process.env.B0_LOCAL_ANON;
if (url !== "http://127.0.0.1:56221" || !anon || process.env.B0_LOCAL_SMOKE !== "DESCARTAVEL") throw Error("Smoke B0 exige stack descartável local 56221.");
const opcoes = {auth:{persistSession:false,autoRefreshToken:false}};
let a:SupabaseClient, b:SupabaseClient, aId:string, bId:string, tokenA:string, tokenB:string;
let locacao:string, venda:string;
const contagens:Array<Record<string,unknown>>=[];
function sql(texto:string) {
  return execFileSync("docker",["exec","-i","supabase_db_radar-b0-local","psql","-U","postgres","-d","postgres","-X","-At","-v","ON_ERROR_STOP=1"],{input:texto,encoding:"utf8",stdio:["pipe","pipe","pipe"],timeout:30000}).trim();
}
async function conta() {
  const c=createClient(url!,anon!,opcoes),email=`radar-b0-${randomUUID()}@example.test`,password=`B0-${randomUUID()}`;
  const r=await c.auth.signUp({email,password});expect(r.error).toBeNull();expect(r.data.session).not.toBeNull();
  return {c,id:r.data.user!.id,token:r.data.session!.access_token};
}
async function registrar(dados=oferta(),c=a) {
  const r=await c.rpc("registrar_comparavel_mercado",{p_dados:dados});expect(r.error).toBeNull();expect(r.data).toHaveLength(1);return r.data[0];
}
function contar(etapa:string) {
  contagens.push({etapa,...JSON.parse(sql("select json_build_object('comparaveis',(select count(*) from comparaveis_mercado),'observacoes',(select count(*) from observacoes_comparaveis_mercado),'radar_anuncios',(select count(*) from radar_anuncios),'radar_buscas',(select count(*) from radar_buscas));"))});
}
beforeAll(async()=> {
  ({c:a,id:aId,token:tokenA}=await conta());({c:b,id:bId,token:tokenB}=await conta());
  contar("antes");
},30000);

describe("B0 — contrato real local",()=> {
 it("Locação antiga, migration e histórico são preservados",async()=> {
  locacao=(await registrar()).id;contar("apos_locacao_antes_migration");
  const anterior=sql("select row_to_json(c) from comparaveis_mercado c; select row_to_json(o) from observacoes_comparaveis_mercado o;");
  const rls=sql("select tablename,policyname,cmd,qual,with_check from pg_policies where tablename in ('comparaveis_mercado','observacoes_comparaveis_mercado','radar_buscas','radar_anuncios') order by 1,2");
  sql(readFileSync(new URL("../../supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql",import.meta.url),"utf8"));
  expect(sql("select row_to_json(c) from comparaveis_mercado c; select row_to_json(o) from observacoes_comparaveis_mercado o;")).toBe(anterior);
  expect(sql("select tablename,policyname,cmd,qual,with_check from pg_policies where tablename in ('comparaveis_mercado','observacoes_comparaveis_mercado','radar_buscas','radar_anuncios') order by 1,2")).toBe(rls);
  expect(sql("select pg_get_constraintdef(oid) from pg_constraint where conname='comparaveis_mercado_oferta_key'")).toBe("UNIQUE (user_id, portal, id_externo, finalidade)");
 });
 it("dupla finalidade e mudanças de preço não misturam observações",async()=> {
  venda=(await registrar(oferta("venda"))).id;expect(venda).not.toBe(locacao);contar("apos_venda");
  expect((await registrar()).id).toBe(locacao);expect((await registrar(oferta("venda"))).id).toBe(venda);contar("apos_reobservacoes");
  expect(contagens.at(-1)).toMatchObject({comparaveis:2,observacoes:2});
  await registrar(oferta("locacao",3300));await registrar(oferta("venda",640000));contar("apos_precos");
  const r=await a.from("comparaveis_mercado").select("id,finalidade,valor_anunciado").eq("user_id",aId).order("finalidade");
  expect(r.data).toEqual([{id:locacao,finalidade:"locacao",valor_anunciado:3300},{id:venda,finalidade:"venda",valor_anunciado:640000}]);
  const h=await a.from("observacoes_comparaveis_mercado").select("comparavel_id,valor_anunciado,tipo_evento").eq("user_id",aId).order("id");
  expect(h.data).toEqual([
    {comparavel_id:locacao,valor_anunciado:3200,tipo_evento:"novo"},{comparavel_id:venda,valor_anunciado:650000,tipo_evento:"novo"},
    {comparavel_id:locacao,valor_anunciado:3300,tipo_evento:"preco_alterado"},{comparavel_id:venda,valor_anunciado:640000,tipo_evento:"preco_alterado"},
  ]);
 });
 it.each(["url","fingerprint"])("%s mantém duas ofertas e deduplica aliases concorrentes",async(criterio)=> {
  for(const finalidade of ["locacao","venda"]) {
    const extra={id_externo:`${criterio}-${finalidade}`,url_canonica:`https://example.test/${criterio}`,anuncio_fingerprint:`fisico-${criterio}`,fingerprint_forte:criterio==="fingerprint"};
    const primeira=await registrar(oferta(finalidade,undefined,extra));
    const aliases=await Promise.all(Array.from({length:5},(_,i)=>registrar(oferta(finalidade,undefined,{...extra,id_externo:`alias-${criterio}-${finalidade}-${i}`,url_canonica:criterio==="url"?extra.url_canonica:`https://example.test/${finalidade}/${i}`}))));
    expect(aliases.every(r=>r.id===primeira.id)).toBe(true);
  }
 });
 it("catálogo compartilhado, escrita isolada, RPC respeita Auth e conflito falha fechado",async()=> {
  const catalogo=await b.from("comparaveis_mercado").select("id").eq("user_id",aId);expect(catalogo.data?.length).toBe(6);
  const update=await b.from("comparaveis_mercado").update({valor_anunciado:999}).eq("id",locacao).select("id");expect(update.error).toBeNull();expect(update.data).toEqual([]);
  const insert=await b.from("comparaveis_mercado").insert({user_id:aId,portal:"zap",id_externo:"forjado",url:"x",titulo:"x",cidade:"x",cidade_chave:"x",valor_anunciado:999});expect(insert.error?.code).toBe("42501");
  const forjada=await registrar(oferta("venda",900000,{user_id:aId}),b);
  const dono=await b.from("comparaveis_mercado").select("user_id").eq("id",forjada.id).single();expect(dono.data?.user_id).toBe(bId);
  const privado=await b.from("observacoes_comparaveis_mercado").select("id").eq("user_id",aId);expect(privado.data).toEqual([]);
  for(const dados of [oferta("venda",650000,{finalidade_observada:"locacao"}),oferta("locacao",3200,{finalidade_observada:"venda"}),oferta("venda",650000,{finalidade_observada:null}),oferta("venda",650000,{dados_originais:{finalidadeObservada:"locacao"}}),oferta("locacao",3200,{dados_originais:{finalidadeObservada:"venda"}})]) {
    expect((await a.rpc("registrar_comparavel_mercado",{p_dados:dados})).error?.code).toBe("22023");
  }
  expect((await a.from("comparaveis_mercado").update({finalidade:"venda"}).eq("id",locacao)).error?.code).toBe("22023");
  expect((await a.from("comparaveis_mercado").select("valor_anunciado").eq("id",locacao).single()).data?.valor_anunciado).toBe(3300);
 });
 it("fronteiras de finalização e persistência preservam Locação e rejeitam evidência conflitante",async()=> {
  const filtros={portal:"zap" as const,cidade:"Londrina",estado:"PR",tipo:"Apartamento"};
  const anuncio={portal:"zap" as const,idExterno:"SYNTHETIC-123",url:oferta().url,titulo:"Oferta sintética",preco:3300,cidade:"Londrina",estado:"PR",anunciante:"incerto" as const};
  expect((await finalizarColetaCentralAngariacao(a,aId,[anuncio],filtros)).comparaveisSalvos).toBe(1);
  expect(await salvarComparaveisMercado(a,aId,[{...anuncio,finalidadeObservada:"venda"}],filtros)).toBe(0);
  const ids=await carregarIdsComparaveisDosAnunciosComCliente(a,aId,[anuncio]);expect(ids.get("zap:SYNTHETIC-123")).toBe(locacao);
 });
 it("Locação 10/10 mantém finalização e deduplicação no banco real",async()=> {
  for(const portal of ["olx","zap","viva-real","chaves-na-mao","wimoveis"] as const) for(const tipoRecorte of ["casa","apartamento"] as const) {
    const tipo=tipoRecorte==="casa"?"Casa":"Apartamento",idExterno=tipoRecorte==="casa"?"999999991":"999999992";
    const url=portal==="olx"?`https://pr.olx.com.br/regiao-de-londrina/imoveis/sintetico-${idExterno}`
      :portal==="viva-real"?`https://www.vivareal.com.br/imovel/sintetico-id-${idExterno}/`
      :`https://example.test/${portal}/${idExterno}`;
    const anuncio={portal,idExterno,url,titulo:tipo+" sintético",tipo,tipoDeclarado:tipo,finalidade:"locacao" as const,
      preco:2200,cidade:"Londrina",estado:"PR",anunciante:"incerto" as const,
      evidenciaLocacaoOlx:portal==="olx"?{idExterno,url,tipoDeclarado:tipo,finalidade:"locacao" as const,preco:2200}:undefined,
      evidenciaLocacaoVivaReal:portal==="viva-real"?{idExterno,url,preco:2200}:undefined};
    const filtros={portal,tipoRecorte,tipo,finalidade:"locacao" as const,cidade:"Londrina",estado:"PR"};
    expect((await finalizarColetaCentralAngariacao(a,aId,[anuncio],filtros)).comparaveisSalvos).toBe(1);
    expect((await finalizarColetaCentralAngariacao(a,aId,[anuncio],filtros)).comparaveisSalvos).toBe(1);
    expect((await a.from("comparaveis_mercado").select("id").eq("user_id",aId).eq("portal",portal).eq("id_externo",idExterno).eq("finalidade","locacao")).data).toHaveLength(1);
  }
 });
 it("Radar permanece privado e sua referência escolhe Locação com Venda mais recente",async()=> {
  const busca=await a.from("radar_buscas").insert({user_id:aId,nome:"B0 sintético",filtros:{portal:"zap",finalidade:"locacao",tipoRecorte:"apartamento",cidade:"Londrina",estado:"PR"}}).select("id").single();expect(busca.error).toBeNull();
  const anuncio=await a.from("radar_anuncios").insert({user_id:aId,busca_id:busca.data!.id,portal:"zap",id_externo:"SYNTHETIC-123",url:oferta().url,dados:{finalidade:"locacao",cidade:"Londrina",estado:"PR"}}).select("id").single();expect(anuncio.error).toBeNull();
  expect((await b.from("radar_buscas").select("id").eq("id",busca.data!.id)).data).toEqual([]);
  expect((await b.from("radar_anuncios").select("id").eq("id",anuncio.data!.id)).data).toEqual([]);
  await registrar(oferta("venda",640000,{observado_em:"2026-10-12T12:00:00Z"}));
  const r=await fetch(`http://127.0.0.1:56230/api/avaliacao/contexto?radarAnuncio=${anuncio.data!.id}`,{headers:{authorization:`Bearer ${tokenA}`}});expect(r.status).toBe(200);expect((await r.json()).origemExterna.comparavelId).toBe(locacao);
 });
 it("Next real lê as ofertas corretas e bloqueia Venda nos dez recortes sem transporte",async()=> {
  const origem="http://127.0.0.1:56230";
  for(const [id,finalidade] of [[locacao,"locacao"],[venda,"venda"]]) {
    const r=await fetch(`${origem}/api/avaliacao/contexto?comparavel=${id}`,{headers:{authorization:`Bearer ${tokenA}`}});expect(r.status).toBe(200);expect((await r.json()).prefill.finalidade).toBe(finalidade);
  }
  const privado=await fetch(`${origem}/api/avaliacao/contexto?comparavel=${locacao}`,{headers:{authorization:`Bearer ${tokenB}`}});expect(privado.status).toBe(404);
  for(const portal of ["olx","zap","viva-real","chaves-na-mao","wimoveis"] as const)for(const tipoRecorte of ["casa","apartamento"] as const) {
    const recorte={portal,tipoRecorte,cidade:"Londrina",estado:"PR"};
    expect(capacidadeAquisicaoRadar({...recorte,finalidade:"locacao"}).suportado).toBe(true);
    expect(capacidadeAquisicaoRadar({...recorte,finalidade:"venda"}).suportado).toBe(false);
    const r=await fetch(`${origem}/api/central-angariacao/buscar`,{method:"POST",headers:{authorization:`Bearer ${tokenA}`,"content-type":"application/json"},body:JSON.stringify({...recorte,finalidade:"venda",tipo:tipoRecorte==="casa"?"Casa":"Apartamento"})});
    expect(r.status).toBe(422);
  }
  contar("final");writeFileSync("node_modules/.cache/b0-contagens.json",JSON.stringify(contagens,null,2));
 },120000);
});
