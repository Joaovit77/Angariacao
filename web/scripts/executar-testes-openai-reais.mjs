import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const autorizado = process.env.ALLOW_REAL_OPENAI === "1";
const emCI = !!process.env.CI && !["0", "false", "no", "off"].includes(process.env.CI.toLowerCase());
const emCodex = Object.keys(process.env).some(
  (nome) => nome === "CODEX_HOME" || nome.startsWith("CODEX_"),
);

if (!autorizado) {
  console.error("BLOQUEADO: testes pagos exigem ALLOW_REAL_OPENAI=1.");
  process.exit(2);
}
if (emCI) {
  console.error("BLOQUEADO: testes reais da OpenAI nunca podem rodar em CI.");
  process.exit(2);
}
if (emCodex) {
  console.error("BLOQUEADO: testes reais da OpenAI nunca podem ser executados pelo Codex.");
  process.exit(2);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("BLOQUEADO: OPENAI_API_KEY não foi fornecida deliberadamente ao processo.");
  process.exit(2);
}

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const configuracao = fileURLToPath(new URL("../vitest.openai-real.config.ts", import.meta.url));
const resultado = spawnSync(
  process.execPath,
  [vitest, "run", "--config", configuracao, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);

if (resultado.error) throw resultado.error;
process.exit(resultado.status ?? 1);
