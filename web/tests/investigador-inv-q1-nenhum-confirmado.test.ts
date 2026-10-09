// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extrairCamposInvestigacao,
  ordenarMantidosInvestigacao,
  resumirTriagemInvestigacao,
  triarCorrespondenciasInvestigacao,
  type CorrespondenciaInvestigacao,
  type EventoInvestigacao,
  type FaixaConfiancaInvestigacao,
  type ResultadoInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";

/* INV-Q1: só apresentação. Sem nenhum resultado confirmado (forte ou muito
   forte), a tela diz isso e deixa os demais atrás de um botão; nada some do
   que a API entregou, nada é reordenado e o caso com confirmado não muda. */

const mocks = vi.hoisted(() => ({ investigar: vi.fn(), carregar: vi.fn() }));
vi.mock("@/lib/investigadorImoveis", () => ({
  investigarImovel: mocks.investigar,
  carregarContextoInvestigador: mocks.carregar,
}));

import InvestigadorImoveisView, {
  AVISO_SEM_RESULTADOS,
  EXPLICACAO_NENHUM_CONFIRMADO,
  TITULO_NENHUM_CONFIRMADO,
} from "@/components/investigador/InvestigadorImoveisView";

const raiz = join(import.meta.dirname, "..");

function card(
  indice: number,
  confianca: FaixaConfiancaInvestigacao,
  extra: Partial<CorrespondenciaInvestigacao> = {},
): CorrespondenciaInvestigacao {
  return {
    titulo: `Anúncio ${indice}`,
    url: `https://portal${indice}.test/anuncio/${indice}?id=${indice}`,
    dominio: `portal${indice}.test`,
    descricao: "",
    consultas: ["Rua Michigan, Londrina imóvel"],
    preco: null, endereco: null, referencia: null, condominio: null, quartos: null, vagas: null, area: null,
    confianca, evidencias: [], contradicoes: [],
    ...extra,
  };
}

/** O caso real de 09/10: 10 exibidos, nenhum forte. Faixas alternadas e fora
    de qualquer ordem, para a tela não poder reordenar sem ser notada. */
function dezNaoConfirmados(): CorrespondenciaInvestigacao[] {
  return Array.from({ length: 10 }, (_, i) => card(i + 1, i % 3 === 0 ? "indicio" : "possivel", {
    quartos: i % 2 ? 3 : null,
    evidencias: i % 3 === 0 ? [] : ["Mesma quantidade de quartos: 3", "Termos principais encontrados: michigan, londrina"],
    contradicoes: i % 4 === 0 ? ["Quantidade de vagas diferente: 1"] : [],
  }));
}

function resultadoCom(resultados: CorrespondenciaInvestigacao[], extra: Partial<ResultadoInvestigacao> = {}): ResultadoInvestigacao {
  return {
    ok: true,
    consultaOriginal: "Rua Michigan, Londrina, Casa, 3 quartos",
    consultas: ["Rua Michigan, Londrina, Casa, 3 quartos imóvel"],
    resultados,
    pesquisasEvitadas: 0,
    encerramentoAntecipado: false,
    limiteAtingido: false,
    ...extra,
  };
}

async function investigarCom(dados: ResultadoInvestigacao) {
  mocks.investigar.mockImplementation(async (_consulta: string, aoEvento: (evento: EventoInvestigacao) => void) => {
    aoEvento({ tipo: "resultado", dados });
  });
  fireEvent.change(screen.getByLabelText("O que você sabe sobre o imóvel?"), { target: { value: "Rua Michigan, Londrina" } });
  fireEvent.click(screen.getByRole("button", { name: "Investigar imóvel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Investigar imóvel" })).toBeTruthy());
}

async function abrirCom(dados: ResultadoInvestigacao) {
  render(createElement(InvestigadorImoveisView));
  await investigarCom(dados);
}

