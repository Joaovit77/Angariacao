import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ErroProspeccao,
  acrescentarAvistamento,
  aplicarEtiquetaHumana,
  atualizarEnderecoIdentificado,
  confirmarEtiqueta,
  contestarEtiqueta,
  corrigirObservacaoAvistamento,
  criarIdentificado,
  definirTipoManual,
  descartarIdentificado,
  finalizarFotoAvistamento,
  fundirIdentificados,
  listarIdentificados,
  obterIdentificado,
  reservarFotoAvistamento,
} from "@/lib/prospeccao";

type Resposta = { data: unknown; error: unknown; count?: number | null };

function consulta(resposta: Resposta) {
  const chamada = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    single: vi.fn(async () => resposta),
    maybeSingle: vi.fn(async () => resposta),
  };
  const encadeavel = chamada as typeof chamada & PromiseLike<Resposta>;
  chamada.select.mockReturnValue(encadeavel);
  chamada.order.mockReturnValue(encadeavel);
  chamada.range.mockReturnValue(encadeavel);
  chamada.eq.mockReturnValue(encadeavel);
  chamada.insert.mockReturnValue(encadeavel);
  chamada.update.mockReturnValue(encadeavel);
  chamada.in.mockReturnValue(encadeavel);
  chamada.is.mockReturnValue(encadeavel);
  encadeavel.then = (resolver, rejeitar) => Promise.resolve(resposta).then(resolver, rejeitar);
  return encadeavel;
}

function clienteFalso(
  consultas: Record<string, ReturnType<typeof consulta>[]>,
  rpc = vi.fn(),
) {
  return {
    from: vi.fn((tabela: string) => {
      const proxima = consultas[tabela]?.shift();
      if (!proxima) throw new Error(`Consulta não preparada para ${tabela}`);
      return proxima;
    }),
    rpc,
  };
}

function linhaIdentificado(sobrescritas: Record<string, unknown> = {}) {
  return {
    id: "identificado-1",
    situacao: "identificado",
    logradouro: "Rua São Paulo",
    numero: "10",
    unidade: "101",
    bloco: "A",
    edificio: null,
    bairro: "Centro",
    cidade: "Curitiba",
    estado: "PR",
    cep: null,
    ponto_referencia: null,
    endereco_chave: "rua sao paulo 10|curitiba|101|a",
    cidade_chave: "curitiba",
    bairro_chave: "centro",
    latitude: -25.4,
    longitude: -49.2,
    acuracia_metros: 12,
    precisao_localizacao: "gps",
    tipo: null,
    tipo_origem: null,
    tipo_confianca: null,
    tipo_estado: null,
    tipo_definido_em: null,
    tipo_classificacao_id: null,
    tipo_avistamento_id: null,
    tipo_confirmado_por: null,
    tipo_confirmado_em: null,
    primeiro_avistamento_em: "2026-09-10T10:00:00.000Z",
    ultimo_avistamento_em: "2026-09-10T10:00:00.000Z",
    avistamentos_total: 1,
    avistamento_corrente_id: "avistamento-1",
    origem_identificacao: "campo",
    ultima_investigacao_em: null,
    imovel_id: null,
    promovido_em: null,
    descartado_em: null,
    descartado_motivo: null,
    fundido_em: null,
    fundido_em_imovel_id: null,
    exclusao_solicitada_em: null,
    created_at: "2026-09-10T10:00:00.000Z",
    updated_at: "2026-09-10T10:00:00.000Z",
    ...sobrescritas,
  };
}

function linhaAvistamento(id: string, observadoEm: string, createdAt = observadoEm) {
  return {
    id,
    imovel_identificado_id: "identificado-1",
    observado_em: observadoEm,
    latitude: -25.4,
    longitude: -49.2,
    acuracia_metros: 12,
    precisao_localizacao: "gps",
    observacao: `Observação ${id}`,
    observacao_revisao: 1,
    revisao_conflito_em: null,
    classificacao_estado: "pendente",
    classificacao_id: null,
    classificacao_em: null,
    fingerprint: null,
    created_at: createdAt,
  };
}

