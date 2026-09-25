import { describe, expect, it } from "vitest";
import {
  atributosInequivocosDaConsulta,
  compararResultadosComConfirmacoes,
  projetarContextoConfirmado,
  type AtributoParaContextoConfirmado,
} from "@/lib/calculo/contextoConfirmadoInvestigador";
import type { CorrespondenciaInvestigacao } from "@/lib/calculo/investigadorImoveis";

function linha(atributo: string, valor: number | string, estado = "confirmada"): AtributoParaContextoConfirmado {
  return {
    atributo, estado,
    valorNum: typeof valor === "number" ? valor : null,
    valorTexto: typeof valor === "string" ? valor : null,
  };
}

function resultado(quartos: number | null, url = "https://portal.test/imovel"): CorrespondenciaInvestigacao {
  return {
    titulo: "Apartamento", url, dominio: "portal.test", descricao: "", consultas: [],
    preco: null, endereco: null, referencia: null, condominio: null,
    quartos, vagas: null, area: null, confianca: "indicio", evidencias: [], contradicoes: [],
  };
}

const memoriaTres = () => projetarContextoConfirmado([linha("quartos", 3)]);
const comparar = (consulta: string, quartos: number | null) =>
  compararResultadosComConfirmacoes(memoriaTres(), [resultado(quartos)], consulta);

describe("B3.2b — interpretação conservadora da consulta", () => {
  it.each([
    ["3 quartos", { quartos: 3 }],
    ["apartamento com 3 quartos", { quartos: 3 }],
    ["quartos: 3", { quartos: 3 }],
    ["2 vagas", { vagas: 2 }],
    ["80 m²", { area_m2: 80 }],
    ["Rua Tijuca, 112, 3 quartos, 2 vagas, 80 m²", { quartos: 3, vagas: 2, area_m2: 80 }],
  ])("reconhece somente característica explícita em %s", (consulta, esperado) => {
    expect(atributosInequivocosDaConsulta(consulta)).toEqual(esperado);
  });

  it.each([
    "Rua Tijuca, 112, Londrina, PR",
    "CEP 86000-000, Rua Tijuca, 112",
    "R$ 2.500, Rua Tijuca, 112",
    "Apartamento 3 na Rua Tijuca",
    "3",
    "Rua 3 de Outubro, 112",
    "2 ou 3 quartos",
    "2 e 3 quartos",
    "2 a 3 quartos",
    "2-3 quartos",
    "2 quartos ou 3 quartos",
    "2 ou 3 vagas",
    "2 ou 3 garagens",
    "2 vagas ou 3 vagas",
    "80 ou 90 m²",
    "80 e 90 m²",
    "80 m² ou 90 m²",
    "quartos 3",
    "LD-211",
  ])("não infere atributo de número solto ou ambíguo: %s", (consulta) => {
    expect(atributosInequivocosDaConsulta(consulta)).toEqual({});
  });

  it("mantém texto de condomínio/referência e preço fora da precedência B3.2b", () => {
    expect(atributosInequivocosDaConsulta("Condomínio Aurora, referência ABC123, R$ 450.000")).toEqual({});
  });
});

