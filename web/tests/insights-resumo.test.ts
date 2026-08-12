import { describe, expect, it } from "vitest";
import { resumoExecutivoInsights } from "@/lib/calculo/insights";
import type { Imovel } from "@/lib/tipos";

describe("resumo executivo dos insights", () => {
  it("só usa Ref. CRM depois da angariação e mantém fallback antes dela", () => {
    const imoveis = [
      {
        id: "lead",
        codigo: "LD-10",
        referenciaCrm: "CRM-INDEVIDO",
        endereco: "Rua Lead",
        status: "Novo contato",
        dataAngariacao: "2025-01-01",
        statusHistory: [{ status: "Novo contato", date: "2025-01-01" }],
      },
      {
        id: "captado",
        codigo: "LD-20",
        referenciaCrm: "12345",
        endereco: "Rua Captada",
        status: "Angariado",
        dataAngariacao: "2025-01-01",
        statusHistory: [
          { status: "Novo contato", date: "2025-01-01" },
          { status: "Angariado", date: "2025-01-02" },
        ],
      },
    ] as Imovel[];

    const resumo = resumoExecutivoInsights(imoveis, 100);
    expect(resumo.prioridades.map((item) => item.identificador)).toContain("LD-10");
    expect(resumo.prioridades.map((item) => item.identificador)).toContain("CRM 12345");
    expect(resumo.prioridades.map((item) => item.identificador)).not.toContain("CRM CRM-INDEVIDO");
  });
});
