import { beforeEach, describe, expect, it, vi } from "vitest";

const registrarEvento = vi.hoisted(() => vi.fn());
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento }));

import { criarObservadorRadar } from "@/lib/servidor/observabilidadeRadar";

const ID = "229ee00d-1fe9-44b6-9fa4-80702fef8327";

describe("contrato seguro da observabilidade R4.3", () => {
  beforeEach(() => {
    registrarEvento.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("mantém ausência de fase como desconhecida, sem inferir cache ou ausência de chamada", () => {
    const observador = criarObservadorRadar({ execucaoId: ID, iniciador: "cron", portal: "olx" });
    expect(observador.resumo()).toMatchObject({
      reutilizacao: "desconhecida", aquisicao: "desconhecida",
      chamada_propria_iniciada: null, resposta_recebida: null, resultado_interpretado: null,
    });
  });

  it("distingue cache, chamada externa e reutilização sem atribuir chamada ao consumidor", () => {
    const produtor = criarObservadorRadar({ execucaoId: ID, iniciador: "cron", portal: "olx" });
    const consumidor = criarObservadorRadar({
      execucaoId: "229ee00d-1fe9-44b6-9fa4-80702fef8328", iniciador: "monitor_navegador", portal: "olx",
    });
    produtor.observar({ fase: "caminho_escolhido", aquisicao: "firecrawl", coletaId: ID });
    produtor.observar({ fase: "fetch_iniciado", aquisicao: "firecrawl", coletaId: ID });
    consumidor.observar({ fase: "single_flight", aquisicao: "desconhecida", coletaId: ID });
    consumidor.observar({ fase: "coleta_compartilhada_concluida", aquisicao: "firecrawl", coletaId: ID });
    expect(produtor.resumo()).toMatchObject({
      aquisicao: "firecrawl", reutilizacao: "nenhuma", chamada_propria_iniciada: true, coleta_id: ID,
    });
    expect(consumidor.resumo()).toMatchObject({
      aquisicao: "firecrawl", reutilizacao: "single_flight", chamada_propria_iniciada: false, coleta_id: ID,
    });
    expect(consumidor.resumo().execucao_id).not.toBe(produtor.resumo().execucao_id);
  });

  it("serializa só campos permitidos e ignora falha do registro", () => {
    const observador = criarObservadorRadar({ execucaoId: ID, iniciador: "pesquisar", portal: "olx" });
    observador.observar({
      fase: "falha", aquisicao: "firecrawl", coletaId: ID, codigo: "token-secreto",
      url: "https://segredo.com/token",
    } as Parameters<typeof observador.observar>[0]);
    observador.concluir("usuario-1", "central-busca-falhou", { duracaoMs: 21 });
    const detalhe = JSON.parse(registrarEvento.mock.calls[0][0].detalhe);
    expect(detalhe).toMatchObject({ iniciador: "pesquisar", novos: "nao_aplicavel" });
    expect(JSON.stringify(detalhe)).not.toMatch(/token-secreto|segredo\.com|html|endereco|telefone/);
    registrarEvento.mockImplementation(() => { throw new Error("falha de telemetria"); });
    expect(() => observador.concluir("usuario-1", "central-busca-ok", { duracaoMs: 22 })).not.toThrow();
  });
});
