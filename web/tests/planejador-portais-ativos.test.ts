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

import { planejarColetaMercadoLegado as planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";
import { PORTAIS_ATIVOS } from "@/lib/calculo/centralAngariacao";

describe("planejador de mercados", () => {
  it("considera exatamente os portais ativos; quem decide cobertura é a capacidade", () => {
    avaliados.length = 0;
    const plano = planejarColetaMercado({ cidade: "Londrina", estado: "PR", finalidade: "locacao", segmento: "residencial" });
    // Com a capacidade neutralizada, o zap aparece aqui; com a capacidade real ele
    // é pulado por não haver tipo (ver zap-radar.test.ts). O teto de 4 corta o 5º.
    expect(avaliados).toEqual([...PORTAIS_ATIVOS]);
    expect(plano.consultas.map((consulta) => consulta.filtros.portal)).toEqual(["olx", "chaves-na-mao", "wimoveis", "viva-real"]);
  });
});
