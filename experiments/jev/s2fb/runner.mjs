import {readFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {runCampaign,verifyHistory,verifyPrice,claim,privacyScan} from './core.mjs';
import {requests,plannedStages,sha} from '../s2f/design.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
if(process.argv.length!==3||process.argv[2]!=='--execute-authorized-s2fb')throw Error('EXECUTION_NOT_AUTHORIZED');
const json=async p=>JSON.parse(await readFile(p,'utf8')),before=await json(join(here,'preservation-before.json')),freeze=await json(join(here,'freeze.json'));
const check=async()=>{await verifyHistory(repo,before);for(const[p,h]of Object.entries(freeze.files))if(sha(await readFile(join(here,p)))!==h)throw Error('HISTORY_GATE');};
await check();
const frozenPlan=await json(join(here,'../s2f/requests-plan.json'));
assert.deepEqual(frozenPlan.stages,plannedStages);
for(const r of requests){const f=frozenPlan.requests.find(x=>x.request_id===r.request_id);assert.deepEqual(f.request,r.request);assert.equal(f.request_sha256,sha(r.body));if(/\+55|\bLD-\d|"(?:expected|rationale|oracle|golden)"\s*:/.test(r.body))throw Error('REQUEST_PRIVACY_GATE');}
const certification=await json(join(here,'certification.json'));
if(certification.existing_pass!==248||certification.runner_pass<35||certification.fail!==0||certification.network_calls!==0)throw Error('TEST_CERTIFICATION_GATE');
const pricing=await json(join(here,'pricing-verified.json'));verifyPrice(pricing);
// Somente a linha da credencial autorizada é interpretada, sem carregar variáveis no processo.
const env=await readFile(join(repo,'web/.env.local'),'utf8'),lines=env.split(/\r?\n/).filter(line=>/^\s*(?:export\s+)?Angario_teste\s*=/.test(line));
if(lines.length!==1)throw Error('JEV_KEY_MISSING_OR_AMBIGUOUS');const key=parseEnv(lines[0]).Angario_teste;
if(!key||key.trim()!==key||/\s/.test(key))throw Error('JEV_KEY_INVALID');
if(requests.some(r=>r.body.includes(key)))throw Error('REQUEST_PRIVACY_GATE');
const runId=`jev-s2f-diagnostic-${Date.now()}-${randomUUID().slice(0,8)}`,root=join(repo,'experiments/jev/results'),directory=join(root,`s2fb-${runId}`);
await claim(root,runId);await mkdir(directory,{recursive:false});
const result=await runCampaign({directory,runId,pricing,preservationCheck:check,scan:p=>privacyScan(p,[key]),pause:()=>new Promise(resolve=>setTimeout(resolve,1000)),
 send:async body=>{const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const status=response.status;await response.body?.cancel();return{status};}return{status:response.status,text:await response.text()};}});
console.log(JSON.stringify({directory,...result}));
