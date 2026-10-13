import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const raiz = resolve(import.meta.dirname, "../../..");
const migration = "../supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql";
const calc = "lib/calculo/comparaveisMercado.ts";
const obs = "tests/fixtures/bancoOfertasMercado.ts";
const originais = new Map([migration,calc,obs].map(p=>[p,readFileSync(resolve(raiz,p),"utf8")]));
const restaurar=()=>{for(const [p,s] of originais)writeFileSync(resolve(raiz,p),s);};
for(const sinal of ["SIGINT","SIGTERM"])process.on(sinal,()=>{restaurar();process.exit(130);});
const mutantes = [
  ["Lookup ignora finalidade",migration,"    and c.finalidade = v_finalidade\n", ""],
  ["Fingerprint da oferta ignora finalidade",calc,'${sinais.finalidade ?? "locacao"}',"finalidade-ignorada"],
  ["Venda sobrescreve Locação",migration,"where c.id = v_id and c.user_id = v_user_id;", "where c.id = case when v_finalidade = 'venda' then (select outro.id from public.comparaveis_mercado outro where outro.user_id = v_user_id and outro.finalidade = 'locacao' and outro.id_externo = p_dados->>'id_externo' limit 1) else v_id end and c.user_id = v_user_id;"],
  ["Locação sobrescreve Venda",migration,"where c.id = v_id and c.user_id = v_user_id;", "where c.id = case when v_finalidade = 'locacao' then (select outro.id from public.comparaveis_mercado outro where outro.user_id = v_user_id and outro.finalidade = 'venda' and outro.id_externo = p_dados->>'id_externo' limit 1) else v_id end and c.user_id = v_user_id;"],
  ["Observação vinculada à oferta errada",obs,'const schema = ler("supabase-schema.sql");', 'const schema = ler("supabase-schema.sql").replace("new.id, new.user_id", "(select id from public.comparaveis_mercado where user_id = new.user_id order by primeiro_visto_em, id limit 1), new.user_id");'],
  ["Reobservação duplica",migration,"  if v_id is null then", "  v_id := null;\n  if v_id is null then"],
  ["user_id forjado prevalece",migration,"v_user_id uuid := (select auth.uid());", "v_user_id uuid := coalesce(nullif(p_dados->>'user_id','')::uuid, (select auth.uid()));"],
  ["Conflito de finalidade é aceito",migration,"    raise exception 'Finalidade observada incompatível com a oferta.' using errcode = '22023';", "    null;"],
];
const executar=()=>spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run","tests/ofertas-mercado-finalidade.test.ts","--maxWorkers=1"],{cwd:raiz,encoding:"utf8",timeout:60000,windowsHide:true,env:{...process.env,OPENAI_API_KEY:"",FIRECRAWL_API_KEY:"",ALLOW_REAL_OPENAI:"0"}});
const resultados=[];
try {
 const controle=executar();if(controle.status!==0)throw Error(controle.stdout+controle.stderr);
 for(const [nome,p,de,para] of mutantes){restaurar();const s=originais.get(p);if(!s.includes(de))throw Error('Alvo ausente: '+nome);writeFileSync(resolve(raiz,p),s.replace(de,()=>para));const r=executar();const morto=r.status===1 && /AssertionError/.test(r.stdout+r.stderr);resultados.push({nome,morto});console.log((morto?'MORTO: ':'SOBREVIVEU: ')+nome);if(!morto)console.log(r.stdout+r.stderr);}
 mkdirSync(resolve(raiz,"node_modules/.cache"),{recursive:true});writeFileSync(resolve(raiz,"node_modules/.cache/b0-mutantes.json"),JSON.stringify(resultados,null,2));if(resultados.some(r=>!r.morto))process.exitCode=1;
} finally {restaurar();}
