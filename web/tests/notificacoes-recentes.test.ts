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
    expect(sino).toContain("notificacoesDaCentral(imoveis)");
    expect(sino).toContain("notificacoes.filter((item) => !item.lida)");
    expect(sino).toContain("naoLidas.length > 9");
    expect(sino).not.toContain("isStale");
    expect(sino).not.toContain("s.agenda");
    expect(sino).not.toContain("radarNovos");
  });

  it("preserva leitura em lote, estado vazio e navegação contextual", () => {
    const sino = fonte("components/painel/SinoNotificacoes.tsx");
    expect(sino).toContain("marcarTudoComoLido");
    expect(sino).toContain("marcarTodasRespostasLidas(imoveisComMensagem)");
    expect(sino).toContain("Nenhuma notificação não lida.");
    expect(sino).toContain("/respostas?imovel=");
    expect(sino).toContain('abrirModal("imovel", notificacao.imovelId)');
  });

  it("formata a idade dos eventos de forma curta e determinística", () => {
    const base = timestampDeIso("2026-08-27T12:00:00Z") as number;
    expect(tempoRelativoIso("2026-08-27T11:56:00Z", base)).toBe("há 4 min");
    expect(tempoRelativoIso("2026-08-26T12:00:00Z", base)).toBe("ontem");
    expect(tempoRelativoIso("2026-08-19T12:00:00Z", base)).toBe("há 8 dias");
  });
});
