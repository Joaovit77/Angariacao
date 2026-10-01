import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ================================================================
   RETIRADOS, FASE B / B1: WORKER FAIL-CLOSED POR TIPO

   Antes do B1 o worker enviava qualquer `tipo` que não fosse `livre` nem
   `verificacao-disponibilidade`, sem revalidação nenhuma. Agora só esses dois
   passam; `retomada-retirado` é conhecido mas bloqueado (o banco nem aceita o
   valor ainda), e qualquer outro valor é desconhecido e nunca sai.

   Mesmo harness de `cron-mensagens.test.ts`: Supabase falso que responde por
   tabela, na ordem das chamadas, e envio/instância/histórico/disponibilidade
   mockados. Nenhuma rede, nenhum WhatsApp.
   ================================================================ */

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
  preparar: vi.fn(),
  efetivar: vi.fn(),
  desfazer: vi.fn(),
  marcarIncerta: vi.fn(),
  tabelas: {} as Record<string, ResultadoMock[]>,
  escritas: [] as Array<{ tabela: string; valores: Record<string, unknown> }>,
  consultas: [] as Array<{ tabela: string; operacao: "select" | "update"; colunas?: string; filtros: Array<[string, unknown]> }>,
  /** Lança em vez de responder, para provar que um item não derruba o lote. */
  lancarNaProxima: null as string | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    from: (tabela: string) => {
      const proxima = () => mocks.tabelas[tabela]?.shift() ?? { data: null, error: null };
      let consulta: (typeof mocks.consultas)[number] | null = null;
      const cadeia = {
        select: (colunas?: string) => {
          consulta = { tabela, operacao: "select", colunas, filtros: [] };
          mocks.consultas.push(consulta);
          return cadeia;
        },
        eq: (coluna: string, valor: unknown) => {
          consulta?.filtros.push([coluna, valor]);
          return cadeia;
        },
        maybeSingle: async () => proxima(),
        update: (valores: Record<string, unknown>) => {
          mocks.escritas.push({ tabela, valores });
          consulta = { tabela, operacao: "update", filtros: [] };
          mocks.consultas.push(consulta);
          return cadeia;
        },
        then: (resolve: (r: ResultadoMock) => void, rejeitar?: (e: unknown) => void) => {
          if (mocks.lancarNaProxima === tabela) {
            mocks.lancarNaProxima = null;
            return rejeitar ? rejeitar(new Error("rede caiu")) : undefined;
          }
          return resolve(proxima());
        },
      };
      return cadeia;
    },
  }),
}));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/envioMensagemAgendada", () => ({ enviarMensagemAgendada: mocks.enviar }));
vi.mock("@/lib/servidor/instanciaWhatsapp", () => ({ garantirRegistroInstanciaWhatsapp: mocks.garantir }));
vi.mock("@/lib/servidor/historicoWhatsapp", async (original) => ({
  ...(await original<typeof import("@/lib/servidor/historicoWhatsapp")>()),
  registrarMensagemEnviadaDeOrigem: mocks.historico,
}));
vi.mock("@/lib/servidor/disponibilidadeMensagem", () => ({
  revalidarVerificacaoDisponibilidade: mocks.revalidar,
  aplicarDecisaoNoBanco: mocks.aplicarDecisao,
  cancelarMensagemSemImovel: mocks.cancelarSemImovel,
  prepararConsolidacaoContato: mocks.preparar,
  efetivarConsolidacaoContato: mocks.efetivar,
  desfazerConsolidacaoContato: mocks.desfazer,
  marcarConsolidacaoIncerta: mocks.marcarIncerta,
}));

import { GET } from "@/app/api/cron/mensagens/route";
import { classificarTipoParaEnvio, TIPO_RETOMADA_RETIRADO } from "@/lib/mensagensAgendadas";

