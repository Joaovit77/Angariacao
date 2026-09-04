import { format } from "node:util";
import { describe, expect, it } from "vitest";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
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
