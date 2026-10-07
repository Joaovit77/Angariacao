import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  avaliarPortaoEfeitos,
  EFEITOS_PORTAO,
  VERSAO_PORTAO_EFEITOS,
  type EntradaPortaoEfeitos,
  type VereditoEfeito,
  type VereditoPortao,
} from "@/lib/calculo/portaoEfeitos";
import { ehImovelTerminalParaAtribuicao } from "@/lib/calculo/atribuicaoMensagem";

/* Fase 1a-C3-A1: o portão de efeitos em modo de decisão.

   O contrato (plano aprovado da Fase 1, Revisão 3, §R3.1 a §R3.4):
   atribuição segura a imóvel vivo libera os quatro efeitos; pendência e
   atribuição a terminal suprimem; a resposta a uma retomada (Retirados B3)
   libera tudo menos o encerramento (B0). `indefinido` marca as regras que
   ainda não foram decididas (D5 sem contato, D6 falha) e não é
   comportamento: nada aqui é chamado pelo webhook. */

function entrada(extra: Partial<EntradaPortaoEfeitos> = {}): EntradaPortaoEfeitos {
  return {
    categoria: "concordante",
    autoridade: "motor",
    nivel: "unico",
    imovelTerminal: false,
    casamentosLegados: 1,
    ...extra,
  };
}

/** O status chega ao portão já traduzido pela régua da atribuição, a mesma
    que o motor usa. Os casos por status provam essa tradução. */
function terminal(status: string, retirado = false): boolean {
  return ehImovelTerminalParaAtribuicao({ status, retirado });
}

function decisoes(v: VereditoPortao): Record<string, VereditoEfeito> {
  return Object.fromEntries(EFEITOS_PORTAO.map((e) => [e, v.efeitos[e].decisao]));
}

const TODOS_LIBERAM = { followup: "liberaria", tentativa: "liberaria", encerramento: "liberaria", agenda: "liberaria" };
const TODOS_SUPRIMEM = { followup: "suprimiria", tentativa: "suprimiria", encerramento: "suprimiria", agenda: "suprimiria" };
const TODOS_INDEFINIDOS = { followup: "indefinido", tentativa: "indefinido", encerramento: "indefinido", agenda: "indefinido" };

function motivos(v: VereditoPortao): string[] {
  return [...new Set(EFEITOS_PORTAO.map((e) => v.efeitos[e].motivo))];
}

describe("efeitos avaliados", () => {
  it("são exatamente os quatro do contrato, sem nota, transcrição nem IA", () => {
    expect([...EFEITOS_PORTAO]).toEqual(["followup", "tentativa", "encerramento", "agenda"]);
    const v = avaliarPortaoEfeitos(entrada());
    expect(Object.keys(v.efeitos).sort()).toEqual(["agenda", "encerramento", "followup", "tentativa"]);
    expect(JSON.stringify(v)).not.toMatch(/nota|transcri|classifica|\bia\b/i);
  });
});

describe("1-5. atribuição segura a imóvel vivo libera os quatro efeitos", () => {
  it("1. concordante + único + ativo", () => {
    const v = avaliarPortaoEfeitos(entrada({ nivel: "unico" }));
    expect(decisoes(v)).toEqual(TODOS_LIBERAM);
    expect(motivos(v)).toEqual(["autoridade-segura"]);
    expect(v.pendencia).toBe(false);
    expect(v.requerResolucao).toBe(false);
  });

  it.each(["referencia-explicita", "contexto-tentativa", "contexto-agendamento"])(
    "2-4. concordante + %s + ativo",
    (nivel) => {
      expect(decisoes(avaliarPortaoEfeitos(entrada({ nivel })))).toEqual(TODOS_LIBERAM);
    },
  );

  it.each(["unico", "referencia-explicita", "contexto-tentativa", "contexto-agendamento"])(
    "5. divergente seguro (%s): o motor já tem a autoridade e os efeitos vão para o imóvel dele (D7, contrato)",
    (nivel) => {
      const v = avaliarPortaoEfeitos(entrada({ categoria: "divergente", nivel }));
      expect(decisoes(v)).toEqual(TODOS_LIBERAM);
      expect(motivos(v)).toEqual(["autoridade-segura"]);
    },
  );
});

