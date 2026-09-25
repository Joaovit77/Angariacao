import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compararResultadosComConfirmacoes,
  projetarContextoConfirmado,
  resumirContextoConfirmado,
  type AtributoParaContextoConfirmado,
} from "@/lib/calculo/contextoConfirmadoInvestigador";
import type { CorrespondenciaInvestigacao } from "@/lib/calculo/investigadorImoveis";
import { extrairAfirmacoesDaInvestigacao } from "@/lib/calculo/memoriaIdentidade";
import { lerConfirmacoesInvestigador } from "@/lib/servidor/contextoConfirmadoInvestigador";

const USUARIO = "00000000-0000-4000-8000-000000000001";
const OUTRO_USUARIO = "00000000-0000-4000-8000-000000000002";
const IMOVEL = "00000000-0000-4000-8000-000000000011";
const OUTRO_IMOVEL = "00000000-0000-4000-8000-000000000012";

function linha(atributo: string, valor: number | string, estado: string = "confirmada"): AtributoParaContextoConfirmado {
  return {
    atributo, estado,
    valorTexto: typeof valor === "string" ? valor : null,
    valorNum: typeof valor === "number" ? valor : null,
  };
}

function resultado(quartos: number | null): CorrespondenciaInvestigacao {
  return {
    titulo: "Apartamento", url: "https://portal.test/imovel", dominio: "portal.test", descricao: "",
    consultas: [], preco: null, endereco: null, referencia: null, condominio: null,
    quartos, vagas: null, area: null, confianca: "indicio", evidencias: [], contradicoes: [],
  };
}

describe("B3.2a — projeção e comparação puras", () => {
  it("aceita somente confirmação e falha fechado para estado desconhecido", () => {
    const contexto = projetarContextoConfirmado([
      linha("quartos", 3), linha("area_m2", 80, "hipotese"),
      linha("vagas", 2, "rejeitada"), linha("condominio", "Segredo", "arquivada"),
    ]);
    expect(contexto.valores.map((item) => item.atributo)).toEqual(["quartos"]);
    expect(contexto.conflitosConfirmacoes).toEqual([]);
  });

  it("duas confirmações equivalentes geram um valor utilizável", () => {
    const contexto = projetarContextoConfirmado([linha("quartos", 3), linha("quartos", 3)]);
    expect(contexto.valores).toEqual([{ atributo: "quartos", valorNum: 3, valorTexto: null }]);
    expect(contexto.conflitosConfirmacoes).toEqual([]);
  });

  it("duas confirmações incompatíveis bloqueiam o atributo sem escolher a mais recente", () => {
    const contexto = projetarContextoConfirmado([linha("quartos", 2), linha("quartos", 3)]);
    expect(contexto.valores).toEqual([]);
    expect(contexto.conflitosConfirmacoes).toEqual(["quartos"]);
    expect(compararResultadosComConfirmacoes(contexto, [resultado(3)]).porResultado[0].comparacoes).toEqual([]);
  });

  it("compara igualdade factual exata, divergência e ausência sem fabricar conflito", () => {
    const contexto = projetarContextoConfirmado([linha("quartos", 3)]);
    expect(compararResultadosComConfirmacoes(contexto, [resultado(3)]).porResultado[0].comparacoes)
      .toEqual([{ atributo: "quartos", estado: "coincide" }]);
    expect(compararResultadosComConfirmacoes(contexto, [resultado(2)]).porResultado[0].comparacoes)
      .toEqual([{ atributo: "quartos", estado: "conflita" }]);
    expect(compararResultadosComConfirmacoes(contexto, [resultado(null)]).porResultado[0].comparacoes)
      .toEqual([{ atributo: "quartos", estado: "sem_dado_no_resultado" }]);
  });

  it("área usa igualdade numérica exata, não a tolerância do score; texto é conservador", () => {
    const contexto = projetarContextoConfirmado([linha("area_m2", 80), linha("condominio", "Edifício Aurora")]);
    const web = { ...resultado(3), area: 81, condominio: "edifício aurora " };
    expect(compararResultadosComConfirmacoes(contexto, [web]).porResultado[0].comparacoes).toEqual([
      { atributo: "area_m2", estado: "conflita" },
      { atributo: "condominio", estado: "coincide" },
    ]);
  });

  it("valor anunciado permanece no catálogo mas não ganha extração ou comparação", () => {
    const contexto = projetarContextoConfirmado([linha("valor_anunciado", 450000)]);
    expect(contexto.valores).toHaveLength(1);
    expect(compararResultadosComConfirmacoes(contexto, [{ ...resultado(3), preco: 450000 }]).porResultado[0].comparacoes).toEqual([]);
  });

  it("memória vazia, só hipóteses ou só rejeitadas não geram contexto", () => {
    for (const linhas of [[], [linha("quartos", 3, "hipotese")], [linha("quartos", 3, "rejeitada")]]) {
      const contexto = projetarContextoConfirmado(linhas);
      expect(contexto).toEqual({ valores: [], conflitosConfirmacoes: [] });
      expect(compararResultadosComConfirmacoes(contexto, [resultado(3)]).porResultado[0].comparacoes).toEqual([]);
    }
  });

  it("resumo só contém versão, booleanos e contagens", () => {
    const contexto = projetarContextoConfirmado([linha("quartos", 3), linha("vagas", 2)]);
    const comparacao = compararResultadosComConfirmacoes(contexto, [resultado(3)]);
    expect(resumirContextoConfirmado(contexto, comparacao)).toEqual({
      versao: "b3.2a-v1", memoriaConfirmadaDisponivel: true, memoriaConfirmadaUtilizada: true,
      atributosConfirmadosDisponiveis: 2, atributosComparados: 1, atributosCoincidentes: 1,
      atributosConflitantes: 0, atributosSemDado: 1, conflitoConfirmacoes: 0, leituraFalhou: false,
    });
  });
});

