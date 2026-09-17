/* ================================================================
   INVESTIGADOR (A1): observabilidade do provider e da investigação.

   Incidente de 17/09/2026: a rota morreu aos 60 s e o log só dizia
   `status: null, motivo: indisponivel, tentativa: 1`. Não dava para saber
   se foi timeout ou rede, `tentativa` era o índice da consulta (não há
   retry), e o sucesso nem era logado, então a latência real do provider
   era invisível. Aqui o contrato do log: causa classificada, índice com
   o nome certo, sucesso com duração, uma linha de conclusão por
   investigação e o mesmo `execucao` em todas. E o que continua proibido:
   chave, Bearer, header privado, consulta textual, URL com query.

   O comportamento entregue à tela NÃO muda neste checkpoint: mesmos
   eventos NDJSON, mesmos campos, mesmos avisos.
   ================================================================ */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buscarImovelNaWeb, BuscaWebIndisponivel } from "@/lib/servidor/investigadorImoveis";
import { classificarErroFetch } from "@/lib/servidor/investigadorObservabilidade";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { POST } from "@/app/api/investigador-imoveis/route";

const chaveAnterior = process.env.RAPIDAPI_KEY;
const CHAVE = "segredo-de-teste-a1";
const CONSULTA_PRIVADA = "Rua Francisco Bernardino Leite, Califórnia, Londrina";

