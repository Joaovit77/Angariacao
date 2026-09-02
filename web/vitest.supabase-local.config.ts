import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Integração opt-in: nunca carrega .env.local nem aceita host remoto.
export default defineConfig({ ...base, test: {
  ...base.test,
  include: ["integration/mercados-supabase-local.test.ts"],
  fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000,
} });
