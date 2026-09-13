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
    expect(await resposta.json()).toEqual({ ok: true, processadas: 0, enviadas: 0, falhas: 0 });
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

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 0, falhas: 1 });
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

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 0, falhas: 0 });
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

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 1, falhas: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: expect.objectContaining({ status: "enviada", erro: null }) },
    ]);
  });
});