describe("B3.2b — precedência auxiliar entre entrada, confirmação e web", () => {
  it("A/B: sem confirmação ou sem atributo na consulta mantém o B3.2a", () => {
    const vazio = compararResultadosComConfirmacoes(projetarContextoConfirmado([]), [resultado(3)], "2 quartos");
    expect(vazio).toEqual({ porResultado: [{ url: resultado(3).url, comparacoes: [] }], conflitosConfirmacoes: [] });
    const comMemoria = comparar("Rua Tijuca, 112", 3);
    expect(comMemoria.conflitosEntrada).toBeUndefined();
    expect(comMemoria.porResultado[0].comparacoes).toEqual([{ atributo: "quartos", estado: "coincide" }]);
  });

  it("C: entrada, confirmação e web iguais não geram conflito", () => {
    const resposta = comparar("Rua Tijuca, 112, 3 quartos", 3);
    expect(resposta.conflitosEntrada).toBeUndefined();
    expect(resposta.porResultado[0].comparacoes).toEqual([{ atributo: "quartos", estado: "coincide" }]);
  });

  it("D: web 3 coincide com memória 3, mas diverge da entrada 2", () => {
    const resposta = comparar("Rua Tijuca, 112, 2 quartos", 3);
    expect(resposta.conflitosEntrada).toEqual([{ atributo: "quartos", valorInformado: 2, valorConfirmado: 3 }]);
    expect(resposta.porResultado[0].comparacoes).toEqual([
      { atributo: "quartos", estado: "coincide", relacaoEntrada: "conflita" },
    ]);
  });

  it("E: web 2 acompanha entrada 2 e conflita com memória 3", () => {
    const resposta = comparar("Rua Tijuca, 112, 2 quartos", 2);
    expect(resposta.conflitosEntrada).toEqual([{ atributo: "quartos", valorInformado: 2, valorConfirmado: 3 }]);
    expect(resposta.porResultado[0].comparacoes).toEqual([
      { atributo: "quartos", estado: "conflita", relacaoEntrada: "coincide" },
    ]);
  });

  it("F: web sem quartos não recebe valor inferido nem falso conflito com o resultado", () => {
    const antes = resultado(null);
    const resposta = compararResultadosComConfirmacoes(memoriaTres(), [antes], "2 quartos");
    expect(resposta.conflitosEntrada).toEqual([{ atributo: "quartos", valorInformado: 2, valorConfirmado: 3 }]);
    expect(resposta.porResultado[0].comparacoes).toEqual([
      { atributo: "quartos", estado: "sem_dado_no_resultado", relacaoEntrada: "sem_dado_no_resultado" },
    ]);
    expect(antes.quartos).toBeNull();
  });

  it("G–L: hipóteses e rejeitadas equivalentes ou conflitantes jamais entram no contexto positivo", () => {
    for (const estado of ["hipotese", "rejeitada"]) {
      for (const valor of [2, 3]) {
        const soInvalida = projetarContextoConfirmado([linha("quartos", valor, estado)]);
        expect(soInvalida.valores).toEqual([]);
        expect(compararResultadosComConfirmacoes(soInvalida, [resultado(3)], "2 quartos").conflitosEntrada).toBeUndefined();
        const mista = projetarContextoConfirmado([linha("quartos", 3), linha("quartos", valor, estado)]);
        expect(mista.valores).toEqual(memoriaTres().valores);
        expect(compararResultadosComConfirmacoes(mista, [resultado(2)], "2 quartos").conflitosEntrada)
          .toEqual([{ atributo: "quartos", valorInformado: 2, valorConfirmado: 3 }]);
      }
    }
  });

  it("M: duas confirmações incompatíveis bloqueiam também a precedência B3.2b", () => {
    const contexto = projetarContextoConfirmado([linha("quartos", 2), linha("quartos", 3)]);
    expect(contexto).toEqual({ valores: [], conflitosConfirmacoes: ["quartos"] });
    expect(compararResultadosComConfirmacoes(contexto, [resultado(3)], "2 quartos")).toEqual({
      porResultado: [{ url: resultado(3).url, comparacoes: [] }],
      conflitosConfirmacoes: ["quartos"],
    });
  });

  it("N: consulta ambígua não cria conflito artificial", () => {
    expect(comparar("2 ou 3 quartos", 3).conflitosEntrada).toBeUndefined();
    expect(comparar("2 quartos ou 3 quartos", 3).conflitosEntrada).toBeUndefined();
  });

  it("Y: cada comparação continua ligada à URL do card mesmo após reordenação", () => {
    const alto = resultado(3, "https://portal.test/alto");
    const baixo = resultado(2, "https://portal.test/baixo");
    const resposta = compararResultadosComConfirmacoes(memoriaTres(), [baixo, alto], "2 quartos");
    expect(resposta.porResultado.map((item) => [item.url, item.comparacoes[0].relacaoEntrada])).toEqual([
      [baixo.url, "coincide"], [alto.url, "conflita"],
    ]);
  });

  it("Z: valor_anunciado continua reservado, sem comparação nova", () => {
    const contexto = projetarContextoConfirmado([linha("valor_anunciado", 450000)]);
    const resposta = compararResultadosComConfirmacoes(contexto, [{ ...resultado(3), preco: 450000 }], "R$ 450.000");
    expect(resposta.porResultado[0].comparacoes).toEqual([]);
    expect(resposta.conflitosEntrada).toBeUndefined();
  });
});
import { afterEach, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { POST } from "@/app/api/investigador-imoveis/route";
import { extrairAfirmacoesDaInvestigacao } from "@/lib/calculo/memoriaIdentidade";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), persistir: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/referenciasAvaliacaoInvestigador", () => ({
  associarReferenciasAvaliacaoDoInvestigador: async (_client: unknown, _user: unknown, resultados: unknown) => resultados,
}));
vi.mock("@/lib/servidor/memoriaIdentidade", async (importar) => {
  const real = await importar<typeof import("@/lib/servidor/memoriaIdentidade")>();
  return { ...real, persistirMemoriaDaInvestigacao: mocks.persistir };
});

