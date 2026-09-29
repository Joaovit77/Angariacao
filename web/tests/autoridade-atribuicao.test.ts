import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  decidirImovelOperacional,
  metadadoDaAtribuicao,
  rebaixarParaLegado,
  VERSAO_ATRIBUICAO_NOTA,
  type ResolucaoRelacional,
} from "@/lib/calculo/autoridadeAtribuicao";
import { STATUS_TERMINAL_ATRIBUICAO } from "@/lib/calculo/atribuicaoMensagem";

/* Fase 1a-C2.1a — quem decide o imóvel operacional.

   A regra inteira: o motor vence quando resolveu um imóvel NÃO terminal;
   todo o resto fica com o legado, e o motivo do fallback é explícito. O
   status de cada imóvel já foi traduzido em `terminal` pelo motor da 1a-B;
   aqui os casos por status provam que essa tradução chega intacta. */

const LEGADO = "imovel-legado";

function resolvido(extra: Partial<ResolucaoRelacional> = {}): ResolucaoRelacional {
  return {
    estado: "resolvido",
    imovelId: "imovel-novo",
    terminal: false,
    nivel: "unico",
    contatoId: "contato-1",
    candidatos: ["imovel-novo"],
    terminais: [],
    ...extra,
  };
}

/** O que o motor devolve para um imóvel com este status, pela lista
    própria da atribuição (a mesma que o motor usa). */
function terminalPorStatus(status: string): boolean {
  return STATUS_TERMINAL_ATRIBUICAO.includes(status);
}

describe("1-3. motor resolveu um imóvel vivo → motor", () => {
  it.each(["Publicado", "Angariado", "Sem resposta"])("%s: motor vence", (status) => {
    const d = decidirImovelOperacional(LEGADO, resolvido({ terminal: terminalPorStatus(status) }));
    expect(d).toEqual({ autoridade: "motor", imovelId: "imovel-novo", fallbackMotivo: null, concordante: false });
  });

  it("motor e legado no mesmo imóvel: motor, concordante", () => {
    expect(decidirImovelOperacional(LEGADO, resolvido({ imovelId: LEGADO }))).toEqual({
      autoridade: "motor",
      imovelId: LEGADO,
      fallbackMotivo: null,
      concordante: true,
    });
  });
});

describe("4-9. qualquer outro estado → legado, com motivo", () => {
  it("4. pendente", () => {
    const d = decidirImovelOperacional(LEGADO, resolvido({ estado: "pendente", imovelId: null, nivel: "unico" }));
    expect(d).toEqual({ autoridade: "legado", imovelId: LEGADO, fallbackMotivo: "pendente", concordante: null });
  });

  it("5. sem-candidatos", () => {
    const d = decidirImovelOperacional(LEGADO, resolvido({ estado: "sem-candidatos", imovelId: null }));
    expect(d).toMatchObject({ autoridade: "legado", imovelId: LEGADO, fallbackMotivo: "sem-candidatos" });
  });

  it.each(["Perdido", "Cancelado", "Locado"])("6. terminal (%s) resolvido por referência → legado", (status) => {
    const d = decidirImovelOperacional(LEGADO, resolvido({ terminal: terminalPorStatus(status) }));
    expect(d).toEqual({ autoridade: "legado", imovelId: LEGADO, fallbackMotivo: "terminal", concordante: false });
  });

  it("6b. retirado chega como terminal e fica com o legado", () => {
    // O motor marca `terminal` para retirado=true; a decisão só vê a marca.
    expect(decidirImovelOperacional(LEGADO, resolvido({ terminal: true }))).toMatchObject({
      autoridade: "legado",
      fallbackMotivo: "terminal",
    });
  });

  it("7. falha: com resultado e sem resultado nenhum", () => {
    expect(decidirImovelOperacional(LEGADO, resolvido({ estado: "falha", imovelId: null }))).toMatchObject({
      autoridade: "legado",
      imovelId: LEGADO,
      fallbackMotivo: "falha",
    });
    expect(decidirImovelOperacional(LEGADO, null)).toEqual({
      autoridade: "legado",
      imovelId: LEGADO,
      fallbackMotivo: "falha",
      concordante: null,
    });
  });

  it("7b. falha técnica nunca vira sem-candidatos", () => {
    const d = decidirImovelOperacional(LEGADO, resolvido({ estado: "falha", imovelId: null }));
    expect(d.fallbackMotivo).toBe("falha");
    expect(d.fallbackMotivo).not.toBe("sem-candidatos");
  });

  it("8. sem-contato-relacional", () => {
    const d = decidirImovelOperacional(LEGADO, resolvido({ estado: "sem-contato-relacional", imovelId: null }));
    expect(d).toMatchObject({ autoridade: "legado", fallbackMotivo: "sem-contato-relacional" });
  });

  it.each(["humano", "reatribuido", "", "__proto__", "toString"])(
    "9. estado desconhecido (%j) → legado conservador, mesmo apontando imóvel",
    (estado) => {
      const d = decidirImovelOperacional(LEGADO, resolvido({ estado }));
      expect(d).toMatchObject({ autoridade: "legado", imovelId: LEGADO, fallbackMotivo: "estado-desconhecido" });
    },
  );

  it("9b. resolvido sem imóvel, ou com `terminal` ausente, não ganha autoridade", () => {
    expect(decidirImovelOperacional(LEGADO, resolvido({ imovelId: null }))).toMatchObject({
      autoridade: "legado",
      fallbackMotivo: "resolucao-incompleta",
    });
    const semMarca = { ...resolvido(), terminal: undefined } as unknown as ResolucaoRelacional;
    expect(decidirImovelOperacional(LEGADO, semMarca)).toMatchObject({ autoridade: "legado", fallbackMotivo: "terminal" });
  });
});

