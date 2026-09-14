import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarIdentificados: vi.fn(),
  obterIdentificado: vi.fn(),
  criarIdentificado: vi.fn(),
  acrescentarAvistamento: vi.fn(),
  corrigirObservacaoAvistamento: vi.fn(),
  reservarFotoAvistamento: vi.fn(),
  finalizarFotoAvistamento: vi.fn(),
  fundirIdentificados: vi.fn(),
  descartarIdentificado: vi.fn(),
  aplicarEtiquetaHumana: vi.fn(),
  confirmarEtiqueta: vi.fn(),
  contestarEtiqueta: vi.fn(),
  definirTipoManual: vi.fn(),
  excluirIdentificado: vi.fn(),
  cancelarExclusaoIdentificado: vi.fn(),
  classificarAvistamento: vi.fn(),
  confirmarTipoIdentificado: vi.fn(),
  removerFotoAvistamento: vi.fn(),
  previaExclusaoIdentificado: vi.fn(),
  buscarCandidatosDuplicidade: vi.fn(),
  identidadeParaDedupe: vi.fn((identificado: Record<string, unknown>) => ({
    id: identificado.id, logradouro: identificado.logradouro ?? null, numero: identificado.numero ?? null,
    cidade: identificado.cidade ?? null, unidade: identificado.unidade ?? null, bloco: identificado.bloco ?? null,
    tipo: identificado.tipo ?? null, latitude: identificado.latitude ?? null, longitude: identificado.longitude ?? null,
    acuraciaMetros: identificado.acuraciaMetros ?? null,
  })),
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
    useProspeccao.setState({ itens: [identificado("anterior")], total: 1 });

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
      total: 2,
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