const USUARIO = "00000000-0000-4000-8000-000000000001";
const IMOVEL = "00000000-0000-4000-8000-000000000011";
type LinhaBanco = { user_id: string; imovel_identificado_id: string; atributo: string; estado: string; valor_texto: string | null; valor_num: number | null };
const memoria = (estado: string, valor: number): LinhaBanco => ({
  user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado,
  valor_texto: null, valor_num: valor,
});

function cliente(linhas: LinhaBanco[], ordem: string[], falhaLeitura = false) {
  const operacoes: string[] = [];
  const rpc = vi.fn();
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USUARIO } }, error: null })) },
    rpc,
    from: vi.fn((tabela: string) => {
      const filtros: Array<[string, unknown]> = [];
      const consulta = {
        select: vi.fn(() => { operacoes.push("select:" + tabela); return consulta; }),
        eq: vi.fn((campo: string, valor: unknown) => { filtros.push([campo, valor]); return consulta; }),
        abortSignal: vi.fn(() => consulta),
        maybeSingle: vi.fn(async () => ({ data: { id: IMOVEL }, error: null })),
        then: (resolve: (valor: unknown) => unknown, reject: (erro: unknown) => unknown) => {
          ordem.push("ler-confirmacoes");
          const visiveis = linhas.filter((linha) => filtros.every(([campo, valor]) => linha[campo as keyof LinhaBanco] === valor));
          return Promise.resolve(falhaLeitura
            ? { data: null, error: { code: "simulada" }, count: null }
            : { data: visiveis, error: null, count: visiveis.length }).then(resolve, reject);
        },
      };
      return consulta;
    }),
  };
  return { client: client as unknown as SupabaseClient, operacoes, rpc };
}

interface Execucao {
  dados: {
    consultas: string[];
    resultados: CorrespondenciaInvestigacao[];
    memoriaConfirmada?: { conflitosEntrada?: unknown[]; porResultado: unknown[] };
    encerramentoAntecipado: boolean;
  };
  ordem: string[];
  payload: { resultados: CorrespondenciaInvestigacao[] };
  chamadasProvider: string[];
  log: { pontuacao: unknown; resultadosDescartados: number; motivoParada: string; etapas: unknown };
  operacoes: string[];
  rpc: ReturnType<typeof vi.fn>;
}