describe("6-9. imóvel terminal suprime os quatro efeitos", () => {
  it.each([
    ["Perdido", false],
    ["Cancelado", false],
    ["Locado", false],
    ["Publicado", true],
  ])("%s (retirado=%s) é terminal para atribuição e suprime tudo", (status, retirado) => {
    const imovelTerminal = terminal(status, retirado);
    expect(imovelTerminal).toBe(true);
    const v = avaliarPortaoEfeitos(entrada({ categoria: "terminal-historico", nivel: "referencia-explicita", imovelTerminal }));
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(motivos(v)).toEqual(["terminal-historico"]);
    expect(v.pendencia).toBe(false);
  });

  it("9. retirado sem retomada, mesmo com o motor resolvendo por referência explícita: suprime", () => {
    const v = avaliarPortaoEfeitos(
      entrada({ categoria: "terminal-historico", autoridade: "legado", nivel: "referencia-explicita", imovelTerminal: terminal("Publicado", true) }),
    );
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
  });

  it("atribuição a terminal suprime mesmo quando o imóvel do legado (que receberia o efeito) está vivo", () => {
    // Referência explícita a um Perdido: o legado fica com outro imóvel,
    // vivo. O contrato suprime pela atribuição, não pelo imóvel de destino.
    const v = avaliarPortaoEfeitos(
      entrada({ categoria: "terminal-historico", autoridade: "legado", nivel: "referencia-explicita", imovelTerminal: false }),
    );
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(motivos(v)).toEqual(["terminal-historico"]);
  });
});

describe("10. retirado + contexto de retomada (Retirados B3)", () => {
  const retomada = () =>
    entrada({ categoria: "terminal-historico", autoridade: "motor", nivel: "contexto-retomada", imovelTerminal: terminal("Publicado", true) });

  it("libera follow-up, tentativa e agenda; o encerramento continua suprimido (B0)", () => {
    const v = avaliarPortaoEfeitos(retomada());
    expect(decisoes(v)).toEqual({ followup: "liberaria", tentativa: "liberaria", encerramento: "suprimiria", agenda: "liberaria" });
    expect(v.efeitos.followup.motivo).toBe("retomada-autorizada");
    expect(v.efeitos.tentativa.motivo).toBe("retomada-autorizada");
    expect(v.efeitos.agenda.motivo).toBe("retomada-autorizada");
    expect(v.efeitos.encerramento.motivo).toBe("retomada-sem-encerramento");
    expect(v.pendencia).toBe(false);
  });

  it.each([
    ["sem o motor na autoridade", { autoridade: "legado" }],
    ["com o imóvel vivo", { imovelTerminal: false }],
    ["sem saber se o imóvel é terminal", { imovelTerminal: null }],
    ["fora da categoria terminal-historico", { categoria: "concordante" }],
  ])("as três marcas são exigidas juntas: %s não é retomada autorizada", (_, extra) => {
    const v = avaliarPortaoEfeitos({ ...retomada(), ...extra });
    expect(v.efeitos.agenda.decisao).not.toBe("liberaria");
    expect(v.efeitos.encerramento.decisao).not.toBe("liberaria");
    expect(motivos(v)).not.toContain("retomada-autorizada");
  });
});

describe("11. novo-pendente", () => {
  it("suprime os quatro efeitos e marca a pendência", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "novo-pendente", autoridade: "legado", nivel: null, casamentosLegados: 2 }));
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(motivos(v)).toEqual(["atribuicao-pendente"]);
    expect(v.pendencia).toBe(true);
    expect(v.requerResolucao).toBe(true);
  });

  it("pendência com o imóvel legado terminal: continua pendência (as duas regras suprimem, só a pendência pede resolução)", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "novo-pendente", autoridade: "legado", nivel: "unico", imovelTerminal: true }));
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(motivos(v)).toEqual(["atribuicao-pendente"]);
    expect(v.pendencia).toBe(true);
  });

  it("o nível do empate não muda o veredito", () => {
    for (const nivel of ["referencia-explicita", "contexto-tentativa", "contexto-agendamento", "unico", null]) {
      expect(decisoes(avaliarPortaoEfeitos(entrada({ categoria: "novo-pendente", autoridade: "legado", nivel })))).toEqual(TODOS_SUPRIMEM);
    }
  });
});

describe("12. novo-sem-candidatos", () => {
  it("suprime os quatro efeitos, sem pendência", () => {
    const v = avaliarPortaoEfeitos(
      entrada({ categoria: "novo-sem-candidatos", autoridade: "legado", nivel: null, imovelTerminal: terminal("Perdido") }),
    );
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(v.pendencia).toBe(false);
    expect(v.requerResolucao).toBe(false);
  });

  it("suprime também quando o imóvel legado não é terminal (contato sem vínculo vigente)", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "novo-sem-candidatos", autoridade: "legado", nivel: null, imovelTerminal: false }));
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(motivos(v)).toEqual(["sem-candidatos"]);
  });
});

