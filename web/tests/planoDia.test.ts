/* Contrato do "Foco do dia" (lib/calculo/planoDia).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o comportamento: "contato novo" é a ENTRADA do lead no funil
   (statusHistory), o ritmo é a mediana por dia ativo (hoje fora, cold start
   = null), e o ritmo é dividido IGUALMENTE entre os portais que o corretor usa
   (o sistema não ranqueia por conversão — o registro de leads difere por
   portal). Os portais cadastrados pelo corretor aparecem sempre. */
import { describe, expect, it } from "vitest";
import {
  angariacaoPorPortal,
  contatosNovosHojePorPortal,
  dataEntradaFunil,
  planoDoDia,
  ritmoTipico,
} from "@/lib/calculo/planoDia";
import type { Imovel } from "@/lib/tipos";

const HOJE = "2026-07-22";

/** Imóvel pelo que importa aqui: quando entrou no funil, origem, se angariou. */
function imovel(o: { id: string; origem?: string; entrouEm?: string; angariadoEm?: string }): Imovel {
  const hist = [{ status: "Novo contato", date: o.entrouEm ?? "2026-01-01" }];
  if (o.angariadoEm) hist.push({ status: "Angariado", date: o.angariadoEm });
  return {
    id: o.id,
    endereco: `Rua ${o.id}`,
    origemImovel: o.origem,
    status: o.angariadoEm ? "Angariado" : "Novo contato",
    statusHistory: hist,
  };
}

describe("dataEntradaFunil", () => {
  it("devolve a data da 1ª entrada do statusHistory", () => {
    expect(dataEntradaFunil(imovel({ id: "1", entrouEm: "2026-07-18" }))).toBe("2026-07-18");
  });
  it("é null quando o imóvel não tem histórico", () => {
    expect(dataEntradaFunil({ id: "z", endereco: "Rua Z", status: "Novo contato" })).toBeNull();
  });
});

describe("angariacaoPorPortal", () => {
  it("conta leads e angariados por origem; ignora imóvel sem origem", () => {
    const imoveis = [
      imovel({ id: "a", origem: "OLX / Canal Pro", angariadoEm: "2026-05-02" }),
      imovel({ id: "b", origem: "OLX / Canal Pro" }),
      imovel({ id: "c", origem: "Redes sociais" }),
      imovel({ id: "d" }), // sem origem
    ];
    const m = angariacaoPorPortal(imoveis);
    expect(m.get("OLX / Canal Pro")).toEqual({ leads: 2, angariados: 1 });
    expect(m.get("Redes sociais")).toEqual({ leads: 1, angariados: 0 });
    expect(m.has("(sem origem)")).toBe(false);
  });
});

describe("contatosNovosHojePorPortal", () => {
  it("conta os leads que entraram hoje, agrupados por portal", () => {
    const imoveis = [
      imovel({ id: "a", origem: "OLX / Canal Pro", entrouEm: HOJE }),
      imovel({ id: "b", origem: "OLX / Canal Pro", entrouEm: HOJE }),
      imovel({ id: "c", origem: "Redes sociais", entrouEm: HOJE }),
    ];
    const m = contatosNovosHojePorPortal(imoveis, HOJE);
    expect(m.get("OLX / Canal Pro")).toBe(2);
    expect(m.get("Redes sociais")).toBe(1);
  });

  it("não conta lead que entrou antes de hoje", () => {
    const i = imovel({ id: "a", origem: "OLX / Canal Pro", entrouEm: "2026-07-20" });
    expect(contatosNovosHojePorPortal([i], HOJE).size).toBe(0);
  });
});

describe("ritmoTipico", () => {
  it("é a mediana de contatos novos por dia ativo, com hoje de fora", () => {
    const imoveis = [
      ...["a", "b", "c", "d"].map((id) => imovel({ id, entrouEm: "2026-07-15" })),
      ...["e", "f"].map((id) => imovel({ id, entrouEm: "2026-07-18" })),
      imovel({ id: "g", entrouEm: HOJE }),
      imovel({ id: "h", entrouEm: "2026-05-01" }),
    ];
    expect(ritmoTipico(imoveis, HOJE)).toBe(3); // dias ativos 07-15(×4) e 07-18(×2) ⇒ mediana 3
  });

  it("é null quando não houve contato novo na janela (cold start)", () => {
    expect(ritmoTipico([imovel({ id: "a", entrouEm: HOJE })], HOJE)).toBeNull();
  });
});