async function executarRota(linhas: LinhaBanco[], consulta = "Rua Michigan, 610, 2 quartos", falhaLeitura = false): Promise<Execucao> {
  const ordem: string[] = [];
  const banco = cliente(linhas, ordem, falhaLeitura);
  mocks.createClient.mockReturnValue(banco.client);
  let payload: { resultados: CorrespondenciaInvestigacao[] } | undefined;
  mocks.persistir.mockImplementation(async (pedido: { resultados: CorrespondenciaInvestigacao[] }) => {
    ordem.push("persistir");
    payload = pedido;
    return { estado: "salva", execucaoId: "execucao-simulada", atributosSalvos: 1, atributosRecusados: 0 };
  });
  const chamadasProvider: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, opcoes: { body?: string }) => {
    chamadasProvider.push(opcoes.body ?? "");
    return new Response(JSON.stringify({ organic_results: [
      { title: "Apartamento Rua Michigan, 610, 3 quartos", description: "Rua Michigan, 610, 3 quartos", link: "https://portal.test/apto" },
      { title: "Receita de bolo", description: "Como fazer bolo de chocolate", link: "https://outro.test/bolo" },
    ] }), { status: 200 });
  }));
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  info.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const resposta = await POST(new Request("http://localhost/api/investigador-imoveis", {
    method: "POST",
    headers: { Authorization: "Bearer teste", "Content-Type": "application/json" },
    body: JSON.stringify({ consulta, imovelIdentificado: IMOVEL }),
  }));
  const eventos = (await resposta.text()).trim().split("\n").filter(Boolean).map((item) => JSON.parse(item));
  const conclusao = (info.mock.calls as unknown as Array<[unknown, unknown]>)
    .find(([rotulo]) => String(rotulo).includes("investigação concluída"))?.[1] as Execucao["log"] | undefined;
  if (!payload || !conclusao) throw new Error("A rota não concluiu a investigação simulada.");
  return {
    dados: eventos.at(-1).dados, ordem, payload,
    chamadasProvider, log: conclusao, operacoes: banco.operacoes, rpc: banco.rpc,
  };
}

