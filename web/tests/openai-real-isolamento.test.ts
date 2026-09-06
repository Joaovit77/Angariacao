import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WEB = new URL("../", import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, WEB), "utf8");

describe("isolamento estrutural dos testes reais da OpenAI", () => {
  it("mantém testes reais fora do padrão descoberto por npm test", () => {
    const reais = readdirSync(new URL("tests-real-openai/", WEB));
    expect(reais).toEqual(expect.arrayContaining([
      "ia-auditor-semantico.openai-real.ts",
      "ia-atendimento-comparacao.openai-real.ts",
      "ia-atendimento-reproducao.openai-real.ts",
    ]));
    expect(reais.some((arquivo) => arquivo.endsWith(".test.ts"))).toBe(false);

    const configuracaoComum = ler("vitest.config.ts");
    expect(configuracaoComum).toContain('include: ["tests/**/*.test.ts"]');
    expect(configuracaoComum).toContain('exclude: ["tests-real-openai/**"');
  });

  it("usa runner separado sem carregar .env.local", () => {
    const pacote = JSON.parse(ler("package.json")) as { scripts: Record<string, string> };
    expect(pacote.scripts.test).toBe("vitest run");
    expect(pacote.scripts["test:openai-real:PERIGOSO"]).toBe(
      "node scripts/executar-testes-openai-reais.mjs",
    );

    const runner = ler("scripts/executar-testes-openai-reais.mjs");
    expect(runner).toContain('process.env.ALLOW_REAL_OPENAI === "1"');
    expect(runner).toContain("CODEX_");
    expect(runner).toContain("process.env.CI");
    expect(runner).not.toMatch(/\.env\.local|loadEnvFile|--env-file/);
  });

  it("protege o backfill legado antes de carregar credenciais ou acessar a rede", () => {
    const backfill = readFileSync(
      new URL("../../scripts/backfill-transcricao.mjs", import.meta.url),
      "utf8",
    );
    const barreira = backfill.indexOf('process.env.ALLOW_REAL_OPENAI !== "1"');
    expect(barreira).toBeGreaterThan(-1);
    expect(backfill.indexOf("const env = carregarEnv()")).toBeGreaterThan(barreira);
    expect(backfill).toContain('nome.startsWith("CODEX_")');
    expect(backfill).toContain("process.env.CI");
  });
});
