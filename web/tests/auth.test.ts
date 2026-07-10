/* ================================================================
   Caracterização de passwordStrength() e traduzErroAuth() do app.js
   (seção 7). Valores derivados da leitura direta do código antigo.
   ================================================================ */
import { describe, expect, it } from "vitest";
import { forcaSenha } from "@/lib/auth/forcaSenha";
import { traduzErroAuth } from "@/lib/auth/erros";

describe("forcaSenha", () => {
  it("senha vazia não tem barra nem rótulo", () => {
    expect(forcaSenha("")).toEqual({ pct: 0, label: "", color: "" });
  });

  it("score <= 1 é Fraca", () => {
    // "abc" -> nenhum ponto (< 6 chars, só minúsculas)
    expect(forcaSenha("abc")).toEqual({ pct: 25, label: "Fraca", color: "var(--bad)" });
    // "abcdef" -> 1 ponto (>= 6 chars)
    expect(forcaSenha("abcdef")).toEqual({ pct: 25, label: "Fraca", color: "var(--bad)" });
  });

  it("score 2 é Razoável", () => {
    // >= 6 chars + dígito
    expect(forcaSenha("abcde1")).toEqual({ pct: 50, label: "Razoável", color: "var(--warn)" });
  });

  it("score 3 é Boa", () => {
    // >= 6 chars + maiúscula/minúscula + dígito
    expect(forcaSenha("Abcde1")).toEqual({ pct: 75, label: "Boa", color: "var(--info)" });
  });

  it("score >= 4 é Forte", () => {
    // >= 6 e >= 10 chars + maiúscula/minúscula + dígito
    expect(forcaSenha("Abcdefghi1")).toEqual({ pct: 100, label: "Forte", color: "var(--good)" });
    // com símbolo, score 5
    expect(forcaSenha("Abcdefghi1!")).toEqual({ pct: 100, label: "Forte", color: "var(--good)" });
  });

  it("10 chars só de minúsculas soma os dois pontos de comprimento (Razoável)", () => {
    expect(forcaSenha("abcdefghij")).toEqual({ pct: 50, label: "Razoável", color: "var(--warn)" });
  });
});

describe("traduzErroAuth", () => {
  it("traduz as mensagens conhecidas do Supabase", () => {
    expect(traduzErroAuth({ message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos.");
    expect(traduzErroAuth({ message: "User already registered" })).toBe("Já existe uma conta com esse e-mail.");
    expect(traduzErroAuth({ message: "Password should be at least 6 characters" })).toBe(
      "A senha precisa ter pelo menos 6 caracteres.",
    );
    expect(traduzErroAuth({ message: "Unable to validate email address: invalid format" })).toBe(
      "Esse e-mail não parece válido.",
    );
  });

  it("mensagem desconhecida passa adiante; sem mensagem, cai no texto genérico", () => {
    expect(traduzErroAuth({ message: "Boom" })).toBe("Boom");
    expect(traduzErroAuth({ message: "" })).toBe("Não foi possível concluir. Tente novamente.");
    expect(traduzErroAuth({})).toBe("Não foi possível concluir. Tente novamente.");
  });
});
