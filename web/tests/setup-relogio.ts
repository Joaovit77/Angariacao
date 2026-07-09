/* Congela o relógio no mesmo instante usado na geração do oráculo
   (scripts/gera-oraculo.mjs): 2026-07-09 12:00 em São Paulo.
   Todos os testes de caracterização importam este helper para que
   todayISO() e derivados batam com o comportamento capturado do
   app antigo, independente do dia em que a suíte rodar. */
import { beforeAll, afterAll, vi } from "vitest";

export const INSTANTE_ORACULO = "2026-07-09T15:00:00.000Z";

export function congelaRelogio() {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(INSTANTE_ORACULO));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
}
