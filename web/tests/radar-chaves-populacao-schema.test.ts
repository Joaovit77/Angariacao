import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const ler=(nome:string)=>readFileSync(new URL("../../"+nome,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const nome="20261022180000_radar_chaves_populacao_qualificada.sql";
const sql=ler("supabase/migrations/"+nome),anterior=ler("supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql");
function rpc(s:string){const i=s.indexOf("function public.registrar_coleta_radar(");return s.slice(i,s.indexOf("\n$$;",i)+4);}
describe("Chaves — extensão SQL restrita à população e Sobrado",()=>{
  it("preserva a RPC exceto o gate adicional e a classificação canônica Sobrado",()=>{
    const adicional=sql.slice(sql.indexOf("  if p_contexto->>'portal'='chaves-na-mao'"),sql.indexOf("  -- O servidor atesta"));
    expect(adicional).toContain("cobertura_populacao_chaves_valida(p_aquisicao,lista,p_contexto)");
    const atual=rpc(sql).replace(adicional,"").replace("(case when radar_integridade.chave(item->>'tipoDeclarado')='sobrado' then 'casa' else item->>'tipoDeclarado' end)","item->>'tipoDeclarado'");
    expect(atual).toBe(rpc(anterior));
  });
  it("espelha integralmente a migration uma única vez e não altera tabelas/RLS/histórico",()=>{
    const s=ler("supabase-schema.sql");expect(s.split(sql.trimEnd())).toHaveLength(2);
    expect(sql).not.toMatch(/alter table|create table|drop |delete from/i);
  });
});
