import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HOME = readFileSync(new URL("../components/home/HomeView.tsx", import.meta.url), "utf8");
const DASHBOARD = readFileSync(
  new URL("../components/dashboard/DashboardView.tsx", import.meta.url),
  "utf8",
);
const PLANO = readFileSync(
  new URL("../components/home/PlanoExecucao.tsx", import.meta.url),
  "utf8",
);
const PANORAMA = readFileSync(
  new URL("../components/home/PanoramaDoDia.tsx", import.meta.url),
  "utf8",
);
const RODADA = readFileSync(
  new URL("../components/home/RodadaDoDia.tsx", import.meta.url),
  "utf8",
);

describe("modo de execução da Início", () => {
  it("exibe o plano individual antes das rodadas e dos atalhos", () => {
    const plano = HOME.indexOf("<PlanoExecucao />");
    const rodada = HOME.indexOf("<RodadaDoDia />");
    const atalhos = HOME.indexOf('className="home-actions"');

    expect(plano).toBeGreaterThan(0);
    expect(rodada).toBeGreaterThan(plano);
    expect(atalhos).toBeGreaterThan(rodada);
  });

  it("não duplica o plano operacional no Dashboard analítico", () => {
    expect(DASHBOARD).not.toContain("PlanoExecucao");
  });

  it("abre diretamente o imóvel quando a prioridade já identifica o caso", () => {
    expect(PLANO).toContain('acao.tipo === "parado" && acao.imovelId');
    expect(PLANO).toContain('abrirModal("imovel", acao.imovelId)');
  });

  it("identifica proprietário e endereço no card quando a ação aponta um imóvel", () => {
    expect(PLANO).toContain("proprietarioNome");
    expect(PLANO).toContain("enderecoComUnidade");
    expect(PLANO).toContain("Proprietário");
    expect(PLANO).toContain("Endereço");
  });

  it("explica há quanto tempo o imóvel está parado e desde quando", () => {
    expect(PLANO).toContain("diasSemMovimento");
    expect(PLANO).toContain("ultimoMovimentoISO");
    expect(PLANO).toContain("Sem movimentação desde");
    expect(PLANO).toContain("Retomar imóvel");
  });

  it("não repete respostas e agenda nas rodadas assistidas", () => {
    expect(RODADA).toContain('item.frente !== "respostas"');
    expect(RODADA).toContain('item.frente !== "compromissos"');
  });

  it("mantém resumos e listas completas fora da Início", () => {
    expect(HOME).not.toContain("QuemEstaQuente");
    expect(HOME).not.toContain("Próximos compromissos");
    expect(HOME).not.toContain("Imóveis parados");
    expect(HOME).not.toContain("Metas do mês");
  });

  it("traz de volta somente um panorama compacto com quatro destinos", () => {
    expect(HOME).toContain("<PanoramaDoDia />");
    for (const rota of ["/respostas", "/agenda", "/pipeline", "/metas"]) {
      expect(PANORAMA).toContain(`rota: "${rota}"`);
    }
    expect(PANORAMA).not.toContain("ItemAgenda");
    expect(PANORAMA).not.toContain("home-parado");
  });

  it("mostra apenas a primeira ação, sem despejar a fila inteira", () => {
    expect(PLANO).toContain("const principal = foco.acoes[0]");
    expect(PLANO).not.toContain("seguintes");
    expect(PLANO).not.toContain("totalAcoes");
  });
});
