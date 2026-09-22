import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buscarImovelNaWeb,
  BuscaWebIndisponivel,
} from "@/lib/servidor/investigadorImoveis";

import {
  MARGEM_FINALIZACAO_INVESTIGACAO_MS,
  ORCAMENTO_TOTAL_INVESTIGACAO_MS,
} from "@/lib/servidor/investigadorOrcamento";

const mocks = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));
import { investigarImovel } from "@/lib/investigadorImoveis";

const chaveAnterior = process.env.RAPIDAPI_KEY;
const consultas = ["busca um", "busca dois", "busca tres"];

function resposta(indice: number): Response {
  return new Response(JSON.stringify({ organic_results: [{
    title: `Imóvel genérico ${indice}`,
    description: "Anúncio sem identidade suficiente.",
    link: `https://portal.test/anuncio/${indice}`,
  }] }), { status: 200 });
}

beforeEach(() => {
  process.env.RAPIDAPI_KEY = "chave-local-simulada";
  mocks.getSupabase.mockReturnValue({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token-local" } } }) },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.getSupabase.mockReset();
});
afterAll(() => {
  if (chaveAnterior === undefined) delete process.env.RAPIDAPI_KEY;
  else process.env.RAPIDAPI_KEY = chaveAnterior;
});

describe("orçamento global das consultas", () => {
  it("três chamadas rápidas produzem resultado completo", async () => {
    let agora = 0;
    const fetcher = vi.fn(async () => { agora += 1_000; return resposta(agora); });
    const busca = await buscarImovelNaWeb("Rua sem identidade", consultas, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(busca).toMatchObject({
      falhas: 0, consultasExecutadas: consultas, pesquisasEvitadas: 0,
      orcamentoEsgotado: false, consultasLimitadasPeloOrcamento: 0,
    });
    expect(busca.resultados).toHaveLength(3);
  });

  it("primeira rápida e segunda timeout: preserva a primeira e tenta a terceira se couber", async () => {
    let agora = 0;
    const timeouts: number[] = [];
    const timeoutOriginal = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeouts.push(ms);
      return timeoutOriginal(ms);
    });
    const fetcher = vi.fn()
      .mockImplementationOnce(async () => { agora += 1_000; return resposta(1); })
      .mockImplementationOnce(async () => { agora += 22_000; throw new DOMException("tempo", "TimeoutError"); })
      .mockImplementationOnce(async () => { agora += 1_000; return resposta(3); });
    const busca = await buscarImovelNaWeb("Rua sem identidade", consultas, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(timeouts.slice(0, 3)).toEqual([22_000, 22_000, 19_000]);
    expect(busca).toMatchObject({ falhas: 1, orcamentoEsgotado: false, consultasLimitadasPeloOrcamento: 1 });
    expect(busca.resultados).toHaveLength(2);
  });

  it("duas consultas lentas impedem a terceira quando o prazo de finalização seria ameaçado", async () => {
    let agora = 0;
    const fetcher = vi.fn(async () => { agora += 21_000; return resposta(agora); });
    const busca = await buscarImovelNaWeb("Rua sem identidade", consultas, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca).toMatchObject({
      consultasExecutadas: consultas.slice(0, 2), pesquisasEvitadas: 1, orcamentoEsgotado: true,
    });
    expect(busca.resultados).toHaveLength(2);
    expect(agora).toBe(ORCAMENTO_TOTAL_INVESTIGACAO_MS - MARGEM_FINALIZACAO_INVESTIGACAO_MS);
  });

  it("cards da primeira consulta sobrevivem a falhas nas seguintes", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta(1))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new DOMException("tempo", "TimeoutError"));
    const busca = await buscarImovelNaWeb("Rua sem identidade", consultas, fetcher as typeof fetch);
    expect(busca.falhas).toBe(2);
    expect(busca.resultados).toHaveLength(1);
    expect(busca.resultados[0].url).toBe("https://portal.test/anuncio/1");
  });

  it("sem resultado útil e com orçamento esgotado, retorna erro controlado", async () => {
    let agora = 0;
    const fetcher = vi.fn(async () => { agora += 21_000; throw new DOMException("tempo", "TimeoutError"); });
    await expect(buscarImovelNaWeb("Rua sem identidade", consultas, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    })).rejects.toMatchObject({
      motivo: "orcamento", resumo: { consultasExecutadas: 2, falhas: 2 },
    } satisfies Partial<BuscaWebIndisponivel>);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("prazo próximo encerra sem iniciar chamada e antes do teto da função", async () => {
    const agora = ORCAMENTO_TOTAL_INVESTIGACAO_MS - MARGEM_FINALIZACAO_INVESTIGACAO_MS - 3_400;
    const fetcher = vi.fn();
    await expect(buscarImovelNaWeb("Rua sem identidade", consultas, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    })).rejects.toMatchObject({ motivo: "orcamento", resumo: { consultasExecutadas: 0, falhas: 0 } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(agora).toBeLessThan(60_000);
  });
});

describe("eventos terminais no cliente", () => {
  async function ler(corpo: string) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(corpo, { status: 200 })));
    const eventos: unknown[] = [];
    await investigarImovel("Rua de teste", (evento) => eventos.push(evento));
    return eventos;
  }

  it("resultado continua entregue ao cliente", async () => {
    const evento = { tipo: "resultado", dados: { ok: true, resultados: [] } };
    expect(await ler(JSON.stringify(evento) + "\n")).toEqual([evento]);
  });

  it("erro terminal continua entregue ao cliente", async () => {
    const evento = { tipo: "erro", mensagem: "Falha controlada." };
    expect(await ler(JSON.stringify(evento) + "\n")).toEqual([evento]);
  });

  it("EOF sem resultado nem erro rejeita e deixa a tela apta a limpar o andamento", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ tipo: "etapa", etapa: "pesquisando-web" }) + "\n",
      { status: 200 },
    )));
    const eventos: unknown[] = [];
    await expect(investigarImovel("Rua de teste", (evento) => eventos.push(evento)))
      .rejects.toThrow("A investigação foi interrompida antes de concluir. Tente novamente.");
    expect(eventos).toEqual([{ tipo: "etapa", etapa: "pesquisando-web" }]);
  });
  it("EOF no meio de um evento também mostra erro compreensível", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"tipo":"resultado","dados":', { status: 200 })));
    await expect(investigarImovel("Rua de teste", () => {}))
      .rejects.toThrow("A investigação foi interrompida antes de concluir. Tente novamente.");
  });
});
