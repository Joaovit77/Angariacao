import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({test:{include:["integration/radar-b0-ofertas-local.test.ts"],environment:"node",testTimeout:30000},resolve:{alias:{"@":fileURLToPath(new URL(".",import.meta.url))}}});
