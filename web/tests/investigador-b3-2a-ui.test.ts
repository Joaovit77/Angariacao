// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import type { ResultadoInvestigacao } from "@/lib/calculo/investigadorImoveis";

const mocks = vi.hoisted(() => ({ investigar: vi.fn(), carregar: vi.fn() }));
vi.mock("@/lib/investigadorImoveis", () => ({
  investigarImovel: mocks.investigar,
  carregarContextoInvestigador: mocks.carregar,
}));

import InvestigadorImoveisView from "@/components/investigador/InvestigadorImoveisView";

const BASE: ResultadoInvestigacao = {
  ok: true,
  consultaOriginal: "Rua Michigan, 610",
  consultas: ["Rua Michigan, 610 imóvel"],
  pesquisasEvitadas: 0,
  encerramentoAntecipado: false,
  limiteAtingido: false,
  resultados: [{
    titulo: "Apartamento na Rua Michigan", url: "https://portal.test/imovel", dominio: "portal.test",
    descricao: "", consultas: ["Rua Michigan, 610 imóvel"], preco: null,
    endereco: "Rua Michigan, 610", referencia: null, condominio: null,
    quartos: 3, vagas: null, area: null, confianca: "forte", evidencias: ["Endereço idêntico"], contradicoes: [],
  }],
};

async function investigar(dados: ResultadoInvestigacao) {
  mocks.investigar.mockImplementation(async (_consulta: string, aoEvento: (evento: unknown) => void) => {
    aoEvento({ tipo: "resultado", dados });
  });
  render(createElement(InvestigadorImoveisView));
  fireEvent.change(screen.getByLabelText("O que você sabe sobre o imóvel?"), { target: { value: "Rua Michigan, 610" } });
  fireEvent.click(screen.getByRole("button", { name: "Investigar imóvel" }));
  await waitFor(() => expect(mocks.investigar).toHaveBeenCalledTimes(1));
}

describe("B3.2a — indicação mínima na UI", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("mostra somente a comparação, sem afirmar que o resultado é verdadeiro", async () => {
    await investigar({
      ...BASE,
      memoriaConfirmada: {
        porResultado: [{ url: BASE.resultados[0].url, comparacoes: [
          { atributo: "quartos", estado: "coincide" },
          { atributo: "vagas", estado: "sem_dado_no_resultado" },
        ] }],
        conflitosConfirmacoes: [],
      },
    });
    const bloco = document.querySelector("[data-memoria-confirmada]") as HTMLElement;
    expect(bloco).not.toBeNull();
    expect(within(bloco).getByText("Comparado com o que você confirmou")).toBeTruthy();
    expect(bloco.querySelector('[data-comparacao="coincide"]')?.textContent).toBe("=Bate com o que você confirmou: quartos");
    // Sem dado no anúncio não vira linha nem conflito.
    expect(bloco.querySelectorAll("li")).toHaveLength(1);
    expect(bloco.textContent).not.toMatch(/vagas/i);
    expect(within(bloco).getByText("Essa comparação não altera a correspondência.")).toBeTruthy();
    // Não é evidência do anúncio nem validação: fora da caixa "O que bate", sem ✓.
    expect(bloco.closest("[class*='evidencias']")).toBeNull();
    expect(bloco.textContent).not.toContain("✓");
    expect(document.body.textContent).not.toMatch(/validad|anúncio correto|imóvel confirmado/i);
  });

  it("conflito com a confirmação aparece como diferença, sem mudar a faixa do resultado", async () => {
    await investigar({
      ...BASE,
      memoriaConfirmada: {
        porResultado: [{ url: BASE.resultados[0].url, comparacoes: [{ atributo: "vagas", estado: "conflita" }] }],
        conflitosConfirmacoes: [],
      },
    });
    const bloco = document.querySelector("[data-memoria-confirmada]") as HTMLElement;
    expect(bloco.querySelector('[data-comparacao="conflita"]')?.textContent).toBe("≠Diferente do que você confirmou: vagas");
    expect(within(bloco).getByText("Essa comparação não altera a correspondência.")).toBeTruthy();
    expect(screen.getByText("Correspondência forte")).toBeTruthy();
  });

  it("sem memória não mostra caixa vazia; conflito interno não acusa o resultado", async () => {
    await investigar(BASE);
    expect(document.querySelector("[data-memoria-confirmada]")).toBeNull();
    expect(screen.queryByText("Comparado com o que você confirmou")).toBeNull();
    cleanup();
    vi.clearAllMocks();
    await investigar({
      ...BASE,
      memoriaConfirmada: { porResultado: [{ url: BASE.resultados[0].url, comparacoes: [] }], conflitosConfirmacoes: ["quartos"] },
    });
    expect(screen.getByText(/Há confirmações incompatíveis na memória/)).toBeTruthy();
    expect(document.querySelector("[data-memoria-confirmada]")).toBeNull();
    expect(screen.queryByText(/Diferente do que você confirmou/)).toBeNull();
  });
});