describe("fronteira de dados do Garimpo em Campo", () => {
  it("pagina a listagem com ordenação estável e contagem exata", async () => {
    const query = consulta({ data: [linhaIdentificado()], error: null, count: 25 });
    const client = clienteFalso({ imoveis_identificados: [query] });

    const pagina = await listarIdentificados(
      { pagina: 2, porPagina: 10 },
      client as never,
    );

    expect(pagina).toMatchObject({ pagina: 2, porPagina: 10, total: 25, temMais: true });
    expect(pagina.itens[0]).toMatchObject({
      id: "identificado-1",
      avistamentosTotal: 1,
      avistamentoCorrenteId: "avistamento-1",
    });
    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(query.order.mock.calls).toEqual([
      ["ultimo_avistamento_em", { ascending: false, nullsFirst: false }],
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(query.range).toHaveBeenCalledWith(10, 19);
  });

  it("monta o detalhe longitudinal sem achatar etiquetas nem buscar classificação por padrão", async () => {
    const identidade = consulta({ data: linhaIdentificado(), error: null });
    const avistamentos = consulta({
      data: [
        linhaAvistamento("avistamento-antigo", "2026-09-09T10:00:00.000Z"),
        linhaAvistamento("avistamento-1", "2026-09-10T10:00:00.000Z"),
      ],
      error: null,
    });
    const fotos = consulta({
      data: [
        {
          id: "foto-1",
          avistamento_id: "avistamento-1",
          imovel_identificado_id: "identificado-1",
          estado: "ativa",
          caminho: "usuario/identificado-1/foto-1.webp",
          caminho_miniatura: "usuario/identificado-1/foto-1-mini.webp",
          largura: 1200,
          altura: 900,
          bytes: 1000,
          capturada_em: null,
          reservada_em: "2026-09-10T10:00:00.000Z",
          ativada_em: "2026-09-10T10:01:00.000Z",
          created_at: "2026-09-10T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const etiquetas = consulta({
      data: [
        {
          id: 1,
          imovel_identificado_id: "identificado-1",
          avistamento_id: "avistamento-1",
          classificacao_id: null,
          categoria: "estado-visual",
          codigo: "aparenta-deteriorado",
          origem: "manual",
          confianca: null,
          estado: "confirmada",
          modelo: null,
          versao_catalogo: 1,
          versao_classificador: null,
          revisao_observacao: null,
          observado_em: "2026-09-10T10:00:00.000Z",
          confirmada_por: "usuario-1",
          confirmada_em: "2026-09-10T10:01:00.000Z",
          substituida_em: null,
          substituida_por_classificacao_id: null,
          desatualizada_em: null,
          created_at: "2026-09-10T10:00:00.000Z",
        },
        {
          id: 2,
          imovel_identificado_id: "identificado-1",
          avistamento_id: null,
          classificacao_id: null,
          categoria: "estado-visual",
          codigo: "aparenta-vago",
          origem: "manual",
          confianca: null,
          estado: "confirmada",
          modelo: null,
          versao_catalogo: 1,
          versao_classificador: null,
          revisao_observacao: null,
          observado_em: null,
          confirmada_por: "usuario-1",
          confirmada_em: "2026-09-10T10:01:00.000Z",
          substituida_em: null,
          substituida_por_classificacao_id: null,
          desatualizada_em: null,
          created_at: "2026-09-10T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const client = clienteFalso({
      imoveis_identificados: [identidade],
      imoveis_identificados_avistamentos: [avistamentos],
      imoveis_identificados_fotos: [fotos],
      imoveis_identificados_etiquetas: [etiquetas],
    });

    const detalhe = await obterIdentificado("identificado-1", {}, client as never);

    expect(detalhe?.avistamentos.map((item) => item.id)).toEqual([
      "avistamento-1",
      "avistamento-antigo",
    ]);
    expect(detalhe?.avistamentos[0].fotos).toHaveLength(1);
    expect(detalhe?.avistamentos[0].etiquetas.map((item) => item.id)).toEqual([1]);
    expect(detalhe?.etiquetasDoImovel.map((item) => item.id)).toEqual([2]);
    expect(detalhe?.classificacoesCarregadas).toBe(false);
    expect(client.from).not.toHaveBeenCalledWith("imoveis_identificados_classificacoes");
  });

  it("carrega proveniência completa da classificação somente quando solicitado", async () => {
    const classificacoes = consulta({
      data: [
        {
          id: "classificacao-1",
          avistamento_id: "avistamento-1",
          imovel_identificado_id: "identificado-1",
          estado: "concluida",
          modo: "modelo",
          reusada_de_classificacao_id: null,
          observacao_revisao: 1,
          fingerprint: "sha256",
          modelo: "modelo-gravado",
          esforco: "baixo",
          versao_catalogo: 1,
          versao_classificador: 2,
          confianca_minima: 70,
          tipo_sugerido: "Casa",
          tipo_confianca: 80,
          snapshot_aplicado: true,
          sugeridas: 2,
          aplicadas: 1,
          abaixo_do_piso: 1,
          fora_do_catalogo: 0,
          sem_evidencia: 0,
          ja_confirmada: 0,
          falha_codigo: null,
          iniciada_em: "2026-09-10T10:00:00.000Z",
          concluida_em: "2026-09-10T10:01:00.000Z",
          lease_token: null,
          lease_expira_em: null,
        },
      ],
      error: null,
    });
    const client = clienteFalso({
      imoveis_identificados: [consulta({ data: linhaIdentificado(), error: null })],
      imoveis_identificados_avistamentos: [
        consulta({ data: [linhaAvistamento("avistamento-1", "2026-09-10T10:00:00.000Z")], error: null }),
      ],
      imoveis_identificados_fotos: [consulta({ data: [], error: null })],
      imoveis_identificados_etiquetas: [consulta({ data: [], error: null })],
      imoveis_identificados_classificacoes: [classificacoes],
    });

    const detalhe = await obterIdentificado(
      "identificado-1",
      { incluirClassificacoes: true },
      client as never,
    );

    expect(detalhe?.classificacoesCarregadas).toBe(true);
    expect(detalhe?.avistamentos[0].classificacoes[0]).toMatchObject({
      fingerprint: "sha256",
      modelo: "modelo-gravado",
      versaoClassificador: 2,
      snapshotAplicado: true,
    });
  });

  it("cria a identidade e depois o primeiro avistamento em duas requisições", async () => {
    const queryIdentidade = consulta({ data: linhaIdentificado(), error: null });
    const queryAvistamento = consulta({
      data: linhaAvistamento("avistamento-1", "2026-09-10T10:00:00.000Z"),
      error: null,
    });
    const client = clienteFalso({
      imoveis_identificados: [queryIdentidade],
      imoveis_identificados_avistamentos: [queryAvistamento],
    });

    await criarIdentificado(
      "usuario-1",
      {
        logradouro: " Rua São Paulo ",
        numero: " 10 ",
        unidade: "101",
        bloco: "A",
        bairro: "Centro",
        cidade: "Curitiba",
        estado: "pr",
      },
      { observadoEm: "2026-09-10T10:00:00.000Z", observacao: "Placa na fachada" },
      client as never,
    );

    expect(client.from.mock.calls.map(([tabela]) => tabela)).toEqual([
      "imoveis_identificados",
      "imoveis_identificados_avistamentos",
    ]);
    expect(queryIdentidade.insert).toHaveBeenCalledWith({
      user_id: "usuario-1",
      logradouro: "Rua São Paulo",
      numero: "10",
      unidade: "101",
      bloco: "A",
      edificio: null,
      bairro: "Centro",
      cidade: "Curitiba",
      estado: "PR",
      cep: null,
      ponto_referencia: null,
      endereco_chave: "rua sao paulo 10|curitiba|101|a",
      cidade_chave: "curitiba",
      bairro_chave: "centro",
      origem_identificacao: "campo",
      tipo: null,
    });
    expect(queryAvistamento.insert).toHaveBeenCalledWith({
      imovel_identificado_id: "identificado-1",
      user_id: "usuario-1",
      observado_em: "2026-09-10T10:00:00.000Z",
      latitude: null,
      longitude: null,
      acuracia_metros: null,
      precisao_localizacao: "desconhecida",
      observacao: "Placa na fachada",
    });
  });

  it("preserva a identidade transitória quando o primeiro avistamento falha", async () => {
    const client = clienteFalso({
      imoveis_identificados: [consulta({ data: linhaIdentificado(), error: null })],
      imoveis_identificados_avistamentos: [
        consulta({ data: null, error: new Error("falha no segundo insert") }),
      ],
    });

    await expect(
      criarIdentificado(
        "usuario-1",
        { logradouro: "Rua São Paulo" },
        { observadoEm: "2026-09-10T10:00:00.000Z" },
        client as never,
      ),
    ).rejects.toThrow("falha no segundo insert");
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it("interrompe antes do avistamento quando a criação da identidade falha", async () => {
    const client = clienteFalso({
      imoveis_identificados: [
        consulta({ data: null, error: new Error("falha no primeiro insert") }),
      ],
    });

    await expect(
      criarIdentificado(
        "usuario-1",
        { logradouro: "Rua São Paulo" },
        { observadoEm: "2026-09-10T10:00:00.000Z" },
        client as never,
      ),
    ).rejects.toThrow("falha no primeiro insert");
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).not.toHaveBeenCalledWith("imoveis");
  });

  it("insere novo avistamento e corrige somente a observação", async () => {
    const inserir = consulta({
      data: linhaAvistamento("avistamento-2", "2026-09-11T10:00:00.000Z"),
      error: null,
    });
    const atualizar = consulta({
      data: linhaAvistamento("avistamento-2", "2026-09-11T10:00:00.000Z"),
      error: null,
    });
    const client = clienteFalso({
      imoveis_identificados_avistamentos: [inserir, atualizar],
    });

    await acrescentarAvistamento(
      "usuario-1",
      "identificado-1",
      {
        observadoEm: "2026-09-11T10:00:00.000Z",
        latitude: -25.5,
        longitude: -49.3,
        acuraciaMetros: 20,
        precisaoLocalizacao: "gps",
      },
      client as never,
    );
    await corrigirObservacaoAvistamento(
      "avistamento-2",
      "Observação corrigida",
      client as never,
    );

    expect(inserir.insert).toHaveBeenCalledWith(expect.objectContaining({
      imovel_identificado_id: "identificado-1",
      user_id: "usuario-1",
      latitude: -25.5,
    }));
    expect(atualizar.update).toHaveBeenCalledWith({ observacao: "Observação corrigida" });
  });

  it("informa o endereço depois do cadastro: só colunas de endereço, com as chaves de dedupe recalculadas como no cadastro", async () => {
    const atualizar = consulta({
      data: linhaIdentificado({ logradouro: "Rua das Palmeiras", numero: "120", endereco_chave: "rua das palmeiras 120|londrina||" }),
      error: null,
    });
    const client = clienteFalso({ imoveis_identificados: [atualizar] });

    const identificado = await atualizarEnderecoIdentificado(
      "identificado-1",
      { logradouro: " Rua das Palmeiras ", numero: "120", bairro: " Centro ", cidade: "Londrina", estado: "pr", cep: "", pontoReferencia: "  " },
      client as never,
    );

    // Nenhuma coluna fora do endereço: nem tipo, nem origem, nem
    // localização, nem agregados — o grant de update não as concede e a
    // função não as pede.
    expect(atualizar.update).toHaveBeenCalledWith({
      logradouro: "Rua das Palmeiras",
      numero: "120",
      unidade: null,
      bloco: null,
      edificio: null,
      bairro: "Centro",
      cidade: "Londrina",
      estado: "PR",
      cep: null,
      ponto_referencia: null,
      endereco_chave: "rua das palmeiras 120|londrina||",
      cidade_chave: "londrina",
      bairro_chave: "centro",
    });
    expect(atualizar.eq).toHaveBeenCalledWith("id", "identificado-1");
    expect(identificado.logradouro).toBe("Rua das Palmeiras");

    // Sem rua nem número a chave volta a vazio (o índice parcial ignora ''), e o
    // ponto de referência entra sozinho.
    const limpar = consulta({ data: linhaIdentificado(), error: null });
    await atualizarEnderecoIdentificado(
      "identificado-1",
      { pontoReferencia: "Ao lado do mercado", cidade: "Londrina" },
      clienteFalso({ imoveis_identificados: [limpar] }) as never,
    );
    expect(limpar.update).toHaveBeenCalledWith(expect.objectContaining({
      logradouro: null, numero: null, endereco_chave: "", cidade_chave: "londrina", ponto_referencia: "Ao lado do mercado",
    }));
  });

  it("reserva e finaliza a foto só pelas RPCs, sem fazer upload", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          ok: true,
          repetida: false,
          foto_id: "foto-1",
          caminho: "usuario/identificado/foto.webp",
          caminho_miniatura: "usuario/identificado/foto-mini.webp",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, repetida: true, foto_id: "foto-1" }, error: null });
    const client = clienteFalso({}, rpc);

    const reserva = await reservarFotoAvistamento(
      "avistamento-1",
      { largura: 1200, altura: 900, bytes: 1000 },
      client as never,
    );
    const finalizacao = await finalizarFotoAvistamento("foto-1", client as never);

    expect(reserva).toEqual({
      fotoId: "foto-1",
      caminho: "usuario/identificado/foto.webp",
      caminhoMiniatura: "usuario/identificado/foto-mini.webp",
      repetida: false,
    });
    expect(finalizacao).toEqual({ repetida: true });
    expect(rpc.mock.calls).toEqual([
      ["reservar_foto_avistamento", {
        p_avistamento_id: "avistamento-1",
        p_largura: 1200,
        p_altura: 900,
        p_bytes: 1000,
      }],
      ["finalizar_foto_avistamento", { p_foto_id: "foto-1" }],
    ]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("usa as RPCs aprovadas para descarte, etiquetas e tipo manual", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, repetida: false }, error: null });
    const client = clienteFalso({}, rpc);

    await descartarIdentificado("identificado-1", "Fora da área", client as never);
    await aplicarEtiquetaHumana(
      "identificado-1",
      "avistamento-1",
      "estado-visual",
      "aparenta-deteriorado",
      client as never,
    );
    await confirmarEtiqueta(1, client as never);
    await contestarEtiqueta(2, client as never);
    await definirTipoManual("identificado-1", "Casa", client as never);

    expect(rpc.mock.calls).toEqual([
      ["definir_situacao_identificado", {
        p_imovel_identificado_id: "identificado-1",
        p_situacao: "descartado",
        p_motivo: "Fora da área",
      }],
      ["aplicar_etiqueta_humana", {
        p_imovel_identificado_id: "identificado-1",
        p_avistamento_id: "avistamento-1",
        p_categoria: "estado-visual",
        p_codigo: "aparenta-deteriorado",
      }],
      ["definir_estado_etiqueta", { p_etiqueta_id: 1, p_estado: "confirmada" }],
      ["definir_estado_etiqueta", { p_etiqueta_id: 2, p_estado: "contestada" }],
      ["definir_tipo_manual", { p_imovel_identificado_id: "identificado-1", p_tipo: "Casa" }],
    ]);
  });

  it("trata falha lógica de RPC como erro e não como sucesso", async () => {
    const client = clienteFalso(
      {},
      vi.fn().mockResolvedValue({ data: { ok: false, codigo: "estado_invalido" }, error: null }),
    );

    await expect(definirTipoManual("identificado-1", "Casa", client as never)).rejects.toEqual(
      expect.objectContaining<Partial<ErroProspeccao>>({ codigo: "estado_invalido" }),
    );
  });
});

describe("isolamento arquitetural do C3", () => {
  it("mantém a fronteira fora do store central, de API e de Storage", () => {
    const fachada = readFileSync(resolve("lib/prospeccao.ts"), "utf8");
    const estado = readFileSync(resolve("lib/useProspeccao.ts"), "utf8");

    // As únicas rotas que a fronteira conhece são as duas da V7 §19: a
    // classificação por IA (C8), que manda SÓ o id do avistamento, e a
    // exclusão coordenada (C5b). O navegador nunca toca o Storage, nunca
    // apaga linha e nunca manda texto para o modelo por conta própria.
    expect(fachada).not.toMatch(/\.storage\b|\.delete\s*\(/);
    expect([...new Set(fachada.match(/\/api\/[\w/-]*/g))].sort()).toEqual([
      "/api/prospeccao/classificar",
      "/api/prospeccao/excluir",
    ]);
    expect(fachada).not.toContain('.from("imoveis")');
    expect(estado).not.toMatch(/from ["']\.\/store["']|from ["']@\/lib\/store["']/);
    expect(estado).toContain('"use client"');
  });

  it("não altera os cinco arquivos centrais protegidos pelo checkpoint", () => {
    // Pins de conteúdo (SHA-256 do arquivo com CRLF normalizado para LF),
    // calculados sobre o conteúdo idêntico ao checkpoint 0ff1120 (C2f do
    // Garimpo). Substituem o `git show <commit>` antigo, que dependia do
    // histórico estar presente (falha em clone raso) e obrigava um segundo
    // commit para mudar a base. Regra: um pin só muda no MESMO commit que
    // altera o arquivo, e a mensagem do commit explica a mudança. Não existe
    // script que regenere pins. O Garimpo nunca altera estes arquivos.
    const pins: Record<string, string> = {
      "lib/store.ts": "36b998f65e37e754186962b907ebd29cba181e30ae11f87a94cca651013572c0",
      "lib/persistencia/carregarEstado.ts": "6fb0bc6923f504b793b240074b6acd08a3b119191ed0f70e7e361a0ce59b3299",
      "lib/tipos.ts": "9cbc5224bc8d2c4150d6c18db710f15813db1f9ae90e8bd75639b0cdcde723dd",
      "lib/persistencia/mapeadores.ts": "13f4f50b93c8614bbaf8ab1c9c6abb91a011d1c821fd5f6b28af1050ae7f3d69",
      "lib/calculo/motor.ts": "a5586f7baaf79964dbfb466388eee0372f649bc9c40f3fd9ab7f5ebd2640e030",
    };
    const sha256 = (texto: string) =>
      createHash("sha256").update(texto.replace(/\r\n/g, "\n")).digest("hex");

    expect(Object.keys(pins)).toHaveLength(5);
    for (const [arquivo, esperado] of Object.entries(pins)) {
      const observado = sha256(readFileSync(resolve(arquivo), "utf8"));
      expect(
        observado,
        `${arquivo} mudou (sha256 observado ${observado}); atualize o pin no MESMO commit e explique por quê`,
      ).toBe(esperado);
    }
  });
});

describe("C7b — fronteira da RPC canônica", () => {
  const a = "10000000-0000-4000-8000-000000000001";
  const b = "10000000-0000-4000-8000-000000000002";

  it.each([false, true])("confirma repetida=%s com uma única RPC e nenhuma escrita direta", async (repetida) => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, repetida, sobrevivente_id: b, absorvido_id: a }, error: null });
    const client = clienteFalso({}, rpc);
    expect(await fundirIdentificados(b, a, client as never)).toEqual({ sobreviventeId: b, absorvidoId: a, repetida });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("fundir_imoveis_identificados", { p_sobrevivente_id: b, p_absorvido_id: a });
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each(["exclusao_em_andamento", "situacao_incompativel", "fusao_em_si_mesmo"])("preserva recusa %s do banco", async (codigo) => {
    const client = clienteFalso({}, vi.fn().mockResolvedValue({ data: { ok: false, codigo }, error: null }));
    await expect(fundirIdentificados(b, a, client as never)).rejects.toMatchObject({ codigo });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("apresenta o erro real quando o banco não retorna código conhecido", async () => {
    const client = clienteFalso({}, vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "Operação recusada pelo banco." } }));
    await expect(fundirIdentificados(b, a, client as never)).rejects.toThrow("Operação recusada pelo banco.");
  });

  it("recusa auto-merge e IDs inválidos antes de chamar o banco", async () => {
    const client = clienteFalso({});
    await expect(fundirIdentificados(a, a, client as never)).rejects.toBeInstanceOf(ErroProspeccao);
    await expect(fundirIdentificados("rascunho", a, client as never)).rejects.toBeInstanceOf(ErroProspeccao);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("não declara sucesso com resposta de outro par", async () => {
    const client = clienteFalso({}, vi.fn().mockResolvedValue({ data: { ok: true, repetida: false, sobrevivente_id: a, absorvido_id: b }, error: null }));
    await expect(fundirIdentificados(b, a, client as never)).rejects.toMatchObject({ codigo: "resposta_rpc_invalida" });
  });
});
