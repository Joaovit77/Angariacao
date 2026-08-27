import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tempoRelativoIso, timestampDeIso } from "@/lib/datas";

function fonte(caminho: string) {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("central de notificações recentes", () => {
  it("conta somente eventos reais com estado persistido de leitura", () => {
    const sino = fonte("components/painel/SinoNotificacoes.tsx");
    expect(sino).toContain("notificacoesPendentes(imoveis)");
    expect(sino).toContain("caixaDeRespostas(imoveis, hoje)");
    expect(sino).toContain("radarNovos");
    expect(sino).toContain("eventos.length + respostas.length + radarNovos");
    expect(sino).not.toContain("isStale");
    expect(sino).not.toContain("s.agenda");
    expect(sino).not.toContain('irPara("/insights")');
  });

  it("agrupa respostas e Radar em vez de criar uma linha por ocorrência", () => {
    const sino = fonte("components/painel/SinoNotificacoes.tsx");
    expect(sino).toContain("proprietários responderam");
    expect(sino).toContain("oportunidades encontradas");
    expect(sino).toContain("notificacao-indicador");
  });

  it("formata a idade dos eventos de forma curta e determinística", () => {
    const base = timestampDeIso("2026-08-27T12:00:00Z") as number;
    expect(tempoRelativoIso("2026-08-27T11:56:00Z", base)).toBe("há 4 min");
    expect(tempoRelativoIso("2026-08-26T12:00:00Z", base)).toBe("ontem");
    expect(tempoRelativoIso("2026-08-19T12:00:00Z", base)).toBe("há 8 dias");
  });
});
