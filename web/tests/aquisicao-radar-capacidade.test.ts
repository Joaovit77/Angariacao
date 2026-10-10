import { describe, expect, it } from "vitest";
import { capacidadeAquisicaoRadar, tipoRecorteObservadoRadar, tipoRecorteRadar } from "@/lib/calculo/aquisicaoRadar";
import { capacidadeFuncionalZap, PORTAIS_CONHECIDOS } from "@/lib/calculo/centralAngariacao";

describe("matriz de aquisição aprovada em R6.0c-A", () => {
  const esperados = {
    olx: ["parcial", "parcial"],
    zap: ["nao-suportado", "suportado"],
    "viva-real": ["parcial", "parcial"],
    "chaves-na-mao": ["suportado", "parcial"],
    wimoveis: ["parcial", "suportado"],
  } as const;
  for (const portal of PORTAIS_CONHECIDOS) {
    for (const [indice, tipoRecorte] of (["casa", "apartamento"] as const).entries()) {
      it(`${portal}: locação ${tipoRecorte} preserva a classificação aprovada`, () => {
        const capacidade = capacidadeAquisicaoRadar({ portal, finalidade: "locacao", tipoRecorte, cidade: "Londrina", estado: "PR" });
        expect(capacidade.status).toBe(esperados[portal][indice]);
        expect(capacidade.suportado).toBe(esperados[portal][indice] === "suportado");
      });
      it(`${portal}: venda ${tipoRecorte} permanece bloqueada`, () => {
        expect(capacidadeAquisicaoRadar({ portal, finalidade: "venda", tipoRecorte, cidade: "Londrina", estado: "PR" }))
          .toMatchObject({ status: "nao-suportado", suportado: false });
      });
    }
  }
  it("não promove formato geográfico genérico a suporte comprovado", () => {
    expect(capacidadeAquisicaoRadar({ portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Curitiba", estado: "PR" }))
      .toMatchObject({ status: "parcial", suportado: false });
  });
  it("mantém o recorte do ZAP sem bairro", () => {
    expect(capacidadeAquisicaoRadar({ portal: "zap", finalidade: "locacao", tipoRecorte: "apartamento", cidade: "Londrina", estado: "PR", bairro: "Centro" }).suportado).toBe(false);
  });
  it("o wrapper do ZAP também respeita finalidade explícita", () => {
    expect(capacidadeFuncionalZap({ finalidade: "venda", tipoRecorte: "apartamento", tipo: "Apartamento", cidade: "Londrina", estado: "PR" }).suportado).toBe(false);
  });
});

describe("tipo solicitado, observado e famílias de comparáveis", () => {
  it.each(["Sobrado", "Casa de Condomínio", "Kitnet/Studio", "Kitnet", "Studio"])("não promove %s ao recorte mínimo", (tipo) => {
    expect(tipoRecorteRadar(tipo)).toBeNull();
  });
  it("não consulta tipo legado nem tipo solicitado para decidir o observado", () => {
    const legado = { tipo: "Casa", tipoRecorte: "casa" as const, tipoDeclarado: "Apartamento" };
    expect(tipoRecorteObservadoRadar(legado)).toBe("apartamento");
    expect(tipoRecorteObservadoRadar({ ...legado, tipoDeclarado: null })).toBeNull();
    expect(tipoRecorteObservadoRadar({ ...legado, tipoDeclarado: undefined })).toBeNull();
  });
});