describe("planoDoDia", () => {
  it("cold start: sem histórico e sem portais, nada a mostrar", () => {
    const plano = planoDoDia([], [], HOJE);
    expect(plano.ritmo).toBeNull();
    expect(plano.temSugestao).toBe(false);
    expect(plano.portais).toEqual([]);
    expect(plano.feitosHoje).toBe(0);
  });

  it("portal cadastrado pelo corretor aparece mesmo sem histórico nem contato", () => {
    const plano = planoDoDia([], ["Marketplace"], HOJE);
    expect(plano.portais.map((p) => p.origem)).toEqual(["Marketplace"]);
    expect(plano.portais[0].feitos).toBe(0);
  });

  it("fixo sem histórico e sem contato hoje NÃO aparece", () => {
    expect(planoDoDia([], [], HOJE).portais).toEqual([]);
  });

  it("divide o ritmo IGUALMENTE entre os portais em jogo", () => {
    const imoveis: Imovel[] = [
      // Ritmo: 6 leads num único dia ativo da janela ⇒ mediana 6.
      ...["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => imovel({ id, entrouEm: "2026-07-15" })),
      // Dois portais com angariação (entradas fora da janela, não mexem no ritmo).
      imovel({ id: "o1", origem: "OLX / Canal Pro", entrouEm: "2026-05-01", angariadoEm: "2026-05-02" }),
      imovel({ id: "g1", origem: "Garimpo em site de imobiliária", entrouEm: "2026-05-01", angariadoEm: "2026-05-02" }),
      // Um portal em jogo só pelo contato de hoje.
      imovel({ id: "h1", origem: "Redes sociais", entrouEm: HOJE }),
    ];
    const plano = planoDoDia(imoveis, [], HOJE);

    expect(plano.ritmo).toBe(6);
    expect(plano.feitosHoje).toBe(1);
    // 3 portais, ritmo 6 ⇒ 2 para cada (divisão igual, sem ranquear).
    expect(plano.portais.map((p) => p.sugerido)).toEqual([2, 2, 2]);

    const redes = plano.portais.find((p) => p.origem === "Redes sociais")!;
    const olx = plano.portais.find((p) => p.origem === "OLX / Canal Pro")!;
    expect(redes.feitos).toBe(1);
    expect(redes.restantes).toBe(1);
    expect(olx.feitos).toBe(0);
    expect(olx.restantes).toBe(2);
    expect(olx.angariados).toBe(1);

    // Ordem: quem mais falta primeiro. Redes (falta 1) fica por último; empate
    // entre OLX e Garimpo (falta 2) desempata por nome.
    expect(plano.portais.map((p) => p.origem)).toEqual([
      "Garimpo em site de imobiliária",
      "OLX / Canal Pro",
      "Redes sociais",
    ]);
  });

  it("o resto da divisão vai para os primeiros em ordem alfabética (sem ranquear)", () => {
    const imoveis: Imovel[] = [
      // Ritmo 5 (um dia ativo com 5 entradas).
      ...["r1", "r2", "r3", "r4", "r5"].map((id) => imovel({ id, entrouEm: "2026-07-16" })),
      imovel({ id: "o1", origem: "OLX / Canal Pro", entrouEm: "2026-05-01", angariadoEm: "2026-05-02" }),
      imovel({ id: "g1", origem: "Garimpo em site de imobiliária", entrouEm: "2026-05-01", angariadoEm: "2026-05-02" }),
    ];
    const plano = planoDoDia(imoveis, [], HOJE);
    expect(plano.ritmo).toBe(5);
    // 2 portais, ritmo 5 ⇒ 2 e 2, resto 1 vai para "Garimpo..." (alfabético).
    const garimpo = plano.portais.find((p) => p.origem === "Garimpo em site de imobiliária")!;
    const olx = plano.portais.find((p) => p.origem === "OLX / Canal Pro")!;
    expect(garimpo.sugerido).toBe(3);
    expect(olx.sugerido).toBe(2);
  });
});
