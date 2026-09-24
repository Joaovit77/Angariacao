// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("Memória confirmada")).toBeTruthy();
    expect(screen.getByText(/Quartos coincide/)).toBeTruthy();
    expect(screen.queryByText(/Vagas conflita/)).toBeNull();
    expect(screen.getByText(/não altera a correspondência/)).toBeTruthy();
  });

  it("sem memória não mostra caixa vazia; conflito interno não acusa o resultado", async () => {
    await investigar(BASE);
    expect(screen.queryByText("Memória confirmada")).toBeNull();
    cleanup();
    vi.clearAllMocks();
    await investigar({
      ...BASE,
      memoriaConfirmada: { porResultado: [{ url: BASE.resultados[0].url, comparacoes: [] }], conflitosConfirmacoes: ["quartos"] },
    });
    expect(screen.getByText(/Há confirmações incompatíveis na memória/)).toBeTruthy();
    expect(screen.queryByText(/Quartos conflita/)).toBeNull();
  });
});
