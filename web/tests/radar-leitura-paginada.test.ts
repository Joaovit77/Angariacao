import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({getSupabase:vi.fn()}));
vi.mock("@/lib/persistencia/supabase",()=>({getSupabase:mocks.getSupabase}));
import { carregarRadar } from "@/lib/radarAngariacao";
const busca={id:"busca",nome:"Controlada",filtros:{portal:"chaves-na-mao",finalidade:"locacao",tipoRecorte:"casa",cidade:"Londrina",estado:"PR"},ativo:true,created_at:"2026-10-21T12:00:00Z"};
const linha=(id:number)=>({id:String(id),busca_id:"busca",dados:{idExterno:String(100000+id),portal:"chaves-na-mao",cidade:"Londrina",estado:"PR",url:`https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina/id-${100000+id}/`,titulo:"Casa controlada"},visto:false,novidade_varredura_id:null,cobertura_coleta:"parcial"});
let range:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 range=vi.fn().mockResolvedValue({data:Array.from({length:121},(_,i)=>linha(i)),error:null});
 const anuncios={order:vi.fn().mockReturnThis(),range};
 mocks.getSupabase.mockReturnValue({from:(tabela:string)=>({select:()=>tabela==="radar_buscas"?{order:async()=>({data:[busca],error:null})}:anuncios})});
});
describe("Radar — consulta de toda a base privada por páginas",()=>{
 it("primeira página conserva anúncios parciais e oferece continuação",async()=>{
  const r=await carregarRadar(); expect(range).toHaveBeenCalledWith(0,120);
  expect(r.anuncios).toHaveLength(120); expect(r.proximaPagina).toBe(120);
  expect(r.anuncios[0]).toMatchObject({novidade:false,coberturaColeta:"parcial"});
 });
 it("página posterior continua acessível sem teto total de 120",async()=>{
  range.mockResolvedValue({data:[linha(120),linha(121)],error:null});
  const r=await carregarRadar(120); expect(range).toHaveBeenCalledWith(120,240);
  expect(r.anuncios.map(a=>a.id)).toEqual(["120","121"]); expect(r.proximaPagina).toBeNull();
 });
 it("falha de leitura não se apresenta como base vazia",async()=>{
  range.mockResolvedValue({data:null,error:new Error("falha isolada")}); await expect(carregarRadar()).rejects.toThrow("falha isolada");
 });
});
