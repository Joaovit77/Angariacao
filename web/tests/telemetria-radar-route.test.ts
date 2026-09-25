import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), registrarEvento: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));

import { POST } from "@/app/api/central-angariacao/telemetria-radar/route";

const execucaoId = "229ee00d-1fe9-44b6-9fa4-80702fef8327";
const buscaId = "229ee00d-1fe9-44b6-9fa4-80702fef8328";

function requisicao(corpo: unknown, token = "token-teste") {
  return new Request("http://localhost/api/central-angariacao/telemetria-radar", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

describe("fechamento acessório do Radar", () => {
  const maybeSingle = vi.fn();
  const eqUsuario = vi.fn(() => ({ maybeSingle }));
  const eqBusca = vi.fn(() => ({ eq: eqUsuario }));
  const select = vi.fn(() => ({ eq: eqBusca }));
  const from = vi.fn(() => ({ select }));
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.createClient.mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "usuario-1" } }, error: null })) },
      from,
    });
    maybeSingle.mockResolvedValue({ data: { id: buscaId, filtros: { portal: "olx" } }, error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("confere autenticação e pertencimento antes de registrar apenas contagem", async () => {
    const resposta = await POST(requisicao({ execucaoId, buscaId, novos: 2 }));
    expect(resposta.status).toBe(200);
    expect(eqBusca).toHaveBeenCalledWith("id", buscaId);
    expect(eqUsuario).toHaveBeenCalledWith("user_id", "usuario-1");
    const evento = mocks.registrarEvento.mock.calls[0][0];
    expect(evento).toMatchObject({ userId: "usuario-1", categoria: "radar", evento: "radar-verificacao-fechada" });
    expect(JSON.parse(evento.detalhe)).toEqual({
      execucao_id: execucaoId, busca_id: buscaId, portal: "olx", novos: 2,
      origem_contagem: "cliente_autenticado_apos_upsert",
    });
  });

  it("recusa busca de outro usuário e contagem inválida", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(requisicao({ execucaoId, buscaId, novos: 0 }))).status).toBe(403);
    expect((await POST(requisicao({ execucaoId, buscaId, novos: -1 }))).status).toBe(400);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("falha do log não muda o fechamento funcional", async () => {
    mocks.registrarEvento.mockImplementation(() => { throw new Error("log indisponível"); });
    expect((await POST(requisicao({ execucaoId, buscaId, novos: 1 }))).status).toBe(200);
  });
});
