import { describe, expect, it, vi, afterEach } from "vitest";
import { MOTIVOS_RETIRADA, MOTIVO_PERDA_LOCADO_FORA } from "@/lib/constantes";
import { gerarCsv } from "@/lib/csv";
import {
  CABECALHO_CSV_RETIRADOS, filtrosRelatorioRetiradosVazios, linhasCsvRetirados,
  relatorioRetirados, type FiltrosRelatorioRetirados,
} from "@/lib/calculo/relatorioRetirados";
import { relatorioMensal, relatorioSemanal } from "@/lib/calculo/relatorios";
import { relatorioCompleto } from "@/lib/calculo/relatorioCompleto";
import { desempenhoPorCanal } from "@/lib/calculo/canais";
import { desempenhoPorAbordagem, resumoTentativas } from "@/lib/calculo/abordagens";
import { conversaoCaptacao, metricsForRange } from "@/lib/calculo/motor";
import { estatisticasPerdaPosCaptacao } from "@/lib/calculo/perdasPosCaptacao";
import type { Abordagem, Imovel } from "@/lib/tipos";

function imovel(id: string, sobre: Partial<Imovel> = {}): Imovel {
  return { id, codigo: id, endereco: `Rua ${id}`, status: "Publicado", retirado: true, ...sobre };
}
function filtros(sobre: Partial<FiltrosRelatorioRetirados>): FiltrosRelatorioRetirados {
  return { ...filtrosRelatorioRetiradosVazios(), ...sobre };
}
const conjunto = [
  imovel("LD-1", { retiradoEm: "2026-10-01", retiradoMotivo: "vendido" }),
  imovel("LD-2", { retiradoEm: "2026-10-03", retiradoMotivo: "vendido" }),
  imovel("LD-3", { retiradoEm: "2026-10-02", retiradoMotivo: "desistiu" }),
  imovel("LD-4", { retiradoEm: null, retiradoMotivo: "vendido" }),
  imovel("LD-5", { retiradoEm: "2026-09-30", retiradoMotivo: null }),
  imovel("LD-6", { retiradoEm: null, retiradoMotivo: null, retiradoObservacao: null }),
  imovel("ativo", { retirado: false, retiradoEm: "2026-10-02" }),
];
const ids = (r: ReturnType<typeof relatorioRetirados>) => r.linhas.map((linha) => linha.id);

describe("C3: fotografia dos imóveis atualmente retirados", () => {
  it("seleciona somente retirado === true, sem exigir data, motivo, histórico ou status", () => {
    expect(relatorioRetirados([
      imovel("ativo", { retirado: false }), imovel("ausente", { retirado: undefined }),
      imovel("nulo", { retirado: null }), imovel("legado", { statusHistory: [] }),
    ]).linhas.map((linha) => linha.id)).toEqual(["legado"]);
  });

  it.each(["Publicado", "Locado", "Perdido", "Novo contato", "Cancelado", "Angariado"])(
    "status %s não muda a seleção nem é reescrito", (status) => {
      expect(relatorioRetirados([imovel("x", { status })]).linhas[0].status).toBe(status);
    },
  );

  it("nunca usa cadastro, histórico ou notas para preencher a retirada de um legado", () => {
    const r = relatorioRetirados([imovel("legado", {
      dataAngariacao: "2026-10-01", statusHistory: [{ status: "Publicado", date: "2026-10-02" }],
      notas: [{ id: "antiga", data: "2026-10-03", texto: "Retirado em 03/10/2026. Motivo: Vendido." }],
    })]);
    expect(r.linhas[0]).toMatchObject({ dataRetirada: "Não informado", motivo: "Não informado", observacao: "Não informado" });
    expect(r.semData).toBe(1);
  });

  it.each([null, undefined, "", " \r\n "])("observação %j é apresentada e exportada como Não informado", (observacao) => {
    const r = relatorioRetirados([imovel("x", { retiradoObservacao: observacao })]);
    expect(r.linhas[0].observacao).toBe("Não informado");
    expect(linhasCsvRetirados(r)[0][7]).toBe("Não informado");
  });

  it("reativado fica fora mesmo com campos, notas e histórico de retirada antigos", () => {
    const retirado = imovel("x", {
      retiradoEm: "2026-09-15", retiradoMotivo: "vendido",
      notas: [{ id: "retirada", data: "2026-09-15", texto: "Retirado da carteira. Motivo: Vendido." }],
    });
    expect(relatorioRetirados([retirado]).total).toBe(1);
    expect(relatorioRetirados([{ ...retirado, retirado: false }]).total).toBe(0);
    const nova = relatorioRetirados([{ ...retirado, retiradoEm: "2026-10-03", retiradoMotivo: "desistiu" }]);
    expect(nova.linhas).toHaveLength(1);
    expect(nova.linhas[0]).toMatchObject({ dataRetirada: "03/10/2026", motivo: "Desistiu de alugar" });
  });

  it("data inválida não vira data conhecida nem entra em intervalo", () => {
    const invalido = imovel("x", { retiradoEm: "2026-02-30" });
    expect(relatorioRetirados([invalido]).linhas[0].dataRetirada).toBe("Não informado");
    expect(relatorioRetirados([invalido], filtros({ periodo: "intervalo", inicio: "2026-02-01", fim: "2026-03-01" })).total).toBe(0);
  });
});