interface LinhaBanco {
  user_id: string;
  imovel_identificado_id: string;
  atributo: string;
  estado: string;
  valor_texto: string | null;
  valor_num: number | null;
}

function clienteDeLeitura(linhas: LinhaBanco[]) {
  const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]>; operacoes: string[] }> = [];
  const client = {
    from: vi.fn((tabela: string) => {
      const chamada = { tabela, filtros: [] as Array<[string, unknown]>, operacoes: [] as string[] };
      consultas.push(chamada);
      const query = {
        select: vi.fn(() => { chamada.operacoes.push("select"); return query; }),
        eq: vi.fn((campo: string, valor: unknown) => { chamada.filtros.push([campo, valor]); return query; }),
        abortSignal: vi.fn(() => query),
        then: (resolve: (valor: unknown) => unknown, reject: (erro: unknown) => unknown) => {
          const visiveis = linhas.filter((linha) => chamada.filtros.every(([campo, valor]) =>
            linha[campo as keyof LinhaBanco] === valor));
          return Promise.resolve({ data: visiveis, error: null, count: visiveis.length }).then(resolve, reject);
        },
      };
      return query;
    }),
  };
  return { client: client as unknown as SupabaseClient, consultas };
}

describe("B3.2a — leitura autenticada", () => {
  const dados: LinhaBanco[] = [
    { user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado: "confirmada", valor_texto: null, valor_num: 3 },
    { user_id: OUTRO_USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado: "confirmada", valor_texto: null, valor_num: 8 },
    { user_id: USUARIO, imovel_identificado_id: OUTRO_IMOVEL, atributo: "quartos", estado: "confirmada", valor_texto: null, valor_num: 9 },
    { user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "vagas", estado: "rejeitada", valor_texto: null, valor_num: 2 },
  ];

  it("filtra conta, imóvel e estado na consulta, sem leitura ampla nem service role", async () => {
    const { client, consultas } = clienteDeLeitura(dados);
    const leitura = await lerConfirmacoesInvestigador(client, USUARIO, IMOVEL);
    expect(leitura).toEqual({ linhas: [linha("quartos", 3)], falhou: false });
    expect(consultas).toHaveLength(1);
    expect(consultas[0].tabela).toBe("imoveis_identificados_atributos");
    expect(consultas[0].operacoes).toEqual(["select"]);
    expect(consultas[0].filtros).toEqual([
      ["user_id", USUARIO], ["imovel_identificado_id", IMOVEL], ["estado", "confirmada"],
    ]);
  });

  it("resposta truncada não usa confirmação parcial", async () => {
    const client = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          abortSignal: () => query,
          then: (resolve: (valor: unknown) => unknown) => Promise.resolve({
            data: [{ atributo: "quartos", estado: "confirmada", valor_texto: null, valor_num: 3 }],
            count: 2,
            error: null,
          }).then(resolve),
        };
        return query;
      },
    } as unknown as SupabaseClient;
    expect(await lerConfirmacoesInvestigador(client, USUARIO, IMOVEL))
      .toEqual({ linhas: [], falhou: true });
  });

  it("falha de leitura devolve contexto vazio sem lançar", async () => {
    const client = { from: () => { throw new Error("falha privada"); } } as unknown as SupabaseClient;
    expect(await lerConfirmacoesInvestigador(client, USUARIO, IMOVEL)).toEqual({ linhas: [], falhou: true });
  });
});

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), persistirMemoria: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/referenciasAvaliacaoInvestigador", () => ({
  associarReferenciasAvaliacaoDoInvestigador: async (_s: unknown, _u: unknown, resultados: unknown) => resultados,
}));
vi.mock("@/lib/servidor/memoriaIdentidade", async (importar) => {
  const real = await importar<typeof import("@/lib/servidor/memoriaIdentidade")>();
  return { ...real, persistirMemoriaDaInvestigacao: mocks.persistirMemoria };
});

