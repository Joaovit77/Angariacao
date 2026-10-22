// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoRadar } from "@/lib/calculo/radarAngariacao";
const mocks = vi.hoisted(() => ({ carregar: vi.fn(), marcar: vi.fn(), central: vi.fn(), toast: vi.fn(),
  estado: { imoveis: [], radarNovos: 1 }, abrir: vi.fn(), atualizar: vi.fn(), verificar: vi.fn() }));
vi.mock("next/image", () => ({ default: (props: { src: string; alt: string }) => React.createElement("img", { src: props.src, alt: props.alt }) }));
vi.mock("next/link", () => ({ default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", { href: props.href }, props.children) }));
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ usuario: { id: "usuario-local" } }) }));
vi.mock("@/lib/store", () => ({ useAppStore: (selecionar: (valor: unknown) => unknown) => selecionar(mocks.estado) }));
vi.mock("@/lib/uiModal", () => ({ useUiModal: (selecionar: (valor: unknown) => unknown) => selecionar({ abrirPreCadastro: mocks.abrir }) }));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/useCidadePadraoDaConta", () => ({ useCidadePadraoDaConta: () => ({ origem: "nenhuma", cidade: "", estado: "" }) }));
vi.mock("@/lib/centralAngariacao", () => ({ buscarNaCentral: vi.fn() }));
vi.mock("@/lib/persistencia/referenciasInvestigador", () => ({ carregarIdsComparaveisDosAnuncios: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/lib/persistencia/historicoCentralAngariacao", () => ({ carregarChavesAnunciosCentralVisualizados: vi.fn().mockResolvedValue(new Set(["chaves-na-mao:100001"])) }));
vi.mock("@/lib/mutacoes", () => ({ marcarAnuncioCentralComoVisualizado: mocks.central }));
vi.mock("@/lib/radarAngariacao", () => ({
  carregarRadar: mocks.carregar, atualizarPendenciasRadar: mocks.atualizar, marcarOfertaRadarComoVista: mocks.marcar,
  definirBuscaRadarAtiva: vi.fn(), excluirBuscaRadar: vi.fn(), marcarRadarComoVisto: vi.fn(), publicarAtualizacaoRadar: vi.fn(),
  salvarBuscaRadar: vi.fn(), verificarBuscaRadar: mocks.verificar, EVENTO_RADAR_ATUALIZADO: "radar:atualizado", EVENTO_PENDENCIAS_RADAR: "radar:pendencias",
}));
import CentralAngariacaoView from "@/components/central/CentralAngariacaoView";
const estado: EstadoRadar = { buscas: [{ id: "busca-local", nome: "Busca local", filtros: { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" },
  ativo: true, ultimoCheck: null, ultimoCheckAutomatico: null, ultimoCheckOrigem: null, criadoEm: "2026-10-21T12:00:00Z", comparacaoDesde: null }],
  anuncios: [
    { id: "base", buscaId: "busca-local", anuncio: { idExterno: "100002", portal: "chaves-na-mao", finalidade: "locacao", titulo: "Casa da base", url: "https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-100002/", cidade: "Londrina", estado: "PR", anunciante: "incerto" }, visto: false, novidade: false, anuncioGlobalId: "global-base", encontradoEm: "2026-10-21T12:00:00Z" },
    { id: "novo", buscaId: "busca-local", anuncio: { idExterno: "100001", portal: "chaves-na-mao", finalidade: "venda", titulo: "Casa nova para venda", url: "https://www.chavesnamao.com.br/imovel/casa-a-venda-pr-londrina-centro/id-100001/", cidade: "Londrina", estado: "PR", anunciante: "incerto" }, visto: false, novidade: true, anuncioGlobalId: "global-venda", encontradoEm: "2026-10-21T12:00:00Z" },
  ] };
estado.buscas.push({ ...estado.buscas[0], id: "busca-venda", nome: "Venda local",
  filtros: { ...estado.buscas[0].filtros, finalidade: "venda" } });
estado.anuncios[1].buscaId = "busca-venda";
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/central-angariacao?aba=radar");
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  mocks.carregar.mockResolvedValue(structuredClone(estado)); mocks.marcar.mockResolvedValue(undefined);
  mocks.verificar.mockResolvedValue([]);
  mocks.atualizar.mockResolvedValue({ total: 1, porBusca: new Map(), ids: new Set(["novo"]) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Radar — smoke da interface com dados isolados", () => {
  it("mostra Base não revisada e Novo separadamente, sem ocultar Venda pela visualização legada", async () => {
    render(React.createElement(CentralAngariacaoView));
    expect(await screen.findByText("Casa da base")).toBeTruthy();
    expect(screen.getByText("Casa nova para venda")).toBeTruthy();
    expect(screen.getByText("Base não revisada")).toBeTruthy();
    expect(screen.getAllByText("Novo")).toHaveLength(1);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("coleta parcial mantém a base e o link direto utilizáveis sem selo Novo", async () => {
    const parcial=structuredClone(estado); parcial.anuncios= [ {...parcial.anuncios[0],coberturaColeta:"parcial"} ];
    mocks.carregar.mockResolvedValue(parcial); render(React.createElement(CentralAngariacaoView));
    const titulo=await screen.findByText("Casa da base"); const card=titulo.closest("article")!;
    expect(card.textContent).toContain("Base não revisada"); expect(card.textContent).toContain("Coleta parcial");
    expect(card.textContent).not.toContain("Novo");
    const link=card.querySelector<HTMLAnchorElement>("a[target='_blank']")!;
    expect(link.getAttribute("href")).toBe(parcial.anuncios[0].anuncio.url);
    fireEvent.click(link); await waitFor(()=>expect(mocks.marcar).toHaveBeenCalledWith("global-base"));
    fireEvent.click(await screen.findByRole("button",{name:/Mostrar 1 visualizado/}));
    expect(screen.getByText("Casa da base")).toBeTruthy(); expect(screen.getByText("Coleta parcial")).toBeTruthy();
  });
  it("anúncios além da primeira página ficam acessíveis por Carregar mais", async () => {
    const primeira={...structuredClone(estado),proximaPagina:120};
    const segunda={...structuredClone(estado),anuncios:[{...estado.anuncios[0],id:"mais",anuncio:{...estado.anuncios[0].anuncio,titulo:"Casa da página seguinte"}}],proximaPagina:null};
    mocks.carregar.mockResolvedValueOnce(primeira).mockResolvedValueOnce(segunda);
    render(React.createElement(CentralAngariacaoView));
    fireEvent.click(await screen.findByRole("button",{name:"Carregar mais anúncios"}));
    expect(await screen.findByText("Casa da página seguinte")).toBeTruthy(); expect(screen.getByText("Casa da base")).toBeTruthy();
    expect(mocks.carregar).toHaveBeenCalledWith(120); expect(screen.queryByRole("button",{name:"Carregar mais anúncios"})).toBeNull();
  });
  it("Verificar agora comunica coleta parcial sem anunciar falsamente Novos", async () => {
    mocks.verificar.mockImplementation(async (_user,_busca,_origem,registrar)=>{registrar("parcial");return [];});
    render(React.createElement(CentralAngariacaoView));
    const botoes=await screen.findAllByRole("button",{name:"Verificar agora"}); fireEvent.click(botoes[0]);
    await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("Coleta parcial: os anúncios encontrados estão disponíveis")));
  });
  it("Ver anúncio resolve só a oferta qualificada após a escrita privada", async () => {
    render(React.createElement(CentralAngariacaoView));
    const titulo = await screen.findByText("Casa nova para venda");
    const card = titulo.closest("article")!;
    fireEvent.click(card.querySelector("a[target='_blank']")!);
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledWith("global-venda"));
    await waitFor(() => expect(screen.queryByText("Novo")).toBeNull());
    expect(screen.getByText("Casa da base")).toBeTruthy(); expect(mocks.central).not.toHaveBeenCalled();
  });
  it("falha ao marcar visto mantém Novo e a base, sem alteração otimista", async () => {
    mocks.marcar.mockRejectedValue(new Error("falha isolada"));
    render(React.createElement(CentralAngariacaoView));
    const titulo = await screen.findByText("Casa nova para venda");
    fireEvent.click(titulo.closest("article")!.querySelector("a[target='_blank']")!);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("Não foi possível"), "error"));
    expect(screen.getByText("Novo")).toBeTruthy(); expect(screen.getByText("Casa da base")).toBeTruthy();
  });
});
