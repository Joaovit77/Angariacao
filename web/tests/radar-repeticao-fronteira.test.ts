import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(resolve(caminho), "utf8");
const SINAIS = /sinaisRepeticaoRadar|repeticao_chaves|possivel_mesmo_imovel|possivel_imovel_carteira|ja_conhecido_no_mercado/;

// R4.1a é somente observação no cron. Lista, contador, Central e coleta
// compartilhada não podem esconder, agrupar nem reordenar por esses sinais.
describe("fronteira do shadow de repetição do Chaves (R4.1a)", () => {
  it.each([
    "components/central/CentralAngariacaoView.tsx",
    "app/api/central-angariacao/buscar/route.ts",
    "lib/radarAngariacao.ts",
    "lib/calculo/radarAngariacao.ts",
    "lib/calculo/repeticaoCentralAngariacao.ts",
    "lib/calculo/comparaveisMercado.ts",
    "lib/servidor/finalizacaoCentralAngariacao.ts",
    "lib/servidor/coletaMercadosMonitorados.ts",
    "lib/servidor/comparaveisMercado.ts",
    "lib/servidor/firecrawlCentralAngariacao.ts",
    "lib/servidor/centralAngariacao.ts",
  ])("%s não usa os sinais de repetição", (arquivo) => {
    expect(ler(arquivo)).not.toMatch(SINAIS);
  });

  it("o núcleo dos sinais é puro: sem Supabase, React ou Next", () => {
    expect(ler("lib/calculo/sinaisRepeticaoRadar.ts")).not.toMatch(/supabase|from "react"|from "next/);
  });

  it("o monitor só lê para o shadow e grava no Radar como antes", () => {
    const monitor = ler("lib/servidor/monitorRadarAngariacao.ts");
    const shadow = monitor.slice(
      monitor.indexOf("async function detalheShadowRepeticaoChaves"),
      monitor.indexOf("/** Instrumentação é acessória"),
    );
    expect(shadow).not.toMatch(/\.(insert|upsert|update|delete|rpc)\(/);
    expect(monitor).toMatch(/onConflict: "busca_id,portal,id_externo",\s*ignoreDuplicates: true/);
  });

  it("o shadow não cria schema nem coluna", () => {
    expect(ler("../supabase-schema.sql")).not.toMatch(SINAIS);
  });
});