const alternador = () => screen.getByRole("button", { name: /resultados não confirmados/ });
const titulosDo = (grupo: string) =>
  [...document.querySelectorAll(`[data-grupo="${grupo}"] article h4`)].map((item) => item.textContent);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("INV-Q1 — nenhum resultado confirmado", () => {
  it("A. 0 confirmados e 10 não confirmados: o estado principal diz que nada foi confirmado", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));

    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toBe(TITULO_NENHUM_CONFIRMADO);
    expect(titulo.textContent).toBe("Nenhum resultado confirmado");
    expect(screen.getByText(EXPLICACAO_NENHUM_CONFIRMADO)).toBeTruthy();
    expect(EXPLICACAO_NENHUM_CONFIRMADO).toBe(
      "Encontramos alguns indícios, mas não há evidência suficiente para confirmar que correspondem a este imóvel.",
    );
    expect(document.querySelector('[data-estado="nenhum-confirmado"]')).not.toBeNull();
    // Nada que soe como candidato principal.
    expect(document.body.textContent).not.toContain("POSSÍVEIS CORRESPONDÊNCIAS");
    expect(document.body.textContent).not.toContain("Melhores correspondências");
    expect(screen.queryByRole("heading", { name: "10 resultados" })).toBeNull();
    expect(document.querySelector("[data-vazio]")).toBeNull();
  });

  it("B. os não confirmados começam recolhidos: nenhum card na tela, lista oculta", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));
    expect(alternador().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll("article")).toHaveLength(0);
    expect(screen.queryAllByRole("link", { name: /Abrir fonte/ })).toHaveLength(0);
    expect(document.getElementById("lista-resultados-nao-confirmados")?.hidden).toBe(true);
  });

  it("C. o botão conta exatamente os resultados recebidos", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));
    expect(alternador().textContent).toContain("Ver resultados não confirmados (10)");
    cleanup();
    await abrirCom(resultadoCom(dezNaoConfirmados().slice(0, 3)));
    expect(alternador().textContent).toContain("Ver resultados não confirmados (3)");
  });

  it("D. expandir mostra todos, com faixa, fonte e ação de abrir na origem", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));
    fireEvent.click(alternador());

    expect(alternador().getAttribute("aria-expanded")).toBe("true");
    expect(alternador().textContent).toContain("Ocultar resultados não confirmados (10)");
    expect(document.querySelectorAll("article")).toHaveLength(10);
    expect(screen.getAllByRole("link", { name: "Abrir fonte (abre em nova aba)" })).toHaveLength(10);
    expect(screen.getAllByText("Correspondência possível").length + screen.getAllByText("Indício").length).toBe(10);
    // O aviso de que a faixa não confirma o imóvel acompanha a lista aberta.
    expect(within(document.getElementById("lista-resultados-nao-confirmados")!).getByText(/não confirma que é o mesmo imóvel/)).toBeTruthy();
    // A faixa não é a classificação do motor: a tela não usa o termo dele.
    expect(document.body.textContent).not.toMatch(/inconclusiv/i);
  });

  it("E. recolher esconde de novo; uma nova investigação também volta recolhida", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));
    fireEvent.click(alternador());
    expect(document.querySelectorAll("article")).toHaveLength(10);
    fireEvent.click(alternador());
    expect(alternador().getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll("article")).toHaveLength(0);

    fireEvent.click(alternador());
    await investigarCom(resultadoCom(dezNaoConfirmados().slice(0, 4)));
    expect(alternador().getAttribute("aria-expanded")).toBe("false");
    expect(alternador().textContent).toContain("(4)");
    expect(document.querySelectorAll("article")).toHaveLength(0);
  });

  it("um aviso de busca parcial continua visível no estado recolhido", async () => {
    const parcial = "Investigação concluída parcialmente pelo tempo disponível. Os resultados encontrados foram mantidos.";
    await abrirCom(resultadoCom(dezNaoConfirmados(), { aviso: parcial }));
    expect(screen.getByText(parcial)).toBeTruthy();
  });
});

