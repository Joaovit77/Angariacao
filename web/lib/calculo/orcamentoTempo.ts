/* ================================================================
   ORÇAMENTO DE TEMPO — infraestrutura pura

   Uma rota com `maxDuration` precisa saber quanto tempo ainda tem antes
   de iniciar cada chamada externa; sem isso, três chamadas de 22 s em
   sequência passam dos 60 s e a plataforma mata a função no meio do
   corpo da resposta. Este módulo só mede e fabrica sinais: nasce com um
   limite, diz quanto resta, se uma etapa cabe e entrega um AbortSignal
   que nunca dura mais do que o restante. Não conhece rota, provider nem
   fetch, e não importa React/Next.

   Neste checkpoint (A1) ninguém o usa em produção; a rota e o provider
   passam a recebê-lo no A2. Relógio e agendador são injetáveis para o
   teste ser determinístico.
   ================================================================ */

export const NOME_ERRO_ORCAMENTO_ESGOTADO = "OrcamentoEsgotadoError";

/** Razão do abort quando é o orçamento global (e não o timeout individual
    da chamada) que interrompe. O nome permite distinguir no log
    `abort-orcamento` de `timeout-provider`. */
export class OrcamentoEsgotadoError extends Error {
  constructor(message = "O orçamento de tempo da investigação se esgotou.") {
    super(message);
    this.name = NOME_ERRO_ORCAMENTO_ESGOTADO;
  }
}

export interface OpcoesOrcamentoTempo {
  /** Tempo total disponível a partir da criação, em ms. */
  limiteMs: number;
  /** Relógio em ms (padrão: `performance.now`). Injetável para teste. */
  agora?: () => number;
  /** Agendador (padrão: `setTimeout`). Injetável para teste. */
  agendar?: (funcao: () => void, ms: number) => unknown;
  cancelar?: (identificador: unknown) => void;
}

export interface OrcamentoTempo {
  readonly limiteMs: number;
  /** Quanto já passou desde a criação. */
  decorridoMs(): number;
  /** Quanto ainda resta; nunca negativo. Zero após `abortar`. */
  restanteMs(): number;
  /** Se ainda há ao menos `minimoMs` disponíveis para iniciar uma etapa. */
  cabe(minimoMs: number): boolean;
  /**
   * AbortSignal limitado a `min(maxMs, restante)`. Quando quem interrompe
   * é o restante do orçamento, a razão é `OrcamentoEsgotadoError`; quando
   * é o teto individual `maxMs`, a razão é um `TimeoutError`, igual ao de
   * `AbortSignal.timeout`. Sem restante, volta já abortado.
   */
  sinal(maxMs?: number): AbortSignal;
  /** Aborta todos os sinais vivos e zera o restante. */
  abortar(): void;
  readonly abortado: boolean;
}

function erroTimeout(): Error {
  return new DOMException("A chamada excedeu o tempo limite.", "TimeoutError");
}

export function criarOrcamentoTempo(opcoes: OpcoesOrcamentoTempo): OrcamentoTempo {
  const limiteMs = Number.isFinite(opcoes.limiteMs) && opcoes.limiteMs > 0 ? opcoes.limiteMs : 0;
  const agora = opcoes.agora ?? (() => performance.now());
  const agendar = opcoes.agendar ?? ((funcao, ms) => setTimeout(funcao, ms));
  const cancelar = opcoes.cancelar ?? ((identificador) => clearTimeout(identificador as ReturnType<typeof setTimeout>));
  const inicio = agora();
  const global = new AbortController();

  const decorridoMs = () => Math.max(0, agora() - inicio);
  const restanteMs = () => (global.signal.aborted ? 0 : Math.max(0, limiteMs - decorridoMs()));

  return {
    limiteMs,
    decorridoMs,
    restanteMs,
    get abortado() {
      return global.signal.aborted;
    },
    cabe(minimoMs: number): boolean {
      if (!Number.isFinite(minimoMs) || minimoMs < 0 || global.signal.aborted) return false;
      return restanteMs() >= minimoMs;
    },
    sinal(maxMs?: number): AbortSignal {
      const restante = restanteMs();
      if (restante <= 0) return AbortSignal.abort(new OrcamentoEsgotadoError());

      const teto = Number.isFinite(maxMs) && (maxMs as number) > 0 ? (maxMs as number) : restante;
      const limitadoPeloOrcamento = restante <= teto;
      const duracao = Math.min(teto, restante);
      const controlador = new AbortController();

      const identificador = agendar(() => {
        if (!controlador.signal.aborted) {
          controlador.abort(limitadoPeloOrcamento ? new OrcamentoEsgotadoError() : erroTimeout());
        }
      }, duracao);
      const aoAbortarGlobal = () => {
        cancelar(identificador);
        if (!controlador.signal.aborted) controlador.abort(new OrcamentoEsgotadoError());
      };
      global.signal.addEventListener("abort", aoAbortarGlobal, { once: true });
      controlador.signal.addEventListener("abort", () => {
        cancelar(identificador);
        global.signal.removeEventListener("abort", aoAbortarGlobal);
      }, { once: true });

      return controlador.signal;
    },
    abortar(): void {
      if (!global.signal.aborted) global.abort(new OrcamentoEsgotadoError());
    },
  };
}
