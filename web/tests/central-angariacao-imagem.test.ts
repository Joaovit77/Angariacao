import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/central-angariacao/imagem/route";

describe("Proxy de imagens da Central de Angariação", () => {
  it("rejeita protocolos e hosts fora da lista dos portais", async () => {
    const local = await GET(new Request("http://localhost/api/central-angariacao/imagem?url=http%3A%2F%2F127.0.0.1%2Fsegredo"));
    const externo = await GET(new Request("http://localhost/api/central-angariacao/imagem?url=https%3A%2F%2Fexample.com%2Ffoto.jpg"));

    expect(local.status).toBe(403);
    expect(externo.status).toBe(403);
  });

  afterEach(() => vi.unstubAllGlobals());

  const pedir = (url: string) => GET(new Request(`http://localhost/api/central-angariacao/imagem?url=${encodeURIComponent(url)}`));

  it("R4.2h: libera só o host exato das fotos do ZAP, com Referer do próprio ZAP", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetchMock);
    const aceita = await pedir("https://resizedimgs.zapimoveis.com.br/img/foto.jpg");
    expect(aceita.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const opcoes = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    expect(opcoes.headers.Referer).toBe("https://www.zapimoveis.com.br/");
  });

  it.each([
    ["CDN do ZAP não aprovado", "https://cdn-zap-ssr-prod.zapimoveis.com.br/logo.png"],
    ["sufixo enganoso", "https://resizedimgs.zapimoveis.com.br.evil.test/foto.jpg"],
    ["http", "http://resizedimgs.zapimoveis.com.br/foto.jpg"],
    ["loopback", "https://127.0.0.1/foto.jpg"],
  ])("R4.2h: recusa %s sem tocar a rede", async (_nome, url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await pedir(url)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejeita URL malformada antes de tentar a rede", async () => {
    const resposta = await GET(new Request("http://localhost/api/central-angariacao/imagem?url=nao-e-url"));
    expect(resposta.status).toBe(400);
  });
});