describe("C5b — exclusão coordenada no estado local", () => {
  const RESULTADO = { removidos: 4, pendentes: 0, prefixoVazio: true, concluido: true };

  it("a lista normal exclui ocultos; o filtro recarrega a primeira página com incluirOcultos", async () => {
    mocks.listarIdentificados.mockResolvedValue({ itens: [], pagina: 1, porPagina: 24, total: 0, temMais: false });
    await useProspeccao.getState().carregarPagina(2, 24);
    expect(mocks.listarIdentificados).toHaveBeenLastCalledWith({ pagina: 2, porPagina: 24, incluirOcultos: false });

    await useProspeccao.getState().definirIncluirOcultos(true);
    expect(mocks.listarIdentificados).toHaveBeenLastCalledWith({ pagina: 1, porPagina: 24, incluirOcultos: true });
    expect(useProspeccao.getState().incluirOcultos).toBe(true);
  });

  it("exclusão concluída tira o registro da lista e do detalhe sem reler o pai", async () => {
    useProspeccao.setState({
      itens: [identificado("identificado-1"), identificado("identificado-2")],
      total: 2,
      detalhe: detalhe("identificado-1"),
      selecionadoId: "identificado-1",
    });
    mocks.excluirIdentificado.mockResolvedValue(RESULTADO);

    const resultado = await useProspeccao.getState().excluir("identificado-1");

    expect(resultado).toEqual(RESULTADO);
    expect(mocks.obterIdentificado).not.toHaveBeenCalled();
    expect(useProspeccao.getState()).toMatchObject({
      itens: [{ id: "identificado-2" }],
      total: 1,
      detalhe: null,
      selecionadoId: null,
      salvando: false,
      erro: null,
    });
  });

  it("exclusão pendente mantém o registro, relê o detalhe bloqueado e devolve o resultado honesto", async () => {
    useProspeccao.setState({ itens: [identificado("identificado-1")], total: 1 });
    const pendente = { ...RESULTADO, removidos: 1, pendentes: 3, prefixoVazio: false, concluido: false };
    mocks.excluirIdentificado.mockResolvedValue(pendente);
    mocks.obterIdentificado.mockResolvedValue({
      ...detalhe("identificado-1"),
      identificado: { ...identificado("identificado-1"), exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z" },
    });

    const resultado = await useProspeccao.getState().excluir("identificado-1");

    expect(resultado).toEqual(pendente);
    expect(useProspeccao.getState()).toMatchObject({
      itens: [{ id: "identificado-1", exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z" }],
      total: 1,
      detalhe: { identificado: { exclusaoSolicitadaEm: "2026-09-12T10:00:00.000Z" } },
      erro: null,
    });
  });

  it("falha da rota devolve null com erro e nunca tira o registro da lista", async () => {
    useProspeccao.setState({ itens: [identificado("identificado-1")], total: 1 });
    mocks.excluirIdentificado.mockRejectedValue(new Error("rede"));

    expect(await useProspeccao.getState().excluir("identificado-1")).toBeNull();
    expect(useProspeccao.getState()).toMatchObject({
      itens: [{ id: "identificado-1" }],
      total: 1,
      salvando: false,
      erro: expect.stringContaining("retomável"),
    });
  });

  it("cancelar usa a RPC do navegador e relê o detalhe; remover foto passa pela rota e relê", async () => {
    mocks.cancelarExclusaoIdentificado.mockResolvedValue({ repetida: false });
    mocks.removerFotoAvistamento.mockResolvedValue({ ...RESULTADO, removidos: 2 });
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1"));

    expect(await useProspeccao.getState().cancelarExclusao("identificado-1")).toBe(true);
    expect(mocks.cancelarExclusaoIdentificado).toHaveBeenCalledWith("identificado-1");

    const remocao = await useProspeccao.getState().removerFoto("identificado-1", "foto-1");
    expect(remocao).toMatchObject({ concluido: true });
    expect(mocks.removerFotoAvistamento).toHaveBeenCalledWith("foto-1");
    expect(mocks.obterIdentificado).toHaveBeenCalledTimes(2);
    expect(useProspeccao.getState().erro).toBeNull();
  });

  it("foto cujo arquivo ficou no Storage continua no registro e o estado avisa", async () => {
    mocks.removerFotoAvistamento.mockResolvedValue({ ...RESULTADO, removidos: 0, pendentes: 2, prefixoVazio: false, concluido: false });
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1"));

    const remocao = await useProspeccao.getState().removerFoto("identificado-1", "foto-1");

    expect(remocao).toMatchObject({ concluido: false, pendentes: 2 });
    expect(useProspeccao.getState().erro).toContain("não foi removido");
  });

  it("previaExclusao devolve a contagem ou null, sem mexer no estado", async () => {
    mocks.previaExclusaoIdentificado.mockResolvedValueOnce({ fotosTotal: 3, lapidesTotal: 1 }).mockRejectedValueOnce(new Error("rls"));
    expect(await useProspeccao.getState().previaExclusao("identificado-1")).toEqual({ fotosTotal: 3, lapidesTotal: 1 });
    expect(await useProspeccao.getState().previaExclusao("identificado-1")).toBeNull();
    expect(useProspeccao.getState()).toMatchObject({ salvando: false, erro: null });
  });
});

describe("C7 — dedupe no estado local: liga fronteira e núcleo, sem tocar o estado", () => {
  it("candidatos da conta viram vereditos ordenados; erro vira null; nada muda no store", async () => {
    const alvo = { id: "alvo-1", logradouro: "Rua Souza Naves", numero: "100", cidade: "Londrina", unidade: "", bloco: "", tipo: "Casa" as const,
      latitude: -23.31, longitude: -51.16, acuraciaMetros: 7 };
    mocks.buscarCandidatosDuplicidade.mockResolvedValue([
      { id: "longe", logradouro: "Rua Longe", numero: "1", cidade: "Londrina", latitude: -23.31 + 500 / 111_320, longitude: -51.16, acuraciaMetros: 5 },
      { id: "dup", logradouro: "R. Souza Naves,", numero: "100", cidade: "Londrina", latitude: -23.31 + 10 / 111_320, longitude: -51.16, acuraciaMetros: 5 },
    ]);
    const antes = useProspeccao.getState();

    const duplicatas = await useProspeccao.getState().buscarDuplicatas(alvo);

    expect(mocks.buscarCandidatosDuplicidade).toHaveBeenCalledWith(alvo);
    expect(duplicatas?.map((item) => [item.candidato.id, item.resultado.grau, item.resultado.motivo]))
      .toEqual([["dup", "exata", "identidade-textual"]]);
    expect(useProspeccao.getState().itens).toBe(antes.itens);
    expect(useProspeccao.getState()).toMatchObject({ salvando: false, erro: null });

    mocks.buscarCandidatosDuplicidade.mockRejectedValue(new Error("rls"));
    expect(await useProspeccao.getState().buscarDuplicatas(alvo)).toBeNull();
    expect(useProspeccao.getState().erro).toBeNull();
  });
});

describe("merge no hook", () => {
  const resposta = { sobreviventeId: "principal", absorvidoId: "absorvido", repetida: false };
  const pagina = (itens: ImovelIdentificado[]) => ({ itens, pagina: 1, porPagina: 24, total: itens.length, temMais: false });

  it("aguarda a RPC, bloqueia chamada simultânea e publica lista/histórico somente após as leituras", async () => {
    let concluir!: (r: unknown) => void;
    mocks.fundirIdentificados.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    const antigo = detalhe("absorvido", ["evento-a"]);
    const unido = detalhe("principal", ["evento-b", "evento-a"]);
    useProspeccao.setState({ itens: [antigo.identificado, unido.identificado], detalhe: antigo, selecionadoId: "absorvido" });
    mocks.listarIdentificados.mockResolvedValue(pagina([unido.identificado]));
    mocks.obterIdentificado.mockResolvedValue(unido);
    const operacao = useProspeccao.getState().fundir("principal", "absorvido");
    expect(useProspeccao.getState().detalhe).toBe(antigo);
    expect(mocks.listarIdentificados).not.toHaveBeenCalled();
    await expect(useProspeccao.getState().fundir("principal", "absorvido")).resolves.toBeNull();
    expect(mocks.fundirIdentificados).toHaveBeenCalledTimes(1);
    concluir(resposta);
    await expect(operacao).resolves.toEqual(resposta);
    expect(useProspeccao.getState()).toMatchObject({
      itens: [unido.identificado], detalhe: unido, selecionadoId: "principal", salvando: false, revisaoFusao: 1,
    });
  });

  it("retorno repetido recupera o histórico, inclusive classificações já abertas e filtro de ocultos", async () => {
    const lapide = { ...identificado("absorvido"), situacao: "fundido" } as ImovelIdentificado;
    const unido = detalhe("principal", ["evento-a", "evento-b"]);
    useProspeccao.setState({ incluirOcultos: true, detalhe: { ...detalhe("absorvido"), classificacoesCarregadas: true } });
    mocks.fundirIdentificados.mockResolvedValue({ ...resposta, repetida: true });
    mocks.listarIdentificados.mockResolvedValue(pagina([lapide, unido.identificado]));
    mocks.obterIdentificado.mockResolvedValue(unido);
    await useProspeccao.getState().fundir("principal", "absorvido");
    expect(mocks.listarIdentificados).toHaveBeenCalledWith({ pagina: 1, porPagina: 24, incluirOcultos: true });
    expect(mocks.obterIdentificado).toHaveBeenCalledWith("principal", { incluirClassificacoes: true });
    expect(useProspeccao.getState().itens).toEqual([lapide, unido.identificado]);
  });

  it("erro da RPC mantém o retrato anterior e não recarrega nem declara sucesso", async () => {
    const antigo = detalhe("absorvido");
    useProspeccao.setState({ detalhe: antigo, itens: [antigo.identificado] });
    mocks.fundirIdentificados.mockRejectedValue(new Error("Exclusão em andamento."));
    await expect(useProspeccao.getState().fundir("principal", "absorvido")).resolves.toBeNull();
    expect(useProspeccao.getState()).toMatchObject({ detalhe: antigo, itens: [antigo.identificado], erro: "Exclusão em andamento.", salvando: false });
    expect(mocks.listarIdentificados).not.toHaveBeenCalled();
    expect(mocks.obterIdentificado).not.toHaveBeenCalled();
  });

  it("falha de releitura após confirmação descarta o retrato antigo e recupera só por leitura", async () => {
    useProspeccao.setState({ itens: [identificado("absorvido")], detalhe: detalhe("absorvido") });
    mocks.fundirIdentificados.mockResolvedValue(resposta);
    mocks.listarIdentificados.mockRejectedValueOnce(new Error("Sem conexão."));
    mocks.obterIdentificado.mockResolvedValue(detalhe("principal"));
    await expect(useProspeccao.getState().fundir("principal", "absorvido")).resolves.toEqual(resposta);
    expect(useProspeccao.getState()).toMatchObject({ itens: [], detalhe: null, erro: null, salvando: false });
    expect(useProspeccao.getState().aviso).toContain("Os registros foram unidos");
    mocks.listarIdentificados.mockResolvedValue(pagina([identificado("principal")]));
    await useProspeccao.getState().carregarPagina();
    expect(useProspeccao.getState().aviso).toBeNull();
    expect(mocks.fundirIdentificados).toHaveBeenCalledTimes(1);
  });

  it("resposta antiga não repõe dados depois de resetar a sessão", async () => {
    let concluir!: (r: unknown) => void;
    mocks.fundirIdentificados.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    const operacao = useProspeccao.getState().fundir("principal", "absorvido");
    useProspeccao.getState().resetar();
    concluir(resposta);
    await expect(operacao).resolves.toBeNull();
    expect(useProspeccao.getState()).toMatchObject({ itens: [], detalhe: null, salvando: false, revisaoFusao: 0 });
    expect(mocks.listarIdentificados).not.toHaveBeenCalled();
  });
});

describe("C8 — classificação por IA no estado local", () => {
  const RESPOSTA = {
    ok: true, repetida: false, estado: "concluida", modo: "modelo",
    etiquetas: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }],
    tipo: null, snapshotAplicado: true, falha: null,
  };

  function esperarSegundoPlano() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("avistamento salvo dispara a classificação em segundo plano, com o id do avistamento criado", async () => {
    mocks.criarIdentificado.mockResolvedValue({ identificado: identificado("novo"), avistamento: { id: "av-1" } });
    mocks.acrescentarAvistamento.mockResolvedValue({ id: "av-2" });
    mocks.corrigirObservacaoAvistamento.mockResolvedValue({ id: "av-2" });
    mocks.obterIdentificado.mockImplementation(async (id: string) => detalhe(id, ["av-1", "av-2"]));
    mocks.classificarAvistamento.mockResolvedValue(RESPOSTA);

    await expect(useProspeccao.getState().criar("usuario-1", {} as never, {} as never)).resolves.toBe(true);
    await expect(useProspeccao.getState().adicionarAvistamento("usuario-1", "novo", {} as never)).resolves.toBe(true);
    await expect(useProspeccao.getState().corrigirObservacao("novo", "av-2", "Texto corrigido")).resolves.toBe(true);
    await esperarSegundoPlano();

    expect(mocks.classificarAvistamento.mock.calls.map(([id]) => id)).toEqual(["av-1", "av-2", "av-2"]);
    // A gravação não espera a classificação: `salvando` já voltou a false antes.
    expect(useProspeccao.getState()).toMatchObject({ salvando: false, erro: null, classificandoAvistamentoId: null });
  });

  it("IA indisponível não vira erro na tela: relê o detalhe e segue", async () => {
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1", ["av-1"]));
    await useProspeccao.getState().carregarDetalhe("identificado-1");
    mocks.obterIdentificado.mockClear();
    mocks.classificarAvistamento.mockResolvedValue({ ...RESPOSTA, ok: false, estado: null, etiquetas: [], falha: "nao-configurado" });

    const resultado = await useProspeccao.getState().classificarAvistamento("identificado-1", "av-1");
    expect(resultado).toMatchObject({ ok: false, falha: "nao-configurado" });
    expect(mocks.obterIdentificado).toHaveBeenCalledWith("identificado-1", { incluirClassificacoes: false });
    expect(useProspeccao.getState()).toMatchObject({ erro: null, salvando: false, classificandoAvistamentoId: null });
  });

  it("sem resposta da rota nada muda e nada é relido; a mesma classificação não roda duas vezes ao mesmo tempo", async () => {
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1", ["av-1"]));
    await useProspeccao.getState().carregarDetalhe("identificado-1");
    mocks.obterIdentificado.mockClear();
    let concluir!: (r: unknown) => void;
    mocks.classificarAvistamento.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));

    const primeira = useProspeccao.getState().classificarAvistamento("identificado-1", "av-1");
    expect(useProspeccao.getState().classificandoAvistamentoId).toBe("av-1");
    await expect(useProspeccao.getState().classificarAvistamento("identificado-1", "av-1")).resolves.toBeNull();
    expect(mocks.classificarAvistamento).toHaveBeenCalledTimes(1);

    concluir(undefined);
    await expect(primeira).resolves.toBeNull();
    expect(mocks.obterIdentificado).not.toHaveBeenCalled();
    expect(useProspeccao.getState()).toMatchObject({ erro: null, classificandoAvistamentoId: null });
  });

  /* C9.1: o motivo da última falha é estado TRANSITÓRIO de tela, preso ao
     avistamento em que falhou. Só o código fechado da rota; nunca a
     mensagem bruta. Some na próxima tentativa, no sucesso, ao trocar de
     imóvel e ao limpar a seleção. */
  it("falha guarda só o código, preso ao avistamento; sucesso limpa; nova tentativa apaga o anterior", async () => {
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1", ["av-1", "av-2"]));
    await useProspeccao.getState().carregarDetalhe("identificado-1");
    mocks.classificarAvistamento.mockResolvedValue({ ...RESPOSTA, ok: false, estado: null, etiquetas: [], falha: "limite-diario" });

    await useProspeccao.getState().classificarAvistamento("identificado-1", "av-1");
    expect(useProspeccao.getState().falhaAnalise).toEqual({ avistamentoId: "av-1", codigo: "limite-diario" });
    expect(JSON.stringify(useProspeccao.getState().falhaAnalise)).not.toMatch(/Error|openai|exception/i);

    // Sucesso em OUTRO avistamento não apaga o motivo de av-1 (é dele, não do imóvel).
    mocks.classificarAvistamento.mockResolvedValue(RESPOSTA);
    await useProspeccao.getState().classificarAvistamento("identificado-1", "av-2");
    expect(useProspeccao.getState().falhaAnalise).toEqual({ avistamentoId: "av-1", codigo: "limite-diario" });

    // Nova tentativa em av-1 apaga o motivo enquanto roda; sucesso deixa limpo.
    let concluir!: (r: unknown) => void;
    mocks.classificarAvistamento.mockReturnValue(new Promise((resolve) => { concluir = resolve; }));
    const tentativa = useProspeccao.getState().classificarAvistamento("identificado-1", "av-1");
    expect(useProspeccao.getState().falhaAnalise).toBeNull();
    concluir(RESPOSTA);
    await tentativa;
    expect(useProspeccao.getState().falhaAnalise).toBeNull();
  });

  it("sem resposta da rota o motivo é 'indisponivel'; trocar de imóvel ou limpar a seleção apaga o motivo", async () => {
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1", ["av-1"]));
    await useProspeccao.getState().carregarDetalhe("identificado-1");
    mocks.classificarAvistamento.mockRejectedValue(new Error("ECONNRESET: mensagem bruta que não pode ir para a tela"));
    await useProspeccao.getState().classificarAvistamento("identificado-1", "av-1");
    expect(useProspeccao.getState().falhaAnalise).toEqual({ avistamentoId: "av-1", codigo: "indisponivel" });

    // Outro imóvel carregado: o motivo de av-1 não tem o que dizer sobre ele.
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-2", ["av-9"]));
    await useProspeccao.getState().carregarDetalhe("identificado-2");
    expect(useProspeccao.getState().falhaAnalise).toBeNull();

    mocks.classificarAvistamento.mockResolvedValue({ ...RESPOSTA, ok: false, estado: null, etiquetas: [], falha: "ocupado" });
    await useProspeccao.getState().classificarAvistamento("identificado-2", "av-9");
    expect(useProspeccao.getState().falhaAnalise).toEqual({ avistamentoId: "av-9", codigo: "ocupado" });
    useProspeccao.getState().limparSelecao();
    expect(useProspeccao.getState().falhaAnalise).toBeNull();
  });

  it("confirmar tipo passa pela RPC do navegador e atualiza o detalhe", async () => {
    mocks.obterIdentificado.mockResolvedValue(detalhe("identificado-1", ["av-1"]));
    mocks.confirmarTipoIdentificado.mockResolvedValue({ repetida: false });
    await expect(useProspeccao.getState().confirmarTipo("identificado-1")).resolves.toBe(true);
    expect(mocks.confirmarTipoIdentificado).toHaveBeenCalledWith("identificado-1");
    expect(useProspeccao.getState()).toMatchObject({ salvando: false, erro: null, detalhe: { identificado: { id: "identificado-1" } } });

    mocks.confirmarTipoIdentificado.mockRejectedValue(new Error("tipo_nao_inferido"));
    await expect(useProspeccao.getState().confirmarTipo("identificado-1")).resolves.toBe(false);
    expect(useProspeccao.getState().erro).toBe("Não foi possível confirmar o tipo do imóvel.");
  });
});
