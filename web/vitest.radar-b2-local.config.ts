import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  test: { include: ["integration/radar-b2-venda-local.test.ts"], environment: "node", testTimeout: 60000 },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
