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
    const limitarUsos = vi.fn().mockResolvedValue({
      data: [{ id: 7, tipo: "assistente-chat", criado_em: "2026-08-27T12:00:00.000Z" }],
      error: null,
    });
    const limitarEventos = vi.fn().mockResolvedValue({
      data: [{
        id: 8,
        evento: "ia-assistente-respondido",
        criado_em: "2026-08-27T12:00:05.000Z",
        detalhe: JSON.stringify({
          operacao: "assistente-chat",
          ferramentasChamadas: ["consultar_imovel"],
          entidadesUtilizadas: ["id-privado"],
          fontesDeDados: ["ferramenta:consultar_imovel"],
          validacoesAplicadas: ["sanitizacao-da-saida"],
          resultado: "respondido",
          motivo: "resposta-gerada",
        }),
      }],
      error: null,
    });
    const ordenarUsos = vi.fn().mockReturnValue({ limit: limitarUsos });
    const filtrarUsuarioUsos = vi.fn().mockReturnValue({ order: ordenarUsos });
    const selecionarUsos = vi.fn().mockReturnValue({ eq: filtrarUsuarioUsos });
    const ordenarEventos = vi.fn().mockReturnValue({ limit: limitarEventos });
    const filtrarCategoria = vi.fn().mockReturnValue({ order: ordenarEventos });
    const filtrarUsuarioEventos = vi.fn().mockReturnValue({ eq: filtrarCategoria });
    const selecionarEventos = vi.fn().mockReturnValue({ eq: filtrarUsuarioEventos });
    const from = vi.fn((tabela: string) => tabela === "ia_uso"
      ? { select: selecionarUsos }
      : { select: selecionarEventos });
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
    expect(from).toHaveBeenCalledWith("log_eventos");
    expect(selecionarUsos).toHaveBeenCalledWith("id,tipo,criado_em");
    expect(selecionarEventos).toHaveBeenCalledWith("id,evento,detalhe,criado_em");
    expect(filtrarUsuarioUsos).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(filtrarUsuarioEventos).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(filtrarCategoria).toHaveBeenCalledWith("categoria", "ia");
    expect(corpo.atividades[0].titulo).toBe("Conversa com o Assistente");
    expect(corpo.atividades[0].detalhesObservados).toBe(true);
    expect(JSON.stringify(corpo)).not.toContain("token");
    expect(JSON.stringify(corpo)).not.toContain("modelo");
    expect(JSON.stringify(corpo)).not.toContain("id-privado");
    expect(JSON.stringify(corpo)).not.toContain("sanitizacao-da-saida");
  });

  it("recusa a consulta sem sessão antes de criar a service role", async () => {
    const resposta = await GET(new Request("http://localhost/api/ia/atividades"));
    expect(resposta.status).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
