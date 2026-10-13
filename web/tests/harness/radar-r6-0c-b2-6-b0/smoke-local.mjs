import { readFileSync, openSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
const raiz=resolve(import.meta.dirname,"../../..");
const log=readFileSync(resolve(raiz,"node_modules/.cache/radar-b0-start.log"),"utf8");
const local=JSON.parse(log.split(/\r?\n/).find(l=>l.startsWith('{"DB_URL"')));
if(local.API_URL!=="http://127.0.0.1:56221")throw Error("Stack local inesperada");
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:"",OPENAI_API_KEY:"",FIRECRAWL_API_KEY:"",ALLOW_REAL_OPENAI:"0",B0_LOCAL_URL:local.API_URL,B0_LOCAL_ANON:local.ANON_KEY,B0_LOCAL_SMOKE:"DESCARTAVEL"};
const preparo=spawnSync(process.execPath,["tests/harness/radar-r6-0c-b2-6-b0/preparar-local.mjs"],{cwd:raiz,stdio:"inherit",windowsHide:true});
if(preparo.status!==0)throw Error("Falha ao preparar banco descartável");
const out=openSync(resolve(raiz,"node_modules/.cache/b0-next.log"),"w");
const next=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","56230"],{cwd:raiz,env,stdio:["ignore",out,out],windowsHide:true});
try{
 for(let i=0;i<90;i++){try{await fetch("http://127.0.0.1:56230");break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 const p=spawn(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.radar-b0-local.config.ts","--maxWorkers=1"],{cwd:raiz,env,stdio:"inherit",windowsHide:true});
 process.exitCode=await new Promise(r=>p.on("exit",r));
}finally{
 if(process.platform==="win32")spawnSync("taskkill",["/pid",String(next.pid),"/t","/f"],{stdio:"ignore",windowsHide:true});
 else next.kill();
}
