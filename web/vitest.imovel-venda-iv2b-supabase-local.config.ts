import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Gate separado e opt-in. Nunca incluído na suíte comum; não carrega .env.local.
export default defineConfig({...base,test:{...base.test,
  include:["integration/imovel-venda-iv2b-supabase-local.test.ts"],fileParallelism:false,
  testTimeout:60_000,hookTimeout:60_000,
}});
