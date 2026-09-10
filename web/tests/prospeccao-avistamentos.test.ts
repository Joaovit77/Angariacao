import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GRAUS_CERTEZA_PROSPECCAO,
  resumirAvistamentos,
  type AvistamentoProspeccao,
} from "@/lib/calculo/prospeccao";

const avistamento = (
  id: string,
  observadoEm: string,
  parcial: Partial<AvistamentoProspeccao> = {},
): AvistamentoProspeccao => ({
  id,
  imovelIdentificadoId: "imovel-1",
  observadoEm,
  createdAt: observadoEm,
  observacao: `Observação ${id}`,
  observacaoRevisao: 1,
  classificacaoEstado: "pendente",
  latitude: null,
  longitude: null,
  acuraciaMetros: null,
  precisaoLocalizacao: "desconhecida",
  ...parcial,
});

describe("memória longitudinal de avistamentos", () => {
  it("preserva todos os eventos e escolhe o corrente pela data observada", () => {
    const antigo = avistamento("av-1", "2026-09-09T14:32:00Z");
    const novo = avistamento("av-2", "2026-11-20T10:15:00Z");
    const resumo = resumirAvistamentos([antigo, novo]);
    expect(resumo).toMatchObject({
      avistamentosTotal: 2,
      primeiroAvistamentoEm: antigo.observadoEm,
      ultimoAvistamentoEm: novo.observadoEm,
      avistamentoCorrenteId: "av-2",
    });
    expect([antigo.observacao, novo.observacao]).toEqual(["Observação av-1", "Observação av-2"]);
  });

  it("inserir hoje um avistamento retroativo não o torna corrente", () => {
    const corrente = avistamento("av-corrente", "2026-11-20T10:15:00Z");
    const retroativo = avistamento("av-retroativo", "2026-10-01T09:00:00Z", {
      createdAt: "2027-01-15T09:04:00Z",
    });
    expect(resumirAvistamentos([corrente, retroativo]).avistamentoCorrenteId)
      .toBe("av-corrente");
  });

  it("desempata o corrente por criação e id", () => {
    const data = "2026-11-20T10:15:00Z";
    const resumo = resumirAvistamentos([
      avistamento("a", data, { createdAt: "2026-11-20T10:16:00Z" }),
      avistamento("b", data, { createdAt: "2026-11-20T10:17:00Z" }),
    ]);
    expect(resumo.avistamentoCorrenteId).toBe("b");
  });

  it("mantém a coordenada mais precisa mesmo quando o corrente é pior", () => {
    const resumo = resumirAvistamentos([
      avistamento("preciso", "2026-09-09T14:32:00Z", {
        latitude: -23.31,
        longitude: -51.17,
        acuraciaMetros: 7,
        precisaoLocalizacao: "gps",
      }),
      avistamento("corrente", "2026-11-20T10:15:00Z", {
        latitude: -23.32,
        longitude: -51.18,
        acuraciaMetros: 80,
        precisaoLocalizacao: "gps",
      }),
    ]);
    expect(resumo.avistamentoCorrenteId).toBe("corrente");
    expect(resumo.melhorLocalizacao).toMatchObject({ avistamentoId: "preciso", acuraciaMetros: 7 });
  });

  it("declara ausência em vez de inventar valores para uma identidade vazia", () => {
    expect(resumirAvistamentos([])).toEqual({
      avistamentosTotal: 0,
      primeiroAvistamentoEm: null,
      ultimoAvistamentoEm: null,
      avistamentoCorrenteId: null,
      melhorLocalizacao: null,
    });
    expect(GRAUS_CERTEZA_PROSPECCAO).toContain("desconhecido");
  });

  it("mantém todo o núcleo fora de React, Next, Supabase, store e IA", () => {
    const arquivos = [
      "../lib/calculo/prospeccao.ts",
      "../lib/calculo/catalogoEtiquetas.ts",
      "../lib/calculo/etiquetasProspeccao.ts",
      "../lib/calculo/dedupeProspeccao.ts",
      "../lib/calculo/fotoFachada.ts",
    ];
    for (const arquivo of arquivos) {
      const fonte = readFileSync(new URL(arquivo, import.meta.url), "utf8");
      expect(fonte).not.toMatch(/from ["'][^"']*(?:react|next|supabase|store|servidor\/ia)/i);
      expect(fonte).not.toContain("/api/ia");
    }
  });
});