describe("INV-Q1 — casos com confirmado e vazio não mudam", () => {
  it("F. 1 confirmado + 9 não confirmados: o confirmado continua principal e os demais seguem visíveis como secundários", async () => {
    const forte = card(99, "forte", { evidencias: ["Endereço idêntico: Rua Michigan, 610"] });
    const naoConfirmados = dezNaoConfirmados().slice(0, 9);
    await abrirCom(resultadoCom([forte, ...naoConfirmados]));

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("10 resultados");
    expect(document.body.textContent).toContain("POSSÍVEIS CORRESPONDÊNCIAS");
    expect(titulosDo("grupo-melhores")).toEqual(["Anúncio 99"]);
    expect(titulosDo("grupo-outros")).toEqual(naoConfirmados.map((item) => item.titulo));
    expect(screen.queryByText(TITULO_NENHUM_CONFIRMADO)).toBeNull();
    expect(screen.queryByRole("button", { name: /resultados não confirmados/ })).toBeNull();
  });

  it("F. 3 confirmados e 0 não confirmados: só o grupo principal, sem botão", async () => {
    await abrirCom(resultadoCom([card(1, "muito-forte"), card(2, "forte"), card(3, "forte")]));
    expect(titulosDo("grupo-melhores")).toEqual(["Anúncio 1", "Anúncio 2", "Anúncio 3"]);
    expect(document.querySelector('[data-grupo="grupo-outros"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /resultados não confirmados/ })).toBeNull();
    expect(screen.queryByText(TITULO_NENHUM_CONFIRMADO)).toBeNull();
  });

  it("G. 0 resultados: o vazio original, nunca o \"nenhum confirmado\"", async () => {
    await abrirCom(resultadoCom([], { aviso: AVISO_SEM_RESULTADOS }));
    expect(screen.getByText("Nenhuma correspondência encontrada")).toBeTruthy();
    expect(document.querySelectorAll("[data-vazio]")).toHaveLength(1);
    expect(screen.queryByText(TITULO_NENHUM_CONFIRMADO)).toBeNull();
    expect(screen.queryByText(EXPLICACAO_NENHUM_CONFIRMADO)).toBeNull();
    expect(screen.queryByRole("button", { name: /resultados não confirmados/ })).toBeNull();
    expect(document.querySelector('[data-estado="nenhum-confirmado"]')).toBeNull();
  });
});

describe("INV-Q1 — lista recebida intacta", () => {
  function web(titulo: string, descricao: string, url: string): ResultadoWebInvestigacao {
    return {
      titulo, url, dominio: new URL(url).hostname, descricao, consultas: ["Rua Michigan, 610, Londrina imóvel"],
      ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
    };
  }

  it("H. o descartado pelo motor continua fora da tela; só o que a análise manteve vira card", async () => {
    const entrada = "Rua Michigan, 610, Londrina";
    const brutos = [
      web("Casa à venda em Londrina com 3 quartos", "Imobiliária Exemplo, casa com quintal.", "https://portal-a.test/casa-1"),
      web("Casa à venda Rua Michigan, 999", "Londrina, ótima localização.", "https://portal-b.test/casa-2"),
      web("Apartamento para alugar em Londrina", "Dois dormitórios, perto do centro.", "https://portal-c.test/apto-3"),
    ];
    const triagem = triarCorrespondenciasInvestigacao(entrada, brutos);
    expect(resumirTriagemInvestigacao(triagem)).toMatchObject({ relevantes: 0, inconclusivos: 2, descartados: 1 });
    // A mesma montagem da rota: o cliente recebe os mantidos na ordem do B3.
    const exibidos = ordenarMantidosInvestigacao(triagem, triagem.mantidos).map((item) => item.correspondencia);

    await abrirCom(resultadoCom(exibidos));
    expect(alternador().textContent).toContain("(2)");
    fireEvent.click(alternador());
    expect(document.querySelectorAll("article")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("Casa à venda Rua Michigan, 999");
  });

  it("\"não confirmado\" vem só da faixa: um relevante do motor com faixa possível fica ali, sem a tela chamá-lo de inconclusivo", async () => {
    // Endereço idêntico (relevante no B2) com empreendimento divergente
    // (contradição grave): a análise rebaixa a faixa para possível.
    const entrada = "Rua Michigan, 610, Condomínio Solar, Londrina";
    const brutos = [web(
      "Apartamento à venda Rua Michigan, 610, Condomínio Aurora, Londrina",
      "Dois quartos e uma vaga.",
      "https://portal-d.test/apto-4",
    )];
    const triagem = triarCorrespondenciasInvestigacao(entrada, brutos);
    expect(triagem.itens.map((item) => [item.relevancia, item.correspondencia.confianca])).toEqual([["relevante", "possivel"]]);
    const exibidos = ordenarMantidosInvestigacao(triagem, triagem.mantidos).map((item) => item.correspondencia);

    await abrirCom(resultadoCom(exibidos));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(TITULO_NENHUM_CONFIRMADO);
    expect(alternador().textContent).toContain("Ver resultados não confirmados (1)");
    fireEvent.click(alternador());
    expect(titulosDo("grupo-nao-confirmados")).toEqual(["Apartamento à venda Rua Michigan, 610, Condomínio Aurora, Londrina"]);
    expect(screen.getByRole("heading", { name: /Resultados não confirmados/ })).toBeTruthy();
    expect(screen.getByText("Correspondência possível")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/inconclusiv/i);
  });

  it("I. expandido, mantém exatamente a ordem recebida", async () => {
    const recebidos = dezNaoConfirmados();
    await abrirCom(resultadoCom(recebidos));
    fireEvent.click(alternador());
    expect(titulosDo("grupo-nao-confirmados")).toEqual(recebidos.map((item) => item.titulo));
  });

  it("J. não altera URL, domínio, preço, características nem o objeto recebido", async () => {
    const recebidos = Object.freeze(dezNaoConfirmados().map((item, i) => Object.freeze({
      ...item,
      preco: i === 0 ? 2500 : null,
      area: i === 0 ? 72 : null,
    }))) as unknown as CorrespondenciaInvestigacao[];
    const copia = JSON.parse(JSON.stringify(recebidos));
    await abrirCom(resultadoCom(recebidos));
    fireEvent.click(alternador());

    const links = screen.getAllByRole("link", { name: "Abrir fonte (abre em nova aba)" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(recebidos.map((item) => item.url));
    const cards = [...document.querySelectorAll("article")];
    cards.forEach((elemento, i) => expect(elemento.textContent).toContain(recebidos[i].dominio));
    expect(cards[0].textContent).toContain("72 m²");
    expect(cards[0].textContent).toMatch(/R\$\s?2\.500/);
    expect(JSON.parse(JSON.stringify(recebidos))).toEqual(copia);
  });
});

describe("INV-Q1 — acessibilidade e estrutura", () => {
  it("K. o controle é um botão real, com aria-expanded, alvo identificável e foco por teclado", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));
    const botao = alternador();
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.getAttribute("type")).toBe("button");
    const alvo = botao.getAttribute("aria-controls");
    expect(alvo).toBeTruthy();
    expect(document.getElementById(alvo!)).not.toBeNull();
    botao.focus();
    expect(document.activeElement).toBe(botao);
    // O botão nativo cuida de Enter/Espaço; o símbolo é decorativo.
    expect(botao.querySelector("span")?.getAttribute("aria-hidden")).toBe("true");
    expect(botao.closest("h1,h2,h3,h4,a,label")).toBeNull();
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(within(document.getElementById(alvo!)!).getAllByRole("article")).toHaveLength(10);
  });

  it("L. estrutura válida para o celular: ids únicos, sem interativo aninhado, botão de largura total e grade de uma coluna", async () => {
    await abrirCom(resultadoCom(dezNaoConfirmados()));
    fireEvent.click(alternador());

    const ids = [...document.querySelectorAll("[id]")].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.querySelectorAll("button button, button a, a button, a a")).toHaveLength(0);

    const css = readFileSync(join(raiz, "components/investigador/InvestigadorImoveisView.module.css"), "utf8");
    const celular = css.slice(css.indexOf("@media (max-width: 760px)"));
    expect(celular).toMatch(/\.alternarNaoConfirmados\s*\{[^}]*width:\s*100%/);
    expect(celular).toMatch(/\.gradeResultados\s*\{[^}]*grid-template-columns:\s*1fr/);
  });
});