import { POST } from "@/app/api/investigador-imoveis/route";

function clienteDaRota(linhas: LinhaBanco[], ordem: string[]) {
  const chamadas: Array<{ tabela: string; filtros: Array<[string, unknown]>; operacoes: string[] }> = [];
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USUARIO } }, error: null })) },
    from: vi.fn((tabela: string) => {
      const chamada = { tabela, filtros: [] as Array<[string, unknown]>, operacoes: [] as string[] };
      chamadas.push(chamada);
      const query = {
        select: vi.fn(() => { chamada.operacoes.push("select"); return query; }),
        eq: vi.fn((campo: string, valor: unknown) => { chamada.filtros.push([campo, valor]); return query; }),
        abortSignal: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: { id: IMOVEL }, error: null })),
        then: (resolve: (valor: unknown) => unknown, reject: (erro: unknown) => unknown) => {
          ordem.push("ler-confirmacoes");
          const visiveis = linhas.filter((linha) => chamada.filtros.every(([campo, valor]) =>
            linha[campo as keyof LinhaBanco] === valor));
          return Promise.resolve({ data: visiveis, error: null, count: visiveis.length }).then(resolve, reject);
        },
      };
      return query;
    }),
  };
  return { client, chamadas };
}

async function executarRota(linhas: LinhaBanco[], comImovel = true) {
  const ordem: string[] = [];
  const banco = clienteDaRota(linhas, ordem);
  mocks.createClient.mockReturnValue(banco.client);
  mocks.persistirMemoria.mockReset().mockImplementation(async () => {
    ordem.push("persistir");
    return { estado: "salva", execucaoId: "execucao-simulada", atributosSalvos: 1, atributosRecusados: 0 };
  });
  const consulta = "Rua Michigan, 610, 3 quartos";
  const resposta = await POST(new Request("http://localhost/api/investigador-imoveis", {
    method: "POST", headers: { Authorization: "Bearer teste", "Content-Type": "application/json" },
    body: JSON.stringify(comImovel ? { consulta, imovelIdentificado: IMOVEL } : { consulta }),
  }));
  const eventos = (await resposta.text()).trim().split("\n").filter(Boolean).map((item) => JSON.parse(item));
  return { dados: eventos.at(-1).dados, ordem, chamadas: banco.chamadas, memoriaEnviada: mocks.persistirMemoria.mock.calls[0]?.[0] };
}

