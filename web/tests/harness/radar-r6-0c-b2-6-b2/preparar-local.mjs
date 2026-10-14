import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const raiz = resolve(import.meta.dirname, "../../../..");
if (process.env.B2_LOCAL_SMOKE !== "DESCARTAVEL") throw Error("Preparação exige opt-in descartável B2.");
const executar = sql => execFileSync("docker", ["exec", "-i", "supabase_db_radar-b2-local", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], {
  input: sql, encoding: "utf8", windowsHide: true, maxBuffer: 15 * 1024 * 1024,
});
// Nome fixo exclusivo da stack B2; não aceita URL, container ou SQL remoto.
const arquivos = readdirSync(resolve(raiz, "supabase/migrations")).filter(n => n.endsWith(".sql")).sort();
if (arquivos.length !== 83 || arquivos.at(-1) !== "20261011203141_radar_ofertas_por_finalidade.sql") throw Error("Base de migrations inesperada.");
let log = executar("drop schema public cascade; drop schema if exists private cascade; create schema public; grant usage on schema public to anon,authenticated,service_role;");
const base = "20260828115824_assistente_status_sem_resposta_em_lote.sql";
for (const nome of arquivos.filter(n => n >= base)) {
  log += nome + "\n" + executar(readFileSync(resolve(raiz, "supabase/migrations", nome), "utf8"));
}
writeFileSync(resolve(raiz, "web/node_modules/.cache/b2/schema.log"), log);
console.log("Schema equivalente às 83 migrations reconstruído somente na stack B2.");
