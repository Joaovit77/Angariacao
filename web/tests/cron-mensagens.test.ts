import { format } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* O worker de mensagens agendadas diante de falhas passageiras do Supabase.
   Em produção o claim falhava em ~14% dos minutos e a rota devolvia 500
   sem registrar nada; uma linha ficou `processando` para sempre. */

interface ResultadoMock { data?: unknown; error?: { message: string; code: string } | null; status?: number }

const mocks = vi.hoisted(() => ({
  rpc: vi.fn<() => Promise<ResultadoMock>>(),
  registrarEvento: vi.fn(),
  enviar: vi.fn(),
  garantir: vi.fn(),
  historico: vi.fn(),
  revalidar: vi.fn(),
  aplicarDecisao: vi.fn(),
  cancelarSemImovel: vi.fn(),
  consolidar: vi.fn(),
  /** Resposta de cada leitura/escrita por tabela, na ordem das chamadas. */
  tabelas: {} as Record<string, ResultadoMock[]>,
  escritas: [] as Array<{ tabela: string; valores: Record<string, unknown> }>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    from: (tabela: string) => {
      const proxima = () => mocks.tabelas[tabela]?.shift() ?? { data: null, error: null };
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        maybeSingle: async () => proxima(),
        update: (valores: Record<string, unknown>) => {
          mocks.escritas.push({ tabela, valores });
          return cadeia;
        },
        then: (resolve: (r: ResultadoMock) => void) => resolve(proxima()),
      };
      return cadeia;
    },
  }),
}));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/envioMensagemAgendada", () => ({ enviarMensagemAgendada: mocks.enviar }));
vi.mock("@/lib/servidor/instanciaWhatsapp", () => ({ garantirRegistroInstanciaWhatsapp: mocks.garantir }));
vi.mock("@/lib/servidor/historicoWhatsapp", () => ({ registrarMensagemEnviada: mocks.historico }));
vi.mock("@/lib/servidor/disponibilidadeMensagem", () => ({
  revalidarVerificacaoDisponibilidade: mocks.revalidar,
  aplicarDecisaoNoBanco: mocks.aplicarDecisao,
  cancelarMensagemSemImovel: mocks.cancelarSemImovel,
  consolidarContatoDoProprietario: mocks.consolidar,
}));

import { GET } from "@/app/api/cron/mensagens/route";

const MENSAGEM = {
  id: "m1", user_id: "u1", imovel_id: "i1", nome_proprietario: "Ana", telefone: "43999999999",
  mensagem: "Olá", data_envio: "2026-09-12T11:00:00Z", status: "processando", enviado_em: null, erro: null,
};
const FETCH_FALHOU = { message: "TypeError: fetch failed", code: "" };

function chamar() {
  return GET(new Request("http://localhost/api/cron/mensagens", { headers: { Authorization: "Bearer segredo-do-cron" } }));
}

/** Deixa as pausas entre tentativas correrem sem esperar de verdade. */
async function chamarComPausas() {
  const promessa = chamar();
  await vi.runAllTimersAsync();
  return promessa;
}

