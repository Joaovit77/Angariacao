import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(resolve(caminho), "utf8");

// R3.2a é somente observação no cron. Nenhum outro consumidor da coleta
// compartilhada pode filtrar por relevância enquanto o gate não for aprovado.
describe("fronteira do shadow de quarto individual (R3.2a)", () => {
  it.each([
    "app/api/central-angariacao/buscar/route.ts",
    "lib/radarAngariacao.ts",
    "lib/servidor/finalizacaoCentralAngariacao.ts",
    "lib/servidor/coletaMercadosMonitorados.ts",
    "lib/servidor/comparaveisMercado.ts",
    "lib/servidor/firecrawlCentralAngariacao.ts",
    "lib/calculo/radarAngariacao.ts",
  ])("%s não usa a classificação de relevância", (arquivo) => {
    expect(ler(arquivo)).not.toMatch(/relevanciaRadarOlx|classificarRelevanciaRadarOlx|parece_quarto/);
  });

  it("a Central manual continua coletando sem diagnóstico nem filtro extra", () => {
    const rota = ler("app/api/central-angariacao/buscar/route.ts");
    expect(rota).toMatch(/buscarComFirecrawl\(seguros, urlPesquisa\)/);
  });

  it("o shadow não cria schema nem coluna", () => {
    expect(ler("../supabase-schema.sql")).not.toMatch(/parece_quarto|relevancia_radar/);
  });
});
