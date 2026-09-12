// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  estado: {
    itens: [] as unknown[],
    detalhe: null as unknown,
    selecionadoId: null as string | null,
    pagina: 1,
    porPagina: 24,
    total: 0,
    temMais: false,
    carregando: false,
    salvando: false,
    erro: null as string | null,
    carregarPagina: vi.fn(),
    carregarDetalhe: vi.fn(),
    limparSelecao: vi.fn(),
    criar: vi.fn(),
    adicionarAvistamento: vi.fn(),
    corrigirObservacao: vi.fn(),
    descartar: vi.fn(),
    confirmarEtiqueta: vi.fn(),
    contestarEtiqueta: vi.fn(),
    definirTipo: vi.fn(),
  },
  abrirModal: vi.fn(),
  fecharModal: vi.fn(),
  usuario: { id: "usuario-1" },
}));

vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) =>
    seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});

vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: {
    abrirModal: typeof cenario.abrirModal;
    fecharModal: typeof cenario.fecharModal;
  }) => unknown) => seletor({ abrirModal: cenario.abrirModal, fecharModal: cenario.fecharModal }),
}));

/* C6: sem GPS nem Nominatim nos testes de tela — a localização é
   exercitada na própria suíte do C6. */
vi.mock("@/lib/geo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geo")>()),
  capturarPosicaoAtual: async () => ({ ok: false, motivo: "indisponivel" }),
  geocodeEndereco: async () => null,
}));

vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: cenario.usuario }),
}));

import ModalAvistamento from "@/components/modais/ModalAvistamento";
import LinhaDoTempoAvistamentos from "@/components/prospeccao/LinhaDoTempoAvistamentos";
import ProspeccaoView from "@/components/prospeccao/ProspeccaoView";

function identificado(id: string) {
  return {
    id,
    situacao: "identificado",
    logradouro: `Rua ${id}`,
    numero: "10",
    unidade: null,
    bloco: null,
    edificio: null,
    bairro: "Centro",
    cidade: "Londrina",
    estado: "PR",
    pontoReferencia: null,
    tipo: null,
    avistamentosTotal: 2,
    ultimoAvistamentoEm: "2026-09-11T14:00:00.000Z",
    avistamentoCorrenteId: "avistamento-novo",
  } as never;
}

function avistamento(id: string, observadoEm: string, observacao: string) {
  return {
    id,
    imovelIdentificadoId: "identificado-1",
    observadoEm,
    createdAt: observadoEm,
    latitude: null,
    longitude: null,
    acuraciaMetros: null,
    precisaoLocalizacao: "desconhecida",
    observacao,
    observacaoRevisao: id === "avistamento-novo" ? 2 : 1,
    classificacaoEstado: "concluida",
    revisaoConflitoEm: null,
    classificacaoId: `classificacao-${id}`,
    classificacaoEm: observadoEm,
    fingerprint: "fingerprint",
    fotos: [],
    classificacoes: [{ modo: id === "avistamento-novo" ? "reuso" : "modelo" }],
    etiquetas: [{
      id: id === "avistamento-novo" ? 2 : 1,
      imovelIdentificadoId: "identificado-1",
      avistamentoId: id,
      classificacaoId: `classificacao-${id}`,
      categoria: "estado-visual",
      codigo: id === "avistamento-novo" ? "aparenta-ocupado" : "aparenta-vago",
      origem: "ia-texto",
      confianca: 85,
      estado: "inferida",
      observadoEm,
      modelo: "modelo-gravado",
      versaoCatalogo: 1,
      versaoClassificador: 1,
      revisaoObservacao: 1,
      confirmadaPor: null,
      confirmadaEm: null,
      substituidaEm: null,
      substituidaPorClassificacaoId: null,
      desatualizadaEm: null,
      criadoEm: observadoEm,
    }],
  } as never;
}

