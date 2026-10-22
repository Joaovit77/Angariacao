/** Limites por execução do servidor; cache e single-flight não gastam chamadas pagas. */
export interface LimitesRodadaRadar { maxPaginas: number; maxChamadasPagas: number }
export type MotivoLimiteRadar = "limite_paginas" | "limite_chamadas_pagas" | "limite_tempo";
export class LimiteOperacionalRadar extends Error {
  constructor(readonly motivo: MotivoLimiteRadar) { super("Coleta parcial por limite operacional do Radar."); }
}
function limite(valor: string | undefined): number {
  if (valor === undefined || valor === "") return 10;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("Limite do Radar deve ser inteiro entre 1 e 100.");
  return n;
}
export function limitesRodadaRadar(): LimitesRodadaRadar {
  return { maxPaginas: limite(process.env.RADAR_MAX_PAGINAS_RODADA),
    maxChamadasPagas: limite(process.env.RADAR_MAX_CHAMADAS_PAGAS_RODADA) };
}
export function criarOrcamentoRadar(limites = limitesRodadaRadar()) {
  if (![limites.maxPaginas,limites.maxChamadasPagas].every((n) => Number.isInteger(n) && n >= 1 && n <= 100)) {
    throw new Error("Limites do Radar devem ser inteiros entre 1 e 100.");
  }
  const paginas = new Set<string>();
  let chamadasPagas = 0;
  return {
    limites,
    reservarPagina(chave: string) {
      if (paginas.has(chave)) return;
      if (paginas.size >= limites.maxPaginas) throw new LimiteOperacionalRadar("limite_paginas");
      paginas.add(chave);
    },
    reservarChamadaPaga() {
      if (chamadasPagas >= limites.maxChamadasPagas) throw new LimiteOperacionalRadar("limite_chamadas_pagas");
      chamadasPagas++;
    },
    resumo: () => ({ paginasConsultadas: paginas.size, chamadasPagas,
      limitePaginas: limites.maxPaginas, limiteChamadasPagas: limites.maxChamadasPagas }),
  };
}
export type OrcamentoRodadaRadar = ReturnType<typeof criarOrcamentoRadar>;

/** Consulta o mesmo deadline do chamador; não cria nem renova uma janela por fase/página. */
export interface TempoRodadaRadar { restanteMs: () => number; reservaFinalizacaoMs: number }
export function exigirTempoFaseRadar(tempo: TempoRodadaRadar, duracaoFaseMs: number): void {
  const restante = tempo.restanteMs();
  if (!Number.isFinite(restante) || !Number.isFinite(duracaoFaseMs) || duracaoFaseMs < 0
    || !Number.isFinite(tempo.reservaFinalizacaoMs) || tempo.reservaFinalizacaoMs <= 0
    || restante < duracaoFaseMs + tempo.reservaFinalizacaoMs) {
    throw new LimiteOperacionalRadar("limite_tempo");
  }
}
