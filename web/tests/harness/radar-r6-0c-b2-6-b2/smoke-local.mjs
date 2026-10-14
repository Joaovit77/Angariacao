import { readFileSync, openSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
const web = resolve(import.meta.dirname, "../../..");
const local = JSON.parse(readFileSync(resolve(web, "node_modules/.cache/b2/local.json"), "utf8").replace(/^\uFEFF/, ""));
if (local.API_URL !== "http://127.0.0.1:56421") throw Error("Stack B2 inesperada.");
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "fixture-local-sem-credito", RAPIDAPI_KEY: "", ALLOW_REAL_OPENAI: "0",
  B2_LOCAL_URL: local.API_URL, B2_LOCAL_ANON: local.ANON_KEY, B2_LOCAL_SMOKE: "DESCARTAVEL" };
const preparo = spawnSync(process.execPath, ["tests/harness/radar-r6-0c-b2-6-b2/preparar-local.mjs"], { cwd: web, env, stdio: "inherit", windowsHide: true });
if (preparo.status !== 0) throw Error("Falha na preparação B2.");
const log = openSync(resolve(web, "node_modules/.cache/b2/next.log"), "w");
const next = spawn(process.execPath, ["--import", "./tests/harness/radar-r6-0c-b2-6-b2/transporte-local.mjs", "node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "56430"], { cwd: web, env, stdio: ["ignore", log, log], windowsHide: true });
try {
  let pronto = false;
  for (let i = 0; i < 60; i++) {
    try { await fetch("http://127.0.0.1:56430"); pronto = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  if (!pronto) throw Error("Next B2 não iniciou.");
  const teste = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.radar-b2-local.config.ts", "--maxWorkers=1", "--reporter=json", "--outputFile=node_modules/.cache/b2/smoke.json"], { cwd: web, env, stdio: "inherit", windowsHide: true });
  process.exitCode = await new Promise(r => teste.on("exit", r));
} finally {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(next.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  else next.kill();
}
