/* ================================================================
   ORÇAMENTO DE TEMPO (A1): infraestrutura pura, ainda desligada.

   O módulo precisa ser previsível com relógio falso: quanto resta, se
   uma etapa cabe e que sinal entrega. A razão do abort distingue quem
   interrompeu (teto individual ou orçamento global), porque é isso que
   o log do A2 vai classificar.
   ================================================================ */
import { describe, expect, it } from "vitest";
import {
  criarOrcamentoTempo,
  NOME_ERRO_ORCAMENTO_ESGOTADO,
  OrcamentoEsgotadoError,
} from "@/lib/calculo/orcamentoTempo";

/** Relógio e agendador de mentira: o tempo só anda quando o teste manda. */
function relogioFalso(inicio = 1_000) {
  let agora = inicio;
  const agendados: Array<{ id: number; em: number; funcao: () => void }> = [];
  let proximoId = 1;
  return {
    agora: () => agora,
    agendar: (funcao: () => void, ms: number) => {
      const id = proximoId++;
      agendados.push({ id, em: agora + ms, funcao });
      return id;
    },
    cancelar: (id: unknown) => {
      const indice = agendados.findIndex((item) => item.id === id);
      if (indice >= 0) agendados.splice(indice, 1);
    },
    avancar(ms: number) {
      agora += ms;
      for (const item of [...agendados].sort((a, b) => a.em - b.em)) {
        if (item.em <= agora) {
          agendados.splice(agendados.indexOf(item), 1);
          item.funcao();
        }
      }
    },
    pendentes: () => agendados.length,
  };
}

describe("OrcamentoTempo", () => {
  it("mede o restante a partir do limite e nunca fica negativo", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 52_000, ...relogio });
    expect(orcamento.limiteMs).toBe(52_000);
    expect(orcamento.decorridoMs()).toBe(0);
    expect(orcamento.restanteMs()).toBe(52_000);

    relogio.avancar(22_000);
    expect(orcamento.decorridoMs()).toBe(22_000);
    expect(orcamento.restanteMs()).toBe(30_000);

    relogio.avancar(40_000);
    expect(orcamento.restanteMs()).toBe(0);
    expect(orcamento.decorridoMs()).toBe(62_000);
  });

  it("cabe() diz se uma etapa com mínimo conhecido ainda pode começar", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 52_000, ...relogio });
    expect(orcamento.cabe(6_000)).toBe(true);
    relogio.avancar(44_000);
    expect(orcamento.restanteMs()).toBe(8_000);
    expect(orcamento.cabe(6_000)).toBe(true);
    expect(orcamento.cabe(8_000)).toBe(true);
    expect(orcamento.cabe(8_001)).toBe(false);
    expect(orcamento.cabe(-1)).toBe(false);
    expect(orcamento.cabe(Number.NaN)).toBe(false);
  });

  it("sinal(maxMs) respeita o teto individual quando ele é menor que o restante", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 52_000, ...relogio });
    const sinal = orcamento.sinal(22_000);
    expect(sinal.aborted).toBe(false);
    relogio.avancar(21_999);
    expect(sinal.aborted).toBe(false);
    relogio.avancar(1);
    expect(sinal.aborted).toBe(true);
    expect((sinal.reason as Error).name).toBe("TimeoutError");
  });

  it("sinal(maxMs) encolhe para o restante e a razão passa a ser o orçamento", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 52_000, ...relogio });
    relogio.avancar(44_000);
    const sinal = orcamento.sinal(22_000);
    relogio.avancar(7_999);
    expect(sinal.aborted).toBe(false);
    relogio.avancar(1);
    expect(sinal.aborted).toBe(true);
    expect(sinal.reason).toBeInstanceOf(OrcamentoEsgotadoError);
    expect((sinal.reason as Error).name).toBe(NOME_ERRO_ORCAMENTO_ESGOTADO);
  });

  it("sinal() sem teto dura exatamente o restante", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 10_000, ...relogio });
    const sinal = orcamento.sinal();
    relogio.avancar(9_999);
    expect(sinal.aborted).toBe(false);
    relogio.avancar(1);
    expect(sinal.aborted).toBe(true);
    expect(sinal.reason).toBeInstanceOf(OrcamentoEsgotadoError);
  });

  it("com restante <= 0 o sinal já nasce abortado, sem agendar nada", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 5_000, ...relogio });
    relogio.avancar(5_000);
    expect(orcamento.restanteMs()).toBe(0);
    const sinal = orcamento.sinal(22_000);
    expect(sinal.aborted).toBe(true);
    expect(sinal.reason).toBeInstanceOf(OrcamentoEsgotadoError);
    expect(relogio.pendentes()).toBe(0);
  });

  it("abortar() derruba os sinais vivos, zera o restante e limpa os timers", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 52_000, ...relogio });
    const a = orcamento.sinal(22_000);
    const b = orcamento.sinal(3_500);
    expect(relogio.pendentes()).toBe(2);

    orcamento.abortar();
    expect(orcamento.abortado).toBe(true);
    expect(a.aborted).toBe(true);
    expect(b.aborted).toBe(true);
    expect(a.reason).toBeInstanceOf(OrcamentoEsgotadoError);
    expect(orcamento.restanteMs()).toBe(0);
    expect(orcamento.cabe(0)).toBe(false);
    expect(orcamento.cabe(1)).toBe(false);
    expect(relogio.pendentes()).toBe(0);
    expect(orcamento.sinal(1_000).aborted).toBe(true);
  });

  it("um sinal que disparou libera o próprio timer e não afeta os demais", () => {
    const relogio = relogioFalso();
    const orcamento = criarOrcamentoTempo({ limiteMs: 52_000, ...relogio });
    const curto = orcamento.sinal(1_000);
    const longo = orcamento.sinal(22_000);
    relogio.avancar(1_000);
    expect(curto.aborted).toBe(true);
    expect(longo.aborted).toBe(false);
    expect(relogio.pendentes()).toBe(1);
    expect(orcamento.abortado).toBe(false);
  });

  it("limite inválido vira orçamento zerado, nunca infinito", () => {
    const relogio = relogioFalso();
    for (const limiteMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const orcamento = criarOrcamentoTempo({ limiteMs, ...relogio });
      expect(orcamento.limiteMs).toBe(0);
      expect(orcamento.restanteMs()).toBe(0);
      expect(orcamento.sinal(22_000).aborted).toBe(true);
    }
  });

  it("funciona com o relógio e o agendador reais (contrato mínimo)", async () => {
    const orcamento = criarOrcamentoTempo({ limiteMs: 50 });
    const sinal = orcamento.sinal(10);
    expect(sinal.aborted).toBe(false);
    await new Promise((resolver) => setTimeout(resolver, 30));
    expect(sinal.aborted).toBe(true);
    expect((sinal.reason as Error).name).toBe("TimeoutError");
    expect(orcamento.restanteMs()).toBeLessThan(50);
  });
});
