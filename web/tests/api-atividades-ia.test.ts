import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { GET } from "@/app/api/ia/atividades/route";

describe("GET /api/ia/atividades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
  });

  it("deriva o usuário do token e limita a consulta ao próprio histórico", async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{ id: 7, tipo: "assistente-chat", criado_em: "2026-08-27T12:00:00.000Z" }],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mocks.createClient
      .mockReturnValueOnce({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario-autenticado" } }, error: null }) },
      })
      .mockReturnValueOnce({ from });

    const resposta = await GET(new Request("http://localhost/api/ia/atividades?userId=outro", {
      headers: { Authorization: "Bearer token-valido" },
    }));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(from).toHaveBeenCalledWith("ia_uso");
    expect(select).toHaveBeenCalledWith("id,tipo,criado_em");
    expect(eq).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(corpo.atividades[0].titulo).toBe("Conversa com o Assistente");
    expect(JSON.stringify(corpo)).not.toContain("token");
    expect(JSON.stringify(corpo)).not.toContain("modelo");
  });

  it("recusa a consulta sem sessão antes de criar a service role", async () => {
    const resposta = await GET(new Request("http://localhost/api/ia/atividades"));
    expect(resposta.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