describe("10. imóvel diferente do legado", () => {
  it("o motor vence SOMENTE quando resolveu e não é terminal", () => {
    expect(decidirImovelOperacional(LEGADO, resolvido({ imovelId: "outro" }))).toMatchObject({
      autoridade: "motor",
      imovelId: "outro",
      concordante: false,
    });
    for (const estado of ["pendente", "sem-candidatos", "falha", "sem-contato-relacional", "novo-estado"]) {
      expect(decidirImovelOperacional(LEGADO, resolvido({ estado, imovelId: "outro" })).imovelId).toBe(LEGADO);
    }
    expect(decidirImovelOperacional(LEGADO, resolvido({ imovelId: "outro", terminal: true })).imovelId).toBe(LEGADO);
  });

  it("sem legado, nada é inventado", () => {
    expect(decidirImovelOperacional(null, resolvido({ estado: "pendente", imovelId: null }))).toMatchObject({
      autoridade: "legado",
      imovelId: null,
    });
  });
});

describe("rebaixamento (carga do imóvel do motor falhou)", () => {
  it("volta ao legado com motivo próprio e lembra se o motor concordava", () => {
    const motor = decidirImovelOperacional(LEGADO, resolvido({ imovelId: "outro" }));
    expect(rebaixarParaLegado(motor, LEGADO, "carregamento-imovel")).toEqual({
      autoridade: "legado",
      imovelId: LEGADO,
      fallbackMotivo: "carregamento-imovel",
      concordante: false,
    });
  });
});

describe("metadado da nota", () => {
  it("resolvido: guarda nível, contato, ids e a autoridade", () => {
    const r = resolvido({ imovelId: "outro", candidatos: ["outro"], terminais: ["t1"], nivel: "contexto-tentativa" });
    const d = decidirImovelOperacional(LEGADO, r);
    expect(metadadoDaAtribuicao(d, r, LEGADO)).toEqual({
      versao: VERSAO_ATRIBUICAO_NOTA,
      autoridade: "motor",
      estado: "resolvido",
      nivel: "contexto-tentativa",
      nivelEmpate: null,
      terminal: false,
      contatoId: "contato-1",
      novoImovelId: "outro",
      legadoImovelId: LEGADO,
      candidatos: ["outro"],
      terminais: ["t1"],
      fallbackMotivo: null,
    });
  });

  it("pendente: o nível vira nivelEmpate", () => {
    const r = resolvido({ estado: "pendente", imovelId: null, nivel: "contexto-agendamento", candidatos: ["a", "b"] });
    const m = metadadoDaAtribuicao(decidirImovelOperacional(LEGADO, r), r, LEGADO);
    expect(m).toMatchObject({ autoridade: "legado", nivel: null, nivelEmpate: "contexto-agendamento", fallbackMotivo: "pendente" });
  });

  it("sem resolução: estado falha, listas vazias", () => {
    const m = metadadoDaAtribuicao(decidirImovelOperacional(LEGADO, null), null, LEGADO);
    expect(m).toMatchObject({ estado: "falha", contatoId: null, candidatos: [], terminais: [], fallbackMotivo: "falha" });
  });

  it("não guarda dado pessoal: só ids, enums e booleanos", () => {
    const m = metadadoDaAtribuicao(decidirImovelOperacional(LEGADO, resolvido()), resolvido(), LEGADO);
    expect(Object.keys(m).sort()).toEqual(
      [
        "autoridade",
        "candidatos",
        "contatoId",
        "estado",
        "fallbackMotivo",
        "legadoImovelId",
        "nivel",
        "nivelEmpate",
        "novoImovelId",
        "terminais",
        "terminal",
        "versao",
      ].sort(),
    );
    expect(JSON.stringify(m)).not.toMatch(/telefone|texto|nome|endereco|\d{8,}/i);
  });
});

describe("fronteira do módulo", () => {
  const fonte = readFileSync(new URL("../lib/calculo/autoridadeAtribuicao.ts", import.meta.url), "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("puro: sem Supabase, fetch, log, relógio ou import de servidor", () => {
    expect(codigo).not.toMatch(/supabase|fetch\(|console\.|new Date|Date\.now|registrarEvento|from "\.\.\/servidor/i);
    expect(codigo).not.toMatch(/^import (?!type)/m);
  });

  it("updated_at não entra na decisão", () => {
    expect(codigo).not.toContain("updated_at");
    expect(codigo).not.toMatch(/updatedAt/);
  });
});