function detalhe() {
  return {
    identificado: identificado("identificado-1"),
    avistamentos: [
      avistamento("avistamento-novo", "2026-09-11T14:00:00.000Z", "Placa nova"),
      avistamento("avistamento-antigo", "2026-09-09T10:00:00.000Z", "Imóvel vazio"),
    ],
    etiquetasDoImovel: [],
    classificacoesCarregadas: true,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(cenario.estado, {
    itens: [],
    detalhe: null,
    selecionadoId: null,
    pagina: 1,
    porPagina: 24,
    total: 0,
    temMais: false,
    carregando: false,
    salvando: false,
    erro: null,
  });
  cenario.estado.carregarPagina.mockResolvedValue(true);
  cenario.estado.carregarDetalhe.mockResolvedValue(true);
  cenario.estado.criar.mockResolvedValue(true);
  cenario.estado.adicionarAvistamento.mockResolvedValue(true);
});

afterEach(cleanup);

describe("ProspeccaoView", () => {
  it("exibe o nome final do produto e o carregamento inicial", () => {
    cenario.estado.carregando = true;
    render(createElement(ProspeccaoView));

    expect(screen.getByRole("heading", { name: "Garimpo em Campo" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Carregando identificações");
    expect(cenario.estado.carregarPagina).toHaveBeenCalledWith(1, 24);
  });

  it("apresenta erro com nova tentativa e estado vazio com CTA", () => {
    cenario.estado.erro = "Falha simulada";
    const { rerender } = render(createElement(ProspeccaoView));

    expect(screen.getByRole("alert").textContent).toContain("Falha simulada");
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(cenario.estado.carregarPagina).toHaveBeenCalledWith(1, 24);

    cenario.estado.erro = null;
    rerender(createElement(ProspeccaoView));
    expect(screen.getByText("Nenhum imóvel identificado ativo.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar primeiro avistamento" })[1]);
    expect(cenario.abrirModal).toHaveBeenCalledWith("avistamento");
  });

  it("com registros existentes o topo oferece um local novo, não o 'primeiro avistamento'", () => {
    cenario.estado.itens = [identificado("identificado-1")];
    cenario.estado.total = 1;
    render(createElement(ProspeccaoView));

    expect(screen.queryByRole("button", { name: "Registrar primeiro avistamento" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Registrar novo local" }));
    expect(cenario.abrirModal).toHaveBeenCalledWith("avistamento");
  });

  it("renderiza cards paginados, seleciona o detalhe e avança sem carregar tudo", async () => {
    cenario.estado.itens = [identificado("identificado-1")];
    cenario.estado.total = 30;
    cenario.estado.temMais = true;
    render(createElement(ProspeccaoView));

    fireEvent.click(screen.getByRole("button", { name: /Rua identificado-1/ }));
    expect(cenario.estado.carregarDetalhe).toHaveBeenCalledWith("identificado-1", true);

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => {
      expect(cenario.estado.carregarPagina).toHaveBeenCalledWith(2, 24);
      expect(cenario.estado.limparSelecao).toHaveBeenCalled();
    });
    expect(screen.getByText("Página 1")).toBeTruthy();
  });

  it("abre o painel selecionado apenas com ações entregues até o C4", () => {
    cenario.estado.itens = [identificado("identificado-1")];
    cenario.estado.detalhe = detalhe();
    cenario.estado.selecionadoId = "identificado-1";
    render(createElement(ProspeccaoView));

    expect(screen.getByRole("button", { name: "Novo avistamento" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar correção" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Definir tipo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Contestar" })).toBeTruthy();
    expect(screen.queryByText("Transformar em oportunidade")).toBeNull();
  });
});

describe("LinhaDoTempoAvistamentos", () => {
  it("mantém eventos, etiquetas e proveniência separados em ordem temporal", () => {
    const { container } = render(createElement(LinhaDoTempoAvistamentos, {
      avistamentos: [
        avistamento("avistamento-antigo", "2026-09-09T10:00:00.000Z", "Imóvel vazio"),
        avistamento("avistamento-novo", "2026-09-11T14:00:00.000Z", "Placa nova"),
      ],
      avistamentoCorrenteId: "avistamento-novo",
    }));

    const eventos = [...container.querySelectorAll("[data-avistamento-id]")];
    expect(eventos.map((evento) => evento.getAttribute("data-avistamento-id"))).toEqual([
      "avistamento-novo",
      "avistamento-antigo",
    ]);
    expect(eventos[0].textContent).toContain("Placa nova");
    expect(eventos[0].textContent).toContain("Aparenta ocupado · ia-texto · inferida");
    expect(eventos[0].textContent).toContain("Revisão 2");
    expect(eventos[0].textContent).toContain("Modo: reuso");
    expect(eventos[0].textContent).toContain("Avistamento corrente");
    expect(eventos[1].textContent).toContain("Imóvel vazio");
    expect(eventos[1].textContent).toContain("Aparenta vago · ia-texto · inferida");
  });
});

describe("ModalAvistamento", () => {
  it("deixa explícito que só data e horário são obrigatórios e recolhe detalhes opcionais", () => {
    render(createElement(ModalAvistamento));

    const detalhes = screen.getByText("Mais detalhes do imóvel (opcional)").closest("details");
    expect(detalhes).toBeTruthy();
    expect(detalhes?.hasAttribute("open")).toBe(false);
    expect((screen.getByLabelText("Data") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Horário") as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Logradouro") as HTMLInputElement).required).toBe(false);
    expect((screen.getByLabelText("Observação (opcional)") as HTMLTextAreaElement).required).toBe(false);
  });

  it("aceita o mínimo real do contrato sem inventar endereço ou referência obrigatórios", async () => {
    render(createElement(ModalAvistamento));

    fireEvent.click(screen.getByRole("button", { name: "Salvar avistamento" }));

    await waitFor(() => expect(cenario.estado.criar).toHaveBeenCalled());
    expect(cenario.estado.criar).toHaveBeenCalledWith(
      "usuario-1",
      expect.objectContaining({ logradouro: "", pontoReferencia: "", tipo: null }),
      expect.objectContaining({ observacao: "" }),
    );
    expect(cenario.fecharModal).toHaveBeenCalledOnce();
  });

  it("registra o primeiro avistamento pela action do C3 e fecha somente no sucesso", async () => {
    render(createElement(ModalAvistamento));
    fireEvent.change(screen.getByLabelText("Logradouro"), { target: { value: "Rua Nova" } });
    fireEvent.change(screen.getByLabelText("Observação (opcional)"), { target: { value: "Placa no portão" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avistamento" }));

    await waitFor(() => expect(cenario.estado.criar).toHaveBeenCalled());
    expect(cenario.estado.criar).toHaveBeenCalledWith(
      "usuario-1",
      expect.objectContaining({ logradouro: "Rua Nova", tipo: null }),
      expect.objectContaining({ observacao: "Placa no portão" }),
    );
    expect(cenario.estado.adicionarAvistamento).not.toHaveBeenCalled();
    expect(cenario.fecharModal).toHaveBeenCalledOnce();
  });

  it("registra novo avistamento sem campos de identidade e com foto opcional", async () => {
    cenario.estado.detalhe = detalhe();
    render(createElement(ModalAvistamento, { imovelIdentificadoId: "identificado-1" }));
    expect(screen.queryByLabelText("Logradouro")).toBeNull();
    expect(screen.getByLabelText("Foto da fachada")).toBeTruthy();
    expect(screen.getByText(/Rua identificado-1, 10/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Observação (opcional)"), { target: { value: "Novo retorno" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avistamento" }));

    await waitFor(() => expect(cenario.estado.adicionarAvistamento).toHaveBeenCalledWith(
      "usuario-1",
      "identificado-1",
      expect.objectContaining({ observacao: "Novo retorno" }),
    ));
    expect(cenario.fecharModal).toHaveBeenCalledOnce();
  });

  it("preserva a entrada e mantém o modal aberto quando a action falha", async () => {
    cenario.estado.adicionarAvistamento.mockImplementation(async () => {
      cenario.estado.erro = "Não foi possível adicionar o avistamento.";
      return false;
    });
    render(createElement(ModalAvistamento, { imovelIdentificadoId: "identificado-1" }));
    const observacao = screen.getByLabelText("Observação (opcional)") as HTMLTextAreaElement;
    fireEvent.change(observacao, { target: { value: "Entrada preservada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar avistamento" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Não foi possível adicionar o avistamento.",
      );
    });
    expect(observacao.value).toBe("Entrada preservada");
    expect(cenario.fecharModal).not.toHaveBeenCalled();
  });
});
