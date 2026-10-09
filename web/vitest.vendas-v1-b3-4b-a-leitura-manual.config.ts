import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Execução humana explícita: somente GET, sem carregar .env.local. */
export default defineConfig({
  test: { include: ["integration/vendas-v1-b3-4b-a-leitura-manual.test.ts"], environment: "node", testTimeout: 30000 },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