function respostaRapid(organicos: unknown, status = 200): Response {
  return new Response(JSON.stringify({ organic_results: organicos }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Cada índice tem texto próprio: o dedupe por conteúdo do núcleo junta
    títulos quase iguais no mesmo domínio, e aqui queremos contar cards. */
function organico(indice: number) {
  const bairros = ["Gleba Palhano", "Jardim Bandeirantes", "Vila Ipiranga"];
  return {
    title: `Casa ${indice} no bairro ${bairros[indice % 3]}`,
    description: `Residência térrea, ${bairros[indice % 3]}, ${["esquina arborizada", "próxima ao parque", "rua tranquila"][indice % 3]}. 3 quartos, 80 m², 2 vagas, R$ 2.400 por mês.`,
    link: `https://imobiliaria.test/imovel/${indice}`,
  };
}

interface Registro { rotulo: string; dados: Record<string, unknown> }

/** Captura console.warn e console.info como pares (rótulo, objeto). */
function capturarLogs() {
  const registros: Registro[] = [];
  const guardar = (rotulo: unknown, dados: unknown) => {
    if (typeof rotulo === "string" && dados && typeof dados === "object") {
      registros.push({ rotulo, dados: dados as Record<string, unknown> });
    }
  };
  vi.spyOn(console, "warn").mockImplementation(guardar);
  vi.spyOn(console, "info").mockImplementation(guardar);
  return {
    registros,
    falhas: () => registros.filter((r) => r.rotulo.includes("chamada ao provider falhou")).map((r) => r.dados),
    sucessos: () => registros.filter((r) => r.rotulo.includes("chamada ao provider concluída")).map((r) => r.dados),
    conclusoes: () => registros.filter((r) => r.rotulo.includes("investigação concluída")).map((r) => r.dados),
    texto: () => JSON.stringify(registros),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.RAPIDAPI_KEY = CHAVE;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => {
  if (chaveAnterior == null) delete process.env.RAPIDAPI_KEY;
  else process.env.RAPIDAPI_KEY = chaveAnterior;
});

describe("classificarErroFetch: guarda só o nome do erro e um código curto", () => {
  it("TimeoutError → timeout-provider; OrcamentoEsgotadoError → abort-orcamento; AbortError → abortada", () => {
    expect(classificarErroFetch(new DOMException("x", "TimeoutError"))).toEqual({ causa: "timeout-provider", erro: "TimeoutError" });
    const orcamento = new Error("x");
    orcamento.name = "OrcamentoEsgotadoError";
    expect(classificarErroFetch(orcamento)).toEqual({ causa: "abort-orcamento", erro: "OrcamentoEsgotadoError" });
    expect(classificarErroFetch(new DOMException("x", "AbortError"))).toEqual({ causa: "abortada", erro: "AbortError" });
  });

  it("TypeError (fetch failed) → rede, com o código da causa quando é curto e seguro", () => {
    const erro = new TypeError("fetch failed: segredo-na-mensagem");
    (erro as Error & { cause?: unknown }).cause = { code: "ECONNRESET", message: "detalhe-privado" };
    expect(classificarErroFetch(erro)).toEqual({ causa: "rede", erro: "TypeError", codigo: "ECONNRESET" });
    expect(classificarErroFetch(new TypeError("fetch failed"))).toEqual({ causa: "rede", erro: "TypeError" });
    const suspeito = new Error("x");
    suspeito.name = "Nome com espaço e token-vazado";
    expect(classificarErroFetch(suspeito)).toEqual({ causa: "rede", erro: "desconhecido" });
    expect(classificarErroFetch(null)).toEqual({ causa: "rede", erro: "desconhecido" });
    expect(classificarErroFetch("string")).toEqual({ causa: "rede", erro: "desconhecido" });
  });
});

describe("log de falha do provider: causa, índice da consulta e nada de retry", () => {
  it("fetch rejeitado por TimeoutError → causa timeout-provider, status null, duração medida", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    await expect(buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1"], fetcher)).rejects.toBeInstanceOf(BuscaWebIndisponivel);

    const [falha] = logs.falhas();
    expect(falha).toMatchObject({
      provider: "rapidapi",
      operation: "pesquisar_imovel",
      indiceConsulta: 1,
      status: null,
      causa: "timeout-provider",
      motivo: "indisponivel",
      erro: "TimeoutError",
    });
    expect(typeof falha.duracaoMs).toBe("number");
    expect(falha).not.toHaveProperty("tentativa");
  });

  it("fetch rejeitado por TypeError → causa rede", async () => {
    const logs = capturarLogs();
    const erro = new TypeError("fetch failed");
    (erro as Error & { cause?: unknown }).cause = { code: "ENOTFOUND" };
    const fetcher = vi.fn().mockRejectedValue(erro);
    await expect(buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1"], fetcher)).rejects.toBeInstanceOf(BuscaWebIndisponivel);
    expect(logs.falhas()[0]).toMatchObject({ causa: "rede", erro: "TypeError", codigo: "ENOTFOUND", status: null, indiceConsulta: 1 });
  });

  it("HTTP 503 → causa http com o status; 429 continua motivo limite", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "7" } }));
    await expect(buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1", "b2", "b3"], fetcher)).rejects.toMatchObject({ motivo: "limite" });

    const falhas = logs.falhas();
    expect(falhas).toHaveLength(2);
    expect(falhas[0]).toMatchObject({ causa: "http", motivo: "indisponivel", status: 503, indiceConsulta: 1 });
    expect(falhas[1]).toMatchObject({ causa: "http", motivo: "limite", status: 429, indiceConsulta: 2 });
    expect(falhas[0]).not.toHaveProperty("erro");
  });

  it("o índice da consulta é a posição na fila, nunca uma repetição da mesma consulta", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError"));
    await expect(buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1", "b2", "b3"], fetcher)).rejects.toBeInstanceOf(BuscaWebIndisponivel);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("keyword"))).toEqual(["b1", "b2", "b3"]);
    expect(logs.falhas().map((f) => f.indiceConsulta)).toEqual([1, 2, 3]);
  });
});

describe("resposta inválida e sucesso do provider", () => {
  it("HTTP 200 sem organic_results válido → causa resposta-invalida; comportamento continua zero resultados sem falha", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("isto não é json", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ organic_results: "texto" }), { status: 200 }));
    const busca = await buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1", "b2", "b3"], fetcher);

    // Contrato funcional inalterado: nada de resultado, nada de falha, nada de exceção.
    expect(busca).toMatchObject({ resultados: [], falhas: 0, limiteAtingido: false, consultasExecutadas: ["b1", "b2", "b3"] });
    const falhas = logs.falhas();
    expect(falhas).toHaveLength(3);
    for (const [indice, falha] of falhas.entries()) {
      expect(falha).toMatchObject({ causa: "resposta-invalida", motivo: "resposta-invalida", status: 200, indiceConsulta: indice + 1 });
    }
    expect(logs.sucessos()).toHaveLength(0);
  });

  it("HTTP 200 válido → log de sucesso com duração e resultados brutos (antes do corte de 10)", async () => {
    const logs = capturarLogs();
    const doze = Array.from({ length: 12 }, (_, i) => organico(i + 1));
    const fetcher = vi.fn().mockResolvedValueOnce(respostaRapid(doze));
    const busca = await buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1"], fetcher);

    expect(busca.resultados).toHaveLength(10);
    const [sucesso] = logs.sucessos();
    expect(sucesso).toMatchObject({
      provider: "rapidapi",
      operation: "pesquisar_imovel",
      execucao: null,
      indiceConsulta: 1,
      status: 200,
      resultadosBrutos: 12,
    });
    expect(typeof sucesso.duracaoMs).toBe("number");
    expect(Number.isFinite(sucesso.duracaoMs)).toBe(true);
    expect(logs.falhas()).toHaveLength(0);
  });

  it("lista vazia é sucesso com resultadosBrutos 0, não resposta inválida", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn().mockResolvedValueOnce(respostaRapid([]));
    await buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1"], fetcher);
    expect(logs.sucessos()[0]).toMatchObject({ resultadosBrutos: 0, status: 200 });
    expect(logs.falhas()).toHaveLength(0);
  });

  it("o id da execução, quando informado, aparece em sucesso e em falha", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(respostaRapid([organico(1)]));
    await buscarImovelNaWeb(CONSULTA_PRIVADA, ["b1", "b2"], fetcher, undefined, { execucao: "exec-123" });
    expect(logs.falhas()[0]).toMatchObject({ execucao: "exec-123", indiceConsulta: 1 });
    expect(logs.sucessos()[0]).toMatchObject({ execucao: "exec-123", indiceConsulta: 2 });
  });
});