describe("B3.2b — fronteira real da rota com provider simulado", () => {
  beforeEach(() => {
    vi.stubEnv("RAPIDAPI_KEY", "chave-simulada");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-simulada");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    mocks.persistir.mockReset();
    mocks.createClient.mockReset();
  });

  it("O/P/Q/R/S/T/U/V/W/X: memória só afeta metadado posterior, sem chamadas ou escritas próprias", async () => {
    const sem = await executarRota([]);
    const com = await executarRota([memoria("confirmada", 3), memoria("hipotese", 2), memoria("rejeitada", 2)]);
    expect(com.ordem).toEqual(["persistir", "ler-confirmacoes"]);
    expect(sem.ordem).toEqual(com.ordem);
    expect(com.dados.consultas).toEqual(sem.dados.consultas);
    expect(com.dados.consultas[0]).toBe("Rua Michigan, 610, 2 quartos imóvel");
    expect(com.chamadasProvider).toEqual(sem.chamadasProvider);
    expect(com.chamadasProvider.length).toBe(sem.chamadasProvider.length);
    expect(com.dados.encerramentoAntecipado).toBe(sem.dados.encerramentoAntecipado);
    expect(com.dados.resultados).toEqual(sem.dados.resultados);
    expect(com.log.resultadosDescartados).toBe(sem.log.resultadosDescartados);
    expect(com.log.pontuacao).toEqual(sem.log.pontuacao);
    expect(com.log.motivoParada).toBe(sem.log.motivoParada);
    const semTempoDeRelogio = (etapas: unknown) => (etapas as Array<Record<string, unknown>>)
      .map((etapa) => Object.fromEntries(Object.entries(etapa).filter(([chave]) => chave !== "orcamentoRestanteMs")));
    expect(semTempoDeRelogio(com.log.etapas)).toEqual(semTempoDeRelogio(sem.log.etapas));
    expect(com.payload.resultados).toEqual(sem.payload.resultados);
    expect(extrairAfirmacoesDaInvestigacao(com.payload.resultados))
      .toEqual(extrairAfirmacoesDaInvestigacao(sem.payload.resultados));
    expect(com.operacoes.every((operacao) => operacao.startsWith("select:"))).toBe(true);
    expect(com.rpc).not.toHaveBeenCalled();
    expect(com.dados.memoriaConfirmada?.conflitosEntrada).toEqual([
      { atributo: "quartos", valorInformado: 2, valorConfirmado: 3 },
    ]);
    expect(sem.dados.memoriaConfirmada).toBeUndefined();
  });

  it("O: falha da leitura confirmada não compromete a investigação concluída", async () => {
    const sem = await executarRota([]);
    const falhou = await executarRota([memoria("confirmada", 3)], "Rua Michigan, 610, 2 quartos", true);
    expect(falhou.dados.consultas).toEqual(sem.dados.consultas);
    expect(falhou.dados.resultados).toEqual(sem.dados.resultados);
    expect(falhou.payload.resultados).toEqual(sem.payload.resultados);
    expect(falhou.chamadasProvider).toEqual(sem.chamadasProvider);
    expect(falhou.dados.memoriaConfirmada).toBeUndefined();
    expect((falhou.log as typeof falhou.log & { b3_2a: { leituraFalhou: boolean } }).b3_2a.leituraFalhou).toBe(true);
  });

  it("G–M: a rota lê só confirmada; hipótese/rejeição não altera a precedência", async () => {
    for (const estado of ["hipotese", "rejeitada"]) {
      for (const valor of [2, 3]) {
        const soInvalida = await executarRota([memoria(estado, valor)]);
        expect(soInvalida.dados.memoriaConfirmada).toBeUndefined();
        const comConfirmacao = await executarRota([memoria("confirmada", 3), memoria(estado, valor)]);
        expect(comConfirmacao.dados.memoriaConfirmada?.conflitosEntrada).toEqual([
          { atributo: "quartos", valorInformado: 2, valorConfirmado: 3 },
        ]);
      }
    }
    const incompatíveis = await executarRota([memoria("confirmada", 2), memoria("confirmada", 3)]);
    expect(incompatíveis.dados.memoriaConfirmada?.conflitosEntrada).toBeUndefined();
  });

  it("barreira estrutural: memória não é entrada do planejamento, B2, B3.1 ou persistência", () => {
    const rota = readFileSync(new URL("../app/api/investigador-imoveis/route.ts", import.meta.url), "utf8");
    const planejar = rota.indexOf("plano = planejarPesquisasInvestigacao(consultaOriginal)");
    const triar = rota.indexOf("triarCorrespondenciasInvestigacao(consultaOriginal, unicos)");
    const ordenar = rota.indexOf("ordenarMantidosInvestigacao(triagem, resultados)");
    const persistir = rota.indexOf("await persistirMemoriaDaInvestigacao(");
    const ler = rota.indexOf("await lerConfirmacoesInvestigador(");
    const comparar = rota.indexOf("compararResultadosComConfirmacoes(contexto, exibidos.map(");
    expect(planejar).toBeGreaterThan(-1);
    expect(planejar).toBeLessThan(triar);
    expect(triar).toBeLessThan(ordenar);
    expect(ordenar).toBeLessThan(persistir);
    expect(persistir).toBeLessThan(ler);
    expect(ler).toBeLessThan(comparar);
    expect(rota).not.toContain("derivarMemoriaAtual");
    expect(rota).not.toContain("afirmacaoAtiva");
    const projecao = readFileSync(new URL("../lib/calculo/contextoConfirmadoInvestigador.ts", import.meta.url), "utf8");
    expect(projecao).not.toContain(".vigente");
    expect(projecao).not.toContain("afirmacaoAtiva");
  });
});