describe("B3.2a — barreira depois da persistência real da rota", () => {
  const anterior = process.env.RAPIDAPI_KEY;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("RAPIDAPI_KEY", "chave-simulada");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-simulada");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ organic_results: [
      { title: "Apartamento na Rua Michigan, 610, 3 quartos", description: "Rua Michigan, 610, 3 quartos", link: "https://portal.test/imovel" },
    ] }), { status: 200 })));
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (anterior === undefined) delete process.env.RAPIDAPI_KEY;
  });

  it("sem contexto, hipótese apenas e rejeição apenas mantêm a resposta sem metadado", async () => {
    for (const memoria of [[], ["hipotese"], ["rejeitada"]]) {
      const linhas = memoria.map((estado) => ({
        user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado,
        valor_texto: null, valor_num: 3,
      }));
      const execucao = await executarRota(linhas);
      expect(execucao.dados.memoriaConfirmada).toBeUndefined();
      expect(execucao.ordem).toEqual(["persistir", "ler-confirmacoes"]);
    }
  });

  it("auto-confirmação é impossível: coincidência e conflito alteram só o metadado posterior", async () => {
    const semMemoria = await executarRota([]);
    const comTres = await executarRota([{
      user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado: "confirmada",
      valor_texto: null, valor_num: 3,
    }]);
    const comDois = await executarRota([{
      user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado: "confirmada",
      valor_texto: null, valor_num: 2,
    }]);
    for (const execucao of [comTres, comDois]) {
      expect(execucao.ordem).toEqual(["persistir", "ler-confirmacoes"]);
      expect(execucao.dados.consultas).toEqual(semMemoria.dados.consultas);
      expect(execucao.dados.resultados).toEqual(semMemoria.dados.resultados);
      expect(execucao.dados.encerramentoAntecipado).toBe(semMemoria.dados.encerramentoAntecipado);
      expect(execucao.memoriaEnviada.resultados).toEqual(semMemoria.memoriaEnviada.resultados);
      expect(extrairAfirmacoesDaInvestigacao(execucao.memoriaEnviada.resultados))
        .toEqual(extrairAfirmacoesDaInvestigacao(semMemoria.memoriaEnviada.resultados));
      expect(execucao.chamadas.every((item) => item.operacoes.every((op) => op === "select"))).toBe(true);
    }
    const comparacao = (execucao: typeof comTres) => execucao.dados.memoriaConfirmada.porResultado[0].comparacoes;
    expect(comparacao(comTres)).toContainEqual({ atributo: "quartos", estado: "coincide" });
    expect(comparacao(comDois)).toContainEqual({ atributo: "quartos", estado: "conflita", relacaoEntrada: "coincide" });
    const conclusoes = (info.mock.calls as unknown as Array<[unknown, unknown]>).filter(([rotulo]) => String(rotulo).includes("investigação concluída"))
      .map(([, dados]) => dados as { pontuacao: unknown; resultadosDescartados: number; motivoParada: string });
    expect(conclusoes.map((item) => item.pontuacao)).toEqual([conclusoes[0].pontuacao, conclusoes[0].pontuacao, conclusoes[0].pontuacao]);
    expect(conclusoes.map((item) => [item.resultadosDescartados, item.motivoParada]))
      .toEqual([0, 1, 2].map(() => [conclusoes[0].resultadosDescartados, conclusoes[0].motivoParada]));
  });

  it("isola contas e imóveis, não consulta memória para outras origens e não registra valores", async () => {
    const linhas = [
      { user_id: OUTRO_USUARIO, imovel_identificado_id: IMOVEL, atributo: "quartos", estado: "confirmada", valor_texto: null, valor_num: 3 },
      { user_id: USUARIO, imovel_identificado_id: OUTRO_IMOVEL, atributo: "quartos", estado: "confirmada", valor_texto: null, valor_num: 3 },
      { user_id: USUARIO, imovel_identificado_id: IMOVEL, atributo: "condominio", estado: "confirmada", valor_texto: "Condomínio Segredo Privado", valor_num: null },
    ];
    const garimpo = await executarRota(linhas);
    expect(garimpo.dados.memoriaConfirmada).toBeDefined();
    expect(garimpo.dados.memoriaConfirmada.porResultado[0].comparacoes.map((item: { atributo: string }) => item.atributo))
      .toEqual(["condominio"]);
    expect(garimpo.chamadas.at(-1)?.filtros).toEqual([
      ["user_id", USUARIO], ["imovel_identificado_id", IMOVEL], ["estado", "confirmada"],
    ]);
    const manual = await executarRota(linhas, false);
    expect(manual.dados.memoriaConfirmada).toBeUndefined();
    expect(manual.chamadas).toEqual([]);
    expect(manual.ordem).toEqual([]);
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).not.toContain("Condomínio Segredo Privado");
    expect(logs).not.toContain("portal.test");
    const ultimo = (info.mock.calls as unknown as Array<[unknown, unknown]>).filter(([rotulo]) => String(rotulo).includes("investigação concluída"))[0][1] as {
      b3_2a: Record<string, unknown>; pontuacao: { memoria: string };
    };
    expect(ultimo.b3_2a.versao).toBe("b3.2a-v1");
    expect(ultimo.pontuacao.memoria).toBe("nao-utilizada");
  });
});
