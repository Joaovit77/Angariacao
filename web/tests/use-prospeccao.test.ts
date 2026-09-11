import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarIdentificados: vi.fn(),
  obterIdentificado: vi.fn(),
  criarIdentificado: vi.fn(),
  acrescentarAvistamento: vi.fn(),
  corrigirObservacaoAvistamento: vi.fn(),
  reservarFotoAvistamento: vi.fn(),
  finalizarFotoAvistamento: vi.fn(),
  descartarIdentificado: vi.fn(),
  aplicarEtiquetaHumana: vi.fn(),
  confirmarEtiqueta: vi.fn(),
  contestarEtiqueta: vi.fn(),
  definirTipoManual: vi.fn(),
}));

vi.mock("@/lib/prospeccao", () => mocks);

import { useProspeccao } from "@/lib/useProspeccao";
import type {
  DetalheImovelIdentificado,
  ImovelIdentificado,
} from "@/lib/prospeccao";

function identificado(id: string): ImovelIdentificado {
  return { id, situacao: "identificado", logradouro: `Rua ${id}` } as ImovelIdentificado;
}

function detalhe(id: string, avistamentos: string[] = []): DetalheImovelIdentificado {
  return {
    identificado: identificado(id),
    avistamentos: avistamentos.map((avistamentoId) => ({ id: avistamentoId })),
    etiquetasDoImovel: [],
    classificacoesCarregadas: false,
  } as unknown as DetalheImovelIdentificado;
}

beforeEach(() => {
  vi.clearAllMocks();
  useProspeccao.getState().resetar();
});

