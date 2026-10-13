import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const raiz=resolve(import.meta.dirname,"../../../..");
const container="supabase_db_radar-b0-local";
const executar=(sql)=> {
  const r=spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-X","-v","ON_ERROR_STOP=1"],{input:sql,encoding:"utf8",maxBuffer:10*1024*1024,windowsHide:true});
  if(r.status!==0)throw Error(r.stderr.slice(-2000));return r.stdout+r.stderr;
};
// Exclusivamente a stack descartável B0, sem parâmetros remotos.
let log=executar("drop schema public cascade; drop schema if exists private cascade; create schema public; grant usage on schema public to anon,authenticated,service_role;");
const base="20260828115824_assistente_status_sem_resposta_em_lote.sql";
const nomes=[base,...readdirSync(resolve(raiz,"supabase/migrations")).sort().filter(n=>n>base && n<"20261011000000" && n.endsWith(".sql"))];
for(const nome of nomes)log+=nome+"\n"+executar(readFileSync(resolve(raiz,"supabase/migrations",nome)));
writeFileSync(resolve(raiz,"web/node_modules/.cache/b0-schema-before.log"),log);
console.log(`Base anterior reconstruída: baseline histórico + ${nomes.length-1} migrations posteriores.`);
