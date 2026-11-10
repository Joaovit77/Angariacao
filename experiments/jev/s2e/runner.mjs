import{readFile,mkdir}from'node:fs/promises';import{join,dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';import{randomUUID}from'node:crypto';import{parseEnv}from'node:util';import assert from'node:assert/strict';
import{runCampaign,verifyHistory,verifyPrice,claim,privacyScan}from'./core.mjs';import{requests,scenarios,qualityRules,sha}from'./scenarios.mjs';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(here,'../../..');
if(process.argv.length!==3||process.argv[2]!=='--execute-authorized-s2e')throw new Error('EXECUTION_NOT_AUTHORIZED');
const json=async p=>JSON.parse(await readFile(p,'utf8')),before=await json(join(here,'preservation-before.json')),freeze=await json(join(here,'freeze.json'));
const check=async()=>{await verifyHistory(repo,before);for(const[f,d]of Object.entries(freeze.files))if(sha(await readFile(join(here,f)))!==d)throw new Error('HISTORY_GATE');};
await check();assert.deepEqual(await json(join(here,'requests-frozen.json')),requests);assert.deepEqual(await json(join(here,'oracle-mini.json')),{scenarios,quality_rules:qualityRules});
const certification=await json(join(here,'certification.json'));if(certification.existing_pass!==188||certification.runner_pass!==26||certification.fail!==0)throw new Error('TEST_CERTIFICATION_GATE');
const pricing=await json(join(here,'pricing-verified.json'));verifyPrice(pricing);
// Extrair somente a variável JEV autorizada, sem carregar o arquivo no ambiente.
const env=await readFile(join(repo,'web/.env.local'),'utf8'),lines=env.split(/\r?\n/).filter(line=>/^\s*(?:export\s+)?Angario_teste\s*=/.test(line));
if(lines.length!==1)throw new Error('JEV_KEY_MISSING_OR_AMBIGUOUS');const key=parseEnv(lines[0]).Angario_teste;if(!key||key.trim()!==key||/\s/.test(key))throw new Error('JEV_KEY_INVALID');
const runId=`jev-s2e-semantic-${Date.now()}-${randomUUID().slice(0,8)}`,root=join(repo,'experiments/jev/results'),directory=join(root,`s2e-${runId}`);
await claim(root,runId);await mkdir(directory,{recursive:false});
const result=await runCampaign({directory,runId,pricing,preservationCheck:check,scan:p=>privacyScan(p,[key]),pause:()=>new Promise(resolve=>setTimeout(resolve,1000)),
 send:async body=>{const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok){const status=response.status;await response.body?.cancel();return{status};}return{status:response.status,text:await response.text()};}});
console.log(JSON.stringify({directory,...result}));