describe("cron de mensagens agendadas", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-ficticia");
    vi.stubEnv("EVOLUTION_SERVER_URL", "https://evolution.fixture");
    mocks.rpc.mockReset();
    mocks.registrarEvento.mockReset();
    mocks.enviar.mockReset().mockResolvedValue({ mensagemId: "wa-1" });
    mocks.garantir.mockReset().mockResolvedValue({ ok: true, instancia: "corretora", token: "tok", criada: false, qr: null });
    mocks.historico.mockReset().mockResolvedValue({ erro: null });
    mocks.revalidar.mockReset();
    mocks.aplicarDecisao.mockReset().mockResolvedValue({ ok: true, detalhe: null, erro: null });
    mocks.cancelarSemImovel.mockReset().mockResolvedValue({ ok: true, detalhe: null, erro: null });
    mocks.consolidar.mockReset();
    mocks.tabelas = {};
    mocks.escritas.length = 0;
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("repete o claim quando o fetch cai e segue com o lote da segunda tentativa", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: FETCH_FALHOU, status: 0 })
      .mockResolvedValueOnce({ data: [], error: null, status: 200 });

    const resposta = await chamarComPausas();

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, processadas: 0, enviadas: 0, falhas: 0, suprimidas: 0, reagendadas: 0, consolidadas: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.registrarEvento).toHaveBeenCalledExactlyOnceWith({
      userId: null, categoria: "whatsapp", nivel: "aviso", evento: "agendamento-fila-recuperada", detalhe: "rede:0",
    });
  });

  it("registra o motivo por allowlist quando as tentativas se esgotam, sem a mensagem crua", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "<html>upstream timed out</html>", code: "" }, status: 504 })
      .mockResolvedValueOnce({ data: null, error: { message: "canceling statement due to statement timeout", code: "57014" }, status: 500 })
      .mockResolvedValueOnce({ data: null, error: FETCH_FALHOU, status: 0 });

    const resposta = await chamarComPausas();

    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({ ok: false, erro: "Fila de mensagens indisponível.", falha: "rede" });
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.registrarEvento).toHaveBeenCalledExactlyOnceWith({
      userId: null, categoria: "whatsapp", nivel: "erro", evento: "agendamento-fila-indisponivel",
      detalhe: "gateway:504 banco-transitorio:500:57014 rede:0",
    });
    expect(log).toHaveBeenCalledTimes(3);
    const registrado = log.mock.calls.map((chamada: unknown[]) => format(...chamada)).join("\n");
    expect(registrado).toContain("57014");
    expect(registrado).not.toMatch(/html|upstream|canceling|fetch failed/i);
  });

  it("não repete uma recusa determinística do banco", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "function not found", code: "42883" }, status: 404 });

    const resposta = await chamarComPausas();

    expect(resposta.status).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      evento: "agendamento-fila-indisponivel", detalhe: "recusado:404:42883",
    }));
  });

  it("falha de releitura antes do envio marca erro em vez de deixar a linha processando", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [MENSAGEM], error: null, status: 200 });
    mocks.tabelas = {
      whatsapp_instancias: [{ data: { instancia: "corretora", token: "tok", observacao: null }, error: null }],
      mensagens_agendadas: [{ data: null, error: FETCH_FALHOU, status: 0 }],
    };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 0, falhas: 1, suprimidas: 0, reagendadas: 0, consolidadas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.objectContaining({ status: "erro", erro: "releitura-falhou" }) },
    ]);
  });

  it("linha removida do lote continua sendo descartada em silêncio", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [MENSAGEM], error: null, status: 200 });
    mocks.tabelas = {
      whatsapp_instancias: [{ data: { instancia: "corretora", token: "tok", observacao: null }, error: null }],
      mensagens_agendadas: [{ data: null, error: null }],
    };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 0, falhas: 0, suprimidas: 0, reagendadas: 0, consolidadas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.escritas).toEqual([]);
  });

  it("envia e conclui a mensagem quando a releitura confirma o item", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [MENSAGEM], error: null, status: 200 });
    mocks.tabelas = {
      whatsapp_instancias: [{ data: { instancia: "corretora", token: "tok", observacao: null }, error: null }],
      mensagens_agendadas: [{ data: { status: "processando", imovel_id: "i1" }, error: null }],
    };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 1, falhas: 0, suprimidas: 0, reagendadas: 0, consolidadas: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.objectContaining({ status: "enviada", erro: null }) },
    ]);
  });

  /* --- M3: verificação de disponibilidade reavaliada antes do envio -------- */

  const VERIFICACAO = { ...MENSAGEM, id: "v1", tipo: "verificacao-disponibilidade" as "verificacao-disponibilidade" | "livre" };
  const IMOVEL = { id: "i1", endereco: "Rua A, 1", status: "Publicado" };

  function prontoParaEnviar(mensagem = VERIFICACAO) {
    mocks.rpc.mockResolvedValueOnce({ data: [mensagem], error: null, status: 200 });
    mocks.tabelas = {
      whatsapp_instancias: [{ data: { instancia: "corretora", token: "tok", observacao: null }, error: null }],
      mensagens_agendadas: [{ data: { status: "processando", imovel_id: "i1" }, error: null }],
    };
  }

  it("mensagem livre não passa pela revalidação nem pela consolidação", async () => {
    prontoParaEnviar({ ...MENSAGEM, tipo: "livre" as const });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 1, suprimidas: 0 });
    expect(mocks.revalidar).not.toHaveBeenCalled();
    expect(mocks.consolidar).not.toHaveBeenCalled();
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });

  it("imóvel indisponível: cancela pela RPC do M4 e não envia", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockResolvedValueOnce({
      decisao: { acao: "cancelar", motivo: "imovel-indisponivel", evidencia: { codigo: "status-perdido" }, fato: "Perdido" },
      contexto: { imovel: IMOVEL, agenda: [], avaliacao: null },
    });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 0, suprimidas: 1, falhas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.aplicarDecisao).toHaveBeenCalledOnce();
    expect(mocks.aplicarDecisao.mock.calls[0][1]).toMatchObject({ id: "v1" });
    expect(mocks.aplicarDecisao.mock.calls[0][2]).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel" });
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      evento: "agendamento-cancelado-worker", detalhe: "v1 imovel-indisponivel status-perdido",
    }));
    // O worker não escreve na linha por conta própria: a transação é da RPC.
    expect(mocks.escritas).toEqual([]);
  });

  it("disponibilidade confirmada depois do agendamento: reagenda pela RPC e não envia", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockResolvedValueOnce({
      decisao: {
        acao: "reagendar", motivo: "disponibilidade-confirmada", dataEvidencia: "2026-09-01T10:15:00",
        novoDiaEnvio: "2026-10-31", novaDataEnvio: "2026-10-31T11:00:00.000Z",
        evidencia: { codigo: "visita_confirmada_pelo_proprietario" },
      },
      contexto: { imovel: IMOVEL, agenda: [], avaliacao: null },
    });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 0, reagendadas: 1, falhas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.aplicarDecisao.mock.calls[0][2]).toMatchObject({ acao: "reagendar", novoDiaEnvio: "2026-10-31" });
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      evento: "agendamento-reagendado", detalhe: "v1 visita_confirmada_pelo_proprietario E=2026-09-01 -> 2026-10-31",
    }));
  });

  it("transição recusada pelo banco vira erro classificado: nunca envia uma mensagem que devia ser cancelada", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockResolvedValueOnce({
      decisao: { acao: "cancelar", motivo: "imovel-indisponivel", evidencia: null, fato: "Perdido" },
      contexto: { imovel: IMOVEL, agenda: [], avaliacao: null },
    });
    mocks.aplicarDecisao.mockResolvedValueOnce({ ok: false, detalhe: null, erro: "imovel-nao-encontrado" });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 0, suprimidas: 0, falhas: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.objectContaining({ status: "erro", erro: "transicao-falhou:imovel-nao-encontrado" }) },
    ]);
  });

  it("falha ao carregar os fatos não envia nem cancela: erro classificado e evento", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockRejectedValueOnce(new Error("agenda: timeout"));

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 0, suprimidas: 0, falhas: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ evento: "agendamento-revalidacao-falhou" }));
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.objectContaining({ status: "erro", erro: "revalidacao-falhou" }) },
    ]);
  });

  it("sem evidência: envia como sempre e registra a nota só no imóvel da mensagem", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockResolvedValueOnce({
      decisao: { acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" },
      contexto: { imovel: IMOVEL, agenda: [], avaliacao: null },
    });
    mocks.consolidar.mockResolvedValueOnce({
      plano: { imoveisConsultados: ["i1"], absorvidas: [], recusadas: [], texto: null },
      absorvidasIds: [], transicoes: [], imoveisConsultados: [IMOVEL],
    });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 1, consolidadas: 0 });
    expect(mocks.enviar).toHaveBeenCalledWith("43999999999", "Olá", expect.anything());
    expect(mocks.historico).toHaveBeenCalledOnce();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.not.objectContaining({ imoveis_consultados: expect.anything() }) },
    ]);
  });

  it("conflitante não vira disponível nem indisponível: segue o fluxo de sempre", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockResolvedValueOnce({
      decisao: { acao: "enviar", estado: "conflitante", motivo: "conflitante" },
      contexto: { imovel: IMOVEL, agenda: [], avaliacao: null },
    });
    mocks.consolidar.mockResolvedValueOnce({
      plano: { imoveisConsultados: ["i1"], absorvidas: [], recusadas: [], texto: null },
      absorvidasIds: [], transicoes: [], imoveisConsultados: [IMOVEL],
    });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 1, suprimidas: 0, reagendadas: 0 });
    expect(mocks.aplicarDecisao).not.toHaveBeenCalled();
  });

  it("mesmo proprietário: envia uma mensagem só, com a lista de imóveis, e registra a nota em cada um", async () => {
    prontoParaEnviar();
    mocks.revalidar.mockResolvedValueOnce({
      decisao: { acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" },
      contexto: { imovel: IMOVEL, agenda: [], avaliacao: null },
    });
    const outros = [{ id: "i2", endereco: "Rua B, 2", status: "Publicado" }, { id: "i3", endereco: "Rua C, 3", status: "Publicado" }];
    mocks.consolidar.mockResolvedValueOnce({
      plano: { imoveisConsultados: ["i1", "i2", "i3"], absorvidas: [], recusadas: [], texto: "TEXTO CONSOLIDADO" },
      absorvidasIds: ["v2", "v3"], transicoes: [], imoveisConsultados: [IMOVEL, ...outros],
    });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 1, consolidadas: 2 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.enviar).toHaveBeenCalledWith("43999999999", "TEXTO CONSOLIDADO", expect.anything());
    expect(mocks.historico.mock.calls.map((chamada) => chamada[1].imovelId)).toEqual(["i1", "i2", "i3"]);
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.objectContaining({
        status: "enviada", mensagem: "TEXTO CONSOLIDADO", imoveis_consultados: ["i1", "i2", "i3"],
      }) },
    ]);
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      evento: "agendamento-consolidado", detalhe: "v1 absorveu 2; imoveis=3",
    }));
  });
});