describe("13-14. sem-contato-relacional: regra não decidida (D5)", () => {
  it.each([1, 2])("%i casamento(s) legado(s) com imóvel vivo: indefinido, e o número só fica registrado", (n) => {
    const v = avaliarPortaoEfeitos(
      entrada({ categoria: "sem-contato-relacional", autoridade: "legado", nivel: null, imovelTerminal: false, casamentosLegados: n }),
    );
    expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
    expect(motivos(v)).toEqual(["sem-contato-regra-pendente"]);
    expect(v.casamentosLegados).toBe(n);
    expect(v.pendencia).toBe(false);
  });

  it("1 e 2 casamentos dão o mesmo veredito: a contagem não decide nada", () => {
    const base = entrada({ categoria: "sem-contato-relacional", autoridade: "legado", nivel: null });
    const um = avaliarPortaoEfeitos({ ...base, casamentosLegados: 1 });
    const dois = avaliarPortaoEfeitos({ ...base, casamentosLegados: 2 });
    expect(um.efeitos).toEqual(dois.efeitos);
  });

  it.each([1, 2])(
    "sem contato + imóvel terminal (%i casamento): suprime os quatro, contrato aprovado; a D5 segue aberta só para imóvel vivo",
    (n) => {
      const v = avaliarPortaoEfeitos(
        entrada({ categoria: "sem-contato-relacional", autoridade: "legado", nivel: null, imovelTerminal: true, casamentosLegados: n }),
      );
      expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
      expect(motivos(v)).toEqual(["terminal-historico"]);
      expect(v.pendencia).toBe(false);
      expect(v.requerResolucao).toBe(false);
    },
  );

  it("o mesmo sem contato em imóvel vivo continua indefinido (D5 não foi resolvida pelo terminal)", () => {
    const base = entrada({ categoria: "sem-contato-relacional", autoridade: "legado", nivel: null });
    expect(decisoes(avaliarPortaoEfeitos({ ...base, imovelTerminal: true }))).toEqual(TODOS_SUPRIMEM);
    expect(decisoes(avaliarPortaoEfeitos({ ...base, imovelTerminal: false }))).toEqual(TODOS_INDEFINIDOS);
  });
});

describe("15. falha: regra não decidida (D6)", () => {
  it.each([1, 2])("com %i casamento(s) legado(s): indefinido, nem fail-open nem fail-closed", (n) => {
    const v = avaliarPortaoEfeitos(
      entrada({ categoria: "falha", autoridade: "legado", nivel: null, imovelTerminal: false, casamentosLegados: n }),
    );
    expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
    expect(motivos(v)).toEqual(["falha-regra-pendente"]);
  });

  it.each([1, 2])(
    "falha + imóvel terminal (%i casamento): suprime os quatro, contrato aprovado; a D6 segue aberta só para imóvel vivo",
    (n) => {
      const v = avaliarPortaoEfeitos(
        entrada({ categoria: "falha", autoridade: "legado", nivel: null, imovelTerminal: true, casamentosLegados: n }),
      );
      expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
      expect(motivos(v)).toEqual(["terminal-historico"]);
      expect(v.pendencia).toBe(false);
      expect(v.requerResolucao).toBe(false);
    },
  );

  it("a mesma falha em imóvel vivo continua indefinida (D6 não foi resolvida pelo terminal)", () => {
    const base = entrada({ categoria: "falha", autoridade: "legado", nivel: null });
    expect(decisoes(avaliarPortaoEfeitos({ ...base, imovelTerminal: true }))).toEqual(TODOS_SUPRIMEM);
    expect(decisoes(avaliarPortaoEfeitos({ ...base, imovelTerminal: false }))).toEqual(TODOS_INDEFINIDOS);
  });

  it("falha sem saber se o imóvel é terminal: indefinido (o terminal só vale quando é sabido)", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "falha", autoridade: "legado", nivel: null, imovelTerminal: null }));
    expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
    expect(motivos(v)).toEqual(["falha-regra-pendente"]);
  });
});

describe("16. categoria desconhecida", () => {
  it.each(["humano", "novo-estado", "", "__proto__", "toString", "constructor"])(
    "%j: indefinido em todos os efeitos, sem lançar",
    (categoria) => {
      const v = avaliarPortaoEfeitos(entrada({ categoria }));
      expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
      expect(motivos(v)).toEqual(["categoria-desconhecida"]);
    },
  );

  it("vence até o imóvel terminal: categoria que ninguém conhece não é classificada", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "novo-estado", imovelTerminal: true }));
    expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
  });
});