describe("o que nunca entra no log", () => {
  it("nem chave, nem Bearer, nem header privado, nem consulta textual, nem URL com query, em sucesso ou falha", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 503,
        headers: { "x-rapidapi-key": "segredo-vazado", authorization: "Bearer token-vazado" },
      }))
      .mockRejectedValueOnce(new TypeError(`fetch failed ao chamar ${CONSULTA_PRIVADA} com ${CHAVE}`))
      .mockResolvedValueOnce(respostaRapid([{ ...organico(1), title: "Título privado", description: "Descrição privada" }]));
    await buscarImovelNaWeb(CONSULTA_PRIVADA, [`${CONSULTA_PRIVADA} imóvel`, "consulta-dois", "consulta-tres"], fetcher);

    const texto = logs.texto();
    expect(logs.falhas()).toHaveLength(2);
    expect(logs.sucessos()).toHaveLength(1);
    expect(texto).not.toContain(CHAVE);
    expect(texto).not.toContain("segredo-vazado");
    expect(texto).not.toContain("token-vazado");
    expect(texto).not.toContain("authorization");
    expect(texto).not.toContain("Francisco Bernardino");
    expect(texto).not.toContain("consulta-dois");
    expect(texto).not.toContain("keyword=");
    expect(texto).not.toContain("rapidapi.com/search?");
    expect(texto).not.toContain("Título privado");
    expect(texto).not.toContain("Descrição privada");
    expect(texto).not.toContain("imobiliaria.test");
  });
});

/* ------------------------------------------------------------------
   Rota: uma linha de conclusão, mesmo `execucao` em tudo, NDJSON igual.
   ------------------------------------------------------------------ */

const USUARIO_ID = "11111111-1111-4111-8111-111111111111";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clienteSupabase(referenciasComErro = false) {
  const consultaIn = vi.fn().mockResolvedValue(
    referenciasComErro ? { data: null, error: { code: "42501", message: "detalhe" } } : { data: [], error: null },
  );
  const eq = vi.fn().mockReturnValue({ in: consultaIn });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });
  return { auth: { getUser }, from };
}

function requisicao(consulta: string): Request {
  return new Request("http://localhost/api/investigador-imoveis", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-sessao", "Content-Type": "application/json" },
    body: JSON.stringify({ consulta }),
  });
}

async function eventosDe(resposta: Response) {
  return (await resposta.text()).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
}

