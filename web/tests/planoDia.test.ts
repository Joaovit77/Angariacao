/* Contrato do "Foco do dia" (lib/calculo/planoDia).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o comportamento: "contato novo" é a ENTRADA do lead no funil (cadastrar
   um lead não cria tentativa, então é o statusHistory que ancora), o ritmo é a
   mediana por dia ativo (hoje fora, cold start = null), e o plano reparte o
   ritmo pesando pela conversão do portal, com piso e trava de amostra. Os
   portais cadastrados pelo corretor aparecem sempre. */
import { describe, expect, it } from "vitest";
import {
  contatosNovosHojePorPortal,
  dataEntradaFunil,
  planoDoDia,
  ritmoTipico,
} from "@/lib/calculo/planoDia";
import type { Imovel } from "@/lib/tipos";

const HOJE = "2026-07-22";

/** Imóvel pelo que importa aqui: quando entrou no funil, origem, se angariou/locou. */
function imovel(o: {
  id: string;
  origem?: string;
  entrouEm?: string; // data da entrada no funil (1ª entrada do statusHistory)
  angariadoEm?: string;
  locadoEm?: string;
}): Imovel {
  const hist = [{ status: "Novo contato", date: o.entrouEm ?? "2026-01-01" }];
  if (o.angariadoEm) hist.push({ status: "Angariado", date: o.angariadoEm });
  if (o.locadoEm) hist.push({ status: "Locado", date: o.locadoEm });
  return {
    id: o.id,
    endereco: `Rua ${o.id}`,
    origemImovel: o.origem,
    status: o.locadoEm ? "Locado" : o.angariadoEm ? "Angariado" : "Novo contato",
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

  it("não conta lead que entrou antes de hoje (não é contato novo de hoje)", () => {
    const i = imovel({ id: "a", origem: "OLX / Canal Pro", entrouEm: "2026-07-20" });
    expect(contatosNovosHojePorPortal([i], HOJE).size).toBe(0);
  });

  it("ignora imóvel sem origem (não há portal a creditar)", () => {
    const i = imovel({ id: "a", entrouEm: HOJE });
    expect(contatosNovosHojePorPortal([i], HOJE).size).toBe(0);
  });
});

describe("ritmoTipico", () => {
  it("é a mediana de contatos novos por dia ativo, com hoje de fora", () => {
    // Dois dias ativos na janela: 07-15 (×4) e 07-18 (×2) ⇒ mediana (2+4)/2 = 3.
    // 07-22 (hoje) e 05-01 (fora da janela) não entram.
    const imoveis = [
      ...["a", "b", "c", "d"].map((id) => imovel({ id, entrouEm: "2026-07-15" })),
      ...["e", "f"].map((id) => imovel({ id, entrouEm: "2026-07-18" })),
      imovel({ id: "g", entrouEm: HOJE }),
      imovel({ id: "h", entrouEm: "2026-05-01" }),
    ];
    expect(ritmoTipico(imoveis, HOJE)).toBe(3);
  });

  it("é null quando não houve contato novo na janela (cold start)", () => {
    const i = imovel({ id: "a", entrouEm: HOJE }); // só hoje ⇒ janela vazia
    expect(ritmoTipico([i], HOJE)).toBeNull();
  });
});

describe("planoDoDia", () => {
  it("cold start: sem histórico e sem portais cadastrados, nada a mostrar", () => {
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
    const plano = planoDoDia([], [], HOJE);
    expect(plano.portais).toEqual([]);
  });

  it("fixo entra em jogo ao receber um contato novo hoje", () => {
    const imoveis = [imovel({ id: "a", origem: "OLX / Canal Pro", entrouEm: HOJE })];
    const plano = planoDoDia(imoveis, [], HOJE);
    expect(plano.portais.map((p) => p.origem)).toEqual(["OLX / Canal Pro"]);
    expect(plano.portais[0].feitos).toBe(1);
  });

  it("reparte o ritmo pesando pela conversão, com feitos e amostra", () => {
    const imoveis: Imovel[] = [
      // Ritmo: 6 leads num único dia ativo da janela ⇒ mediana 6.
      ...["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => imovel({ id, entrouEm: "2026-07-15" })),
      // Portal forte: 4 angariados, 4 locados ⇒ 100%, amostra firme. Entrada
      // antiga, fora da janela, para não mexer no ritmo.
      ...["o1", "o2", "o3", "o4"].map((id) =>
        imovel({ id, origem: "OLX / Canal Pro", entrouEm: "2026-05-01", angariadoEm: "2026-05-02", locadoEm: "2026-05-20" }),
      ),
      // Portal fraco: 1 angariado, 0 locado ⇒ 0%, amostra insuficiente (piso).
      imovel({ id: "s1", origem: "Redes sociais", entrouEm: "2026-05-02", angariadoEm: "2026-05-03" }),
      // Contatos novos de hoje: 2 na OLX, 1 nas redes.
      imovel({ id: "h1", origem: "OLX / Canal Pro", entrouEm: HOJE }),
      imovel({ id: "h2", origem: "OLX / Canal Pro", entrouEm: HOJE }),
      imovel({ id: "h3", origem: "Redes sociais", entrouEm: HOJE }),
    ];
    const plano = planoDoDia(imoveis, [], HOJE);

    expect(plano.ritmo).toBe(6);
    expect(plano.temSugestao).toBe(true);
    expect(plano.feitosHoje).toBe(3);

    const olx = plano.portais.find((p) => p.origem === "OLX / Canal Pro")!;
    const redes = plano.portais.find((p) => p.origem === "Redes sociais")!;

    // O portal que mais fecha puxa a fatia maior e encabeça a lista.
    expect(plano.portais[0].origem).toBe("OLX / Canal Pro");
    expect(olx.sugerido).toBeGreaterThan(redes.sugerido);
    expect(olx.indicativo).toBe(false);
    expect(redes.indicativo).toBe(true);

    // Feitos e restantes saem dos leads que entraram hoje.
    expect(olx.feitos).toBe(2);
    expect(olx.restantes).toBe(Math.max(0, olx.sugerido - 2));
    expect(redes.feitos).toBe(1);
  });
});
