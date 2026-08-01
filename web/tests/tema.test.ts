import { describe, it, expect } from "vitest";
import { CHAVE_TEMA, ATRIBUTO_TEMA, SCRIPT_TEMA, ehTema, outroTema, resolverTema } from "@/lib/tema";

/* A decisão do tema, sem DOM. O que interessa aqui é o que o app faz com
   o que ENCONTRA salvo — inclusive lixo —, porque um valor que escapa
   vira um `data-tema` que o CSS não conhece e a tela fica sem paleta. */

describe("resolverTema", () => {
  it("a escolha salva vence a preferência do sistema", () => {
    expect(resolverTema("claro", false)).toBe("claro");
    expect(resolverTema("escuro", true)).toBe("escuro");
  });

  it("sem escolha, segue o sistema", () => {
    expect(resolverTema(null, true)).toBe("claro");
    expect(resolverTema(null, false)).toBe("escuro");
  });

  it("valor salvo inválido cai no sistema, não vira tema", () => {
    // Chave de outra versão, storage corrompido, extensão bisbilhoteira.
    for (const lixo of ["", "dark", "Claro", "true", "{}"]) {
      expect(resolverTema(lixo, true)).toBe("claro");
      expect(resolverTema(lixo, false)).toBe("escuro");
    }
  });
});

describe("ehTema / outroTema", () => {
  it("só reconhece os dois temas que o CSS define", () => {
    expect(ehTema("claro")).toBe(true);
    expect(ehTema("escuro")).toBe(true);
    expect(ehTema("light")).toBe(false);
    expect(ehTema(null)).toBe(false);
    expect(ehTema(undefined)).toBe(false);
  });

  it("alternar leva sempre ao outro tema", () => {
    expect(outroTema("claro")).toBe("escuro");
    expect(outroTema("escuro")).toBe("claro");
    expect(outroTema(outroTema("claro"))).toBe("claro");
  });
});

describe("SCRIPT_TEMA", () => {
  // Ele roda antes de tudo, no <head>: um erro aqui não trava só a cor,
  // trava o carregamento. Por isso a checagem de forma.
  it("usa a mesma chave e o mesmo atributo do resto do módulo", () => {
    expect(SCRIPT_TEMA).toContain(JSON.stringify(CHAVE_TEMA));
    expect(SCRIPT_TEMA).toContain(JSON.stringify(ATRIBUTO_TEMA));
  });

  it("é protegido por try/catch — storage bloqueado não derruba a página", () => {
    expect(SCRIPT_TEMA).toContain("try{");
    expect(SCRIPT_TEMA).toContain("catch");
  });

  it("aplica a escolha salva e NÃO marca nada sem escolha", () => {
    // Executa o script com um ambiente falso, do jeito que o navegador faria.
    const atributos: Record<string, string> = {};
    const documentoFalso = {
      documentElement: {
        setAttribute: (nome: string, valor: string) => {
          atributos[nome] = valor;
        },
      },
    };
    const rodar = new Function("document", "localStorage", SCRIPT_TEMA);

    rodar(documentoFalso, { getItem: () => "claro" });
    expect(atributos[ATRIBUTO_TEMA]).toBe("claro");

    rodar(documentoFalso, { getItem: () => "escuro" });
    expect(atributos[ATRIBUTO_TEMA]).toBe("escuro");

    // Sem escolha o script sai de cena: quem decide é o
    // `prefers-color-scheme` do CSS. Marcar um tema aqui atropelaria
    // isso — e prenderia no escuro quem tem o sistema em claro.
    delete atributos[ATRIBUTO_TEMA];
    rodar(documentoFalso, { getItem: () => null });
    expect(atributos[ATRIBUTO_TEMA]).toBeUndefined();
    rodar(documentoFalso, { getItem: () => "lixo" });
    expect(atributos[ATRIBUTO_TEMA]).toBeUndefined();
  });

  it("não quebra com localStorage que lança (navegação privativa)", () => {
    const atributos: Record<string, string> = {};
    const documentoFalso = {
      documentElement: { setAttribute: (n: string, v: string) => { atributos[n] = v; } },
    };
    const rodar = new Function("document", "localStorage", SCRIPT_TEMA);
    expect(() =>
      rodar(documentoFalso, {
        getItem: () => {
          throw new Error("bloqueado");
        },
      }),
    ).not.toThrow();
    expect(atributos[ATRIBUTO_TEMA]).toBeUndefined();
  });
});