const BASE = {
  user_id: "u1", imovel_id: "i1", nome_proprietario: "Ana", telefone: "43999999999",
  mensagem: "Texto que não pode ir para o log", data_envio: "2026-10-01T11:00:00Z", status: "processando",
  enviado_em: null, erro: null,
};
const LIVRE = { ...BASE, id: "l1", tipo: "livre" };
const VERIFICACAO = { ...BASE, id: "v1", tipo: "verificacao-disponibilidade" };
const RETOMADA = { ...BASE, id: "r1", tipo: TIPO_RETOMADA_RETIRADO };
const VALOR_ESTRANHO = "tipo-inventado-que-nao-pode-vazar";
const DESCONHECIDO = { ...BASE, id: "d1", tipo: VALOR_ESTRANHO };

const INSTANCIA = { data: { instancia: "corretora", token: "tok", observacao: null }, error: null };
const RELEITURA = (imovel = "i1") => ({ data: { status: "processando", imovel_id: imovel }, error: null });
const IMOVEL_ATIVO = { data: { status: "Publicado", retirado: false }, error: null };
const BLOQUEOU = { data: [{ id: "x" }], error: null };
const NAO_ESTAVA_PROCESSANDO = { data: [], error: null };

function chamar() {
  return GET(new Request("http://localhost/api/cron/mensagens", { headers: { Authorization: "Bearer segredo-do-cron" } }));
}
async function chamarComPausas() {
  const promessa = chamar();
  await vi.runAllTimersAsync();
  return promessa;
}
function lote(...itens: unknown[]) {
  mocks.rpc.mockResolvedValueOnce({ data: itens, error: null, status: 200 });
}
const consultasDe = (tabela: string) => mocks.consultas.filter((c) => c.tabela === tabela);
const eventos = () => mocks.registrarEvento.mock.calls.map((c) => c[0] as { evento: string; nivel: string; detalhe: string });

/* ----------------------------------------------------------------
   1. O CLASSIFICADOR (puro)
   ---------------------------------------------------------------- */
describe("classificarTipoParaEnvio", () => {
  it("os dois tipos enviáveis passam pelo valor exato", () => {
    expect(classificarTipoParaEnvio("livre")).toBe("livre");
    expect(classificarTipoParaEnvio("verificacao-disponibilidade")).toBe("verificacao-disponibilidade");
  });

  it("ausente continua sendo livre (a mesma regra do `??` de hoje)", () => {
    expect(classificarTipoParaEnvio(null)).toBe("livre");
    expect(classificarTipoParaEnvio(undefined)).toBe("livre");
  });

  it("retomada-retirado é conhecida, mas bloqueada", () => {
    expect(classificarTipoParaEnvio("retomada-retirado")).toBe("retomada-bloqueada");
  });

  it("fail-closed: vazio, parecido ou de outro tipo nunca vira enviável", () => {
    for (const valor of ["", " ", "Livre", "LIVRE", " livre", "livre ", "verificacao", "Verificacao-disponibilidade",
      "retomada", "Retomada-retirado", "desconhecido", VALOR_ESTRANHO, 0, 1, true, false, {}, [], ["livre"]]) {
      expect(classificarTipoParaEnvio(valor), JSON.stringify(valor)).toBe("desconhecido");
    }
  });
});

/* ----------------------------------------------------------------
   2. O WORKER
   ---------------------------------------------------------------- */
