import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chamadaOpenAIRealAutorizada,
  criarClienteOpenAIReal,
  execucaoAutomaticaOpenAIBloqueada,
  exigirAutorizacaoOpenAIReal,
} from "@/lib/servidor/openai-real";

describe("proteção contra chamadas reais à OpenAI", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("nega teste e desenvolvimento mesmo com OPENAI_API_KEY presente", () => {
    for (const NODE_ENV of ["test", "development", undefined]) {
      const ambiente = { NODE_ENV, OPENAI_API_KEY: "chave-ficticia" };
      expect(chamadaOpenAIRealAutorizada(ambiente)).toBe(false);
      expect(() => exigirAutorizacaoOpenAIReal(ambiente)).toThrow(
        "ALLOW_REAL_OPENAI=1",
      );
    }
  });

  it("só aceita opt-in literal em ambiente local", () => {
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "development",
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

  it("no local exige chave disponível além do opt-in explícito", () => {
    vi.stubEnv("CI", "");
    for (const nome of Object.keys(process.env)) {
      if (nome === "CODEX_HOME" || nome.startsWith("CODEX_")) vi.stubEnv(nome, "");
    }
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ALLOW_REAL_OPENAI", "1");
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
    expect(() => criarClienteOpenAIReal()).not.toThrow();

    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => criarClienteOpenAIReal()).toThrow("OPENAI_API_KEY não configurada");
  });

  it("bloqueia qualquer ambiente Vercel não produtivo mesmo com chave e opt-in", () => {
    for (const VERCEL_ENV of ["preview", "development", "staging"]) {
      const ambiente = {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV,
        OPENAI_API_KEY: "chave-ficticia",
        ALLOW_REAL_OPENAI: "1",
      };
      expect(chamadaOpenAIRealAutorizada(ambiente)).toBe(false);
      expect(() => exigirAutorizacaoOpenAIReal(ambiente)).toThrow("valide localmente");
    }
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      OPENAI_API_KEY: "chave-ficticia",
      ALLOW_REAL_OPENAI: "1",
    })).toBe(false);
  });

  it("não constrói o cliente real em Preview mesmo com chave e opt-in", () => {
    vi.stubEnv("CI", "");
    for (const nome of Object.keys(process.env)) {
      if (nome === "CODEX_HOME" || nome.startsWith("CODEX_")) vi.stubEnv(nome, "");
    }
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
    vi.stubEnv("ALLOW_REAL_OPENAI", "1");

    expect(() => criarClienteOpenAIReal({ apiKey: "chave-ficticia" })).toThrow("valide localmente");
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
      OPENAI_API_KEY: "chave-ficticia",
    })).toBe(true);
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "preview",
      OPENAI_API_KEY: "chave-ficticia",
      ALLOW_REAL_OPENAI: "1",
    })).toBe(false);
    expect(chamadaOpenAIRealAutorizada({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    })).toBe(false);
  });
});
