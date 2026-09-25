// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CorrespondenciaInvestigacao,
  EventoInvestigacao,
  FaixaConfiancaInvestigacao,
  ResultadoInvestigacao,
} from "@/lib/calculo/investigadorImoveis";

/* AB4: só apresentação. Os testes provam que a tela nova não esconde,
   descarta nem reordena resultados, não inventa a pesquisa em andamento e
   não deixa pesquisas de uma tentativa falha parecendo resultado. */

const mocks = vi.hoisted(() => ({ investigar: vi.fn(), carregar: vi.fn() }));
vi.mock("@/lib/investigadorImoveis", () => ({
  investigarImovel: mocks.investigar,
  carregarContextoInvestigador: mocks.carregar,
}));

import InvestigadorImoveisView, {
  AVISO_SEM_RESULTADOS,
  agruparResultadosPorFaixa,
  textoAndamentoInvestigacao,
} from "@/components/investigador/InvestigadorImoveisView";

const raiz = join(import.meta.dirname, "..");

function card(url: string, confianca: FaixaConfiancaInvestigacao, titulo: string): CorrespondenciaInvestigacao {
  return {
    titulo, url, dominio: new URL(url).hostname, descricao: "", consultas: ["Rua Tijuca, 112 imóvel"],
    preco: null, endereco: null, referencia: null, condominio: null, quartos: null, vagas: null, area: null,
    confianca, evidencias: [], contradicoes: [],
  };
}

function resultadoCom(resultados: CorrespondenciaInvestigacao[], extra: Partial<ResultadoInvestigacao> = {}): ResultadoInvestigacao {
  return {
    ok: true,
    consultaOriginal: "Rua Tijuca, 112",
    consultas: ["Rua Tijuca, 112 imóvel", "Rua Tijuca imóvel"],
    resultados,
    pesquisasEvitadas: 0,
    encerramentoAntecipado: false,
    limiteAtingido: false,
    ...extra,
  };
}

function iniciar() {
  render(createElement(InvestigadorImoveisView));
  fireEvent.change(screen.getByLabelText("O que você sabe sobre o imóvel?"), { target: { value: "Rua Tijuca, 112" } });
  fireEvent.click(screen.getByRole("button", { name: "Investigar imóvel" }));
}

async function investigarCom(eventos: EventoInvestigacao[]) {
  mocks.investigar.mockImplementation(async (_consulta: string, aoEvento: (evento: EventoInvestigacao) => void) => {
    for (const evento of eventos) aoEvento(evento);
  });
  iniciar();
  await waitFor(() => expect(screen.getByRole("button", { name: "Investigar imóvel" })).toBeTruthy());
}

const titulosDo = (grupo: string) =>
  [...document.querySelectorAll(`[data-grupo="${grupo}"] article h4`)].map((item) => item.textContent);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AB4 — agrupamento só visual, pela faixa recebida", () => {
  it("A. todos aparecem, nenhum some e cada grupo mantém a ordem recebida", async () => {
    // Fora da ordem do B3.1 de propósito: a tela não pode reordenar.
    const recebidos = Object.freeze([
      Object.freeze(card("https://a.test/1", "forte", "Forte primeiro")),
      Object.freeze(card("https://b.test/2", "muito-forte", "Muito forte depois")),
      Object.freeze(card("https://c.test/3", "possivel", "Anúncio possível")),
      Object.freeze(card("https://d.test/4", "indicio", "Anúncio fraco")),
    ]) as unknown as CorrespondenciaInvestigacao[];
    await investigarCom([{ tipo: "resultado", dados: resultadoCom(recebidos) }]);

    expect(document.querySelectorAll("article")).toHaveLength(4);
    expect(titulosDo("grupo-melhores")).toEqual(["Forte primeiro", "Muito forte depois"]);
    expect(titulosDo("grupo-outros")).toEqual(["Anúncio possível", "Anúncio fraco"]);
    expect(screen.getByRole("heading", { name: "4 resultados" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Melhores correspondências/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Outros resultados/ })).toBeTruthy();
    // A faixa continua visível em todo card, inclusive nos compactos.
    for (const rotulo of ["Correspondência forte", "Correspondência muito forte", "Correspondência possível", "Indício"]) {
      expect(screen.getByText(rotulo)).toBeTruthy();
    }
    expect(screen.getAllByRole("link", { name: /Abrir fonte/ })).toHaveLength(4);
    expect(document.body.textContent).not.toMatch(/confirmad[oa]s? |corret[oa]s|errad[oa]s|score|pontos|após remover duplicatas/i);
    expect(mocks.investigar).toHaveBeenCalledOnce();
  });

  it("A. a divisão cobre as quatro faixas, é estável e, na ordem do B3.1, recompõe a lista", () => {
    const ordemB31 = [
      card("https://a.test/1", "muito-forte", "1"),
      card("https://a.test/2", "forte", "2"),
      card("https://a.test/3", "forte", "3"),
      card("https://a.test/4", "possivel", "4"),
      card("https://a.test/5", "indicio", "5"),
      card("https://a.test/6", "indicio", "6"),
    ];
    const { melhores, outros } = agruparResultadosPorFaixa(ordemB31);
    expect([...melhores, ...outros]).toEqual(ordemB31);
    expect(melhores.map((item) => item.titulo)).toEqual(["1", "2", "3"]);
    expect(outros.map((item) => item.titulo)).toEqual(["4", "5", "6"]);
  });

  it("A. só com resultados fracos não inventa grupo de melhores", async () => {
    await investigarCom([{ tipo: "resultado", dados: resultadoCom([card("https://c.test/3", "indicio", "Fraco")]) }]);
    expect(document.querySelector('[data-grupo="grupo-melhores"]')).toBeNull();
    expect(titulosDo("grupo-outros")).toEqual(["Fraco"]);
  });
});

