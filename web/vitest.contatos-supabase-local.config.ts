import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Integração opt-in da Fase 1a (contatos): nunca carrega .env.local nem aceita host remoto.
export default defineConfig({ ...base, test: {
  ...base.test,
  include: ["integration/contatos-supabase-local.test.ts"],
  fileParallelism: false,
  testTimeout: 30_000,
  hookTimeout: 30_000,
} });
