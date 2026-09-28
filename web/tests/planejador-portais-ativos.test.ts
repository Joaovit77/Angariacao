// R4.2g — o planejador parte só dos portais ATIVOS por conta própria. A
// capacidade geográfica é neutralizada e as chamadas são registradas, para que
// nem ela nem o teto de LIMITE_CONSULTAS_MERCADO escondam um zap que entrasse
// na lista do planejador (as defesas são independentes).
import { describe, expect, it, vi } from "vitest";

const avaliados = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/servidor/centralAngariacao", () => ({
  capacidadeGeograficaPortal: (filtros: { portal: string }) => {
    avaliados.push(filtros.portal);
    return { suportado: true, nivel: "comprovado", motivo: "teste" };
  },
  urlDaPesquisa: (filtros: { portal: string }) => `https://portal.test/${filtros.portal}`,
}));

import { planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";

describe("R4.2g: planejador de mercados", () => {
  it("nunca considera portal inativo, mesmo se a capacidade permitisse", () => {
    avaliados.length = 0;
    const plano = planejarColetaMercado({ cidade: "Londrina", estado: "PR", finalidade: "locacao", segmento: "residencial" });
    expect(avaliados).toEqual(["olx", "chaves-na-mao", "wimoveis", "viva-real"]);
    expect(plano.consultas.map((consulta) => consulta.filtros.portal)).toEqual(["olx", "chaves-na-mao", "wimoveis", "viva-real"]);
  });
});
