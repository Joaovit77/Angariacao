import { describe, expect, it } from "vitest";
import {
  chaveResultadoViaCep,
  mapearEnderecoViaCep,
  prepararPesquisaEnderecoViaCep,
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
