import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/central-angariacao/imagem/route";

describe("Proxy de imagens da Central de Angariação", () => {
  it("rejeita protocolos e hosts fora da lista dos portais", async () => {
    const local = await GET(new Request("http://localhost/api/central-angariacao/imagem?url=http%3A%2F%2F127.0.0.1%2Fsegredo"));
    const externo = await GET(new Request("http://localhost/api/central-angariacao/imagem?url=https%3A%2F%2Fexample.com%2Ffoto.jpg"));

    expect(local.status).toBe(403);
    expect(externo.status).toBe(403);
  });

  it("rejeita URL malformada antes de tentar a rede", async () => {
    const resposta = await GET(new Request("http://localhost/api/central-angariacao/imagem?url=nao-e-url"));
    expect(resposta.status).toBe(400);
  });
});
