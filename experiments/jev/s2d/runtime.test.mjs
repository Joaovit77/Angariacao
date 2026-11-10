import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson } from '../s2b/core.mjs';
import { runProbe, guard, budget, claim, privacyScan, verifyHistory, verifyPrice, project, listArtifacts } from './core.mjs';
import { materialized, probeFreeze, plan, sha, MODEL } from './probes.mjs';
const here=dirname(fileURLToPath(import.meta.url)), repo=resolve(here,'../../..');
const price=()=>({model:MODEL,input_usd_per_million:.042,output_usd_per_million:0,maximum_request_tokens_for_reservation:65536,source:'https://docs.typesafe.ai/models',verified_at_utc:new Date().toISOString()});
const runId=()=>`jev-s2d-probdiag-${Date.now()}-${randomUUID().slice(0,8)}`;
const markers=['FAKE_SECRET_DO_NOT_LOG','Pessoa Exemplo','+5511999999999','fake-token-123','texto sintético de conversa'];
const wire=body=>{
 const r=JSON.parse(body);return {model:MODEL,answers:Object.fromEntries(Object.entries(r.questions).map(([id,q])=>{const options=Object.keys(q.criteria);return[id,{type:'choice',choice:options[0],confidence:.9,probabilities:Object.fromEntries(options.map((o,i)=>[o,i===0?1:0]))}];})),usage:{input_tokens:100,output_tokens:20}};
};
const noMarkers=async dir=>{for(const f of await listArtifacts(dir)){const text=await readFile(f,'utf8');for(const m of markers)assert.equal(text.includes(m),false,f);}};
async function setup(){const directory=await mkdtemp(join(repo,'experiments/jev/results/s2d-offline-'));return{directory,runId:runId(),pricing:price()};}

