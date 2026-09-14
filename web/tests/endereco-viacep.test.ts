import { describe, expect, it } from "vitest";
import {
  chaveResultadoViaCep,
  mapearEnderecoViaCep,
  prepararPesquisaEnderecoViaCep,
  separarNumeroDoEndereco,
} from "@/lib/calculo/enderecoViaCep";

describe("endereço por ViaCEP", () => {
  it("exige UF, cidade e logradouro nos mínimos aceitos pelo serviço", () => {
    expect(prepararPesquisaEnderecoViaCep("P", "Londrina", "Paraná")).toBeNull();
    expect(prepararPesquisaEnderecoViaCep("PR", "Lo", "Paraná")).toBeNull();
    expect(prepararPesquisaEnderecoViaCep("PR", "Londrina", "Pa")).toBeNull();
  });

  it("normaliza a pesquisa e preserva o número depois da vírgula", () => {
    expect(prepararPesquisaEnderecoViaCep(" pr ", "  Londrina  ", " Rua   Paraná,  123 ")).toEqual({
      uf: "PR",
      cidade: "Londrina",
      logradouro: "Rua Paraná",
      numero: "123",
    });
  });

  it("não confunde o número do nome da rua com o número do imóvel", () => {
    expect(prepararPesquisaEnderecoViaCep("PR", "Londrina", "Rua 15")).toEqual({
      uf: "PR",
      cidade: "Londrina",
      logradouro: "Rua 15",
      numero: "",
    });
  });

  it("mapeia o resultado sem apagar componentes ausentes", () => {
    const pesquisa = prepararPesquisaEnderecoViaCep("PR", "Londrina", "Paraná, 123");
    expect(pesquisa).not.toBeNull();
    expect(mapearEnderecoViaCep({
      cep: "86010-390",
      logradouro: "Rua Paraná",
      bairro: "Centro",
      localidade: "Londrina",
      uf: "pr",
    }, pesquisa!)).toEqual({
      endereco: "Rua Paraná, 123",
      bairro: "Centro",
      cidade: "Londrina",
      estado: "PR",
      cep: "86010-390",
    });

    expect(mapearEnderecoViaCep({ logradouro: "Rua Paraná" }, pesquisa!)).toEqual({
      endereco: "Rua Paraná, 123",
    });
  });

  it("gera chave estável para eliminar resultados repetidos", () => {
    const resultado = { cep: "86010-390", logradouro: "Rua Paraná", localidade: "Londrina", uf: "PR" };
    expect(chaveResultadoViaCep(resultado)).toBe(chaveResultadoViaCep({ ...resultado }));
  });
});

describe("separarNumeroDoEndereco", () => {
  it("devolve rua e número quando o endereço vem como 'Rua X, 123'", () => {
    expect(separarNumeroDoEndereco("Rua das Palmeiras, 120")).toEqual({ rua: "Rua das Palmeiras", numero: "120" });
    expect(separarNumeroDoEndereco("Rua das Palmeiras,120-A")).toEqual({ rua: "Rua das Palmeiras", numero: "120-A" });
  });

  it("sem número depois da vírgula, tudo é rua — inclusive nomes com vírgula ou número", () => {
    expect(separarNumeroDoEndereco("Rua Sete de Setembro")).toEqual({ rua: "Rua Sete de Setembro", numero: "" });
    expect(separarNumeroDoEndereco("Avenida 10, Jardim")).toEqual({ rua: "Avenida 10, Jardim", numero: "" });
    expect(separarNumeroDoEndereco("  Rua   Larga  ")).toEqual({ rua: "Rua Larga", numero: "" });
  });
});
