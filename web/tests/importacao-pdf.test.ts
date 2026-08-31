/* Regressão do relatório real "Imóveis Angariados" do CasaSoft.

   As posições abaixo reproduzem as colunas do PDF que motivou a mudança.
   O teste não depende da implementação do PDF.js: ele fixa o contrato que a
   extração precisa entregar ao parser e, principalmente, o imóvel que deve
   aparecer na prévia antes de qualquer escrita. */
import { describe, expect, it } from "vitest";
import {
  csvDoRelatorioCasaSoft,
  interpretarRelatorioCasaSoft,
  type TextoPdfPosicionado,
} from "@/lib/calculo/importacaoPdf";
import { lerImportacao } from "@/lib/calculo/importacao";

function texto(pagina: number, x: number, y: number, valor: string): TextoPdfPosicionado {
  return { pagina, x, y, texto: valor };
}

function relatorioRealista(): TextoPdfPosicionado[] {
  return [
    texto(1, 717, 536, "Imóveis Angariados"),
    texto(1, 30, 501, "Ref."),
    texto(1, 668, 501, "Dt. Angariação"),

    texto(1, 30, 396.3, "04044.001"),
    texto(1, 101, 396.3, "Apartamento"),
    texto(1, 180, 396.3, "Avenida Camilly Fernandes Rodrigues, 155 BL 11 AP 301"),
    texto(1, 356, 396.3, "CIDADE INDUSTRIAL 2"),
    texto(1, 477, 396.3, "44,00"),
    texto(1, 523, 396.3, "40,00"),
    texto(1, 676, 397.2, "25/08/2026"),
    texto(1, 781, 396.3, "1.560,00"),
    texto(1, 191, 382.1, "EDNEA"),

    // No PDF.js comum endereço e bairro desta linha se grudam. A extração
    // por operadores preserva as duas células nestas coordenadas.
    texto(1, 30, 367.1, "03623.001"),
    texto(1, 101, 367.1, "Apartamento"),
    texto(1, 180, 367.1, "RUA BARTHOLOMEU LOPES , 625 BL E AP 304"),
    texto(1, 356, 367.1, "CONJUNTO HABITACIONAL JAMILE DEQUECH"),
    texto(1, 482, 367.1, "0,00"),
    texto(1, 527, 367.1, "0,00"),
    texto(1, 676, 368, "29/07/2026"),
    texto(1, 781, 367.1, "1.200,00"),
    texto(1, 191, 352.9, "EDNEA"),

    texto(2, 717, 536, "Imóveis Angariados"),
    texto(2, 30, 501, "Ref."),
    texto(2, 668, 501, "Dt. Angariação"),
    texto(2, 30, 440.5, "04011.001"),
    texto(2, 101, 440.5, "Casa Comercial"),
    texto(2, 180, 440.5, "Aveni Robert Koch, 663"),
    texto(2, 356, 440.5, "OPERARIA"),
    texto(2, 482, 440.5, "0,00"),
    texto(2, 518, 440.5, "160,00"),
    texto(2, 676, 441.4, "17/08/2026"),
    texto(2, 781, 440.5, "3.600,00"),
    texto(2, 191, 426.4, "EDNEA"),
    texto(2, 30, 47, "Total de registros: 3"),
  ];
}

describe("interpretarRelatorioCasaSoft", () => {
  it("reconstrói endereço, unidade, bloco, referência, data e aluguel-base", () => {
    const resultado = interpretarRelatorioCasaSoft(relatorioRealista());
    expect(resultado).toMatchObject({ totalDeclarado: 3, paginas: 2 });
    expect(resultado.registros[0]).toMatchObject({
      referenciaCrm: "04044.001",
      endereco: "Avenida Camilly Fernandes Rodrigues, 155",
      bairro: "Cidade Industrial 2",
      cidade: "Londrina",
      unidade: "301",
      bloco: "11",
      tipo: "Apartamento",
      valorAluguel: 1300,
      responsavel: "Ednea",
      dataAngariacao: "2026-08-25",
    });
    expect(resultado.registros[0].observacoes).toContain("Área total: 44 m²");
    expect(resultado.registros[0].observacoes).toContain("Área útil: 40 m²");
  });

  it("não perde o bairro quando ele encosta no endereço no PDF", () => {
    const imovel = interpretarRelatorioCasaSoft(relatorioRealista()).registros[1];
    expect(imovel).toMatchObject({
      referenciaCrm: "03623.001",
      endereco: "Rua Bartholomeu Lopes, 625",
      bairro: "Conjunto Habitacional Jamile Dequech",
      unidade: "304",
      bloco: "E",
      valorAluguel: 1000,
    });
  });

  it("mapeia Casa Comercial sem esconder o tipo original", () => {
    const imovel = interpretarRelatorioCasaSoft(relatorioRealista()).registros[2];
    expect(imovel).toMatchObject({
      endereco: "Avenida Robert Koch, 663",
      tipo: "Sala Comercial",
      valorAluguel: 3000,
    });
    expect(imovel.observacoes).toContain("Tipo no relatório: Casa Comercial");
  });

  it("entra na mesma prévia segura do CSV e continua começando em Novo contato", () => {
    const extraido = interpretarRelatorioCasaSoft(relatorioRealista());
    const previa = lerImportacao(csvDoRelatorioCasaSoft(extraido.registros), [], "2026-08-31");
    expect(previa.linhas).toHaveLength(3);
    expect(previa.linhas.every((linha) => linha.imovel?.status === "Novo contato")).toBe(true);
    expect(previa.linhas[0].imovel?.referenciaCrm).toBe("04044.001");
  });

  it("interrompe antes da prévia se alguma linha do PDF não foi lida", () => {
    const incompleto = relatorioRealista().filter((item) => item.texto !== "03623.001");
    expect(() => interpretarRelatorioCasaSoft(incompleto)).toThrow(
      "O PDF informa 3 imóvel(is), mas foi possível ler 2",
    );
  });

  it("recusa outro tipo de PDF em vez de importar texto por engano", () => {
    expect(() => interpretarRelatorioCasaSoft([texto(1, 10, 10, "Contrato de locação")])).toThrow(
      "não é o relatório 'Imóveis Angariados'",
    );
  });
});
