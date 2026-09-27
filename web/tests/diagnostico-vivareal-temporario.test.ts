import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { buscar, exigirAdmin, salvar } = vi.hoisted(() => ({ buscar: vi.fn(), exigirAdmin: vi.fn(), salvar: vi.fn() }));

vi.mock("@/lib/servidor/firecrawlCentralAngariacao", () => ({
  buscarComFirecrawlAoVivo: buscar,
  FirecrawlIndisponivel: class FirecrawlIndisponivel extends Error {
    constructor(message: string, readonly codigo = "firecrawl_indisponivel") { super(message); }
  },
}));
vi.mock("@/app/api/admin/_comum", () => ({ exigirAdmin }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({ salvarComparaveisMercado: salvar }));

import { POST } from "@/app/api/admin/diagnostico-vivareal/route";

function pedido(sufixo = "", corpo?: string) {
  return new Request(`https://preview.test/api/admin/diagnostico-vivareal${sufixo}`, {
    method: "POST",
    body: corpo,
  });
}

describe("prova temporária Viva Real", () => {
  const anterior = process.env.VERCEL_ENV;
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
    buscar.mockReset();
    exigirAdmin.mockReset();
    salvar.mockReset();
    exigirAdmin.mockResolvedValue({ userId: "admin" });
  });
  afterEach(() => { process.env.VERCEL_ENV = anterior; });

  it("bloqueia Production antes da guarda e da aquisição", async () => {
    process.env.VERCEL_ENV = "production";
    expect((await POST(pedido())).status).toBe(403);
    expect(exigirAdmin).not.toHaveBeenCalled();
    expect(buscar).not.toHaveBeenCalled();
  });

  it("não aceita URL ou corpo do cliente", async () => {
    expect((await POST(pedido("?url=https://outro.test"))).status).toBe(400);
    expect((await POST(pedido("", JSON.stringify({ url: "https://outro.test" })))).status).toBe(400);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("exige a guarda administrativa", async () => {
    exigirAdmin.mockResolvedValue({ resposta: new Response(null, { status: 403 }) });
    expect((await POST(pedido())).status).toBe(403);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("faz uma aquisição e retorna somente métricas agregadas", async () => {
    buscar.mockResolvedValue([{ portal: "viva-real", idExterno: "123456", titulo: "Título privado", url: "https://www.vivareal.com.br/imovel/privado-id-123456/", preco: 2000, cidade: "Londrina", anunciante: "incerto", descricao: "Conteúdo bruto privado" }]);
    const resposta = await POST(pedido());
    const texto = await resposta.text();
    const corpo = JSON.parse(texto);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar.mock.calls[0][1]).toBe("https://www.vivareal.com.br/aluguel/parana/londrina/apartamento_residencial/");
    expect(corpo).toMatchObject({ interpretados: 1, normalizados: 1, aposFiltros: 1 });
    expect(corpo.cobertura.preco).toEqual({ preenchidos: 1, total: 1 });
    expect(corpo.cobertura.autoria).toEqual({ preenchidos: 0, total: 1 });
    expect(texto).not.toContain("Título privado");
    expect(texto).not.toContain("Conteúdo bruto privado");
    expect(texto).not.toContain("123456");
    expect(texto).not.toContain("FIRECRAWL_API_KEY");
    expect(salvar).not.toHaveBeenCalled();
  });

  it("classifica falha sem divulgar mensagem ou conteúdo da exceção", async () => {
    buscar.mockRejectedValue(new Error("FIRECRAWL_API_KEY ou HTML privado"));
    const resposta = await POST(pedido());
    const texto = await resposta.text();
    expect(resposta.status).toBe(502);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(texto).not.toContain("FIRECRAWL_API_KEY");
    expect(texto).not.toContain("HTML privado");
    expect(salvar).not.toHaveBeenCalled();
  });
});
