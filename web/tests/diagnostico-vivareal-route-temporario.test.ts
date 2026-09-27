import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exigirAdmin: vi.fn(),
  buscarComFirecrawlAoVivo: vi.fn(),
  escrita: vi.fn(),
}));

vi.mock("@/app/api/admin/_comum", () => ({ exigirAdmin: mocks.exigirAdmin }));
vi.mock("@/lib/servidor/firecrawlCentralAngariacao", () => ({
  buscarComFirecrawlAoVivo: mocks.buscarComFirecrawlAoVivo,
  FirecrawlIndisponivel: class FirecrawlIndisponivel extends Error {},
}));

import { POST } from "@/app/api/admin/diagnostico-vivareal/route";

const rota = "https://preview.test/api/admin/diagnostico-vivareal";
const pedido = (url = rota, body?: string) => new Request(url, {
  method: "POST", headers: { Authorization: "Bearer token-falso" }, body,
});
const html = `<a href="https://www.vivareal.com.br/imovel/apartamento-id-2904079401/">
  <h2>Apartamento em Centro, Londrina</h2><p>Rua Segredo, 15</p>
  <p>Aluguel R$ 2.500</p><p>Condomínio R$ 500</p><p>telefone-falso-sigiloso</p>
</a>`;

describe("rota diagnóstica temporária Viva Real", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    mocks.exigirAdmin.mockResolvedValue({ userId: "admin-falso", sb: { from: mocks.escrita } });
    mocks.buscarComFirecrawlAoVivo.mockImplementation(async (_filtros, _url, opcoes) => {
      opcoes.observarHtml(html);
      return [{
        portal: "viva-real", idExterno: "2904079401", titulo: "Apartamento em Centro, Londrina",
        preco: 2500, cidade: "Londrina", endereco: "Rua Segredo, 15",
        url: "https://www.vivareal.com.br/imovel/apartamento-id-2904079401/", anunciante: "incerto",
      }];
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("bloqueia Production antes da autenticação e da aquisição", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(403);
    expect(mocks.exigirAdmin).not.toHaveBeenCalled();
    expect(mocks.buscarComFirecrawlAoVivo).not.toHaveBeenCalled();
  });

  it("exige admin e não consulta Firecrawl sem autorização", async () => {
    mocks.exigirAdmin.mockResolvedValue({ resposta: Response.json({ ok: false }, { status: 403 }) });
    expect((await POST(pedido())).status).toBe(403);
    expect(mocks.buscarComFirecrawlAoVivo).not.toHaveBeenCalled();
  });

  it("rejeita URL arbitrária e corpo enviado pelo cliente", async () => {
    expect((await POST(pedido(`${rota}?url=https://outro.test/`))).status).toBe(400);
    expect((await POST(pedido(rota, JSON.stringify({ url: "https://outro.test/" })))).status).toBe(400);
    expect(mocks.buscarComFirecrawlAoVivo).not.toHaveBeenCalled();
  });

  it("usa apenas a URL do builder, chama Firecrawl uma vez e devolve só agregados", async () => {
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(200);
    expect(mocks.buscarComFirecrawlAoVivo).toHaveBeenCalledTimes(1);
    expect(mocks.buscarComFirecrawlAoVivo.mock.calls[0][1])
      .toBe("https://www.vivareal.com.br/aluguel/parana/londrina/apartamento_residencial/");
    expect(mocks.escrita).not.toHaveBeenCalled();
    const resultado = await resposta.json();
    expect(resultado).toMatchObject({
      ok: true, cardsInterpretaveis: 1,
      preco: { doisValores: 1, primeiroRotuladoAluguel: 1 },
      identidade: { idNaUrl: 1, fallbackPosicional: 0 },
      parser: { interpretados: 1 },
    });
    const serializado = JSON.stringify(resultado);
    for (const segredo of ["<a", "Rua Segredo", "telefone-falso", "2904079401", "R$ 2.500", "token-falso"]) {
      expect(serializado).not.toContain(segredo);
    }
  });
});
