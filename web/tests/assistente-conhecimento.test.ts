import { describe, expect, it } from "vitest";
import { CONHECIMENTO_PRODUTO, instrucoesDoAssistente } from "@/lib/servidor/assistente/conhecimento";

describe("conhecimento do assistente", () => {
  it("explicita leitura, consulta e sem tabela separada de leads", () => {
    const texto = instrucoesDoAssistente({ rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" });
    expect(texto).toContain("angario-governanca-v1");
    expect(texto).toContain("HIERARQUIA DE EVIDÊNCIA");
    expect(texto).toContain("somente em leitura");
    expect(texto).toContain("Consulte as ferramentas");
    expect(texto).toContain("não existe tabela separada de leads");
  });

  it("documenta somente as quatro metas reais", () => {
    expect(CONHECIMENTO_PRODUTO.metas).toContain("angariações");
    expect(CONHECIMENTO_PRODUTO.metas).toContain("imóveis locados");
    expect(CONHECIMENTO_PRODUTO.metas).toContain("comissão recebida");
    expect(CONHECIMENTO_PRODUTO.metas).toContain("faturamento em contratos");
    expect(CONHECIMENTO_PRODUTO.metas).not.toMatch(/meta.*visita|meta.*negocia|meta.*autoriza/i);
  });

  it("distingue ja constava de reentrega duplicada", () => {
    expect(CONHECIMENTO_PRODUTO.jaConstava).toContain("mesma data e o mesmo valor");
    expect(CONHECIMENTO_PRODUTO.jaConstava).toContain("diferente de evento duplicado");
  });

  it("orienta mensagens programadas e referencias aos cards", () => {
    const texto = instrucoesDoAssistente({ rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" });
    expect(texto).toContain("consultar_mensagens_agendadas");
    for (const referencia of ["desses", "dele", "qual deles"]) expect(texto).toContain(referencia);
    expect(texto).toContain("consulta global superlativa");
    expect(texto).toContain("Nunca os cite, reproduza ou mostre ao usuário");
  });

  it("distingue estado atual de marco e orienta follow-up temporal", () => {
    const texto = instrucoesDoAssistente({ rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" });
    expect(texto).toContain("Separe estado de evento");
    expect(texto).toContain("buscar_marcos_imoveis");
    expect(texto).toContain('"e o último publicado?"');
    expect(texto).toContain("único card");
    expect(texto).toContain("nunca updated_at");
  });
});
