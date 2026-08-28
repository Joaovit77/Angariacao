import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  registrarEvento: vi.fn(),
  instanciaWhatsappDoUsuario: vi.fn(),
  destinoAncoradoDaConversa: vi.fn(),
  registrarMensagemEnviada: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/instanciaWhatsapp", () => ({
  instanciaWhatsappDoUsuario: mocks.instanciaWhatsappDoUsuario,
}));
vi.mock("@/lib/servidor/identidadeWhatsapp", () => ({
  destinoAncoradoDaConversa: mocks.destinoAncoradoDaConversa,
}));
vi.mock("@/lib/servidor/historicoWhatsapp", () => ({
  idMensagemEvolution: () => "mensagem-saida-1",
  registrarMensagemEnviada: mocks.registrarMensagemEnviada,
}));

import { POST } from "@/app/api/whatsapp/enviar/route";

describe("POST /api/whatsapp/enviar — validação do contrato", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.stubEnv("EVOLUTION_SERVER_URL", "https://evolution.example");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    mocks.createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null }),
      },
    });
    mocks.instanciaWhatsappDoUsuario.mockResolvedValue({
      ok: true,
      instancia: "instancia-1",
      token: "token-instancia",
      criada: false,
      qr: null,
    });
    mocks.destinoAncoradoDaConversa.mockResolvedValue(null);
    mocks.registrarMensagemEnviada.mockResolvedValue({ gravou: true, erro: null });
  });

  function clienteComImovel() {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario-1" } }, error: null }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                proprietario_telefone: "+55 (43) 99802-4316",
                notas: [{ id: "wa:entrada-1", texto: "Resposta pelo WhatsApp: Olá", data: "2026-08-28T14:00" }],
              },
              error: null,
            }),
          })),
        })),
      })),
    };
  }

  it("classifica mensagem vazia antes de consultar instância ou imóvel", async () => {
    const resposta = await POST(
      new Request("http://localhost/api/whatsapp/enviar", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: JSON.stringify({ imovelId: "imovel-1", mensagem: "   " }),
      }),
    );

    expect(resposta.status).toBe(422);
    expect(await resposta.json()).toEqual({
      ok: false,
      falha: "mensagem-invalida",
      mensagem: "Escreva uma mensagem antes de enviar.",
    });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("classifica JSON inválido sem mascarar como falha da integração", async () => {
    const resposta = await POST(
      new Request("http://localhost/api/whatsapp/enviar", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "mensagem-invalida" });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });

  it("classifica Preview sem service role como ambiente não configurado", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const resposta = await POST(
      new Request("http://localhost/api/whatsapp/enviar", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: JSON.stringify({ imovelId: "imovel-1", mensagem: "Olá." }),
      }),
    );

    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "nao-configurado" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.destinoAncoradoDaConversa).not.toHaveBeenCalled();
  });

  it("envia uma única vez ao JID canônico e só então persiste o histórico", async () => {
    mocks.createClient
      .mockReturnValueOnce(clienteComImovel())
      .mockReturnValueOnce({});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ exists: true, jid: "554398024316@s.whatsapp.net" }]))
      .mockResolvedValueOnce(Response.json({ key: { id: "mensagem-saida-1" } }));
    vi.stubGlobal("fetch", fetcher);

    const resposta = await POST(
      new Request("http://localhost/api/whatsapp/enviar", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: JSON.stringify({ imovelId: "imovel-1", mensagem: "Obrigado pelo retorno." }),
      }),
    );

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true, historicoPersistido: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toContain("/message/sendText/instancia-1");
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      number: "554398024316",
      text: "Obrigado pelo retorno.",
    });
    expect(mocks.registrarMensagemEnviada).toHaveBeenCalledTimes(1);
    expect(mocks.registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({ evento: "envio-ok", userId: "usuario-1" }),
    );
  });

  it("usa somente o LID ancorado quando a consulta do telefone responde exists:false", async () => {
    mocks.createClient
      .mockReturnValueOnce(clienteComImovel())
      .mockReturnValueOnce({});
    mocks.destinoAncoradoDaConversa.mockResolvedValue("123456789@lid");
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ exists: false }]))
      .mockResolvedValueOnce(Response.json({ key: { id: "mensagem-saida-1" } }));
    vi.stubGlobal("fetch", fetcher);

    const resposta = await POST(
      new Request("http://localhost/api/whatsapp/enviar", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: JSON.stringify({ imovelId: "imovel-1", mensagem: "Obrigado." }),
      }),
    );

    expect(resposta.status).toBe(200);
    expect(mocks.destinoAncoradoDaConversa).toHaveBeenCalledWith(
      "https://evolution.example",
      "instancia-1",
      "token-instancia",
      "+55 (43) 99802-4316",
      expect.arrayContaining([expect.objectContaining({ id: "wa:entrada-1" })]),
    );
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).number).toBe("123456789@lid");
  });

  it("traduz indisponibilidade da integração sem persistir nem repetir o envio", async () => {
    mocks.createClient
      .mockReturnValueOnce(clienteComImovel())
      .mockReturnValueOnce({});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ exists: true, jid: "554398024316@s.whatsapp.net" }]))
      .mockResolvedValueOnce(new Response("connection closed", { status: 400 }));
    vi.stubGlobal("fetch", fetcher);

    const resposta = await POST(
      new Request("http://localhost/api/whatsapp/enviar", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        body: JSON.stringify({ imovelId: "imovel-1", mensagem: "Olá." }),
      }),
    );

    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({
      ok: false,
      falha: "instancia-desconectada",
      mensagem: expect.stringContaining("WhatsApp está desconectado"),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.registrarMensagemEnviada).not.toHaveBeenCalled();
  });
});