describe("C3: filtros e resumo do mesmo conjunto", () => {
  it("estado inicial tem todos os motivos e períodos e nenhuma data fabricada", () => {
    expect(filtrosRelatorioRetiradosVazios()).toEqual({ motivo: "todos", periodo: "todos", inicio: "", fim: "" });
    expect(relatorioRetirados(conjunto)).toMatchObject({ total: 6, semData: 2, erroFiltro: null });
  });
  it.each(MOTIVOS_RETIRADA)("filtra o motivo oficial $id", ({ id, rotulo }) => {
    const r = relatorioRetirados([imovel("alvo", { retiradoMotivo: id }), imovel("sem")], filtros({ motivo: id }));
    expect(ids(r)).toEqual(["alvo"]);
    expect(r.porMotivo).toEqual([{ rotulo, quantidade: 1 }]);
  });
  it("motivo Não informado inclui somente ausência de motivo", () => {
    expect(ids(relatorioRetirados(conjunto, filtros({ motivo: "nao-informado" })))).toEqual(["LD-5", "LD-6"]);
  });
  it("intervalo inclui ambas as pontas e exclui ausentes e datas externas", () => {
    const r = relatorioRetirados(conjunto, filtros({ periodo: "intervalo", inicio: "2026-10-01", fim: "2026-10-03" }));
    expect(ids(r)).toEqual(["LD-2", "LD-3", "LD-1"]);
    expect(r.semData).toBe(0);
    expect(r.filtrosAplicados.periodo).toBe("01/10/2026 a 03/10/2026 (inclusive)");
  });
  it("intervalo de um dia inclui a data exata", () => {
    expect(ids(relatorioRetirados(conjunto, filtros({ periodo: "intervalo", inicio: "2026-10-02", fim: "2026-10-02" })))).toEqual(["LD-3"]);
  });
  it("data não informada inclui legados e não reaproveita o intervalo anterior", () => {
    expect(ids(relatorioRetirados(conjunto, filtros({ periodo: "nao-informada", inicio: "2026-10-01", fim: "2026-10-03" })))).toEqual(["LD-4", "LD-6"]);
  });
  it("motivo específico AND intervalo restringem tabela, contagem e distribuição", () => {
    const r = relatorioRetirados(conjunto, filtros({ motivo: "vendido", periodo: "intervalo", inicio: "2026-10-01", fim: "2026-10-03" }));
    expect(ids(r)).toEqual(["LD-2", "LD-1"]);
    expect(r).toMatchObject({ total: 2, semData: 0, porMotivo: [{ rotulo: "Vendido", quantidade: 2 }] });
    expect(linhasCsvRetirados(r).map((linha) => linha[0])).toEqual(["LD-2", "LD-1"]);
  });
  it.each([
    ["vendido", "nao-informada", ["LD-4"]],
    ["nao-informado", "nao-informada", ["LD-6"]],
    ["nao-informado", "intervalo", []],
  ] as const)("combina %s AND %s", (motivo, periodo, esperados) => {
    expect(ids(relatorioRetirados(conjunto, filtros({ motivo, periodo, inicio: "2026-10-01", fim: "2026-10-03" })))).toEqual(esperados);
  });
  it("todos os períodos ignora datas guardadas de um intervalo anterior", () => {
    expect(relatorioRetirados(conjunto, filtros({ inicio: "2026-10-03", fim: "2026-10-01" })).total).toBe(6);
  });
  it.each([
    { inicio: "", fim: "" }, { inicio: "2026-10-01", fim: "" },
    { inicio: "2026-10-03", fim: "2026-10-01" }, { inicio: "2026-02-30", fim: "2026-10-03" },
  ])("intervalo incompleto ou inválido não exporta a carteira inteira: %j", (intervalo) => {
    const r = relatorioRetirados(conjunto, filtros({ periodo: "intervalo", ...intervalo }));
    expect(r.erroFiltro).not.toBeNull();
    expect(r.total).toBe(0);
    expect(linhasCsvRetirados(r)).toEqual([]);
  });
  it("distribuição inclui desconhecidos e sua soma coincide com a tabela", () => {
    const r = relatorioRetirados(conjunto);
    expect(r.porMotivo).toEqual([
      { rotulo: "Vendido", quantidade: 3 }, { rotulo: "Não informado", quantidade: 2 },
      { rotulo: "Desistiu de alugar", quantidade: 1 },
    ]);
    expect(r.porMotivo.reduce((total, grupo) => total + grupo.quantidade, 0)).toBe(r.linhas.length);
    expect(r.total).toBe(r.linhas.length);
  });
  it("ordena datas decrescentes, legados ao final e códigos em ordem natural sem mutar a entrada", () => {
    const entrada = [imovel("LD-10"), imovel("LD-2"), imovel("LD-20", { retiradoEm: "2026-10-01" }), imovel("LD-30", { retiradoEm: "2026-10-03" })];
    const antes = structuredClone(entrada);
    expect(ids(relatorioRetirados(entrada))).toEqual(["LD-30", "LD-20", "LD-2", "LD-10"]);
    expect(entrada).toEqual(antes);
  });
});

