/* ================================================================
   OBSERVABILIDADE DO BOOT

   Mede somente durações, quantidades e tamanhos aproximados. Nunca
   recebe nem registra token, id de usuário, payload ou conteúdo de
   mensagem. O mesmo formato funciona no console do browser e nos
   Runtime Logs das rotas do Next.
   ================================================================ */

type ValorMetrica = string | number | boolean | null;
type DetalhesMetrica = Record<string, ValorMetrica>;

interface ExecucaoBoot {
  inicio: number;
  usuarioId: string | null;
  ocorrencias: Map<string, number>;
  primeiroRenderRegistrado: boolean;
}

let execucao: ExecucaoBoot | null = null;

export function agoraBoot(): number {
  return performance.now();
}

function duracao(inicio: number): number {
  return Math.round((agoraBoot() - inicio) * 10) / 10;
}

function escrever(etapa: string, duracaoMs: number, detalhes: DetalhesMetrica = {}): void {
  console.info("[boot]", {
    etapa,
    duracaoMs,
    ...detalhes,
  });
}

/** Começa uma medição de navegação. O Strict Mode pode remontar o
    provider em desenvolvimento; nesse caso a mesma execução é mantida
    para que as ocorrências duplicadas fiquem visíveis. */
export function iniciarBoot(): number {
  if (!execucao || execucao.primeiroRenderRegistrado) {
    execucao = {
      inicio: agoraBoot(),
      usuarioId: null,
      ocorrencias: new Map(),
      primeiroRenderRegistrado: false,
    };
  }
  return execucao.inicio;
}

/** Força uma nova medição ao entrar depois de permanecer na tela de login.
    Sem isso, o tempo digitando e-mail/senha contaminaria o tempo do boot. */
export function reiniciarBoot(): number {
  execucao = null;
  return iniciarBoot();
}

/** Associa internamente a execução ao usuário para detectar troca de
    conta na mesma aba. O id nunca sai deste módulo nem é registrado. */
export function associarUsuarioAoBoot(usuarioId: string): void {
  if (!execucao) iniciarBoot();
  if (execucao?.usuarioId && execucao.usuarioId !== usuarioId) {
    execucao = {
      inicio: agoraBoot(),
      usuarioId,
      ocorrencias: new Map(),
      primeiroRenderRegistrado: false,
    };
    return;
  }
  if (execucao) execucao.usuarioId = usuarioId;
}

export function registrarEtapaBoot(
  etapa: string,
  inicio: number,
  detalhes: DetalhesMetrica = {},
): void {
  if (!execucao) iniciarBoot();
  const ocorrencia = (execucao?.ocorrencias.get(etapa) ?? 0) + 1;
  execucao?.ocorrencias.set(etapa, ocorrencia);
  escrever(etapa, duracao(inicio), { ocorrencia, ...detalhes });
}

export function registrarPrimeiroRenderBoot(): void {
  if (!execucao || execucao.primeiroRenderRegistrado) return;
  execucao.primeiroRenderRegistrado = true;
  escrever("tempo_total_primeiro_render", duracao(execucao.inicio));
}

/** Log de rota: usa o mesmo vocabulário, mas não participa do estado
    global do browser. */
export function registrarEtapaBootServidor(
  etapa: string,
  inicio: number,
  detalhes: DetalhesMetrica = {},
): void {
  escrever(etapa, duracao(inicio), { origem: "servidor", ...detalhes });
}

export function tamanhoAproximadoEmBytes(valor: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(valor ?? null)).byteLength;
  } catch {
    return 0;
  }
}
