// @vitest-environment jsdom

import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetalheImovelIdentificado, ImovelIdentificado, AvistamentoLongitudinal } from "@/lib/prospeccao";

const mocks = vi.hoisted(() => ({
  fundirIdentificados: vi.fn(), listarIdentificados: vi.fn(), obterIdentificado: vi.fn(),
  buscarCandidatosDuplicidade: vi.fn(), createSignedUrl: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/prospeccao", async (original) => ({
  ...await original<typeof import("@/lib/prospeccao")>(),
  fundirIdentificados: mocks.fundirIdentificados,
  listarIdentificados: mocks.listarIdentificados,
  obterIdentificado: mocks.obterIdentificado,
  buscarCandidatosDuplicidade: mocks.buscarCandidatosDuplicidade,
}));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({
    createSignedUrl: mocks.createSignedUrl, upload: mocks.upload, remove: mocks.remove,
  }) } }),
}));
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ usuario: { id: "usuario" } }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { identidadeParaDedupe } from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import CandidatosDuplicidade from "@/components/prospeccao/CandidatosDuplicidade";
import DialogoFundirIdentificados from "@/components/prospeccao/DialogoFundirIdentificados";
import PainelIdentificado from "@/components/prospeccao/PainelIdentificado";
import ProspeccaoView from "@/components/prospeccao/ProspeccaoView";

function identificado(id: string, extras: Partial<ImovelIdentificado> = {}): ImovelIdentificado {
  return {
    id, situacao: "identificado", logradouro: "Rua das Palmeiras", numero: "100",
    unidade: "101", bloco: "A", edificio: null, bairro: "Centro", cidade: "Londrina", estado: "PR",
    cep: null, pontoReferencia: null, tipo: null, tipoOrigem: null, tipoEstado: null,
    latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
    avistamentosTotal: 1, avistamentoCorrenteId: "evento-" + id,
    ultimoAvistamentoEm: id === "a" ? "2026-09-01T10:00:00Z" : "2026-09-02T10:00:00Z",
    criadoEm: id === "a" ? "2026-09-01T10:00:00Z" : "2026-09-02T10:00:00Z",
    exclusaoSolicitadaEm: null, fundidoEm: null, fundidoEmImovelId: null,
    ...extras,
  } as ImovelIdentificado;
}
function evento(id: string, pai: string): AvistamentoLongitudinal {
  return {
    id, imovelIdentificadoId: pai, observadoEm: pai === "a" ? "2026-09-01T10:00:00Z" : "2026-09-02T10:00:00Z",
    createdAt: "2026-09-03T10:00:00Z", observacao: "Observação " + id, observacaoRevisao: 2,
    classificacaoEstado: "pendente", fotos: [], classificacoes: [], etiquetas: [],
  } as unknown as AvistamentoLongitudinal;
}
const a = identificado("a");
const b = identificado("b", { tipo: "Casa" });
const historicoA: DetalheImovelIdentificado = {
  identificado: a, avistamentos: [evento("evento-a", "a")], etiquetasDoImovel: [], classificacoesCarregadas: false,
};
const unido: DetalheImovelIdentificado = {
  identificado: { ...b, avistamentosTotal: 2 },
  avistamentos: [evento("evento-b", "b"), { ...evento("evento-a", "a"), imovelIdentificadoId: "b" }],
  etiquetasDoImovel: [], classificacoesCarregadas: false,
};
const pagina = (itens: ImovelIdentificado[]) => ({ itens, pagina: 1, porPagina: 24, total: itens.length, temMais: false });
const armazem = { ler: async () => null, limpar: async () => {}, salvar: async () => {} };

beforeEach(() => {
  vi.resetAllMocks();
  useProspeccao.getState().resetar();
  useUiModal.getState().fecharModal();
  useAppStore.setState({ imoveis: [] });
  useProspeccao.setState({ itens: [a, b], detalhe: historicoA, selecionadoId: "a", total: 2 });
  mocks.buscarCandidatosDuplicidade.mockResolvedValue([b]);
  mocks.listarIdentificados.mockResolvedValue(pagina([a, b]));
  mocks.obterIdentificado.mockResolvedValue(unido);
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "/foto-original-preservada.jpg" }, error: null });
});
afterEach(cleanup);

function escolher(nome = "registro sugerido") {
  fireEvent.click(screen.getByRole("radio", { name: "Manter " + nome + " como principal" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo que estes registros/ }));
}
function sucesso(repetida = false) {
  mocks.fundirIdentificados.mockResolvedValue({ sobreviventeId: "b", absorvidoId: "a", repetida });
  mocks.listarIdentificados.mockResolvedValue(pagina([unido.identificado]));
  mocks.buscarCandidatosDuplicidade.mockResolvedValue([]);
}

