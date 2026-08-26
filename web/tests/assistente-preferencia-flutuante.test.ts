import { describe, expect, it, vi } from "vitest";
import {
  CHAVE_ASSISTENTE_FLUTUANTE,
  definirAssistenteFlutuanteAtivo,
  lerAssistenteFlutuanteAtivo,
} from "@/lib/assistente/preferenciaFlutuante";

function armazenamento(valorInicial: string | null = null) {
  let valor = valorInicial;
  return {
    getItem: vi.fn(() => valor),
    setItem: vi.fn((_chave: string, novoValor: string) => { valor = novoValor; }),
  };
}

describe("preferencia do Assistente flutuante", () => {
  it("mantem o atalho ativado por padrao", () => {
    expect(lerAssistenteFlutuanteAtivo(armazenamento())).toBe(true);
  });

  it("persiste e rele a desativacao sem afetar outra configuracao", () => {
    const memoria = armazenamento();
    definirAssistenteFlutuanteAtivo(false, memoria);
    expect(memoria.setItem).toHaveBeenCalledWith(CHAVE_ASSISTENTE_FLUTUANTE, "0");
    expect(lerAssistenteFlutuanteAtivo(memoria)).toBe(false);
  });

  it("e idempotente ao gravar o mesmo estado mais de uma vez", () => {
    const memoria = armazenamento("1");
    definirAssistenteFlutuanteAtivo(true, memoria);
    definirAssistenteFlutuanteAtivo(true, memoria);
    expect(lerAssistenteFlutuanteAtivo(memoria)).toBe(true);
  });

  it("continua funcionando na sessao se o armazenamento estiver indisponivel", () => {
    definirAssistenteFlutuanteAtivo(false, null);
    expect(lerAssistenteFlutuanteAtivo(null)).toBe(false);
    definirAssistenteFlutuanteAtivo(true, null);
  });
});
