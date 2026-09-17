import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Integração opt-in do R2: aceita somente Supabase em loopback e nunca carrega .env.local.
export default defineConfig({ ...base, test: {
  ...base.test,
  include: ["integration/radar-supabase-local.test.ts"],
  fileParallelism: false,
  testTimeout: 30_000,
  hookTimeout: 30_000,
} });
