import { describe, expect, it } from "vitest";
import { chaveCanonicaConsultaPortal, deduplicarConsultasPortal, planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";

const mercado = { cidade: "Londrina", estado: "PR", finalidade: "locacao", segmento: "residencial" };
describe("planejador capability-aware de mercados", () => {
  it("planeja quatro consultas amplas para Londrina/PR sem combinações", () => {
    const plano = planejarColetaMercado(mercado);
    expect(plano.erro).toBeNull();
    expect(plano.consultas).toHaveLength(4);
    expect(plano.consultas[0].url).toBe("https://www.olx.com.br/imoveis/aluguel/estado-pr/regiao-de-londrina");
    for (const { filtros } of plano.consultas) {
      expect(Object.keys(filtros).sort()).toEqual(["cidade", "estado", "portal"]);
    }
  });
  it.each(["Curitiba", "Maringá"])("%s/PR não recebe OLX Londrina nem região inventada", (cidade) => {
    const plano = planejarColetaMercado({ ...mercado, cidade });
    expect(plano.consultas.map((q) => q.filtros.portal)).toEqual(["chaves-na-mao", "wimoveis", "viva-real"]);
    expect(JSON.stringify(plano)).not.toContain("regiao-de-");
    expect(JSON.stringify(plano)).not.toContain("londrina");
  });
  it("Campinas/SP usa somente formatos UF/cidade disponíveis, sem VivaReal Paraná", () => {
    const plano = planejarColetaMercado({ ...mercado, cidade: "Campinas", estado: "SP" });
    expect(plano.consultas.map((q) => q.filtros.portal)).toEqual(["chaves-na-mao", "wimoveis"]);
    expect(plano.consultas.every((q) => q.filtros.estado === "SP")).toBe(true);
    expect(JSON.stringify(plano)).not.toMatch(/parana|estado-pr|londrina/);
  });
  it.each([{ estado: "" }, { estado: "XX" }, { cidade: "" }])("mercado sem geografia segura não possui consultas: %j", (parcial) => {
    expect(planejarColetaMercado({ ...mercado, ...parcial })).toEqual({ consultas: [], erro: "sem_portal_suportado" });
  });
  it.each([{ finalidade: "venda" }, { segmento: "comercial" }])("não coleta capacidade não operacional: %j", (parcial) => {
    expect(planejarColetaMercado({ ...mercado, ...parcial })).toEqual({ consultas: [], erro: "mercado_nao_suportado" });
  });
  it("deduplica tipo ignorado pela OLX e mantém parâmetros reais", () => {
    const base = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    expect(deduplicarConsultasPortal([{ ...base, tipo: "casa" }, { ...base, tipo: "apartamento" }])).toHaveLength(1);
    expect(deduplicarConsultasPortal([base, { ...base, somenteProprietario: true }])).toHaveLength(2);
  });
  it("normaliza ordem de querystring, ignora fragmento e separa UFs homônimas", () => {
    expect(chaveCanonicaConsultaPortal("olx", "https://www.olx.com.br/?a=1&b=2#x"))
      .toBe(chaveCanonicaConsultaPortal("olx", "https://www.olx.com.br/?b=2&a=1"));
    const pr = planejarColetaMercado(mercado).consultas.find((q) => q.filtros.portal === "chaves-na-mao")!;
    const sp = planejarColetaMercado({ ...mercado, estado: "SP" }).consultas[0];
    expect(pr.chave).not.toBe(sp.chave);
  });
});
