import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const configuracao = readFileSync(
  new URL("../components/assistente/ConfiguracaoAnaliseAprofundada.tsx", import.meta.url),
  "utf8",
);
const conversa = readFileSync(
  new URL("../components/assistente/ConversaAssistente.tsx", import.meta.url),
  "utf8",
);
const relatorio = readFileSync(
  new URL("../components/assistente/RelatorioAnaliseAprofundada.tsx", import.meta.url),
  "utf8",
);
const servidor = readFileSync(
  new URL("../lib/servidor/assistente/analiseAprofundada.ts", import.meta.url),
  "utf8",
);

describe("Análise aprofundada — UX e fronteiras do MVP", () => {
  it("oferece o modo dentro do Assistente e exige seleção explícita de imóvel", () => {
    expect(conversa).toContain("Análise aprofundada");
    expect(configuracao).toContain('value=""');
    expect(configuracao).toContain('disabled={!imovelId || carregando}');
    expect(configuracao).toContain("Selecione um imóvel");
  });

  it("mostra todas as fontes antes da execução", () => {
    for (const fonte of [
      "Dados do imóvel",
      "Mercado e comparáveis",
      "Histórico operacional",
      "Agenda e follow-ups",
      "Protocolos",
      "Atendimento",
    ]) expect(configuracao).toContain(fonte);
  });

  it("mantém Atendimento desligado e dependente de ação explícita", () => {
    expect(configuracao).toContain("useState(false)");
    expect(configuracao).toContain("setAtendimento(evento.target.checked)");
    expect(configuracao).toContain("autorização explícita");
  });

  it("distingue Fato, Inferência e Lacuna no relatório", () => {
    expect(relatorio).toContain('fato: "Fato"');
    expect(relatorio).toContain('inferencia: "Inferência"');
    expect(relatorio).toContain('lacuna: "Lacuna"');
    expect(relatorio).toContain("fontes.get(id)?.rotulo");
  });

  it("não registra ferramentas de ação nem integra pesquisa externa no fluxo", () => {
    expect(servidor).not.toContain("DEFINICOES_FERRAMENTAS_ACOES");
    expect(servidor).not.toContain("RapidAPI");
    expect(servidor).not.toContain("Firecrawl");
    expect(servidor).not.toContain("Tavily");
    expect(servidor).not.toContain("Exa");
    expect(servidor).not.toContain("Investigador");
    expect(servidor).not.toContain(".responses.create");
    expect(servidor).not.toContain('.select("*")');
    expect(servidor).not.toContain(".insert(");
    expect(servidor).not.toContain(".update(");
    expect(servidor).not.toContain(".upsert(");
  });
});
