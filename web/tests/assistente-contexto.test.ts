import { describe, expect, it } from "vitest";
import { montarContextoAssistente } from "@/lib/assistente/contexto";

describe("contexto do assistente", () => {
  it("envia somente o id do drawer, sem dados do Zustand", () => {
    expect(montarContextoAssistente("/pipeline", "imovel-1", null)).toEqual({
      rota: "/pipeline", pagina: "Pipeline", superficie: "drawer", entidade: { tipo: "imovel", id: "imovel-1" },
    });
  });

  it("prioriza o modal sobre o drawer e distingue agenda", () => {
    expect(montarContextoAssistente("/agenda", "imovel-1", { tipo: "agenda", id: "agenda-2" })).toMatchObject({
      superficie: "modal", entidade: { tipo: "agenda", id: "agenda-2" },
    });
  });

  it("trata verificacao aberta como compromisso, nao como id de imovel", () => {
    expect(montarContextoAssistente("/agenda", null, { tipo: "verificacao", id: "agenda-3" })).toMatchObject({
      superficie: "modal", entidade: { tipo: "agenda", id: "agenda-3" },
    });
  });

  it("troca a entidade quando outro imovel e aberto no drawer", () => {
    const primeiro = montarContextoAssistente("/pipeline", "uuid-interno-1", null);
    const segundo = montarContextoAssistente("/pipeline", "uuid-interno-2", null);
    expect(primeiro.entidade).toEqual({ tipo: "imovel", id: "uuid-interno-1" });
    expect(segundo.entidade).toEqual({ tipo: "imovel", id: "uuid-interno-2" });
  });

  it("remove a entidade ativa quando o drawer fecha", () => {
    expect(montarContextoAssistente("/pipeline", null, null)).toEqual({
      rota: "/pipeline", pagina: "Pipeline", superficie: "pagina",
    });
  });

  it("ignora o id antigo do drawer ao sair do Pipeline", () => {
    expect(montarContextoAssistente("/agenda", "uuid-interno-1", null)).toEqual({
      rota: "/agenda", pagina: "Agenda", superficie: "pagina",
    });
  });

  it("identifica a pagina dedicada sem ampliar o contexto enviado", () => {
    expect(montarContextoAssistente("/assistente", null, null)).toEqual({
      rota: "/assistente", pagina: "Assistente", superficie: "pagina",
    });
  });

  it("reconhece outro imovel ao voltar ao Pipeline", () => {
    const fora = montarContextoAssistente("/agenda", "uuid-interno-1", null);
    const volta = montarContextoAssistente("/pipeline", "uuid-interno-2", null);
    expect(fora.entidade).toBeUndefined();
    expect(volta.entidade).toEqual({ tipo: "imovel", id: "uuid-interno-2" });
  });
});