test('três requests sintéticos, seis stages únicos e repetições com bytes idênticos',()=>{
 assert.equal(materialized.length,3);assert.equal(plan.length,6);assert.equal(new Set(plan.map(s=>s.stage_id)).size,6);
 assert.deepEqual(plan.map(s=>s.stage_id),['P1/R1','P1/R2','P2/R1','P2/R2','P3/R1','P3/R2']);
 assert.deepEqual(probeFreeze.map(p=>p.question_structure.length),[1,3,12]);
 for(const p of materialized){assert.equal(sha(p.body),p.request_sha256);assert.equal(p.request.model,MODEL);assert.equal(plan.filter(s=>s.request_sha256===p.request_sha256).length,2);}
 assert.deepEqual([...new Set(probeFreeze[2].question_structure.map(q=>q.option_count))],[2,3,4]);
});
test('limite absoluto 6 bloqueia chamada 7 e estados encerrados',()=>{
 for(const started of [6,7])assert.throws(()=>guard({status:'RUNNING',stages:Array.from({length:started},()=>({attempt_id:'a',record:{usage_status:'USAGE_PRESENT',usage:{input_tokens:100,output_tokens:0}}}))}));
 assert.throws(()=>guard({status:'HOLD',stages:[]}));assert.throws(()=>guard({status:'PASS_DIAGNOSTIC',stages:[]}));
});
test('budget reserva US$0,002752512 por envio e respeita US$0,05',()=>{
 const l={status:'RUNNING',stages:[]};assert.equal(guard(l).worst_case_next_call_usd,.002752512);
 l.stages=[{attempt_id:'a',record:{usage_status:'USAGE_PRESENT',usage:{input_tokens:1125000,output_tokens:0}}}];assert.throws(()=>guard(l));
 l.stages=[{attempt_id:'a',record:null}];assert.equal(budget(l).estimated_cost_usd,null);assert.equal(budget(l).unknown_usage_reserved_usd,.002752512);assert.throws(()=>guard(l));
});
test('preço diferente ou não reconfirmado bloqueia antes do transporte',()=>{
 for(const mutation of [p=>p.input_usd_per_million=1,p=>p.output_usd_per_million=1,p=>p.model='jev-latest',p=>p.verified_at_utc='2020-01-01T00:00:00Z',p=>p.maximum_request_tokens_for_reservation=1]){const p=price();mutation(p);assert.throws(()=>verifyPrice(p));}
});
test('seis envios simulados: persistência antes do transporte, zero retry e custo conhecido',async()=>{
 const args=await setup();let calls=0;const bodies=[];
 const summary=await runProbe({...args,send:async body=>{calls++;bodies.push(body);const l=JSON.parse(await readFile(join(args.directory,'ledger.json')));assert.equal(l.stages[calls-1].status,'IN_PROGRESS');assert.ok(l.stages[calls-1].attempt_id);return{status:200,text:JSON.stringify(wire(body))};}});
 assert.equal(calls,6);assert.equal(summary.status,'PASS_DIAGNOSTIC');assert.equal(summary.structurally_valid,6);assert.equal(summary.completed_transport,6);
 assert.equal(summary.budget.input_tokens,600);assert.equal(summary.budget.output_tokens,120);assert.equal(summary.budget.estimated_cost_usd,.0000252);
 assert.equal(bodies[0],bodies[1]);assert.equal(bodies[2],bodies[3]);assert.equal(bodies[4],bodies[5]);
 const ledger=JSON.parse(await readFile(join(args.directory,'ledger.json')));assert.equal(new Set(ledger.stages.map(s=>s.attempt_id)).size,6);
 await assert.rejects(()=>runProbe({...args,send:async()=>{calls++;}}));assert.equal(calls,6);
 const names=await readdir(args.directory);for(const n of ['manifest.json','authorization.json','pricing.json','budget.json','probes-freeze.json','ledger.json','probabilities-summary.json','repetition-comparison.json','privacy-check.json','errors.json','summary.json','hashes.json'])assert.ok(names.includes(n),n);
});
test('autorização S2-D exclusiva não reutiliza o lock S2-B nem libera outro run',async()=>{
 const {directory}=await setup();await claim(directory,runId());await assert.rejects(()=>claim(directory,runId()));
 assert.deepEqual(await readdir(directory),['s2d-authorization.lock']);
});
test('projeção preserva parser, hash bruto exato e elimina extras privados antes de persistir',async()=>{
 const args=await setup();const summary=await runProbe({...args,scan:d=>privacyScan(d,markers),send:async body=>{const r=wire(body);r.secret=markers;r.chain_of_thought=markers;r.usage.debug=markers;for(const a of Object.values(r.answers))a.internal_reasoning=markers;return{status:200,text:JSON.stringify(r)};}});
 assert.equal(summary.status,'PASS_DIAGNOSTIC');await noMarkers(args.directory);
 const r=JSON.parse(await readFile(join(args.directory,'stage-results/001.json')));assert.match(r.raw_sha256,/^[a-f0-9]{64}$/);assert.equal(r.model_observed,MODEL);assert.ok(r.normalized_answers.flag.probabilities);
 const raw=JSON.stringify(wire(materialized[0].body));assert.equal(project(raw,materialized[0].request,{stage_id:'P1/R1',attempt_id:'local'}).raw_sha256,sha(raw));
});
for(const [name,mutate,code]of[
 ['soma',a=>a.probabilities[Object.keys(a.probabilities)[0]]=.8,'PROBABILITY_SUM_MISMATCH'],
 ['choice',a=>a.choice=Object.keys(a.probabilities)[1],'PROBABILITY_CHOICE_MISMATCH'],
 ['tipo',a=>a.probabilities[Object.keys(a.probabilities)[0]]=markers.join(' '),'PROBABILITY_NOT_NUMBER'],
 ['extra',a=>a.probabilities[markers.join(' ')]=0,'PROBABILITY_UNKNOWN_OPTION'],
])test(`INVALID_PROBABILITIES ${name} classificado permite continuar sem aceitar/corrigir`,async()=>{
 const args=await setup();let calls=0;const s=await runProbe({...args,scan:d=>privacyScan(d,markers),send:async body=>{calls++;const r=wire(body);mutate(Object.values(r.answers)[0]);return{status:200,text:JSON.stringify(r)};}});
 assert.equal(calls,6);assert.equal(s.status,'PASS_DIAGNOSTIC');assert.equal(s.invalid_probabilities,6);assert.equal(s.classified_diagnostics,6);assert.equal(s.structurally_valid,0);
 const r=JSON.parse(await readFile(join(args.directory,'stage-results/001.json')));assert.equal(r.diagnostic_subcode,code);assert.equal(r.parser_status,'INVALID_RESPONSE');assert.equal(r.normalized_answers,null);assert.equal(r.diagnostic.stage_id,'P1/R1');await noMarkers(args.directory);
});
test('modelo diferente preserva evidência e para no primeiro envio',async()=>{
 const args=await setup();let calls=0;const s=await runProbe({...args,send:async body=>{calls++;const r=wire(body);r.model='jev-1.13.0';return{status:200,text:JSON.stringify(r)};}});
 assert.equal(calls,1);assert.equal(s.status,'HOLD');assert.equal(s.halt_reason,'MODEL_MISMATCH_GATE');
 const r=JSON.parse(await readFile(join(args.directory,'stage-results/001.json')));assert.equal(r.model_observed,'jev-1.13.0');
});
test('usage ausente não vira zero e impede segundo envio',async()=>{
 const args=await setup();let calls=0;const s=await runProbe({...args,send:async body=>{calls++;const r=wire(body);delete r.usage;return{status:200,text:JSON.stringify(r)};}});
 assert.equal(calls,1);assert.equal(s.status,'HOLD');assert.equal(s.halt_reason,'USAGE_GATE');assert.equal(s.budget.input_tokens,null);assert.equal(s.budget.estimated_cost_usd,null);
});
test('usage inválido ou acima da reserva impede próximo envio',async()=>{
 for(const usage of [{input_tokens:'1',output_tokens:1},{input_tokens:65537,output_tokens:1}]){const args=await setup();let calls=0;const s=await runProbe({...args,send:async body=>{calls++;const r=wire(body);r.usage=usage;return{status:200,text:JSON.stringify(r)};}});assert.equal(calls,1);assert.equal(s.status,'HOLD');}
});
for(const status of [401,403,429,500,529])test(`HTTP ${status} consome tentativa e para sem retry nem corpo bruto`,async()=>{
 const args=await setup();let calls=0;const s=await runProbe({...args,send:async()=>{calls++;return{status,text:markers.join(' ')};}});
 assert.equal(calls,1);assert.equal(s.operational_errors,1);assert.equal(s.status,'HOLD');await noMarkers(args.directory);
});
test('exceção DNS/TLS/timeout não persiste message e nunca reenvia',async()=>{
 const args=await setup();let calls=0;const s=await runProbe({...args,send:async()=>{calls++;throw new Error(markers.join(' '));}});
 assert.equal(calls,1);assert.equal(s.operational_errors,1);assert.equal(s.status,'HOLD');await noMarkers(args.directory);
});
test('transporte vazio é operacional e para',async()=>{
 const args=await setup();const s=await runProbe({...args,send:async()=>({status:200,text:''})});assert.equal(s.started_calls,1);assert.equal(s.operational_errors,1);assert.equal(s.status,'HOLD');
});
for(const [name,change]of[['json',()=>'{'],['enum',r=>{r.answers.flag.choice='UNKNOWN';return JSON.stringify(r);}],['duplicata',r=>JSON.stringify(r).replace('"choice":"YES"','"choice":"YES","choice":"NO"')]])test(`erro estrutural ${name} fora da categoria estudada para sem retry`,async()=>{
 const args=await setup();let calls=0;const s=await runProbe({...args,send:async body=>{calls++;return{status:200,text:change(wire(body))};}});
 assert.equal(calls,1);assert.equal(s.status,'HOLD');assert.equal(s.unclassified_structural,1);
});
test('crash antes do transporte conserva IN_PROGRESS, consome reserva e não retoma',async()=>{
 const args=await setup();let calls=0;const send=async()=>{calls++;};const s=await runProbe({...args,send,hooks:{afterBegin:()=>{throw new Error('crash');}}});
 assert.equal(calls,0);assert.equal(s.status,'HOLD');assert.equal(s.budget.usage_unknown_calls,1);
 const l=JSON.parse(await readFile(join(args.directory,'ledger.json')));assert.equal(l.stages[0].status,'IN_PROGRESS');await assert.rejects(()=>runProbe({...args,send}));assert.equal(calls,0);
});
test('crash depois do transporte não repete tentativa nem grava raw transitório',async()=>{
 const args=await setup();let calls=0;const send=async body=>{calls++;return{status:200,text:JSON.stringify({...wire(body),secret:markers})};};
 const s=await runProbe({...args,send,hooks:{afterTransport:()=>{throw new Error('crash');}}});assert.equal(calls,1);assert.equal(s.status,'HOLD');await noMarkers(args.directory);
 await assert.rejects(()=>runProbe({...args,send}));assert.equal(calls,1);
});
test('falha de persistência antes do envio impede transporte',async()=>{
 const args=await setup();let calls=0;await assert.rejects(()=>runProbe({...args,send:async()=>{calls++;},persist:async()=>{throw new Error('falha');}}));assert.equal(calls,0);
});
test('escrita atômica mantém snapshot anterior quando rename não ocorre',async()=>{
 const {directory}=await setup(), path=join(directory,'atomic.json');await atomicJson(path,{value:1});
 await assert.rejects(()=>atomicJson(path,{value:2},()=>{throw new Error('crash');}));assert.deepEqual(JSON.parse(await readFile(path)),{value:1});
});
test('detecção de secret ou histórico alterado bloqueia o próximo HTTP',async()=>{
 for(const type of ['privacy','history']){const args=await setup();let calls=0,checks=0;const s=await runProbe({...args,send:async body=>{calls++;return{status:200,text:JSON.stringify(wire(body))};},
  preservationCheck:async()=>{if(type==='history'&&++checks===2)throw new Error('HISTORY_GATE');},scan:async()=>{if(type==='privacy')throw new Error('PRIVACY_GATE');return{status:'PASS'};}}).catch(()=>({status:'HOLD'}));assert.equal(s.status,'HOLD');assert.ok(calls<=1);}
});
test('S0/S1/S2-A/S2-B/S2-C e locks históricos preservados',async()=>{
 await verifyHistory(repo,JSON.parse(await readFile(join(here,'preservation-before.json'))));
});
test('runner de testes não importa transporte real nem credenciais',async()=>{
 const text=await readFile(join(here,'core.mjs'),'utf8');assert.equal(/\bfetch\s*\(|process\.env|\.env\.local|Bearer/.test(text),false);
});