describe("cron de mensagens — trava por tipo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-ficticia");
    vi.stubEnv("EVOLUTION_SERVER_URL", "https://evolution.fixture");
    mocks.rpc.mockReset();
    mocks.registrarEvento.mockReset();
    mocks.enviar.mockReset().mockResolvedValue({ mensagemId: "wa-1", idExterno: true });
    mocks.garantir.mockReset().mockResolvedValue({ ok: true, instancia: "corretora", token: "tok", criada: false, qr: null });
    mocks.historico.mockReset().mockResolvedValue({ persistencia: "gravada", imoveisEco: [], erro: null });
    mocks.revalidar.mockReset();
    mocks.aplicarDecisao.mockReset().mockResolvedValue({ ok: true, detalhe: null, erro: null });
    mocks.cancelarSemImovel.mockReset();
    mocks.preparar.mockReset();
    mocks.efetivar.mockReset();
    mocks.desfazer.mockReset();
    mocks.marcarIncerta.mockReset();
    mocks.tabelas = {};
    mocks.escritas.length = 0;
    mocks.consultas.length = 0;
    mocks.lancarNaProxima = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function nadaDeEfeitoExterno() {
    expect(consultasDe("whatsapp_instancias")).toEqual([]);
    expect(mocks.garantir).not.toHaveBeenCalled();
    expect(mocks.revalidar).not.toHaveBeenCalled();
    expect(mocks.preparar).not.toHaveBeenCalled();
    expect(mocks.efetivar).not.toHaveBeenCalled();
    expect(mocks.historico).not.toHaveBeenCalled();
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(consultasDe("imoveis")).toEqual([]);
  }

  it("retomada-retirado: não busca instância nem envia, vira erro `retomada-envio-desabilitado` e registra 1 evento de aviso", async () => {
    lote(RETOMADA);
    mocks.tabelas = { mensagens_agendadas: [BLOQUEOU] };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toEqual({ ok: true, processadas: 1, enviadas: 0, falhas: 1, suprimidas: 0, reagendadas: 0, consolidadas: 0 });
    nadaDeEfeitoExterno();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: { status: "erro", erro: "retomada-envio-desabilitado", updated_at: expect.any(String) } },
    ]);
    // Só fecha a linha que o próprio worker reclamou, na própria conta.
    const update = mocks.consultas.find((c) => c.tabela === "mensagens_agendadas" && c.operacao === "update");
    expect(update?.filtros).toEqual([["id", "r1"], ["user_id", "u1"], ["status", "processando"]]);
    expect(eventos()).toEqual([
      { userId: "u1", categoria: "whatsapp", nivel: "aviso", evento: "agendamento-tipo-bloqueado", detalhe: "r1 tipo=retomada-retirado" },
    ]);
  });

  it("tipo desconhecido: o mesmo bloqueio, com `tipo-desconhecido` e evento de erro", async () => {
    lote(DESCONHECIDO);
    mocks.tabelas = { mensagens_agendadas: [BLOQUEOU] };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ processadas: 1, enviadas: 0, falhas: 1 });
    nadaDeEfeitoExterno();
    expect(mocks.escritas).toEqual([
      { tabela: "mensagens_agendadas", valores: { status: "erro", erro: "tipo-desconhecido", updated_at: expect.any(String) } },
    ]);
    expect(eventos()).toEqual([
      { userId: "u1", categoria: "whatsapp", nivel: "erro", evento: "agendamento-tipo-desconhecido", detalhe: "d1 tipo=desconhecido" },
    ]);
  });

  it("privacidade: o valor cru, o telefone e o texto nunca entram no evento", async () => {
    lote(DESCONHECIDO, RETOMADA);
    mocks.tabelas = { mensagens_agendadas: [BLOQUEOU, BLOQUEOU] };

    await chamarComPausas();

    const tudo = JSON.stringify(mocks.registrarEvento.mock.calls);
    expect(tudo).not.toContain(VALOR_ESTRANHO);
    expect(tudo).not.toContain(BASE.telefone);
    expect(tudo).not.toContain(BASE.mensagem);
    expect(tudo).not.toContain(BASE.nome_proprietario);
  });

  it("string vazia não é livre: hoje ela saía sem trava nenhuma, agora é desconhecida e não sai", async () => {
    lote({ ...LIVRE, id: "e1", tipo: "" });
    mocks.tabelas = { mensagens_agendadas: [BLOQUEOU] };

    await chamarComPausas();

    nadaDeEfeitoExterno();
    expect(mocks.escritas[0].valores).toMatchObject({ status: "erro", erro: "tipo-desconhecido" });
  });

  it.each([["null", null], ["ausente", undefined]])("tipo %s segue exatamente o caminho da livre (envia, com a trava de retirado lida)", async (_, tipo) => {
    lote({ ...LIVRE, tipo });
    mocks.tabelas = { whatsapp_instancias: [INSTANCIA], mensagens_agendadas: [RELEITURA()], imoveis: [IMOVEL_ATIVO] };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 1, falhas: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    expect(consultasDe("imoveis")).toHaveLength(1);
    expect(eventos().some((e) => e.evento.startsWith("agendamento-tipo"))).toBe(false);
  });

  it("tipo ausente com imóvel retirado continua bloqueado pela trava da livre (cancelada, não enviada)", async () => {
    lote({ ...LIVRE, tipo: undefined });
    mocks.tabelas = {
      whatsapp_instancias: [INSTANCIA],
      mensagens_agendadas: [RELEITURA()],
      imoveis: [{ data: { status: "Publicado", retirado: true }, error: null }],
    };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 0, suprimidas: 1, falhas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.escritas[0].valores).toMatchObject({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
  });

  it("concorrência: se a linha já deixou `processando`, nada é sobrescrito, nenhum evento e nenhuma falha contada", async () => {
    lote(RETOMADA, DESCONHECIDO);
    mocks.tabelas = { mensagens_agendadas: [NAO_ESTAVA_PROCESSANDO, NAO_ESTAVA_PROCESSANDO] };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ processadas: 2, enviadas: 0, falhas: 0 });
    nadaDeEfeitoExterno();
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("o banco recusar a transição não vira evento de bloqueio e não envia", async () => {
    lote(RETOMADA);
    mocks.tabelas = { mensagens_agendadas: [{ data: null, error: { message: "boom", code: "XX000" } }] };

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toMatchObject({ enviadas: 0, falhas: 0 });
    nadaDeEfeitoExterno();
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("um item bloqueado não aborta o lote, nem quando a transição lança", async () => {
    lote(RETOMADA, LIVRE);
    mocks.lancarNaProxima = "mensagens_agendadas";
    mocks.tabelas = { whatsapp_instancias: [INSTANCIA], mensagens_agendadas: [RELEITURA()], imoveis: [IMOVEL_ATIVO] };

    const resposta = await chamarComPausas();

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ processadas: 2, enviadas: 1 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
  });

  it("lote misto: livre e verificação seguem o caminho de sempre; retomada e desconhecido são bloqueados sem atrapalhar", async () => {
    lote(LIVRE, RETOMADA, VERIFICACAO, DESCONHECIDO);
    mocks.tabelas = {
      whatsapp_instancias: [INSTANCIA, INSTANCIA],
      mensagens_agendadas: [
        RELEITURA(), { data: null, error: null }, // livre: releitura e conclusão
        BLOQUEOU, // retomada
        RELEITURA(), { data: null, error: null }, // verificação: releitura e conclusão
        BLOQUEOU, // desconhecido
      ],
      imoveis: [IMOVEL_ATIVO],
    };
    mocks.revalidar.mockResolvedValueOnce({
      decisao: { acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" },
      contexto: { imovel: { id: "i1", endereco: "Rua A, 1", status: "Publicado" }, agenda: [], avaliacao: null },
    });
    mocks.preparar.mockResolvedValueOnce({
      plano: { imoveisConsultados: ["i1"], absorvidas: [], recusadas: [], texto: null },
      reservadasIds: [], transicoes: [], imoveisConsultados: [],
    });

    const resposta = await chamarComPausas();

    expect(await resposta.json()).toEqual({ ok: true, processadas: 4, enviadas: 2, falhas: 2, suprimidas: 0, reagendadas: 0, consolidadas: 0 });
    expect(mocks.enviar).toHaveBeenCalledTimes(2);
    expect(mocks.revalidar).toHaveBeenCalledOnce();
    expect(mocks.revalidar.mock.calls[0][1]).toMatchObject({ id: "v1" });
    expect(mocks.escritas.map((e) => [e.valores.status, e.valores.erro ?? null])).toEqual([
      ["enviada", null],
      ["erro", "retomada-envio-desabilitado"],
      ["enviada", null],
      ["erro", "tipo-desconhecido"],
    ]);
    expect(eventos().map((e) => e.evento)).toEqual(["agendamento-tipo-bloqueado", "agendamento-tipo-desconhecido"]);
  });
});
