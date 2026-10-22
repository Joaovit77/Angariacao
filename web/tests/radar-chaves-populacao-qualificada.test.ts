import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { avaliarCoberturaRadar, avaliarSequenciaChavesRadar, type AquisicaoPortalRadar, type PaginaPortalRadar } from "@/lib/servidor/coberturaRadar";
import { qualificarOfertaRadar } from "@/lib/servidor/ingestaoRadar";
import { basePopulacaoChaves as base, filtrosPopulacaoChaves as f, paginasPopulacaoChaves } from "./fixtures/populacaoChavesRadar";
import { paginaRadar } from "./fixtures/paginacaoRadar";
function fontes(htmls: string[]): PaginaPortalRadar[] {
  return htmls.map((html,i)=>{const url=i?`${base}?pg=${i+1}`:base;return {id:`local-${i}`,em:new Date(Date.now()-1000).toISOString(),origem:"firecrawl",html,confiavel:true,url,
    transporte:{urlSolicitada:url,urlEfetiva:url,statusHttp:200,statusPortalHttp:200,redirecionada:false}};});
}
function avaliar(htmls=paginasPopulacaoChaves()) {
  const paginas=fontes(htmls), prova=avaliarSequenciaChavesRadar(paginas,base,f);
  const anuncios=htmls.flatMap(html=>extrairAnunciosFirecrawl(html,f));
  const aquisicao: AquisicaoPortalRadar={...paginas[0],paginas,paginasLidas:paginas.length,motivoTermino:"fim_comprovado"};
  return {prova,anuncios,cobertura:avaliarCoberturaRadar(aquisicao,f,base,anuncios)};
}
describe("Chaves — população qualificada e raw para progressão (A–H)",()=>{
  it("A/G: 45 raw, 33 qualificados, 12 extras e zero indeterminados permitem cobertura completa",()=>{
    const r=avaliar();expect(r.prova?.contagens).toEqual({raw_count:45,qualified_count:33,out_of_scope_count:12,indeterminate_count:0,declared_total:33});
    expect(r.prova?.idsBrutos.size).toBe(45);expect(r.prova?.ids.size).toBe(33);
    expect(r.prova?.paginas[2].populacao.fora).toHaveLength(12);
    expect(r.prova?.paginas[2].populacao.exclusoes["44062904"]).toEqual(["bairro"]);
    expect(r.cobertura).toEqual({cobertura:"completa",total:33,evidencia:"itemlist_paginado_qualificado_v1"});
    const sobrado=r.anuncios.find(a=>a.idExterno==="45735542")!;
    expect(qualificarOfertaRadar(sobrado,f)).toMatchObject({tipoDeclarado:"Sobrado",tipo:"Sobrado",bairro:"Jardim Tókio",finalidade:"locacao",cidade:"Londrina",estado:"PR"});
  });
  it("B: 34 qualificados excedendo declarado33 são inconsistentes",()=>{const r=avaliar(paginasPopulacaoChaves(34));expect(r.prova).toBeNull();expect(r.cobertura.cobertura).not.toBe("completa");});
  it("C: 32 qualificados não completam declared33",()=>{const r=avaliar(paginasPopulacaoChaves(32));expect(r.prova?.contagens.qualified_count).toBe(32);expect(r.cobertura.cobertura).toBe("parcial");});
  it("D: 33 qualificados com next não provam fim",()=>{const r=avaliar(paginasPopulacaoChaves(33,0,true));expect(r.prova?.proxima).toBe(`${base}?pg=4`);expect(r.cobertura.cobertura).toBe("parcial");});
  it("E: tipo indeterminado não é completado por SingleFamilyResidence",()=>{const r=avaliar(paginasPopulacaoChaves(32,1));expect(r.prova?.contagens).toMatchObject({qualified_count:32,indeterminate_count:1});expect(r.cobertura.cobertura).toBe("parcial");});
  it("E: indeterminado impede completar mesmo com 33 já qualificados",()=>{const r=avaliar(paginasPopulacaoChaves(33,1));expect(r.prova?.contagens).toMatchObject({qualified_count:33,indeterminate_count:1});expect(r.cobertura.cobertura).toBe("parcial");});
  it("F: página só com extra novo prova progresso bruto; repetir o mesmo extra é loop",()=>{
    const uma=paginaRadar(f,1,["920001","920099"],1,true);
    const tornarExtra=(h:string,id:string)=>h.replace(new RegExp(`(<a href="[^" ]*id-${id}/"><h2>[^<]*</h2>\\s*<p>)Jardim Tókio`),"$1Outro bairro publicado");
    const p1=tornarExtra(uma,"920099"),p2=tornarExtra(paginaRadar(f,2,["920098"],1,false),"920098");
    expect(avaliarSequenciaChavesRadar(fontes([p1,p2]),base,f)?.idsBrutos.size).toBe(3);
    expect(avaliarSequenciaChavesRadar(fontes([p1,p2.replaceAll("920098","920099")]),base,f)).toBeNull();
  });
  it.each(["olx","viva-real","zap","wimoveis"] as const)("H: %s não herda coverage do Chaves",portal=>{
    const paginas=fontes(paginasPopulacaoChaves());expect(avaliarCoberturaRadar({...paginas[0],paginas,motivoTermino:"fim_comprovado"},{...f,portal},base,[]).cobertura).not.toBe("completa");
  });
  it.each(["gap","redirect","total"])("mantém fail-closed com %s",falha=>{
    const p=fontes(paginasPopulacaoChaves());if(falha==="gap")p[1].url=`${base}?pg=3`;if(falha==="redirect")p[1].transporte!.redirecionada=true;if(falha==="total")p[2].html=p[2].html.replace('"numberOfItems":33','"numberOfItems":34');
    expect(avaliarSequenciaChavesRadar(p,base,f)).toBeNull();
  });
});
