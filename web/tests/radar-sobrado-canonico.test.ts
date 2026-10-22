import { describe, expect, it } from "vitest";
import { anuncioAdmitidoRecorteRadar, tipoRecorteObservadoRadar, tipoRecorteRadar } from "@/lib/calculo/aquisicaoRadar";
describe("Radar — Sobrado no recorte canônico Casa", () => {
  it.each(["Casa", "casa", "  CASA  ", "Sobrado", "sobrado", "  SoBrAdO  "])("normaliza tipo observado %s", (tipoDeclarado) => {
    expect(tipoRecorteObservadoRadar({ tipoDeclarado })).toBe("casa");
  });
  it("preserva Apartamento e não amplia a taxonomia dos filtros", () => {
    expect(tipoRecorteObservadoRadar({ tipoDeclarado: "Apartamento" })).toBe("apartamento");
    expect(tipoRecorteRadar("Sobrado")).toBeNull();
  });
  it.each([null, undefined, "desconhecido", "casa geminada", "townhouse", "edícula", "chácara", "fazenda", "kitnet", "studio", "loft", "cobertura", "duplex", "triplex"])("não inventa recorte para %s", (tipoDeclarado) => {
    expect(tipoRecorteObservadoRadar({ tipoDeclarado })).toBeNull();
  });
  it("preserva admissão estrita da aquisição Wimóveis Casa", () => {
    const anuncio = { idExterno: "100001", portal: "wimoveis" as const, titulo: "Sobrado", tipoDeclarado: "Sobrado", preco: 1200,
      cidade: "Londrina", estado: "PR", bairro: "Centro", endereco: null, imagem: null, url: "https://www.wimoveis.com.br/propriedades/sobrado-100001.html", descricao: null, anunciante: "incerto" as const };
    expect(tipoRecorteObservadoRadar(anuncio)).toBe("casa");
    expect(anuncioAdmitidoRecorteRadar(anuncio,{portal:"wimoveis",finalidade:"locacao",tipoRecorte:"casa",cidade:"Londrina",estado:"PR"})).toBe(false);
  });
  it("não modifica o tipo declarado nem contexto ao classificar", () => {
    const anuncio = Object.freeze({ tipoDeclarado: "Sobrado", finalidade: "locacao", cidade: "Londrina", estado: "PR", bairro: "Jardim Tókio" });
    expect(tipoRecorteObservadoRadar(anuncio)).toBe("casa");
    expect(anuncio).toEqual({ tipoDeclarado: "Sobrado", finalidade: "locacao", cidade: "Londrina", estado: "PR", bairro: "Jardim Tókio" });
  });
});
