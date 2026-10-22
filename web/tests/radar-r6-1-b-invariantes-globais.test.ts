import { semBlocoRadarBaseline } from "./helpers/blocoRadarBaseline";
// R6.1-B: evidência estrutural e sequencial em PGlite, sem APIs ou dados reais.
// Não comprova ACL/RLS/PostgREST, locks ou concorrência PostgreSQL reais (R6.1-C).
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url);
const A = "20261014111445_radar_r6_1_fundacao_global_ofertas.sql";
const B = "20261014130154_radar_r6_1_b_invariantes_globais.sql";
const ler = (p: string) => readFileSync(new URL(p, RAIZ), "utf8").replace(/\r\n/g, "\n");
const SQL_A = ler("supabase/migrations/"+A), SQL_B = ler("supabase/migrations/"+B), SCHEMA = ler("supabase-schema.sql");
const T0="2026-01-01T12:00:00Z", T1="2026-01-01T12:01:00Z", T2="2026-01-01T12:02:00Z", T3="2026-01-01T12:03:00Z";
const PREPARACAO = "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"+
  "grant usage on schema public to anon,authenticated,service_role;"+
  "alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role;"+
  "alter default privileges in schema public grant execute on functions to public,anon,authenticated,service_role;";
const TABELAS=["radar_universos","radar_varreduras","radar_anuncios_globais","radar_presencas"];
type Dados = Record<string, unknown>;
let db: PGlite, tentativa=0;
async function tentar<T>(acao:()=>Promise<T>):Promise<T> {
  const nome="tentativa_"+ ++tentativa;
  await db.exec("savepoint "+nome);
  try { return await acao(); }
  catch(e) { await db.exec("rollback to savepoint "+nome); throw e; }
  finally { await db.exec("release savepoint "+nome); }
}
const consultar=(sql:string,params:unknown[]=[])=>tentar(()=>db.query<Dados>(sql,params));
async function inserir(tabela:string,dados:Dados) {
  const cols=Object.keys(dados);
  return String((await consultar("insert into public."+tabela+" ("+cols.join(",")+") values ("+cols.map((_,i)=>"$"+(i+1)).join(",")+") returning id",Object.values(dados))).rows[0].id);
}
async function alterar(tabela:string,id:string,dados:Dados) {
  const cols=Object.keys(dados);
  return consultar("update public."+tabela+" set "+cols.map((c,i)=>c+"=$"+(i+1)).join(",")+" where id=$"+(cols.length+1),[...Object.values(dados),id]);
}
const universo=(dados:Dados={})=>inserir("radar_universos",{portal:"zap",finalidade:"locacao",uf:"PR",cidade:"mercado-"+randomUUID(),tipo_recorte:"apartamento",anunciante_recorte:"todos",versao_semantica:1,...dados});
const varredura=(u:string,dados:Dados={})=>inserir("radar_varreduras",{universo_id:u,chave_idempotencia:randomUUID(),iniciada_em:T0,status:"running",iniciador:"teste_local",cobertura:"desconhecida",...dados});
const oferta=(v:string,dados:Dados={})=>inserir("radar_anuncios_globais",{portal:"zap",finalidade:"locacao",id_externo:randomUUID(),url_canonica:"https://exemplo.invalid/oferta",primeira_varredura_id:v,primeiro_visto_em:T1,ultimo_visto_em:T2,...dados});
async function presenca(v:string,a:string,dados:Dados={}) {
  const d={observado_em:T2,preco_observado:null,tipo_observado:null,uf_observada:null,cidade_observada:null,url_observada:null,dados_objetivos:{},...dados};
  return (await consultar("select * from radar_integridade.registrar_presenca($1,$2,$3,$4,$5,$6,$7,$8,$9)",[v,a,...Object.values(d)])).rows[0];
}
async function finalizar(v:string,dados:Dados={}) {
  const n=Number((await consultar("select count(*) as n from radar_presencas where varredura_id=$1",[v])).rows[0].n);
  const d={status:"success",concluida_em:T3,aquisicao_id:"aquisicao-"+v,aquisicao_em:T1,origem_aquisicao:"fixture_local",versao_aquisicao:"v1",cobertura:"amostra",codigo_resultado:"ok",contagem_bruta:n,contagem_admitida:n,paginas_lidas:1,paginas_planejadas:1,...dados};
  return (await consultar("select * from radar_integridade.finalizar_varredura("+Array.from({length:13},(_,i)=>"$"+(i+1)).join(",")+")",[v,...Object.values(d)])).rows[0];
}
const baseline=(u:string,v:string)=>(consultar("select * from radar_integridade.formar_baseline($1,$2)",[u,v]));
const expirar=(v:string,ref=T2)=>consultar("select * from radar_integridade.expirar_varredura($1,$2)",[v,ref]);
async function cenario(dados:Dados={}) {
  const u=await universo(dados), v=await varredura(u), a=await oferta(v,{portal:dados.portal??"zap",finalidade:dados.finalidade??"locacao"});
  await presenca(v,a); return {u,v,a};
}
async function servico<T>(acao:()=>Promise<T>) {
  await db.exec("set local role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
}

beforeAll(async()=>{
  db=new PGlite(); await db.exec(PREPARACAO); await db.exec(SQL_A);
  await db.exec("create table public.radar_buscas(id integer primary key,sentinela text); insert into public.radar_buscas values(1,'preservar'); alter table public.radar_buscas enable row level security; create policy sentinela_leitura on public.radar_buscas for select to authenticated using(true);");
  await db.exec(SQL_B);
},30_000);
beforeEach(async()=>{await db.exec("begin");});
afterEach(async()=>{await db.exec("rollback; reset role");});
afterAll(async()=>{await db?.close();});

describe("R6.1-B — fronteira estrutural",()=>{
  it("preserva A/B congeladas, espelha B uma única vez e reconhece somente a extensão autorizada",()=>{
    expect(createHash("sha256").update(SQL_A).digest("hex")).toBe("da7c91de4737d9c1c0abb38c465663feefd8b0e3323fb72622342e752d59700c");
    const nomes=readdirSync(new URL("supabase/migrations/",RAIZ)).filter(n=>n.endsWith(".sql")).sort();
    expect(nomes.slice(nomes.indexOf(A)+1)).toEqual([B,"20261021120000_radar_baseline_cobertura_novos.sql", "20261022180000_radar_chaves_populacao_qualificada.sql"]);
    const bloco="-- BEGIN RADAR R6.1-B\n"+SQL_B.trimEnd()+"\n-- END RADAR R6.1-B\n";
    expect(SCHEMA.split(bloco)).toHaveLength(2); expect(semBlocoRadarBaseline(SCHEMA).endsWith(bloco)).toBe(true);
    expect(SCHEMA.split("-- BEGIN RADAR R6.1-A\n")[1].split("-- END RADAR R6.1-A")[0].trim()).toBe(SQL_A.trim());
  });
  it("não cria produto, tabelas, policies, novidade, scheduler ou DML de legado",async()=>{
    const codigo=SQL_B.replace(/--[^\n]*/g,"");
    expect(codigo).not.toMatch(/create table|create policy|alter default privileges|create extension|alter role|\bnovo\s+boolean|user_id|owner_id/i);
    expect(codigo).not.toMatch(/(?:insert into|update|delete from|alter table)\s+(?:public\.)?(?:radar_buscas|radar_anuncios|comparaveis_mercado|observacoes_comparaveis_mercado)\b/i);
    expect((await consultar("select sentinela from radar_buscas")).rows).toEqual([{sentinela:"preservar"}]);
    expect((await consultar("select policyname from pg_policies where tablename='radar_buscas'")).rows).toEqual([{policyname:"sentinela_leitura"}]);
  });
  it("catálogo fecha ACL e RLS; somente quatro primitivas service_role, owner postgres e search_path vazio",async()=>{
    const functions=(await consultar("select p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,has_function_privilege('service_role',p.oid,'EXECUTE') as backend,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as autenticado from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='radar_integridade' order by p.proname")).rows;
    expect(functions).toHaveLength(11);
    expect(functions.filter(f=>f.backend).map(f=>f.proname)).toEqual(["expirar_varredura","finalizar_varredura","formar_baseline","registrar_presenca"]);
    for(const f of functions){expect(f.owner).toBe("postgres");expect(f.proconfig).toEqual(['search_path=""']);expect(f.anon).toBe(false);expect(f.autenticado).toBe(false);expect(f.prosecdef).toBe(f.proname!=="impedir_exclusao");}
    expect((await consultar("select count(*)::int as n from pg_policies where tablename=any($1)",[TABELAS])).rows).toEqual([{n:0}]);
    for(const t of TABELAS){
      const r=(await consultar("select relrowsecurity as rls from pg_class where oid=$1::regclass",["public."+t])).rows[0];expect(r.rls).toBe(true);
      for(const role of ["anon","authenticated"])expect((await consultar("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as tabela,has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') as coluna",[role,"public."+t])).rows).toEqual([{tabela:false,coluna:false}]);
      expect((await consultar("select has_table_privilege('service_role',$1,'DELETE,TRUNCATE,TRIGGER') as pode",["public."+t])).rows).toEqual([{pode:false}]);
    }
    const updates=(await consultar("select table_name,column_name from information_schema.column_privileges where table_name=any($1) and grantee='service_role' and privilege_type='UPDATE' order by table_name,column_name",[TABELAS])).rows;
    expect(updates).toEqual(["dados_objetivos","ultimo_visto_em","url_canonica"].map(column_name=>({table_name:"radar_anuncios_globais",column_name})));
    expect((await consultar("select has_table_privilege('service_role','public.radar_presencas','INSERT') as inserir")).rows).toEqual([{inserir:false}]);
  });
});

describe("R6.1-B — identidades e proveniência",()=>{
  it.each([{id:randomUUID()},{portal:"olx"},{finalidade:"venda"},{uf:"SP"},{cidade:"outra"},{tipo_recorte:"casa"},{anunciante_recorte:"particular"},{versao_semantica:2},{criado_em:T0}])("universo imutável %j",async dados=>{
    const u=await universo();await expect(alterar("radar_universos",u,dados)).rejects.toThrow(/imutável/);
  });
  it("universo deve nascer sem baseline, mesmo com referência válida",async()=>{
    const {v}=await cenario();await finalizar(v);
    await expect(universo({baseline_varredura_id:v,baseline_concluido_em:T3})).rejects.toThrow(/nascer sem baseline/);
  });
  it.each([{id:randomUUID()},{portal:"olx"},{finalidade:"venda"},{id_externo:"outro"},{primeira_varredura_id:randomUUID()},{primeiro_visto_em:T0},{criado_em:T0}])("oferta imutável %j",async dados=>{
    const {a}=await cenario();await expect(alterar("radar_anuncios_globais",a,dados)).rejects.toThrow(/imutáveis/);
  });
  it("URL evolui sem duplicar identidade; última observação avança e dados objetivos evoluem",async()=>{
    const {a}=await cenario();await servico(()=>alterar("radar_anuncios_globais",a,{url_canonica:"https://exemplo.invalid/slug-novo",ultimo_visto_em:T3,dados_objetivos:{area_m2:42}}));
    const r=(await consultar("select url_canonica,ultimo_visto_em,dados_objetivos from radar_anuncios_globais where id=$1",[a])).rows[0];expect(r.url_canonica).toContain("slug-novo");expect(r.ultimo_visto_em).toEqual(new Date(T3));expect(r.dados_objetivos).toEqual({area_m2:42});
  });
  it("última observação não regressiva mesmo permanecendo após primeira",async()=>{
    const {a}=await cenario();await expect(servico(()=>alterar("radar_anuncios_globais",a,{ultimo_visto_em:T1}))).rejects.toThrow(/regredir/);
  });
  it.each([{portal:"olx"},{finalidade:"venda"}])("primeira proveniência recusa contexto incompatível %j",async dados=>{
    const u=await universo(),v=await varredura(u);await expect(oferta(v,dados)).rejects.toThrow(/incompatível/);
  });
  it("primeira observação não antecede execução nem nasce em terminal",async()=>{
    const u=await universo(),v=await varredura(u,{iniciada_em:T2});await expect(oferta(v)).rejects.toThrow(/anterior/);
    await finalizar(v,{aquisicao_em:T2});await expect(oferta(v,{primeiro_visto_em:T2})).rejects.toThrow(/encerrada/);
  });
  it("duas finalidades do mesmo portal/ID coexistem e não cruzam presenças",async()=>{
    const l=await cenario({finalidade:"locacao"}),v=await cenario({finalidade:"venda"});
    await oferta(l.v,{id_externo:"123"});await oferta(v.v,{id_externo:"123",finalidade:"venda"});
    expect((await consultar("select finalidade from radar_anuncios_globais where id_externo='123' order by finalidade")).rows).toEqual([{finalidade:"locacao"},{finalidade:"venda"}]);
    await expect(presenca(l.v,v.a)).rejects.toThrow(/finalidade/);await expect(presenca(v.v,l.a)).rejects.toThrow(/finalidade/);
  });
  it("tipo e geografia do recorte não fragmentam identidade global nem reescrevem primeira proveniência",async()=>{
    const a=await cenario({tipo_recorte:"apartamento"}),u=await universo({tipo_recorte:"casa",cidade:"maringa",uf:"PR"}),v=await varredura(u);
    await presenca(v,a.a,{tipo_observado:"casa",cidade_observada:"maringa"});
    expect((await consultar("select primeira_varredura_id from radar_anuncios_globais where id=$1",[a.a])).rows).toEqual([{primeira_varredura_id:a.v}]);
  });
  it.each(["aquisicao_id","aquisicao_em","origem_aquisicao","versao_aquisicao"])("aquisição definida não troca nem apaga %s",async campo=>{
    const u=await universo(),original={aquisicao_id:"cache-1",aquisicao_em:T0,origem_aquisicao:"fixture",versao_aquisicao:"v1"},v=await varredura(u,original);
    await expect(alterar("radar_varreduras",v,{[campo]:campo==="aquisicao_em"?T1:"alterado"})).rejects.toThrow(/Proveniência/);
    await expect(alterar("radar_varreduras",v,{[campo]:null})).rejects.toThrow(/Proveniência/);
  });
  it("origem antiga de cache permanece antiga ao finalizar",async()=>{
    const u=await universo(),v=await varredura(u,{aquisicao_id:"cache",aquisicao_em:T0,origem_aquisicao:"cache_fixture",versao_aquisicao:"v1"});
    const r=await finalizar(v,{aquisicao_id:"cache",aquisicao_em:T0,origem_aquisicao:"cache_fixture"});expect(r.aquisicao_em).toEqual(new Date(T0));
  });
});

describe("R6.1-B — baseline explícito",()=>{
  it.each(["amostra","universo_comprovado"])("success + %s permite baseline observacional único, sem automatismo",async cobertura=>{
    const {u,v}=await cenario();await finalizar(v,{cobertura});
    expect((await consultar("select baseline_varredura_id,baseline_concluido_em from radar_universos where id=$1",[u])).rows).toEqual([{baseline_varredura_id:null,baseline_concluido_em:null}]);
    const primeiro=await servico(()=>baseline(u,v)),retry=await servico(()=>baseline(u,v));expect(retry.rows).toEqual(primeiro.rows);expect(primeiro.rows[0].baseline_varredura_id).toBe(v);
  });
  it.each(["partial","failed","running"])("%s não forma baseline",async status=>{
    const {u,v}=await cenario();if(status!=="running")await finalizar(v,{status});await expect(baseline(u,v)).rejects.toThrow(/success terminal/);
    expect((await consultar("select baseline_varredura_id from radar_universos where id=$1",[u])).rows).toEqual([{baseline_varredura_id:null}]);
  });
  it("success com cobertura desconhecida ou zero admitidos não forma baseline",async()=>{
    const a=await cenario();await finalizar(a.v,{cobertura:"desconhecida"});await expect(baseline(a.u,a.v)).rejects.toThrow(/Cobertura/);
    const u=await universo(),v=await varredura(u);await finalizar(v);await expect(baseline(u,v)).rejects.toThrow(/vazio não autorizado/);
  });
  it("baseline do próprio universo, sem substituição ou remoção por função/DML",async()=>{
    const {u,v,a}=await cenario(),u2=await universo();await finalizar(v);
    await expect(baseline(u2,v)).rejects.toThrow(/outro universo/);
    await baseline(u,v);const v2=await varredura(u);await presenca(v2,a);await finalizar(v2);
    await expect(baseline(u,v2)).rejects.toThrow(/substituído/);
    await expect(alterar("radar_universos",u,{baseline_varredura_id:v2,baseline_concluido_em:T3})).rejects.toThrow(/substituído/);
    await expect(alterar("radar_universos",u,{baseline_varredura_id:null,baseline_concluido_em:null})).rejects.toThrow(/apagado/);
  });
  it("formação inválida não grava metade do par; versão nova começa sem baseline",async()=>{
    const {u,v}=await cenario();await expect(alterar("radar_universos",u,{baseline_varredura_id:v})).rejects.toThrow();
    const cidade=(await consultar("select cidade from radar_universos where id=$1",[u])).rows[0].cidade;
    const novo=await universo({cidade,versao_semantica:2});expect((await consultar("select baseline_varredura_id,baseline_concluido_em from radar_universos where id=$1",[novo])).rows).toEqual([{baseline_varredura_id:null,baseline_concluido_em:null}]);
  });
});

describe("R6.1-B — execução e terminalidade",()=>{
  it.each(["success","partial","failed"])("nasce running, recusa INSERT terminal %s e permite finalização explícita",async status=>{
    const u=await universo();await expect(varredura(u,{status,concluida_em:T3})).rejects.toThrow(/nascer running/);
    const v=await varredura(u);expect((await servico(()=>finalizar(v,{status}))).status).toBe(status);
  });
  it.each([{id:randomUUID()},{universo_id:randomUUID()},{chave_idempotencia:"alterada"},{iniciada_em:T1},{criado_em:T0},{iniciador:"outro"},{expira_em:"2030-01-01T00:00:00Z"}])("identidade de execução imutável %j",async dados=>{
    const u=await universo(),v=await varredura(u);await expect(alterar("radar_varreduras",v,dados)).rejects.toThrow(/imutável/);
  });
  it.each(["success","partial","failed"].flatMap(de=>["running","success","partial","failed"].filter(para=>para!==de).map(para=>({de,para}))))("terminal $de não transita para $para",async({de,para})=>{
    const {v}=await cenario();await finalizar(v,{status:de});await expect(alterar("radar_varreduras",v,{status:para,concluida_em:para==="running"?null:T3})).rejects.toThrow(/terminal imutável/);
  });
  it.each([{concluida_em:T2},{cobertura:"desconhecida"},{contagem_bruta:99},{aquisicao_id:"outro"}])("terminal congela fatos além do estado %j",async dados=>{
    const {v}=await cenario();await finalizar(v);await expect(alterar("radar_varreduras",v,dados)).rejects.toThrow(/terminal imutável/);
  });
  it("retry final idêntico é leitura, payload divergente conflita",async()=>{
    const {v}=await cenario();const r=await finalizar(v);expect(await finalizar(v)).toEqual(r);await expect(finalizar(v,{codigo_resultado:"diferente"})).rejects.toThrow(/divergente/);
  });
  it.each(["success","partial"])("%s exige aquisição completa e origem temporal válida",async status=>{
    for(const campo of ["aquisicao_id","aquisicao_em","origem_aquisicao","versao_aquisicao"]){const u=await universo(),v=await varredura(u);await expect(finalizar(v,{status,[campo]:null})).rejects.toThrow(/proveniência completa/);}
    const u=await universo(),v=await varredura(u);await expect(finalizar(v,{status,aquisicao_em:"2026-01-01T12:04:00Z"})).rejects.toThrow(/posterior/);
  });
  it("failed admite aquisição ausente e não forma baseline",async()=>{
    const u=await universo(),v=await varredura(u);await finalizar(v,{status:"failed",aquisicao_id:null,aquisicao_em:null,origem_aquisicao:null,versao_aquisicao:null,contagem_bruta:null,contagem_admitida:null});await expect(baseline(u,v)).rejects.toThrow(/success/);
  });
  it("conclusão não antecede fatos e contagem admitida corresponde às presenças únicas",async()=>{
    const {v}=await cenario();await expect(finalizar(v,{concluida_em:T1})).rejects.toThrow(/fatos observados/);
    await expect(finalizar(v,{contagem_bruta:2,contagem_admitida:2})).rejects.toThrow(/Contagens/);
  });
  it("running única e idempotência de execução permanecem por universo",async()=>{
    const u=await universo(),v=await varredura(u,{chave_idempotencia:"mesma"});
    await expect(varredura(u)).rejects.toMatchObject({code:"23505"});await finalizar(v);
    await expect(varredura(u,{chave_idempotencia:"mesma"})).rejects.toMatchObject({code:"23505"});
    await expect(varredura(await universo(),{chave_idempotencia:"mesma"})).resolves.toBeDefined();
  });
  it("expiração explícita fecha V1, libera V2 e bloqueia todos os passos do worker antigo",async()=>{
    const u=await universo(),v1=await varredura(u,{expira_em:T1});await expect(varredura(u)).rejects.toMatchObject({code:"23505"});
    const r=await servico(()=>expirar(v1));expect(r.rows[0].status).toBe("failed");expect((await expirar(v1)).rows).toEqual(r.rows);
    const v2=await varredura(u),a=await oferta(v2);
    await expect(finalizar(v1)).rejects.toThrow(/Worker expirado/);await expect(presenca(v1,a)).rejects.toThrow(/encerrada/);await expect(baseline(u,v1)).rejects.toThrow(/success/);
    await expect(alterar("radar_varreduras",v1,{status:"running",concluida_em:null})).rejects.toThrow(/terminal imutável/);
    expect((await consultar("select status from radar_varreduras where id=$1",[v2])).rows).toEqual([{status:"running"}]);
  });
  it("expiração recusa sem prazo, antes do prazo, referência futura e replay divergente",async()=>{
    const u=await universo(),v=await varredura(u);await expect(expirar(v)).rejects.toThrow(/não pode expirar/);
    const u2=await universo(),v2=await varredura(u2,{expira_em:T2});await expect(expirar(v2,T1)).rejects.toThrow(/não pode expirar/);
    await expect(expirar(v2,"2030-01-01T00:00:00Z")).rejects.toThrow(/Referência/);await expirar(v2,T3);await expect(expirar(v2,T2)).rejects.toThrow(/não pode expirar/);
  });
  it("prazo vencido ainda running não aceita finalização normal nem presença nova",async()=>{
    const x=await cenario(),u=await universo(),v=await varredura(u,{expira_em:T1});await expect(finalizar(v)).rejects.toThrow(/Worker expirado/);await expect(presenca(v,x.a)).rejects.toThrow(/expirada/);
  });
});

describe("R6.1-B — presença e payload",()=>{
  it("retry igual não duplica, aceita igualdade JSONB e mantém fatos originais",async()=>{
    const u=await universo(),v=await varredura(u),a=await oferta(v),dados={preco_observado:1000,tipo_observado:"apartamento",uf_observada:"PR",cidade_observada:"londrina",url_observada:"https://exemplo.invalid/p",dados_objetivos:{area_m2:40,quartos:2}};
    const r=await servico(()=>presenca(v,a,dados));expect(await servico(()=>presenca(v,a,{...dados,dados_objetivos:{quartos:2,area_m2:40}}))).toEqual(r);
    expect((await consultar("select count(*)::int as n from radar_presencas where varredura_id=$1",[v])).rows).toEqual([{n:1}]);
  });
  it.each([{preco_observado:2},{tipo_observado:"casa"},{uf_observada:"SP"},{cidade_observada:"maringa"},{url_observada:"https://exemplo.invalid/outro"},{observado_em:T1},{dados_objetivos:{quartos:3}}])("payload divergente rejeitado sem overwrite %j",async dados=>{
    const {v,a}=await cenario();const original=(await consultar("select * from radar_presencas where varredura_id=$1 and anuncio_global_id=$2",[v,a])).rows;
    await expect(presenca(v,a,dados)).rejects.toThrow(/Payload divergente/);expect((await consultar("select * from radar_presencas where varredura_id=$1 and anuncio_global_id=$2",[v,a])).rows).toEqual(original);
  });
  it.each(["success","partial","failed"])("nenhuma presença após terminal %s, nem retry antigo",async status=>{
    const {v,a}=await cenario();await finalizar(v,{status});await expect(presenca(v,a)).rejects.toThrow(/encerrada/);
    const outro=await cenario();await expect(presenca(v,outro.a)).rejects.toThrow(/encerrada/);
    await expect(consultar("insert into radar_presencas(varredura_id,anuncio_global_id,observado_em) values($1,$2,$3)",[v,outro.a,T2])).rejects.toThrow(/encerrada/);
  });
  it.each([{portal:"olx"},{finalidade:"venda"}])("presença recusa contexto incompatível %j",async dados=>{
    const a=await cenario(),b=await cenario(dados);await expect(presenca(a.v,b.a)).rejects.toThrow(/incompatível/);
  });
  it("presença só com oferta existente e instante não anterior à execução",async()=>{
    const u=await universo(),v=await varredura(u,{iniciada_em:T2}),a=await oferta(v,{primeiro_visto_em:T2});await expect(presenca(v,a,{observado_em:T1})).rejects.toThrow(/Instante/);await expect(presenca(v,randomUUID())).rejects.toThrow(/inexistente/);
  });
  it("partial preserva fatos positivos, primeira proveniência não é promovida por success posterior",async()=>{
    const {u,v,a}=await cenario();await finalizar(v,{status:"partial"});const v2=await varredura(u);await presenca(v2,a);await finalizar(v2);await baseline(u,v2);
    expect((await consultar("select primeira_varredura_id from radar_anuncios_globais where id=$1",[a])).rows).toEqual([{primeira_varredura_id:v}]);
    expect((await consultar("select count(*)::int as n from radar_presencas where anuncio_global_id=$1",[a])).rows).toEqual([{n:2}]);
  });
  it("histórico não aceita UPDATE de presença ou DELETE mesmo por DML de owner",async()=>{
    const {u,v,a}=await cenario();await expect(consultar("update radar_presencas set preco_observado=10 where varredura_id=$1",[v])).rejects.toThrow(/imutável/);
    for(const [t,id] of [["radar_universos",u],["radar_varreduras",v],["radar_anuncios_globais",a]])await expect(consultar("delete from "+t+" where id=$1",[id])).rejects.toThrow(/excluído/);
    await expect(consultar("delete from radar_presencas where varredura_id=$1",[v])).rejects.toThrow(/excluído/);
  });
  it("DML direto service_role não substitui primitivas mesmo com payload válido",async()=>{
    const {u,v,a}=await cenario();
    await expect(servico(()=>alterar("radar_varreduras",v,{status:"success",concluida_em:T3,aquisicao_id:"origem",aquisicao_em:T1,origem_aquisicao:"fixture",versao_aquisicao:"v1",cobertura:"amostra",codigo_resultado:"ok",contagem_bruta:1,contagem_admitida:1,paginas_lidas:1,paginas_planejadas:1}))).rejects.toMatchObject({code:"42501"});
    const b=await oferta(v);await expect(servico(()=>consultar("insert into radar_presencas(varredura_id,anuncio_global_id,observado_em) values($1,$2,$3)",[v,b,T2]))).rejects.toMatchObject({code:"42501"});
    await finalizar(v);await expect(servico(()=>alterar("radar_universos",u,{baseline_varredura_id:v,baseline_concluido_em:new Date()}))).rejects.toMatchObject({code:"42501"});
    await expect(servico(()=>alterar("radar_anuncios_globais",a,{finalidade:"venda"}))).rejects.toMatchObject({code:"42501"});
  });
});
