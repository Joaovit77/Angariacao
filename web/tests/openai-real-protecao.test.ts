import { describe, expect, it } from "vitest";
import {
  chamadaOpenAIRealAutorizada,
  execucaoAutomaticaOpenAIBloqueada,
  exigirAutorizacaoOpenAIReal,
} from "@/lib/servidor/openai-real";

describe("proteção contra chamadas reais à OpenAI", () => {
  it("nega teste e desenvolvimento mesmo com OPENAI_API_KEY presente", () => {
    for (const NODE_ENV of ["test", "development", undefined]) {
      const ambiente = { NODE_ENV, OPENAI_API_KEY: "chave-ficticia" };
      expect(chamadaOpenAIRealAutorizada(ambiente)).toBe(false);
      expect(() => exigirAutorizacaoOpenAIReal(ambiente)).toThrow(
        "ALLOW_REAL_OPENAI=1",
      );
    }
  });

  it("só aceita opt-in literal em ambiente não produtivo", () => {
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "test",
      OPENAI_API_KEY: "chave-ficticia",
      ALLOW_REAL_OPENAI: "1",
    })).toBe(true);
    for (const valor of ["", "true", "TRUE", "yes", "0"]) {
      expect(chamadaOpenAIRealAutorizada({
        NODE_ENV: "development",
        OPENAI_API_KEY: "chave-ficticia",
        ALLOW_REAL_OPENAI: valor,
      })).toBe(false);
    }
  });

  it("bloqueia CI e Codex mesmo quando o opt-in está presente", () => {
    const ambientes = [
      { NODE_ENV: "test", ALLOW_REAL_OPENAI: "1", CI: "true" },
      { NODE_ENV: "development", ALLOW_REAL_OPENAI: "1", CODEX_THREAD_ID: "teste" },
      { NODE_ENV: "production", CODEX_SESSION_ID: "teste" },
    ];
    for (const ambiente of ambientes) {
      expect(execucaoAutomaticaOpenAIBloqueada(ambiente)).toBe(true);
      expect(chamadaOpenAIRealAutorizada(ambiente)).toBe(false);
    }
  });

  it("não confunde NODE_ENV=production local com Production real", () => {
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      OPENAI_API_KEY: "chave-ficticia",
    })).toBe(false);
  });

  it("reconhece automaticamente somente Production real da Vercel", () => {
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
    })).toBe(true);
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
    })).toBe(false);
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    })).toBe(false);
  });
});