describe("C3: contrato CSV", () => {
  it("exporta as oito colunas da tabela, com BOM, acentos, aspas, ; e CR/LF preservados", () => {
    const r = relatorioRetirados([imovel("LD-1", {
      referenciaCrm: "CRM-1", endereco: 'Rua José; número "2"', tipo: "Casa", retiradoEm: "2026-10-03",
      retiradoMotivo: "outro", retiradoObservacao: 'Observação; "primeira"\r\nSegunda linha\nTerceira\rQuarta',
    })]);
    const csv = gerarCsv(CABECALHO_CSV_RETIRADOS, linhasCsvRetirados(r));
    expect(csv).toBe('\uFEFFCódigo;Referência CRM;Endereço;Tipo;Status;Data da retirada;Motivo;Observação\r\n'
      + 'LD-1;CRM-1;"Rua José; número ""2""";Casa;Publicado;03/10/2026;Outro;"Observação; ""primeira""\r\nSegunda linha\nTerceira\rQuarta"');
  });
  it("legado exporta Não informado nas três colunas da retirada", () => {
    expect(linhasCsvRetirados(relatorioRetirados([imovel("legado")]))[0].slice(5)).toEqual(["Não informado", "Não informado", "Não informado"]);
  });
});

afterEach(() => vi.useRealTimers());

describe("C3: retirada não reescreve resultados históricos", () => {
  it("preserva mensal, semanal, esforço/respostas/perdas, captação, conversão, comissão, canais e abordagens", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const historico = [{ status: "Novo contato", date: "2026-09-29" }, { status: "Angariado", date: "2026-10-01" }];
    const carteira: Imovel[] = [
      imovel("captado", { retirado: false, statusHistory: historico, origemImovel: "Placa", tentativas: [{ id: "t", data: "2026-09-29", abordagemId: "a", resultado: "respondeu" }] }),
      imovel("locado", { retirado: false, status: "Locado", statusHistory: [...historico, { status: "Locado", date: "2026-10-02" }], locadoEm: "2026-10-02", comissaoRecebida: true, comissaoRecebidaValor: 1500, comissaoRecebidaData: "2026-10-02", valorAluguel: 1500 }),
      imovel("perda", { retirado: false, status: "Perdido", statusHistory: [...historico, { status: "Perdido", date: "2026-10-02" }], motivoPerda: MOTIVO_PERDA_LOCADO_FORA }),
    ];
    const catalogo: Abordagem[] = [{ id: "a", nome: "Roteiro", arquivada: false }];
    const depois = carteira.map((i) => ({ ...i, retirado: true, retiradoEm: "2026-10-03", retiradoMotivo: "vendido" as const }));
    const resumir = (imoveis: Imovel[]) => {
      const mensal = relatorioMensal(imoveis, 100, "2026-10");
      const semanal = relatorioSemanal(imoveis, 100, 0);
      const completo = relatorioCompleto(imoveis, [], catalogo, "2026-10-01", "2026-10-31", "2026-10-03");
      return {
        mensal: { ...mensal, imoveisAtual: mensal.imoveisAtual.map((i) => i.id) },
        semanal: { ...semanal, imoveisAtual: semanal.imoveisAtual.map((i) => i.id) },
        esforco: completo.esforco, respostas: completo.respostas, perdas: completo.perdas,
        conversao: conversaoCaptacao(imoveis), metricas: metricsForRange(imoveis, 100),
        canais: desempenhoPorCanal(imoveis), abordagens: desempenhoPorAbordagem(imoveis, catalogo, "2026-10-03"),
        tentativas: resumoTentativas(imoveis), perdasPosCaptacao: estatisticasPerdaPosCaptacao(imoveis),
      };
    };
    const antes = resumir(carteira);
    expect(antes.mensal.totalAtual).toBe(3);
    expect(antes.mensal.comissaoRec).toBe(1500);
    expect(antes.perdas.posCaptacao).toBe(1);
    expect(resumir(depois)).toEqual(antes);
  });
});