describe("17. \"Sem resposta\" não é terminal para atribuição", () => {
  it("o status sozinho não suprime: concordante em \"Sem resposta\" libera os quatro efeitos", () => {
    const imovelTerminal = terminal("Sem resposta");
    expect(imovelTerminal).toBe(false);
    const v = avaliarPortaoEfeitos(entrada({ imovelTerminal }));
    expect(decisoes(v)).toEqual(TODOS_LIBERAM);
  });

  it.each(["Novo contato", "Em negociação", "Angariado", "Publicado"])("%s também é vivo", (status) => {
    expect(decisoes(avaliarPortaoEfeitos(entrada({ imovelTerminal: terminal(status) })))).toEqual(TODOS_LIBERAM);
  });
});

describe("18. precedência: o terminal vence a categoria liberada", () => {
  it.each(["concordante", "divergente"])("%s em imóvel terminal suprime tudo", (categoria) => {
    const v = avaliarPortaoEfeitos(entrada({ categoria, imovelTerminal: true }));
    expect(decisoes(v)).toEqual(TODOS_SUPRIMEM);
    expect(motivos(v)).toEqual(["terminal-historico"]);
  });

  it("categoria segura sem saber se o imóvel é terminal: indefinido, nunca liberação", () => {
    const v = avaliarPortaoEfeitos(entrada({ imovelTerminal: null }));
    expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
    expect(motivos(v)).toEqual(["terminal-desconhecido"]);
  });

  it("categoria segura com o legado na autoridade: indefinido (autoridade inconsistente)", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "divergente", autoridade: "legado" }));
    expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
    expect(motivos(v)).toEqual(["autoridade-inconsistente"]);
  });

  it.each(["contexto-retomada", null, "humano", ""])(
    "categoria segura com nível fora da lista segura (%j): indefinido",
    (nivel) => {
      const v = avaliarPortaoEfeitos(entrada({ nivel }));
      expect(decisoes(v)).toEqual(TODOS_INDEFINIDOS);
      expect(motivos(v)).toEqual(["nivel-nao-seguro"]);
    },
  );
});

describe("saída", () => {
  it("é serializável, versionada e sem id, telefone, nome ou texto", () => {
    const v = avaliarPortaoEfeitos(entrada({ categoria: "novo-pendente", autoridade: "legado", nivel: "unico" }));
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(v.versao).toBe(VERSAO_PORTAO_EFEITOS);
    expect(JSON.stringify(v)).not.toMatch(/telefone|texto|nome|endereco|imovelId|contato|\d{5,}/i);
  });

  it.each([-1, 1.5, Number.NaN, null])("casamentos legados inválidos (%j) viram null", (n) => {
    expect(avaliarPortaoEfeitos(entrada({ casamentosLegados: n as number | null })).casamentosLegados).toBeNull();
  });

  it("efeitos de vereditos diferentes não compartilham objetos", () => {
    const a = avaliarPortaoEfeitos(entrada());
    const b = avaliarPortaoEfeitos(entrada());
    expect(a).toEqual(b);
    expect(a.efeitos).not.toBe(b.efeitos);
    expect(a.efeitos.agenda).not.toBe(a.efeitos.followup);
  });
});

describe("pureza", () => {
  it("não muta a entrada e a mesma entrada dá a mesma saída", () => {
    const e = Object.freeze(entrada({ categoria: "divergente", nivel: "contexto-tentativa" }));
    const copia = { ...e };
    const primeira = avaliarPortaoEfeitos(e);
    const segunda = avaliarPortaoEfeitos(e);
    expect(e).toEqual(copia);
    expect(segunda).toEqual(primeira);
  });

  const fonte = readFileSync(new URL("../lib/calculo/portaoEfeitos.ts", import.meta.url), "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it.each(["supabase", "fetch(", "Date.now", "new Date", "Math.random", "process.env", "console.", "registrarEvento", "createClient", "updated_at"])(
    "não usa %s",
    (proibido) => {
      expect(codigo).not.toContain(proibido);
    },
  );

  it("só importa tipos, e de módulos puros", () => {
    expect(codigo).not.toMatch(/^import (?!type)/m);
    expect(fonte).not.toMatch(/from "(next|react|@supabase|@\/lib\/servidor)/);
    expect(codigo).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
  });

  it("não depende de usuário nem de estado global", () => {
    expect(codigo).not.toMatch(/userId|user_id|globalThis|window\.|localStorage/);
    expect(codigo).not.toMatch(/^\s*(let|var) /m);
  });
});