describe("AB4 — estados", () => {
  it("B. vazio mostra uma única mensagem", async () => {
    await investigarCom([{ tipo: "resultado", dados: resultadoCom([], { aviso: AVISO_SEM_RESULTADOS }) }]);
    expect(screen.getByText("Nenhuma correspondência encontrada")).toBeTruthy();
    expect(screen.queryByText(AVISO_SEM_RESULTADOS)).toBeNull();
    expect(document.querySelectorAll("[data-vazio]")).toHaveLength(1);
  });

  it("B. vazio por busca parcial continua avisando que foi parcial", async () => {
    const parcial = "Investigação concluída parcialmente porque o limite do provedor foi atingido.";
    await investigarCom([{ tipo: "resultado", dados: resultadoCom([], { aviso: parcial, limiteAtingido: true }) }]);
    expect(screen.getByText(parcial)).toBeTruthy();
    expect(screen.getByText("Nenhuma correspondência encontrada")).toBeTruthy();
  });

  it("B. o texto do vazio acompanha exatamente o aviso que a rota envia", () => {
    const rota = readFileSync(join(raiz, "app/api/investigador-imoveis/route.ts"), "utf8");
    expect(rota).toContain(`"${AVISO_SEM_RESULTADOS}"`);
  });

  it("C. erro total mantém só a mensagem, sem pesquisas parecendo resultado", async () => {
    await investigarCom([
      { tipo: "etapa", etapa: "pesquisando-web" },
      { tipo: "consultas", consultas: ["Rua Tijuca, 112 imóvel"] },
      { tipo: "erro", mensagem: "A pesquisa na web está indisponível agora. Tente novamente em alguns minutos." },
    ]);
    expect(screen.getByRole("alert").textContent).toContain("indisponível agora");
    expect(document.body.textContent).not.toContain("Rua Tijuca, 112 imóvel");
    expect(document.body.textContent).not.toMatch(/pesquisas? (realizadas?|feitas?|concluídas?)|Investigação (concluída|em andamento)/);
    expect(document.querySelector("article")).toBeNull();
  });

  it("D. a origem Central usa a concordância certa", async () => {
    mocks.carregar.mockResolvedValue({ consulta: "Rua João Wyclif, 300", origem: "central" });
    render(createElement(InvestigadorImoveisView, {
      imovelIdInicial: null,
      referenciaInicial: { origem: "comparavel", id: "11111111-1111-4111-8111-111111111111" },
    }));
    await waitFor(() => expect(screen.getByText(/carregados da Central de Angariação/)).toBeTruthy());
    expect(document.body.textContent).not.toContain("do Central");
    expect(mocks.investigar).not.toHaveBeenCalled();
  });
});

