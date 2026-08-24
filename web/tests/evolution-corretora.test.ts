import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INSTANCIA_CORRETORA,
  NUMERO_CORRETORA_EVOLUTION,
  NUMERO_CORRETORA_ORIGINAL,
} from "@/lib/calculo/instanciaCorretora";
import { garantirInstanciaCorretora } from "@/lib/servidor/evolution";

const SERVER = "https://evolution.exemplo.com";
const API_KEY = "global-secreta";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("identidade fixa da corretora", () => {
  it("preserva a fonte e acrescenta somente o DDI 55", () => {
    expect(INSTANCIA_CORRETORA).toBe("corretora");
    expect(NUMERO_CORRETORA_ORIGINAL).toBe("43 9653-4523");
    expect(NUMERO_CORRETORA_EVOLUTION).toBe("554396534523");
  });
});

describe("garantirInstanciaCorretora", () => {
  it("reutiliza a instância conectada sem criar ou pedir QR", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json([{ name: "corretora", token: "token-instancia", connectionStatus: "open" }]),
    );
    vi.stubGlobal("fetch", fetch);

    const resultado = await garantirInstanciaCorretora(SERVER, API_KEY);

    expect(resultado).toMatchObject({ ok: true, instancia: "corretora", criada: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/instance/create"))).toBe(false);
  });

  it("desconectada pede QR da mesma instância e nunca cria outra", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json([{ name: "corretora", token: "token-instancia", connectionStatus: "close" }]),
      )
      .mockResolvedValueOnce(json({ instance: { state: "close" } }))
      .mockResolvedValueOnce(json({ base64: "AAAA" }));
    vi.stubGlobal("fetch", fetch);

    const resultado = await garantirInstanciaCorretora(SERVER, API_KEY);

    expect(resultado).toMatchObject({
      ok: true,
      instancia: "corretora",
      criada: false,
      qr: "data:image/png;base64,AAAA",
    });
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/instance/connect/corretora"))).toBe(true);
    expect(fetch.mock.calls.some(([url]) => String(url).includes("/instance/create"))).toBe(false);
  });

  it("ausente recria exatamente `corretora` e devolve o QR", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(
        json({
          instance: { instanceName: "corretora", status: "connecting" },
          hash: "novo-token",
          qrcode: { base64: "BBBB" },
        }, 201),
      );
    vi.stubGlobal("fetch", fetch);

    const resultado = await garantirInstanciaCorretora(SERVER, API_KEY);

    expect(resultado).toMatchObject({
      ok: true,
      instancia: "corretora",
      token: "novo-token",
      criada: true,
      qr: "data:image/png;base64,BBBB",
    });
    const chamadaCriacao = fetch.mock.calls.find(([url]) => String(url).endsWith("/instance/create"));
    expect(chamadaCriacao).toBeTruthy();
    expect(JSON.parse(String(chamadaCriacao?.[1]?.body))).toEqual({
      instanceName: "corretora",
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    });
  });

  it("duas chamadas simultâneas compartilham uma única criação", async () => {
    let liberarConsulta!: () => void;
    const consulta = new Promise<Response>((resolve) => {
      liberarConsulta = () => resolve(json([]));
    });
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => consulta)
      .mockResolvedValueOnce(json({ hash: "token-unico", qrcode: { base64: "CCCC" } }, 201));
    vi.stubGlobal("fetch", fetch);

    const primeira = garantirInstanciaCorretora(SERVER, API_KEY);
    const segunda = garantirInstanciaCorretora(SERVER, API_KEY);
    liberarConsulta();
    const [a, b] = await Promise.all([primeira, segunda]);

    expect(a).toEqual(b);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/instance/create"))).toHaveLength(1);
  });

  it("absorve conflito entre processos reconsultando o mesmo nome", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ message: "already exists" }, 409))
      .mockResolvedValueOnce(
        json([{ name: "corretora", token: "token-vencedor", connectionStatus: "connecting" }]),
      );
    vi.stubGlobal("fetch", fetch);

    const resultado = await garantirInstanciaCorretora(SERVER, API_KEY);

    expect(resultado).toMatchObject({
      ok: true,
      instancia: "corretora",
      token: "token-vencedor",
      criada: false,
    });
    const corpos = fetch.mock.calls
      .map(([, init]) => init?.body)
      .filter(Boolean)
      .map(String);
    expect(corpos.join(" ")).not.toMatch(/corretora[-_]/);
  });

  it("Evolution indisponível não vira ausência e não dispara criação", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetch);

    await expect(garantirInstanciaCorretora(SERVER, API_KEY)).resolves.toEqual({
      ok: false,
      falha: "indisponivel",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
