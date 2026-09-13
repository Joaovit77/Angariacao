import { format } from "node:util";
import { describe, expect, it } from "vitest";
import { classificarFalhaSupabase, descreverFalhaSupabase, sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { erroExternoSintetico } from "./fixtures/erroExterno";

describe("allowlist de erros externos", () => {
  it("produz log operacional sem nenhum texto, header ou segredo externo", () => {
    const erro = erroExternoSintetico();
    const seguro = sanitizarErroExterno(erro, "embedding");
    expect(seguro).toEqual({ provider: "openai", operation: "embedding", error_code: "embedding_request_failed", status: 403 });
    const log = format("[teste local] %o", seguro);
    expect(log).toContain("403");
    expect(log).not.toMatch(/secret|secreta|privado|headers|authorization|cookie|api-key|service_role|html|cause|stack|response|request:/i);
    expect(erro.headers.Authorization).toBe("Bearer super-secret");
  });

  it.each([null, undefined, "resposta secreta", 403, { status: "403 segredo" }, { status: 999 }, { status: NaN }, { status: 403.5 }])(
    "descarta status inválido sem converter texto externo (%j)", (erro) => {
      expect(sanitizarErroExterno(erro, "embedding").status).toBeNull();
    },
  );

  it("não serializa causas circulares nem executa toJSON", () => {
    const erro = { status: 429, cause: {} as unknown, toJSON: () => { throw Error("não chamar"); } };
    erro.cause = erro;
    expect(JSON.stringify(sanitizarErroExterno(erro, "firecrawl"))).toContain('"status":429');
  });

  it("um getter de status hostil não impede o fallback", () => {
    expect(sanitizarErroExterno({ get status() { throw Error("segredo"); } }, "embedding").status).toBeNull();
  });

  it("não atribui a OpenAI uma falha do banco", () => {
    expect(sanitizarErroExterno(erroExternoSintetico(), "persistirEmbedding")).toEqual({
      provider: "supabase", operation: "persistir_embedding", error_code: "embedding_persistence_failed", status: 403,
    });
  });
});

describe("classificação de falha do supabase-js", () => {
  it("status 0 é rede: o fetch nem completou, vale repetir", () => {
    const falha = classificarFalhaSupabase({ code: "" }, 0);
    expect(falha).toEqual({ codigo: "rede", sqlstate: null, status: 0, transitoria: true });
    expect(descreverFalhaSupabase(falha)).toBe("rede:0");
  });

  it("5xx sem SQLSTATE é o gateway, não o Postgres", () => {
    expect(classificarFalhaSupabase({ code: "" }, 504)).toMatchObject({ codigo: "gateway", transitoria: true });
  });

  it.each(["57014", "40P01", "08006", "53300"])("SQLSTATE %s é falha passageira do banco", (code) => {
    const falha = classificarFalhaSupabase({ code }, 500);
    expect(falha).toMatchObject({ codigo: "banco-transitorio", sqlstate: code, transitoria: true });
    expect(descreverFalhaSupabase(falha)).toBe(`banco-transitorio:500:${code}`);
  });

  it("recusa determinística não é repetida", () => {
    expect(classificarFalhaSupabase({ code: "42883" }, 404)).toEqual({
      codigo: "recusado", sqlstate: "42883", status: 404, transitoria: false,
    });
    expect(classificarFalhaSupabase({ code: "PGRST301" }, 401)).toMatchObject({ sqlstate: "PGRST301", transitoria: false });
  });

  it("código fora do formato não entra no log, nem quando vem de um erro sintético", () => {
    const erro = erroExternoSintetico();
    const falha = classificarFalhaSupabase(erro, erro.status);
    expect(falha.sqlstate).toBeNull();
    expect(format("%o", falha)).not.toMatch(/secret|secreta|privado|html/i);
  });
});
