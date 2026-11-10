import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {runCampaign,verifyHistory,verifyPrice,claim,privacyScan,plan} from './core.mjs';
import {benchmark} from '../g0/corpus.mjs';
import {sha,buildGuardRequest} from '../g0/contract.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../../..');
if(process.argv.length!==3||process.argv[2]!=='--execute-authorized-guard-g1')throw Error('EXECUTION_NOT_AUTHORIZED');
const json=async p=>JSON.parse(await readFile(p,'utf8')),before=await json(join(here,'preservation-before.json')),freeze=await json(join(here,'freeze.json'));
const check=async()=>{await verifyHistory(repo,before);for(const[p,h]of Object.entries(freeze.files))if(sha(await readFile(join(here,p)))!==h)throw Error('HISTORY_GATE');};
await check();
const g0=join(here,'../g0'),frozenRequests=await json(join(g0,'requests-frozen.json')),frozenPlan=await json(join(g0,'future-run-plan.json'));
assert.equal(plan.length,36);assert.equal(frozenRequests.requests.length,36);
for(let i=0;i<36;i++){const r=frozenRequests.requests[i],body=JSON.stringify(buildGuardRequest(benchmark[i]));assert.equal(r.case_id,`GG0-${String(i+1).padStart(2,'0')}`);assert.equal(r.stage,'validation');assert.deepEqual(r.request,buildGuardRequest(benchmark[i]));assert.equal(r.request_sha256,sha(body));assert.equal(frozenPlan.stages[i].request_sha256,sha(body));if(/\+55|\bLD-\d|"(?:expected|rationale|oracle|golden)"\s*:/.test(body))throw Error('REQUEST_PRIVACY_GATE');}
const certification=await json(join(here,'certification.json'));
if(certification.existing_pass!==401||certification.runner_pass<40||certification.total_pass!==401+certification.runner_pass||certification.fail!==0||certification.network_attempts!==0)throw Error('TEST_CERTIFICATION_GATE');
const pricing=await json(join(here,'pricing-verified.json'));verifyPrice(pricing);
// Somente a linha autorizada é interpretada; o arquivo não é carregado no ambiente do processo.
const env=await readFile(join(repo,'web/.env.local'),'utf8'),lines=env.split(/\r?\n/).filter(line=>/^\s*(?:export\s+)?Angario_teste\s*=/.test(line));
if(lines.length!==1)throw Error('JEV_KEY_MISSING_OR_AMBIGUOUS');const key=parseEnv(lines[0]).Angario_teste;
if(!key||key.trim()!==key||/\s/.test(key))throw Error('JEV_KEY_INVALID');
if(frozenRequests.requests.some(r=>JSON.stringify(r.request).includes(key)))throw Error('REQUEST_PRIVACY_GATE');
const runId=`jev-guard-g1-${Date.now()}-${randomUUID().slice(0,8)}`,root=join(repo,'experiments/jev/results'),directory=join(root,runId);
await claim(root,runId);await mkdir(directory,{recursive:false});
const evidence={g0_freeze_sha256:sha(await readFile(join(g0,'freeze.json'))),benchmark_sha256:sha(await readFile(join(g0,'benchmark.json'))),oracle_sha256:sha(await readFile(join(g0,'oracle.json'))),requests_sha256:sha(await readFile(join(g0,'requests-frozen.json'))),scorer_sha256:sha(await readFile(join(g0,'contract.mjs')))};
const result=await runCampaign({directory,runId,pricing,freezeEvidence:evidence,preservationCheck:check,scan:p=>privacyScan(p,[key]),pause:()=>new Promise(resolve=>setTimeout(resolve,1000)),
 send:async body=>{const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok){const status=response.status;await response.body?.cancel();return{status};}return{status:response.status,text:await response.text()};}});
console.log(JSON.stringify({directory,...result}));
