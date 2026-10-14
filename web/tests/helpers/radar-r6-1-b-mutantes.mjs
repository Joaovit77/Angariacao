// Ensaio local de mutantes R6.1-B: escreve somente em scratch temporário, nunca no worktree.
// Cada mutação precisa ser rejeitada por um teste comportamental específico, além do exit != 0.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const raiz=fileURLToPath(new URL("../../../",import.meta.url));
const nomeA="20261014111445_radar_r6_1_fundacao_global_ofertas.sql";
const nomeB="20261014130154_radar_r6_1_b_invariantes_globais.sql";
const relativoB="supabase/migrations/"+nomeB;
const teste="web/tests/radar-r6-1-b-invariantes-globais.test.ts";
const caminhos=[relativoB,"supabase/migrations/"+nomeA,"supabase-schema.sql",teste,"web/vitest.config.ts","web/package.json"];
const hash=b=>createHash("sha256").update(b).digest("hex");
const antes=Object.fromEntries(caminhos.map(p=>[p,hash(fs.readFileSync(path.join(raiz,p)))]));
const original=fs.readFileSync(path.join(raiz,relativoB),"utf8").replace(/\r\n/g,"\n");
const schema=fs.readFileSync(path.join(raiz,"supabase-schema.sql"),"utf8").replace(/\r\n/g,"\n");
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"radar-r61b-mutantes-"));
for(const p of caminhos){fs.mkdirSync(path.dirname(path.join(scratch,p)),{recursive:true});fs.copyFileSync(path.join(raiz,p),path.join(scratch,p));}
fs.symlinkSync(path.join(raiz,"web/node_modules"),path.join(scratch,"web/node_modules"),process.platform==="win32"?"junction":"dir");
function trocar(s,de,para){if(s.split(de).length!==2)throw Error("Alvo de mutação não é único: "+de.slice(0,70));return s.replace(de,()=>para);}
function funcao(s,n,transformar){const inicio=s.indexOf("create function radar_integridade."+n+"("),fim=s.indexOf("$$;",inicio)+3;if(inicio<0||fim<3)throw Error("Função ausente "+n);return s.slice(0,inicio)+transformar(s.slice(inicio,fim))+s.slice(fim);}
const terminal="  if old.status <> 'running' then\n    if new is distinct from old then raise exception 'Varredura terminal imutável'; end if;\n    return new;\n  end if;";
const proveniencia="  if (old.aquisicao_id is not null and new.aquisicao_id is distinct from old.aquisicao_id)\n    or (old.aquisicao_em is not null and new.aquisicao_em is distinct from old.aquisicao_em)\n    or (old.origem_aquisicao is not null and new.origem_aquisicao is distinct from old.origem_aquisicao)\n    or (old.versao_aquisicao is not null and new.versao_aquisicao is distinct from old.versao_aquisicao)\n    then raise exception 'Proveniência de aquisição imutável depois de definida'; end if;";
const mutantes=[
 {id:"01-finalidade-oferta-mutavel",alvo:"oferta imutável",mudar:s=>funcao(s,"proteger_oferta",f=>trocar(trocar(f,"new.portal,new.finalidade,new.id_externo","new.portal,new.id_externo"),"old.portal,old.finalidade,old.id_externo","old.portal,old.id_externo"))},
 {id:"02-baseline-substituivel",alvo:"baseline do próprio universo",mudar:s=>funcao(s,"proteger_universo",f=>trocar(f,"  if old.baseline_varredura_id is not null and row(new.baseline_varredura_id,new.baseline_concluido_em)\n    is distinct from row(old.baseline_varredura_id,old.baseline_concluido_em)\n    then raise exception 'Baseline não pode ser substituído ou apagado'; end if;",""))},
 {id:"03-partial-baseline",alvo:"partial não forma baseline",mudar:s=>funcao(s,"validar_baseline",f=>trocar(f,"v.status <> 'success'","v.status not in ('success','partial')"))},
 {id:"04-failed-baseline",alvo:"failed não forma baseline",mudar:s=>funcao(s,"validar_baseline",f=>trocar(f,"v.status <> 'success'","v.status not in ('success','failed')"))},
 {id:"05-presenca-terminal",alvo:"nenhuma presença após terminal",mudar:s=>funcao(s,"exigir_running",f=>trocar(f,"  if v.status <> 'running' then raise exception 'Varredura encerrada'; end if;",""))},
 {id:"06-portal-incompativel",alvo:"presença recusa contexto incompatível",mudar:s=>funcao(s,"proteger_presenca",f=>trocar(f,"a.portal <> u.portal or a.finalidade <> u.finalidade","a.finalidade <> u.finalidade"))},
 {id:"07-finalidade-incompativel",alvo:"duas finalidades do mesmo portal/ID",mudar:s=>funcao(s,"proteger_presenca",f=>trocar(f,"a.portal <> u.portal or a.finalidade <> u.finalidade","a.portal <> u.portal"))},
 {id:"08-terminal-reabre",alvo:"terminal",mudar:s=>funcao(s,"proteger_varredura",f=>trocar(f,terminal,""))},
 {id:"09-worker-expirado-finaliza",alvo:"expiração explícita fecha V1",mudar:s=>{
   s=funcao(s,"finalizar_varredura",f=>trocar(trocar(f,"  if v.codigo_resultado='execucao_expirada' then raise exception 'Worker expirado não pode finalizar'; end if;",""),"if v.status <> 'running' then","if v.status <> 'running' and v.codigo_resultado is distinct from 'execucao_expirada' then"));
   return funcao(s,"proteger_varredura",f=>trocar(trocar(f,"if old.status <> 'running' then","if old.status <> 'running' and old.codigo_resultado is distinct from 'execucao_expirada' then"),"elsif old.expira_em is not null and old.expira_em <= pg_catalog.clock_timestamp() then","elsif old.status = 'running' and old.expira_em is not null and old.expira_em <= pg_catalog.clock_timestamp() then"));
 }},
 {id:"10-payload-overwrite",alvo:"payload divergente rejeitado sem overwrite",mudar:s=>{
   s=funcao(s,"proteger_presenca",f=>trocar(f,"if tg_op <> 'INSERT' then raise exception 'Presença imutável'; end if;","if tg_op <> 'INSERT' then return new; end if;"));
   return funcao(s,"registrar_presenca",f=>trocar(f,"then raise exception 'Payload divergente da presença'; end if;","then\n      update public.radar_presencas set observado_em=p_observado_em,preco_observado=p_preco,tipo_observado=p_tipo,uf_observada=p_uf,cidade_observada=p_cidade,url_observada=p_url,dados_objetivos=p_dados where varredura_id=p_varredura and anuncio_global_id=p_anuncio returning * into existente;\n    end if;"));
 }},
 {id:"11-last-seen-regressivo",alvo:"última observação não regressiva",mudar:s=>funcao(s,"proteger_oferta",f=>trocar(f,"    if new.ultimo_visto_em < old.ultimo_visto_em then raise exception 'Última observação não pode regredir'; end if;",""))},
 {id:"12-dml-direto-bypass",alvo:"DML direto service_role não substitui primitivas",mudar:s=>trocar(s,"revoke update (concluida_em,status,expira_em,aquisicao_id,aquisicao_em,origem_aquisicao,versao_aquisicao,\n  cobertura,codigo_resultado,contagem_bruta,contagem_admitida,paginas_lidas,paginas_planejadas)\n  on public.radar_varreduras from service_role;","")},
 {id:"13-zero-baseline",alvo:"success com cobertura desconhecida ou zero",mudar:s=>funcao(s,"validar_baseline",f=>trocar(f,"v.contagem_admitida is null or v.contagem_admitida <= 0","v.contagem_admitida is null"))},
 {id:"14-aquisicao-reescrita",alvo:"aquisição definida não troca nem apaga",mudar:s=>funcao(s,"proteger_varredura",f=>trocar(f,proveniencia,""))},
 {id:"15-primeira-proveniencia-portal",alvo:"primeira proveniência recusa contexto incompatível",mudar:s=>funcao(s,"proteger_oferta",f=>trocar(f,"new.portal <> u.portal or new.finalidade <> u.finalidade","new.finalidade <> u.finalidade"))},
 {id:"16-presenca-mutavel",alvo:"histórico não aceita UPDATE de presença",mudar:s=>funcao(s,"proteger_presenca",f=>trocar(f,"if tg_op <> 'INSERT' then raise exception 'Presença imutável'; end if;","if tg_op <> 'INSERT' then return new; end if;"))},
];
const env={...process.env,ALLOW_REAL_OPENAI:"0",NEXT_TELEMETRY_DISABLED:"1"};for(const k of Object.keys(env))if(/OPENAI|FIRECRAWL|RAPIDAPI|SOPHIA|WHATSAPP|SUPABASE|DATABASE_URL|POSTGRES|CRON_SECRET|AUTH_TOKEN/i.test(k)&&k!=="ALLOW_REAL_OPENAI")delete env[k];
const resultados=[];
function executar(id,sql,alvo){
 fs.writeFileSync(path.join(scratch,relativoB),sql);
 fs.writeFileSync(path.join(scratch,"supabase-schema.sql"),trocar(schema,original.trimEnd(),sql.trimEnd()));
 const json=path.join(scratch,id+".json"),inicio=performance.now();
 const r=spawnSync(process.execPath,[path.join(scratch,"web/node_modules/vitest/vitest.mjs"),"run","tests/radar-r6-1-b-invariantes-globais.test.ts","--maxWorkers=1","--no-file-parallelism","--retry=0","--reporter=json","--outputFile="+json],{cwd:path.join(scratch,"web"),env,encoding:"utf8",maxBuffer:32*1024*1024});
 fs.writeFileSync(path.join(scratch,id+".log"),(r.stdout??"")+(r.stderr??"")+(r.error?.stack??""));
 const j=fs.existsSync(json)?JSON.parse(fs.readFileSync(json,"utf8")):null;
 const falhas=j?.testResults.flatMap(t=>t.assertionResults.filter(a=>a.status==="failed").map(a=>({teste:a.fullName,erros:a.failureMessages})))??[];
 const morto=id!=="controle"&&r.status!==0&&falhas.some(f=>f.teste.includes(alvo));
 const registro={id,exitCode:r.status,total:j?.numTotalTests,passaram:j?.numPassedTests,falharam:j?.numFailedTests,duracaoMs:Math.round(performance.now()-inicio),alvo,morto,falhas};resultados.push(registro);
 fs.writeFileSync(path.join(scratch,"resultado.json"),JSON.stringify({scratch,resultados},null,2));
 console.log(JSON.stringify({id,exitCode:r.status,passaram:registro.passaram,falharam:registro.falharam,morto,alvo}));
 if(id==="controle"?r.status!==0||j?.numFailedTests!==0:!morto)throw Error("Controle falhou ou mutante sobreviveu: "+id);
}
let sucesso=false;
try {executar("controle",original,"");for(const m of mutantes){const sql=m.mudar(original);if(sql===original)throw Error("Mutante vazio "+m.id);executar(m.id,sql,m.alvo);}sucesso=true;}
finally {
 fs.writeFileSync(path.join(scratch,relativoB),original);fs.writeFileSync(path.join(scratch,"supabase-schema.sql"),schema);
 for(const p of caminhos)if(hash(fs.readFileSync(path.join(raiz,p)))!==antes[p])throw Error("Worktree alterado: "+p);
 fs.writeFileSync(path.join(scratch,"resultado.json"),JSON.stringify({scratch,sucesso,planejados:mutantes.length,mortos:resultados.filter(r=>r.morto).length,worktreeIntacto:true,scratchRestaurado:true,resultados},null,2));
 console.log("Evidências dos mutantes: "+path.join(scratch,"resultado.json"));
}
