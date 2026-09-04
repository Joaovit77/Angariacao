import { describe, expect, it } from "vitest";
import {
  derivarFatosHistoricosComparavel,
  incorporarObservacaoPositiva,
  type ObservacaoPositivaComparavel,
  type ReferenciaHistoricaComparavel,
} from "@/lib/calculo/historicoComparaveisMercado";
import { baseFingerprintAnuncio } from "@/lib/calculo/comparaveisMercado";

const referencia: ReferenciaHistoricaComparavel = {
  primeiroVistoEm: "2026-09-01T10:00:00Z",
  ultimoVistoEm: "2026-09-01T10:00:00Z",
  portal: "olx",
  idExterno: "anuncio-123",
  urlCanonica: "https://olx.com.br/imovel/anuncio-123",
  fingerprintForte: true,
  estado: "PR",
  cidadeChave: "londrina",
};

const observacao = (
  observadoEm: string,
  valorAnunciado = 2_500,
  extras: Partial<ObservacaoPositivaComparavel> = {},
): ObservacaoPositivaComparavel => ({
  observadoEm,
  tipoEvento: "reobservado",
  valorAnunciado,
  statusAnuncio: "ativo",
  ...extras,
});

describe("política conservadora de observação", () => {
  it("ausência numa coleta não cria evento nem altera status ou last_seen", () => {
    const historico = [observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo" })];
    const depois = incorporarObservacaoPositiva(historico, null);
    expect(depois).toBe(historico);
    expect(derivarFatosHistoricosComparavel(referencia, depois)).toMatchObject({
      ultimaObservacaoConhecida: "2026-09-01T10:00:00Z",
      alteracoesStatusObservadas: [],
      reaparecimentosComprovados: 0,
    });
  });

  it("portal indisponível também conserva o histórico sem inventar inatividade", () => {
    const historico = [observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo" })];
    const depoisDaFalhaDoPortal = incorporarObservacaoPositiva(historico, null);
    expect(depoisDaFalhaDoPortal).toEqual(historico);
    expect(derivarFatosHistoricosComparavel(referencia, depoisDaFalhaDoPortal)
      .ultimoStatusExplicitamenteObservado).toBeNull();
  });

  it("last_seen só avança quando uma nova observação positiva é incorporada", () => {
    const nova = observacao("2026-09-10T12:00:00Z");
    const fatos = derivarFatosHistoricosComparavel(
      { ...referencia, ultimoVistoEm: nova.observadoEm },
      incorporarObservacaoPositiva([], nova),
    );
    expect(fatos.ultimaObservacaoConhecida).toBe("2026-09-10T12:00:00Z");
    expect(fatos.foiReobservado).toBe(true);
    expect(fatos.quantidadeMinimaObservacoesComprovadas).toBe(2);
  });
});

describe("fatos históricos comprováveis", () => {
  it("reobservação preserva primeira/última observação e contagens honestas", () => {
    const fatos = derivarFatosHistoricosComparavel(
      { ...referencia, ultimoVistoEm: "2026-09-10T12:00:00Z" },
      [
        observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo" }),
        observacao("2026-09-10T12:00:00Z"),
      ],
    );
    expect(fatos).toMatchObject({
      primeiraObservacaoConhecida: "2026-09-01T10:00:00Z",
      ultimaObservacaoConhecida: "2026-09-10T12:00:00Z",
      quantidadeEventosPersistidos: 2,
      quantidadeMinimaObservacoesComprovadas: 2,
      foiReobservado: true,
    });
    expect(fatos.qualidade).toMatchObject({
      reobservacaoComprovada: true,
      inicioDoHistoricoPersistidoComprovado: true,
      contagemCompletaDeObservacoesConhecida: false,
    });
  });

  it("uma única observação não cria alteração de preço nem narrativa de tendência", () => {
    const fatos = derivarFatosHistoricosComparavel(referencia, [
      observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo" }),
    ]);
    expect(fatos.foiReobservado).toBe(false);
    expect(fatos.alteracoesPrecoObservadas).toEqual([]);
    expect(fatos.alteracoesStatusObservadas).toEqual([]);
  });

  it("mudança de preço exige dois valores positivos observados", () => {
    const fatos = derivarFatosHistoricosComparavel(
      { ...referencia, ultimoVistoEm: "2026-09-10T12:00:00Z" },
      [
        observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo" }),
        observacao("2026-09-10T12:00:00Z", 2_400, { tipoEvento: "preco_alterado" }),
      ],
    );
    expect(fatos.alteracoesPrecoObservadas).toEqual([{
      observadoEm: "2026-09-10T12:00:00Z",
      valorAnterior: 2_500,
      valorAtual: 2_400,
      diferenca: -100,
      origemComparacao: "observacoes-consecutivas",
    }]);
  });

  it("preço anterior inválido não produz evento histórico", () => {
    const fatos = derivarFatosHistoricosComparavel(referencia, [
      observacao("2026-09-01T10:00:00Z", 2_500, {
        tipoEvento: "preco_alterado",
        dadosSnapshot: { valorAnterior: 0 },
      }),
    ]);
    expect(fatos.alteracoesPrecoObservadas).toEqual([]);
  });

  it("snapshot isolado num evento novo não inventa uma mudança de preço", () => {
    const fatos = derivarFatosHistoricosComparavel(referencia, [
      observacao("2026-09-01T10:00:00Z", 2_400, {
        tipoEvento: "novo",
        dadosSnapshot: { valorAnterior: 2_500 },
      }),
    ]);
    expect(fatos.alteracoesPrecoObservadas).toEqual([]);
  });

  it("snapshot transacional conserva mudança de preço de comparável legado", () => {
    const fatos = derivarFatosHistoricosComparavel(
      { ...referencia, primeiroVistoEm: "2026-08-01T10:00:00Z", ultimoVistoEm: "2026-09-10T12:00:00Z" },
      [observacao("2026-09-10T12:00:00Z", 2_400, {
        tipoEvento: "preco_alterado",
        dadosSnapshot: { valorAnterior: 2_500 },
      })],
    );
    expect(fatos.alteracoesPrecoObservadas[0]).toMatchObject({
      valorAnterior: 2_500,
      valorAtual: 2_400,
      origemComparacao: "snapshot-da-persistencia",
    });
    expect(fatos.qualidade.inicioDoHistoricoPersistidoComprovado).toBe(false);
  });

  it("status só muda quando as duas pontas possuem evidência explícita", () => {
    const semEvidencia = [
      observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo", statusAnuncio: "removido" }),
      observacao("2026-09-10T12:00:00Z", 2_500, { tipoEvento: "reapareceu", statusAnuncio: "ativo" }),
    ];
    expect(derivarFatosHistoricosComparavel(referencia, semEvidencia).alteracoesStatusObservadas)
      .toEqual([]);

    const comEvidencia = semEvidencia.map((item) => ({ ...item, statusExplicitamenteObservado: true }));
    const fatos = derivarFatosHistoricosComparavel(referencia, comEvidencia);
    expect(fatos.alteracoesStatusObservadas).toEqual([{
      observadoEm: "2026-09-10T12:00:00Z",
      statusAnterior: "removido",
      statusAtual: "ativo",
    }]);
    expect(fatos.reaparecimentosComprovados).toBe(1);
  });
});

describe("qualidade objetiva e identidade", () => {
  it("expõe indicadores objetivos sem produzir score mágico", () => {
    const fatos = derivarFatosHistoricosComparavel(referencia, [
      observacao("2026-09-01T10:00:00Z", 2_500, { tipoEvento: "novo" }),
    ]);
    expect(fatos.qualidade).toEqual({
      portalConhecido: true,
      identidadeConfiavel: true,
      localizacaoConhecida: true,
      datasConsistentes: true,
      precoObservado: true,
      reobservacaoComprovada: false,
      inicioDoHistoricoPersistidoComprovado: true,
      contagemCompletaDeObservacoesConhecida: false,
    });
    expect(fatos.qualidade).not.toHaveProperty("score");
  });

  it("mesma cidade em UFs diferentes mantém fingerprints históricos distintos", () => {
    const oferta = {
      portal: "olx", idExterno: "1", url: "https://olx.com.br/1",
      cidade: "Santa Helena", estado: "PR", bairro: "Centro",
      endereco: "Rua A, 10", tipo: "Apartamento", areaM2: 70,
      quartos: 2, anunciante: "imobiliaria",
    };
    expect(baseFingerprintAnuncio(oferta)).not.toBe(baseFingerprintAnuncio({ ...oferta, estado: "SC" }));
  });

  it("dados insuficientes permanecem explicitamente insuficientes", () => {
    const fatos = derivarFatosHistoricosComparavel({
      ...referencia,
      primeiroVistoEm: null,
      ultimoVistoEm: null,
      portal: "desconhecido",
      idExterno: null,
      urlCanonica: null,
      fingerprintForte: false,
      estado: null,
      cidadeChave: null,
    }, []);
    expect(fatos).toMatchObject({
      primeiraObservacaoConhecida: null,
      ultimaObservacaoConhecida: null,
      quantidadeEventosPersistidos: 0,
      quantidadeMinimaObservacoesComprovadas: 0,
      alteracoesPrecoObservadas: [],
      alteracoesStatusObservadas: [],
      qualidade: {
        identidadeConfiavel: false,
        localizacaoConhecida: false,
        datasConsistentes: false,
        precoObservado: false,
      },
    });
  });

  it("datas invertidas permanecem marcadas como inconsistentes", () => {
    const fatos = derivarFatosHistoricosComparavel({
      ...referencia,
      primeiroVistoEm: "2026-09-10T12:00:00Z",
      ultimoVistoEm: "2026-09-01T10:00:00Z",
    }, []);
    expect(fatos.qualidade.datasConsistentes).toBe(false);
  });
});
