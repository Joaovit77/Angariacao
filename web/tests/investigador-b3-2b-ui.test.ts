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

const base: ResultadoInvestigacao = {
  ok: true,
  consultaOriginal: "Rua Tijuca, 112, 2 quartos",
  consultas: ["Rua Tijuca, 112, 2 quartos imóvel"],
  pesquisasEvitadas: 0,
  encerramentoAntecipado: false,
  limiteAtingido: false,
  resultados: [{
    titulo: "Apartamento na Rua Tijuca", url: "https://portal.test/apto", dominio: "portal.test",
    descricao: "", consultas: ["Rua Tijuca, 112, 2 quartos imóvel"], preco: null,
    endereco: "Rua Tijuca, 112", referencia: null, condominio: null,
    quartos: 3, vagas: null, area: null, confianca: "forte", evidencias: ["Endereço idêntico"], contradicoes: [],
  }],
};

async function mostrar(dados: ResultadoInvestigacao) {
  mocks.investigar.mockImplementation(async (_consulta: string, aoEvento: (evento: unknown) => void) => {
    aoEvento({ tipo: "resultado", dados });
  });
  render(createElement(InvestigadorImoveisView));
  fireEvent.change(screen.getByLabelText("O que você sabe sobre o imóvel?"), {
    target: { value: dados.consultaOriginal },
  });
  fireEvent.click(screen.getByRole("button", { name: "Investigar imóvel" }));
  await waitFor(() => expect(mocks.investigar).toHaveBeenCalledOnce());
}

function comComparacao(
  quartos: number | null,
  estado: "coincide" | "conflita" | "sem_dado_no_resultado",
  relacaoEntrada: "coincide" | "conflita" | "sem_dado_no_resultado",
): ResultadoInvestigacao {
  return {
    ...base,
    resultados: [{ ...base.resultados[0], quartos }],
    memoriaConfirmada: {
      porResultado: [{
        url: base.resultados[0].url,
        comparacoes: [{ atributo: "quartos", estado, relacaoEntrada }],
      }],
      conflitosConfirmacoes: [],
      conflitosEntrada: [{ atributo: "quartos", valorInformado: 2, valorConfirmado: 3 }],
    },
  };
}

describe("B3.2b — apresentação auxiliar", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("D: web coincide com memória, mas conflito com entrada fica explícito", async () => {
    await mostrar(comComparacao(3, "coincide", "conflita"));
    expect(screen.getByText(/Conflito entre a investigação atual e a memória confirmada/)).toBeTruthy();
    expect(screen.getByText(/informado nesta investigação: 2; memória confirmada: 3/)).toBeTruthy();
    expect(screen.getByText(/Quartos coincide com a memória; difere do informado nesta investigação/)).toBeTruthy();
    expect(screen.getByText(/não altera a correspondência/)).toBeTruthy();
  });

  it("E: web acompanha entrada e conflita com memória sem mudar o card", async () => {
    await mostrar(comComparacao(2, "conflita", "coincide"));
    expect(screen.getByText(/Quartos conflita com a memória; acompanha o informado nesta investigação/)).toBeTruthy();
    expect(screen.getByText(/informado nesta investigação: 2; memória confirmada: 3/)).toBeTruthy();
    expect(screen.getByText("2 quartos")).toBeTruthy();
  });

  it("F: ausência no resultado é explícita sem inventar quartos para a página", async () => {
    await mostrar(comComparacao(null, "sem_dado_no_resultado", "sem_dado_no_resultado"));
    expect(screen.getByText(/Quartos sem dado no resultado/)).toBeTruthy();
    expect(screen.queryByText("3 quartos")).toBeNull();
    expect(screen.getByText(/Conflito entre a investigação atual e a memória confirmada/)).toBeTruthy();
  });

  it("Y: comparações acompanham a URL correta mesmo se o metadado vier em outra ordem", async () => {
    const primeiro = { ...base.resultados[0], titulo: "Primeiro card", url: "https://portal.test/primeiro", quartos: 3 };
    const segundo = { ...base.resultados[0], titulo: "Segundo card", url: "https://portal.test/segundo", quartos: 2 };
    await mostrar({
      ...base, resultados: [primeiro, segundo],
      memoriaConfirmada: {
        porResultado: [
          { url: segundo.url, comparacoes: [{ atributo: "quartos", estado: "conflita", relacaoEntrada: "coincide" }] },
          { url: primeiro.url, comparacoes: [{ atributo: "quartos", estado: "coincide", relacaoEntrada: "conflita" }] },
        ],
        conflitosConfirmacoes: [],
        conflitosEntrada: [{ atributo: "quartos", valorInformado: 2, valorConfirmado: 3 }],
      },
    });
    const card1 = screen.getByText("Primeiro card").closest("article");
    const card2 = screen.getByText("Segundo card").closest("article");
    expect(card1 && within(card1).getByText(/Quartos coincide com a memória; difere/)).toBeTruthy();
    expect(card2 && within(card2).getByText(/Quartos conflita com a memória; acompanha/)).toBeTruthy();
  });

  it("A/B/C: sem conflito conserva a apresentação B3.2a; sem memória não cria bloco", async () => {
    await mostrar(base);
    expect(screen.queryByText("Memória confirmada")).toBeNull();
    cleanup();
    vi.clearAllMocks();
    await mostrar({
      ...base,
      memoriaConfirmada: {
        porResultado: [{ url: base.resultados[0].url, comparacoes: [{ atributo: "quartos", estado: "coincide" }] }],
        conflitosConfirmacoes: [],
      },
    });
    expect(screen.getByText("Memória confirmada")).toBeTruthy();
    expect(screen.getByText(/Quartos coincide/)).toBeTruthy();
    expect(screen.queryByText(/Conflito entre a investigação atual/)).toBeNull();
  });
});
