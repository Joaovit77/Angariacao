import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/viacep/route";
import { consultarViaCep } from "@/lib/servidor/viacep";

describe("fronteira de servidor do ViaCEP", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("codifica os segmentos e devolve resultados válidos", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        { cep: "86010-390", logradouro: "Rua Paraná", bairro: "Centro", localidade: "Londrina", uf: "PR" },
      ]),
    );

    const resultado = await consultarViaCep(
      { tipo: "endereco", uf: "PR", cidade: "São José", logradouro: "Rua Paraná" },
      fetcher,
    );

    expect(resultado).toMatchObject({ ok: true, resultados: [{ cep: "86010-390" }] });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://viacep.com.br/ws/PR/S%C3%A3o%20Jos%C3%A9/Rua%20Paran%C3%A1/json/",
    );
  });

  it("distingue CEP inexistente, indisponibilidade e resposta inválida", async () => {
    await expect(
      consultarViaCep(
        { tipo: "cep", cep: "00000000" },
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ erro: true })),
      ),
    ).resolves.toEqual({ ok: false, falha: "nao-encontrado", status: 404 });

    await expect(
      consultarViaCep(
        { tipo: "cep", cep: "86010390" },
        vi.fn<typeof fetch>().mockRejectedValue(new Error("sem rede")),
      ),
    ).resolves.toEqual({ ok: false, falha: "indisponivel", status: 503 });

    await expect(
      consultarViaCep(
        { tipo: "cep", cep: "86010390" },
        vi.fn<typeof fetch>().mockResolvedValue(Response.json({ cep: 123 })),
      ),
    ).resolves.toEqual({ ok: false, falha: "resposta-invalida", status: 502 });
  });

  it("a rota rejeita entrada incompleta sem chamar serviço externo", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const resposta = await GET(new Request("http://localhost/api/viacep?uf=PR&cidade=Lo&logradouro=R"));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "requisicao-invalida" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