describe("C7b — confirmação humana", () => {
  it("É o mesmo abre o diálogo com dois registros, sem escolha implícita nem chamada", async () => {
    render(createElement(CandidatosDuplicidade, { alvo: identidadeParaDedupe(a), identificado: a, fotosIdentificado: 1 }));
    fireEvent.click(await screen.findByRole("button", { name: "É o mesmo" }));
    const dialogo = screen.getByRole("dialog", { name: "Unir registros" });
    expect(dialogo.querySelectorAll("[data-registro-id]")).toHaveLength(2);
    expect(dialogo.textContent).toContain("Unidade 101");
    expect(dialogo.textContent).toContain("Bloco A");
    expect(dialogo.textContent).toContain("1 foto no histórico");
    expect(dialogo.textContent).toContain("Nenhuma passagem, foto ou evidência será apagada");
    expect(dialogo.textContent).toContain("não cria oportunidade no Pipeline");
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByRole("button", { name: "Confirmar união dos históricos" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.fundirIdentificados).not.toHaveBeenCalled();
    expect(within(dialogo).queryByRole("button", { name: /excluir|apagar|promover|oportunidade/i })).toBeNull();
    expect(screen.queryByText("São diferentes")).toBeNull();
  });

  it("permite manter qualquer lado, identifica o absorvido e exige nova confirmação ao trocar", () => {
    render(createElement(DialogoFundirIdentificados, { identificado: a, candidato: b, aoFechar: vi.fn() }));
    escolher("registro aberto");
    expect(screen.getByLabelText("Escolha da união").textContent).toContain("Sobrevivente — registro aberto");
    expect(screen.getByLabelText("Escolha da união").textContent).toContain("Absorvido — registro sugerido");
    fireEvent.click(screen.getByRole("radio", { name: "Manter registro sugerido como principal" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("button", { name: "Confirmar união dos históricos" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(["registro aberto", "registro sugerido"])("a escolha de %s determina a ordem dos argumentos", async (escolha) => {
    const fechar = vi.fn();
    mocks.fundirIdentificados.mockResolvedValue({
      sobreviventeId: escolha === "registro aberto" ? "a" : "b",
      absorvidoId: escolha === "registro aberto" ? "b" : "a", repetida: false,
    });
    render(createElement(DialogoFundirIdentificados, { identificado: a, candidato: b, aoFechar: fechar }));
    escolher(escolha);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar união dos históricos" }));
    await waitFor(() => expect(fechar).toHaveBeenCalledTimes(1));
    expect(mocks.fundirIdentificados).toHaveBeenCalledWith(
      escolha === "registro aberto" ? "a" : "b", escolha === "registro aberto" ? "b" : "a",
    );
  });

  it("duplo clique chama uma vez; durante envio nem escolha, cancelamento ou Escape encerram o diálogo", async () => {
    let concluir!: (valor: unknown) => void;
    mocks.fundirIdentificados.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    const fechar = vi.fn();
    render(createElement(DialogoFundirIdentificados, { identificado: a, candidato: b, aoFechar: fechar }));
    escolher();
    const botao = screen.getByRole("button", { name: "Confirmar união dos históricos" });
    fireEvent.click(botao); fireEvent.click(botao);
    expect(mocks.fundirIdentificados).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(fechar).not.toHaveBeenCalled();
    await act(async () => { concluir({ sobreviventeId: "b", absorvidoId: "a", repetida: false }); });
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it("erro mantém escolha e diálogo, apresenta a recusa e não declara sucesso", async () => {
    mocks.fundirIdentificados.mockRejectedValue(new Error("Registro com exclusão em andamento."));
    const fechar = vi.fn();
    render(createElement(DialogoFundirIdentificados, { identificado: a, candidato: b, aoFechar: fechar }));
    escolher();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar união dos históricos" }));
    expect((await screen.findByRole("alert")).textContent).toContain("exclusão em andamento");
    expect(fechar).not.toHaveBeenCalled();
    expect((screen.getByRole("radio", { name: "Manter registro sugerido como principal" }) as HTMLInputElement).checked).toBe(true);
    expect(useProspeccao.getState().detalhe).toBe(historicoA);
  });

  it.each(["fundido", "promovido", "promovendo", "exclusao"] as const)("não oferece união com %s em qualquer lado", async (bloqueio) => {
    const extras: Partial<ImovelIdentificado> = bloqueio === "exclusao"
      ? { exclusaoSolicitadaEm: "2026-09-13T10:00:00Z" } : { situacao: bloqueio };
    for (const lado of ["alvo", "candidato"]) {
      const alvo = lado === "alvo" ? identificado("a", extras) : a;
      mocks.buscarCandidatosDuplicidade.mockResolvedValue([lado === "candidato" ? identificado("b", extras) : b]);
      render(createElement(CandidatosDuplicidade, { alvo: identidadeParaDedupe(alvo), identificado: alvo }));
      await screen.findByRole("region", { name: "Possíveis duplicatas" });
      expect(screen.queryByRole("button", { name: "É o mesmo" })).toBeNull();
      cleanup();
    }
    expect(mocks.fundirIdentificados).not.toHaveBeenCalled();
  });

  it("cancelar e reabrir descarta a escolha e a confirmação anteriores", async () => {
    render(createElement(CandidatosDuplicidade, { alvo: identidadeParaDedupe(a), identificado: a }));
    const abrir = await screen.findByRole("button", { name: "É o mesmo" });
    fireEvent.click(abrir); escolher();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(abrir);
    expect(screen.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(mocks.fundirIdentificados).not.toHaveBeenCalled();
  });
});

describe("C7b — lista, painel e histórico", () => {
  it.each([false, true])("sucesso repetido=%s fecha, remove absorvido da lista e mostra todos os eventos", async (repetida) => {
    render(createElement(ProspeccaoView, { armazemRascunho: armazem }));
    fireEvent.click(await screen.findByRole("button", { name: "É o mesmo" }));
    escolher(); sucesso(repetida);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar união dos históricos" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useProspeccao.getState().itens.map((i) => i.id)).toEqual(["b"]);
    expect(screen.getByRole("list", { name: "Histórico de passagens" }).querySelectorAll("[data-avistamento-id]")).toHaveLength(2);
    expect(screen.getByText("Observação evento-a")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Histórico de passagens" })).getByText("Observação evento-b")).toBeTruthy();
    expect(mocks.fundirIdentificados).toHaveBeenCalledTimes(1);
  });


  it("bloqueia abrir outro avistamento enquanto a união está em andamento", async () => {
    let concluir!: (resultado: unknown) => void;
    mocks.fundirIdentificados.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    render(createElement(ProspeccaoView, { armazemRascunho: armazem }));
    fireEvent.click(await screen.findByRole("button", { name: "É o mesmo" }));
    escolher();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar união dos históricos" }));
    expect((screen.getByRole("button", { name: "Nova passagem" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Registrar novo local" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { concluir({ sobreviventeId: "b", absorvidoId: "a", repetida: false }); });
  });

  it("foto antiga abre pelo mesmo caminho opaco após mudar o vínculo do avistamento", async () => {
    const foto = {
      id: "foto-a", avistamentoId: "evento-a", imovelIdentificadoId: "b", estado: "ativa",
      caminho: "usuario/a/evento-a/foto.jpg", caminhoMiniatura: "usuario/a/evento-a/foto_thumb.jpg",
      largura: 100, altura: 100, bytes: 1000,
    };
    const comFoto = { ...unido, avistamentos: [unido.avistamentos[0], { ...unido.avistamentos[1], fotos: [foto] }] } as DetalheImovelIdentificado;
    render(createElement(PainelIdentificado, { detalhe: comFoto }));
    await waitFor(() => expect(mocks.createSignedUrl).toHaveBeenCalledWith(foto.caminho, expect.any(Number)));
    await waitFor(() => expect(new URL((screen.getByRole("img", { name: "Fachada registrada nesta passagem" }) as HTMLImageElement).src).pathname).toBe("/foto-original-preservada.jpg"));
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("lápide é somente memória da união e abre o principal, sem novos avistamentos ou exclusão", async () => {
    const lapide = { ...historicoA, identificado: identificado("a", {
      situacao: "fundido", fundidoEm: "2026-09-13T10:00:00Z", fundidoEmImovelId: "b", avistamentosTotal: 0,
    }), avistamentos: [] };
    render(createElement(PainelIdentificado, { detalhe: lapide }));
    expect(screen.getByText("UNIDO A OUTRO REGISTRO")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Abrir registro principal e histórico unido" }));
    await waitFor(() => expect(mocks.obterIdentificado).toHaveBeenCalledWith("b", { incluirClassificacoes: false }));
  });

  it("falha de refresh informa união confirmada e oferece apenas recarregar, sem repetir a RPC", async () => {
    render(createElement(ProspeccaoView, { armazemRascunho: armazem }));
    fireEvent.click(await screen.findByRole("button", { name: "É o mesmo" }));
    escolher(); sucesso();
    mocks.listarIdentificados.mockRejectedValueOnce(new Error("Falha de leitura."));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar união dos históricos" }));
    const recarregar = await screen.findByRole("button", { name: "Recarregar registros" });
    expect(screen.getByText("União confirmada; atualização pendente.")).toBeTruthy();
    expect(useProspeccao.getState().itens).toEqual([]);
    fireEvent.click(recarregar);
    await waitFor(() => expect(screen.queryByText("União confirmada; atualização pendente.")).toBeNull());
    expect(useProspeccao.getState().itens.map((i) => i.id)).toEqual(["b"]);
    expect(mocks.fundirIdentificados).toHaveBeenCalledTimes(1);
  });
});
