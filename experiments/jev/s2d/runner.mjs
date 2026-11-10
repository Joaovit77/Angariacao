import { readFile, mkdir, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { verifyHistory, verifyPrice, claim, runProbe, privacyScan } from './core.mjs';
import { materialized, sha } from './probes.mjs';

// Entrada real explícita e exclusiva deste checkpoint. Nunca importar em testes.
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
if(process.argv.length!==3 || process.argv[2]!=='--execute-authorized-s2d')throw new Error('EXECUTION_NOT_AUTHORIZED');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const preservation=await readJson(join(here,'preservation-before.json'));
await verifyHistory(repo,preservation);
const frozen=await readJson(join(here,'freeze.json'));
for(const [file,digest]of Object.entries(frozen.files))if(sha(await readFile(join(here,file)))!==digest)throw new Error('RUNNER_FREEZE_GATE');
assert.deepEqual(await readJson(join(here,'requests-frozen.json')),materialized);
const certification=await readJson(join(here,'certification.json'));
if(certification.existing_pass!==157 || certification.runner_pass!==31 || certification.fail!==0)throw new Error('TEST_CERTIFICATION_GATE');
const pricing=await readJson(join(here,'pricing-verified.json'));verifyPrice(pricing);
// Somente a variável autorizada, sem carregar o arquivo no ambiente do processo.
const envText=await readFile(join(repo,'web/.env.local'),'utf8');
const matches=envText.split(/\r?\n/).filter(line=>/^\s*(?:export\s+)?Angario_teste\s*=/.test(line));
if(matches.length!==1)throw new Error('JEV_KEY_MISSING_OR_AMBIGUOUS');
const key=parseEnv(matches[0]).Angario_teste;
if(!key || key.trim()!==key || /\s/.test(key))throw new Error('JEV_KEY_INVALID');
const runId=`jev-s2d-probdiag-${Date.now()}-${randomUUID().slice(0,8)}`;
const root=join(repo,'experiments/jev/results'),directory=join(root,`s2d-probdiag-${runId}`);
await claim(root,runId);await mkdir(directory,{recursive:false});
const summary=await runProbe({directory,runId,pricing,preservationCheck:()=>verifyHistory(repo,preservation),scan:path=>privacyScan(path,[key]),
  pause:()=>new Promise(resolve=>setTimeout(resolve,1000)),
  send:async body=>{
    const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body,redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok){const status=response.status;await response.body?.cancel();return{status};}
    return{status:response.status,text:await response.text()};
  }});
console.log(JSON.stringify({run_id:runId,directory,...summary}));