describe("rota POST: conclusão e execução", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.createClient.mockReturnValue(clienteSupabase());
  });

  it("investigação com uma falha e um sucesso: uma linha de conclusão e o mesmo execucao em todas as linhas", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(respostaRapid([organico(1), organico(2)]))
      .mockResolvedValueOnce(respostaRapid([organico(2)]));
    vi.stubGlobal("fetch", fetcher);

    const eventos = await eventosDe(await POST(requisicao("Casa 3 quartos 80 m² 2 vagas Rua Privada 10, Londrina")));
    const final = eventos.find((e) => e.tipo === "resultado");
    expect(final, JSON.stringify(eventos)).toBeDefined();

    const conclusoes = logs.conclusoes();
    expect(conclusoes).toHaveLength(1);
    expect(conclusoes[0]).toMatchObject({
      consultas: 3,
      falhas: 1,
      resultadosBrutos: 3,
      resultadosExibidos: 2,
      encerramento: "concluida",
    });
    expect(typeof conclusoes[0].duracaoMs).toBe("number");
    expect(conclusoes[0].execucao).toMatch(UUID);

    const execucoes = new Set(logs.registros.map((r) => r.dados.execucao));
    expect(logs.registros.length).toBeGreaterThanOrEqual(4); // 1 falha + 2 sucessos + 1 conclusão
    expect(execucoes.size).toBe(1);
    expect(logs.texto()).not.toContain("Rua Privada");
    expect(logs.texto()).not.toContain("token-de-sessao");
  });

  it("parada antecipada por evidência suficiente registra encerramento evidencia-suficiente", async () => {
    const logs = capturarLogs();
    const fetcher = vi.fn().mockResolvedValueOnce(respostaRapid([{
      title: "Apartamento Ref. AP-0917 no Ed Vivere Palhano",
      description: "Referência AP-0917, Ed Vivere Palhano, 79 m², 3 quartos, 2 vagas.",
      link: "https://imobiliaria.test/imovel/ap-0917",
    }]));
    vi.stubGlobal("fetch", fetcher);

    const eventos = await eventosDe(await POST(requisicao("Referência AP-0917 Ed Vivere Palhano 79 m² 3 quartos 2 vagas")));
    const final = eventos.find((e) => e.tipo === "resultado");
    expect(final.dados.encerramentoAntecipado).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(logs.conclusoes()[0]).toMatchObject({ consultas: 1, falhas: 0, encerramento: "evidencia-suficiente" });
  });

  it("falha total do provider: evento erro igual ao de antes e conclusão provider-indisponivel com as contagens", async () => {
    const logs = capturarLogs();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError")));

    const eventos = await eventosDe(await POST(requisicao("Casa 3 quartos Londrina")));
    expect(eventos.at(-1)).toEqual({
      tipo: "erro",
      mensagem: "A pesquisa na web está indisponível agora. Tente novamente em alguns minutos.",
    });
    expect(logs.conclusoes()).toHaveLength(1);
    expect(logs.conclusoes()[0]).toMatchObject({
      consultas: 3, falhas: 3, resultadosBrutos: 0, resultadosExibidos: 0, encerramento: "provider-indisponivel",
    });
    const naoConcluida = logs.registros.find((r) => r.rotulo.includes("investigação não concluída"));
    expect(naoConcluida?.dados).toMatchObject({ motivo: "indisponivel", execucao: logs.conclusoes()[0].execucao });
    expect(new Set(logs.registros.map((r) => r.dados.execucao)).size).toBe(1);
  });

  it("limite do provider sem resultado: conclusão limite-provider e mensagem com Retry-After como antes", async () => {
    const logs = capturarLogs();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "30" } })));
    const eventos = await eventosDe(await POST(requisicao("Casa 3 quartos Londrina")));
    expect(eventos.at(-1)).toEqual({
      tipo: "erro",
      mensagem: "O limite de pesquisas foi atingido. Tente novamente em 30 segundos.",
    });
    expect(logs.conclusoes()[0]).toMatchObject({ consultas: 1, falhas: 1, encerramento: "limite-provider" });
  });

  it("sem RAPIDAPI_KEY: conclusão configuracao, sem chamada de rede", async () => {
    const logs = capturarLogs();
    delete process.env.RAPIDAPI_KEY;
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const eventos = await eventosDe(await POST(requisicao("Casa 3 quartos Londrina")));
    expect(eventos.at(-1)).toEqual({ tipo: "erro", mensagem: "O Investigador ainda não está configurado neste ambiente." });
    expect(fetcher).not.toHaveBeenCalled();
    expect(logs.conclusoes()[0]).toMatchObject({ consultas: 0, falhas: 0, encerramento: "configuracao" });
  });

  it("os eventos NDJSON e os campos do resultado continuam exatamente os de antes", async () => {
    capturarLogs();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(respostaRapid([organico(1)]))
      .mockResolvedValueOnce(respostaRapid([]));
    vi.stubGlobal("fetch", fetcher);

    const eventos = await eventosDe(await POST(requisicao("Casa 3 quartos 80 m² Rua Privada 10, Londrina")));
    expect(eventos.map((e) => (e.tipo === "etapa" ? `etapa:${e.etapa}` : e.tipo))).toEqual([
      "etapa:gerando-buscas",
      "etapa:pesquisando-web",
      "consultas",
      "consultas",
      "consultas",
      "etapa:normalizando-resultados",
      "etapa:cruzando-informacoes",
      "resultado",
    ]);
    const final = eventos.at(-1);
    expect(Object.keys(final.dados).sort()).toEqual([
      "aviso",
      "consultaOriginal",
      "consultas",
      "encerramentoAntecipado",
      "limiteAtingido",
      "ok",
      "pesquisasEvitadas",
      "resultados",
    ]);
    expect(final.dados).toMatchObject({
      ok: true,
      pesquisasEvitadas: 0,
      encerramentoAntecipado: false,
      limiteAtingido: false,
      aviso: "1 das 3 pesquisas executadas não responderam; os demais resultados foram mantidos.",
    });
    expect(final.dados.consultas).toHaveLength(3);
    expect(final.dados.resultados).toHaveLength(1);
    // Nenhum campo de observabilidade vaza para o cliente.
    expect(JSON.stringify(eventos)).not.toContain("execucao");
    expect(JSON.stringify(eventos)).not.toContain("encerramento\"");
    expect(JSON.stringify(eventos)).not.toContain("duracaoMs");
  });
});