describe("estado local do Garimpo em Campo", () => {
  it("carrega a página e registra paginação só depois da leitura", async () => {
    let concluir!: (valor: unknown) => void;
    mocks.listarIdentificados.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    useProspeccao.setState({ itens: [identificado("anterior")] });

    const carregamento = useProspeccao.getState().carregarPagina(3, 12);

    expect(useProspeccao.getState()).toMatchObject({
      carregando: true,
      pagina: 1,
      itens: [{ id: "anterior" }],
    });
    concluir({
      itens: [identificado("pagina-3")],
      pagina: 3,
      porPagina: 12,
      total: 30,
      temMais: false,
    });

    await expect(carregamento).resolves.toBe(true);
    expect(useProspeccao.getState()).toMatchObject({
      carregando: false,
      pagina: 3,
      porPagina: 12,
      total: 30,
      temMais: false,
      itens: [{ id: "pagina-3" }],
    });
  });

  it("não faz atualização otimista ao criar e recarrega o retrato canônico", async () => {
    let concluirCriacao!: (valor: unknown) => void;
    mocks.criarIdentificado.mockReturnValue(
      new Promise((resolve) => { concluirCriacao = resolve; }),
    );
    mocks.obterIdentificado.mockResolvedValue(detalhe("novo", ["avistamento-1"]));
    useProspeccao.setState({ itens: [identificado("anterior")] });

    const criacao = useProspeccao.getState().criar(
      "usuario-1",
      { logradouro: "Rua Nova" },
      { observadoEm: "2026-09-11T10:00:00.000Z" },
    );

    expect(useProspeccao.getState()).toMatchObject({
      salvando: true,
      itens: [{ id: "anterior" }],
      detalhe: null,
    });
    concluirCriacao({ identificado: identificado("novo"), avistamento: { id: "avistamento-1" } });

    await expect(criacao).resolves.toBe(true);
    expect(mocks.obterIdentificado).toHaveBeenCalledWith("novo", {
      incluirClassificacoes: false,
    });
    expect(useProspeccao.getState()).toMatchObject({
      salvando: false,
      selecionadoId: "novo",
      detalhe: { identificado: { id: "novo" } },
      itens: [{ id: "novo" }, { id: "anterior" }],
    });
  });

  it("mantém dados anteriores coerentes e registra erro quando a escrita falha", async () => {
    const detalheAnterior = detalhe("anterior", ["avistamento-antigo"]);
    const itensAnteriores = [identificado("anterior")];
    useProspeccao.setState({
      itens: itensAnteriores,
      detalhe: detalheAnterior,
      selecionadoId: "anterior",
    });
    mocks.criarIdentificado.mockRejectedValue(new Error("falha simulada"));

    await expect(
      useProspeccao.getState().criar(
        "usuario-1",
        { logradouro: "Rua Nova" },
        { observadoEm: "2026-09-11T10:00:00.000Z" },
      ),
    ).resolves.toBe(false);

    expect(useProspeccao.getState()).toMatchObject({
      itens: itensAnteriores,
      detalhe: detalheAnterior,
      selecionadoId: "anterior",
      salvando: false,
      erro: "Não foi possível registrar esta identificação.",
    });
    expect(mocks.obterIdentificado).not.toHaveBeenCalled();
  });

  it("não publica estado parcial se a releitura após a escrita falha", async () => {
    const detalheAnterior = detalhe("identificado-1", ["avistamento-1"]);
    useProspeccao.setState({
      itens: [detalheAnterior.identificado],
      detalhe: detalheAnterior,
      selecionadoId: "identificado-1",
    });
    mocks.acrescentarAvistamento.mockResolvedValue({ id: "avistamento-2" });
    mocks.obterIdentificado.mockRejectedValue(new Error("falha de leitura"));

    const resultado = await useProspeccao.getState().adicionarAvistamento(
      "usuario-1",
      "identificado-1",
      { observadoEm: "2026-09-11T10:00:00.000Z" },
    );

    expect(resultado).toBe(false);
    expect(useProspeccao.getState()).toMatchObject({
      detalhe: detalheAnterior,
      itens: [detalheAnterior.identificado],
      salvando: false,
      erro: "Não foi possível adicionar o avistamento.",
    });
  });

  it("mantém o estado anterior quando a reserva da foto falha", async () => {
    const detalheAnterior = detalhe("identificado-1", ["avistamento-1"]);
    useProspeccao.setState({
      itens: [detalheAnterior.identificado],
      detalhe: detalheAnterior,
      selecionadoId: "identificado-1",
    });
    mocks.reservarFotoAvistamento.mockRejectedValue(new Error("falha simulada"));

    const resultado = await useProspeccao.getState().reservarFoto(
      "identificado-1",
      "avistamento-1",
      { largura: 1200, altura: 900, bytes: 1000 },
    );

    expect(resultado).toBeNull();
    expect(useProspeccao.getState()).toMatchObject({
      detalhe: detalheAnterior,
      itens: [detalheAnterior.identificado],
      salvando: false,
      erro: "Não foi possível reservar a foto.",
    });
    expect(mocks.obterIdentificado).not.toHaveBeenCalled();
  });

  it("encaminha as mutações autorizadas e atualiza o detalhe somente após cada sucesso", async () => {
    mocks.acrescentarAvistamento.mockResolvedValue({ id: "avistamento-2" });
    mocks.corrigirObservacaoAvistamento.mockResolvedValue({ id: "avistamento-2" });
    mocks.reservarFotoAvistamento.mockResolvedValue({
      fotoId: "foto-1",
      caminho: "caminho",
      caminhoMiniatura: "miniatura",
      repetida: false,
    });
    mocks.finalizarFotoAvistamento.mockResolvedValue({ repetida: false });
    mocks.descartarIdentificado.mockResolvedValue({ repetida: false });
    mocks.aplicarEtiquetaHumana.mockResolvedValue({ repetida: false });
    mocks.confirmarEtiqueta.mockResolvedValue({ repetida: false });
    mocks.contestarEtiqueta.mockResolvedValue({ repetida: false });
    mocks.definirTipoManual.mockResolvedValue({ repetida: false });
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1", ["avistamento-2"]));

    await expect(useProspeccao.getState().adicionarAvistamento(
      "usuario-1",
      "identificado-1",
      { observadoEm: "2026-09-11T10:00:00.000Z" },
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().corrigirObservacao(
      "identificado-1",
      "avistamento-2",
      "Corrigida",
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().reservarFoto(
      "identificado-1",
      "avistamento-2",
      { largura: 1200, altura: 900, bytes: 1000 },
    )).resolves.toMatchObject({ fotoId: "foto-1" });
    await expect(useProspeccao.getState().finalizarFoto(
      "identificado-1",
      "foto-1",
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().descartar(
      "identificado-1",
      "Sem interesse",
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().aplicarEtiqueta(
      "identificado-1",
      "avistamento-2",
      "estado-visual",
      "aparenta-vago",
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().confirmarEtiqueta(
      "identificado-1",
      1,
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().contestarEtiqueta(
      "identificado-1",
      2,
    )).resolves.toBe(true);
    await expect(useProspeccao.getState().definirTipo(
      "identificado-1",
      "Casa",
    )).resolves.toBe(true);

    expect(mocks.acrescentarAvistamento).toHaveBeenCalledWith(
      "usuario-1",
      "identificado-1",
      expect.any(Object),
    );
    expect(mocks.corrigirObservacaoAvistamento).toHaveBeenCalledWith(
      "avistamento-2",
      "Corrigida",
    );
    expect(mocks.reservarFotoAvistamento).toHaveBeenCalledWith(
      "avistamento-2",
      { largura: 1200, altura: 900, bytes: 1000 },
    );
    expect(mocks.finalizarFotoAvistamento).toHaveBeenCalledWith("foto-1");
    expect(mocks.descartarIdentificado).toHaveBeenCalledWith(
      "identificado-1",
      "Sem interesse",
    );
    expect(mocks.aplicarEtiquetaHumana).toHaveBeenCalledWith(
      "identificado-1",
      "avistamento-2",
      "estado-visual",
      "aparenta-vago",
    );
    expect(mocks.confirmarEtiqueta).toHaveBeenCalledWith(1);
    expect(mocks.contestarEtiqueta).toHaveBeenCalledWith(2);
    expect(mocks.definirTipoManual).toHaveBeenCalledWith("identificado-1", "Casa");
    expect(mocks.obterIdentificado).toHaveBeenCalledTimes(9);
    expect(useProspeccao.getState()).toMatchObject({
      salvando: false,
      erro: null,
      detalhe: { identificado: { id: "identificado-1" } },
    });
  });
});