describe("AB4 — progresso sem inventar a pesquisa em andamento", () => {
  it("F. textos do andamento derivam só da etapa e das pesquisas concluídas", () => {
    expect(textoAndamentoInvestigacao("preparando", 0)).toBe("Preparando… Conferindo sua sessão e a consulta.");
    expect(textoAndamentoInvestigacao("pesquisando-web", 0)).toBe("Pesquisando na web… a primeira pesquisa está em andamento.");
    expect(textoAndamentoInvestigacao("pesquisando-web", 1)).toBe("Pesquisando na web… 1 de até 3 pesquisas concluídas.");
    expect(textoAndamentoInvestigacao("concluido", 1)).toBe("1 pesquisa realizada.");
    expect(textoAndamentoInvestigacao("concluido", 3)).toBe("3 pesquisas realizadas.");
  });

  it("F. inicial → nenhuma concluída → uma concluída → finalizado, com uma só região viva", async () => {
    let emitir: (evento: EventoInvestigacao) => void = () => {};
    let terminar: () => void = () => {};
    mocks.investigar.mockImplementation((_consulta: string, aoEvento: (evento: EventoInvestigacao) => void) => {
      emitir = aoEvento;
      return new Promise<void>((resolver) => { terminar = resolver; });
    });
    iniciar();

    const painel = () => screen.getByRole("region", { name: "Andamento da investigação" });
    const status = () => within(painel()).getByRole("status");
    await waitFor(() => expect(status().textContent).toBe("Preparando… Conferindo sua sessão e a consulta."));
    expect(painel().getAttribute("aria-live")).toBeNull();
    expect(painel().querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Investigando…" })).toHaveProperty("disabled", true);

    act(() => emitir({ tipo: "etapa", etapa: "pesquisando-web" }));
    expect(status().textContent).toBe("Pesquisando na web… a primeira pesquisa está em andamento.");
    expect(painel().querySelector('[aria-current="step"]')?.textContent).toContain("Pesquisando na web");

    act(() => emitir({ tipo: "consultas", consultas: ["Rua Tijuca, 112 imóvel"] }));
    expect(status().textContent).toBe("Pesquisando na web… 1 de até 3 pesquisas concluídas.");
    // A pesquisa concluída não é apresentada como "a atual".
    expect(painel().textContent).not.toContain("Rua Tijuca, 112 imóvel");

    act(() => emitir({
      tipo: "resultado",
      dados: resultadoCom([card("https://a.test/1", "forte", "Casa")], { consultas: ["Rua Tijuca, 112 imóvel"] }),
    }));
    await act(async () => { terminar(); });
    expect(within(painel()).getByText("Investigação concluída")).toBeTruthy();
    expect(status().textContent).toBe("1 pesquisa realizada.");
    expect(painel().querySelector("ol li[data-estado]")).toBeNull();
    expect(within(painel()).getByText("Ver a pesquisa feita")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Investigar imóvel" })).toBeTruthy();
  });
});

describe("AB4 — card e acessibilidade", () => {
  it("fonte abre em nova aba de forma anunciada; símbolos são decorativos; sem caixa vazia de evidência", async () => {
    const comDados: CorrespondenciaInvestigacao = {
      ...card("https://portal.test/imovel?id=1", "possivel", "Apartamento na Rua Tijuca"),
      preco: 450000,
      evidencias: ["Endereço idêntico: Rua Tijuca, 112"],
      contradicoes: ["Quantidade de vagas diferente: 4"],
    };
    await investigarCom([{ tipo: "resultado", dados: resultadoCom([comDados, card("https://b.test/2", "indicio", "Sem nada")]) }]);

    const link = screen.getAllByRole("link", { name: "Abrir fonte (abre em nova aba)" })[0];
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(document.body.textContent).not.toContain("portal.test/imovel?id=1");
    expect(document.body.textContent).not.toMatch(/Fonte encontrada|Encontrada em \d/i);
    expect(screen.getByText("O que bate")).toBeTruthy();
    expect(screen.getByText("O que diverge")).toBeTruthy();
    for (const simbolo of document.querySelectorAll("li > span")) {
      expect(simbolo.getAttribute("aria-hidden")).toBe("true");
    }
    // O card sem evidência tem uma linha curta, não uma caixa com título.
    expect(screen.getAllByText("O que bate")).toHaveLength(1);
    expect(screen.getByText("Nenhum dado em comum com a sua consulta foi identificado.")).toBeTruthy();
    expect(screen.getByText(/não confirma que é o mesmo imóvel/)).toBeTruthy();
  });
});
