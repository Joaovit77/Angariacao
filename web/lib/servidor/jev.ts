/* ================================================================
   JEV (Typesafe AI) — fronteira exclusiva de servidor

   Motor de perguntas fechadas tipadas (`Choice`), sem geração de texto
   livre. A chave (`JEV_API_KEY` ou alias local `API_JEV`) nunca sai do
   servidor, nunca entra em `NEXT_PUBLIC_*` e nunca aparece em logs.

   Política de ambiente (espelhando `docs/IA-AMBIENTES.md`):
   - Production na Vercel: permitido quando a chave existe;
   - Preview / outros ambientes Vercel: sempre bloqueado (fail-closed);
   - CI / Codex: sempre bloqueado;
   - Local: somente com opt-in literal `ALLOW_REAL_JEV=1`.
   ================================================================ */
import { execucaoAutomaticaOpenAIBloqueada } from "@/lib/servidor/openai-real";

export const HOST_JEV = "api.typesafe.ai";
export const ENDPOINT_JEV = `https://${HOST_JEV}/v1/systemone`;
export const MODELO_JEV_PADRAO = "jev-1.14.0";
export const VARIAVEL_AUTORIZACAO_JEV_REAL = "ALLOW_REAL_JEV";
export const TIMEOUT_JEV_PADRAO_MS = 15_000;

type AmbienteJev = Readonly<Record<string, string | undefined>>;

export interface PerguntaChoiceJev {
  type: "choice";
  instructions: string;
  criteria: Record<string, string | null>;
}

export interface PedidoJev {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, PerguntaChoiceJev>;
}

export interface RespostaPerguntaJev {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface UsoJev {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export type StatusExecucaoJev =
  | "COMPLETED"
  | "INVALID_RESPONSE"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "REDE"
  | "NAO_AUTORIZADO";

export interface ResultadoJev {
  status: StatusExecucaoJev;
  answers: Record<string, RespostaPerguntaJev> | null;
  modelRequested: string;
  modelObserved: string | null;
  modelMismatch: boolean | null;
  statusHttp: number | null;
  codigoErro: string | null;
  duracaoMs: number;
  usage: UsoJev | null;
}

export function chaveJevConfigurada(ambiente: AmbienteJev = process.env): string | null {
  const chave = ambiente.JEV_API_KEY?.trim() || ambiente.API_JEV?.trim() || "";
  if (!chave || /\s/.test(chave)) return null;
  return chave;
}

/**
 * Production da Vercel é o único ambiente hospedado autorizável. Preview e
 * CI/Codex falham fechados; localmente exige opt-in literal `ALLOW_REAL_JEV=1`.
 */
export function chamadaJevRealAutorizada(ambiente: AmbienteJev = process.env): boolean {
  if (execucaoAutomaticaOpenAIBloqueada(ambiente)) return false;

  const execucaoVercel = ambiente.VERCEL === "1" || !!ambiente.VERCEL_ENV?.trim();
  const producaoRealVercel = ambiente.VERCEL === "1" && ambiente.VERCEL_ENV === "production";
  if (execucaoVercel) return producaoRealVercel;

  return ambiente[VARIAVEL_AUTORIZACAO_JEV_REAL] === "1";
}

export function jevDisponivel(ambiente: AmbienteJev = process.env): boolean {
  return Boolean(chaveJevConfigurada(ambiente)) && chamadaJevRealAutorizada(ambiente);
}

function objetoSimples(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function unidade(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 && valor <= 1;
}

function inteiroNaoNegativo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : null;
}

function modeloValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[a-z0-9][a-z0-9._-]{1,63}$/i.test(valor);
}

function extrairUso(valor: unknown): UsoJev | null {
  if (!objetoSimples(valor)) return null;
  const inputTokens = inteiroNaoNegativo(valor.input_tokens ?? valor.prompt_tokens);
  const outputTokens = inteiroNaoNegativo(valor.output_tokens ?? valor.completion_tokens);
  const totalTokens = inteiroNaoNegativo(valor.total_tokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  return { inputTokens, outputTokens, totalTokens };
}

/**
 * Parser estrito por allowlist: valida modelo, conjunto exato de perguntas,
 * enum escolhido, confiança em [0,1] e distribuição de probabilidades.
 */
export function parsearRespostaJev(
  corpoBruto: unknown,
  pedido: PedidoJev,
  duracaoMs = 0,
): ResultadoJev {
  const modelRequested = modeloValido(pedido.model) ? pedido.model : MODELO_JEV_PADRAO;
  const invalido = (
    codigoErro: string,
    modelObserved: string | null = null,
    usage: UsoJev | null = null,
  ): ResultadoJev => ({
    status: "INVALID_RESPONSE",
    answers: null,
    modelRequested,
    modelObserved,
    modelMismatch: modelObserved === null ? null : modelObserved !== modelRequested,
    statusHttp: 200,
    codigoErro,
    duracaoMs,
    usage,
  });

  if (!objetoSimples(corpoBruto)) return invalido("INVALID_BODY");
  const modelObserved = modeloValido(corpoBruto.model) ? corpoBruto.model : null;
  if (!modelObserved) return invalido("INVALID_MODEL");
  const usage = extrairUso(corpoBruto.usage);

  const answers = corpoBruto.answers;
  if (!objetoSimples(answers)) return invalido("INVALID_ANSWERS", modelObserved, usage);

  const idsEsperados = Object.keys(pedido.questions);
  const idsRecebidos = Object.keys(answers);
  if (
    idsRecebidos.length !== idsEsperados.length
    || idsRecebidos.some((id) => !Object.hasOwn(pedido.questions, id))
  ) {
    return invalido("INVALID_QUESTIONS", modelObserved, usage);
  }

  const seguras: Record<string, RespostaPerguntaJev> = {};
  for (const id of idsEsperados) {
    const pergunta = pedido.questions[id];
    const resposta = answers[id];
    if (!objetoSimples(resposta) || resposta.type !== "choice") {
      return invalido("INVALID_ANSWER_TYPE", modelObserved, usage);
    }
    const opcoes = Object.keys(pergunta.criteria);
    const escolhida = resposta.choice;
    if (typeof escolhida !== "string" || !opcoes.includes(escolhida)) {
      return invalido("INVALID_ENUM", modelObserved, usage);
    }
    const confianca = resposta.confidence;
    if (!unidade(confianca)) {
      return invalido("INVALID_CONFIDENCE", modelObserved, usage);
    }
    const probs = resposta.probabilities;
    if (!objetoSimples(probs)) {
      return invalido("INVALID_PROBABILITIES", modelObserved, usage);
    }
    const chavesProb = Object.keys(probs);
    if (chavesProb.length !== opcoes.length || chavesProb.some((chave) => !opcoes.includes(chave))) {
      return invalido("INVALID_PROBABILITIES", modelObserved, usage);
    }
    let soma = 0;
    let maior = -1;
    const limpas: Record<string, number> = {};
    for (const opcao of opcoes) {
      const prob = probs[opcao];
      if (!unidade(prob)) return invalido("INVALID_PROBABILITIES", modelObserved, usage);
      limpas[opcao] = prob;
      soma += prob;
      if (prob > maior) maior = prob;
    }
    if (Math.abs(soma - 1) > 1e-4 || limpas[escolhida] + 1e-9 < maior) {
      return invalido("INVALID_PROBABILITIES", modelObserved, usage);
    }
    seguras[id] = {
      type: "choice",
      choice: escolhida,
      confidence: confianca,
      probabilities: limpas,
    };
  }

  return {
    status: "COMPLETED",
    answers: seguras,
    modelRequested,
    modelObserved,
    modelMismatch: modelObserved !== modelRequested,
    statusHttp: 200,
    codigoErro: null,
    duracaoMs,
    usage,
  };
}

export interface OpcoesExecucaoJev {
  timeoutMs?: number;
  fetcher?: typeof fetch;
  ambiente?: AmbienteJev;
}

/**
 * Executa uma consulta tipada contra `POST https://api.typesafe.ai/v1/systemone`.
 * Nunca lança: devolve sempre `ResultadoJev` tipado e sanitizado.
 */
export async function executarJev(
  pedido: PedidoJev,
  opcoes: OpcoesExecucaoJev = {},
): Promise<ResultadoJev> {
  const ambiente = opcoes.ambiente ?? process.env;
  const apiKey = chaveJevConfigurada(ambiente);
  if (!apiKey || !chamadaJevRealAutorizada(ambiente)) {
    return {
      status: "NAO_AUTORIZADO",
      answers: null,
      modelRequested: pedido.model,
      modelObserved: null,
      modelMismatch: null,
      statusHttp: null,
      codigoErro: !apiKey ? "CHAVE_AUSENTE" : "AMBIENTE_BLOQUEADO",
      duracaoMs: 0,
      usage: null,
    };
  }

  const fetcher = opcoes.fetcher ?? fetch;
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_JEV_PADRAO_MS;
  const inicio = performance.now();

  let resposta: Response;
  try {
    resposta = await fetcher(ENDPOINT_JEV, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pedido),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (erro) {
    const duracaoMs = Math.round(performance.now() - inicio);
    const nome = erro instanceof Error ? erro.name : "";
    const ehTimeout = nome === "TimeoutError" || nome === "AbortError";
    return {
      status: ehTimeout ? "TIMEOUT" : "REDE",
      answers: null,
      modelRequested: pedido.model,
      modelObserved: null,
      modelMismatch: null,
      statusHttp: null,
      codigoErro: ehTimeout ? "TIMEOUT" : "ERRO_REDE",
      duracaoMs,
      usage: null,
    };
  }

  if (!resposta.ok) {
    const duracaoMs = Math.round(performance.now() - inicio);
    // Nunca ler nem persistir corpo de erro externo ou headers privados.
    try { await resposta.body?.cancel(); } catch { /* ignora */ }
    return {
      status: "HTTP_ERROR",
      answers: null,
      modelRequested: pedido.model,
      modelObserved: null,
      modelMismatch: null,
      statusHttp: resposta.status,
      codigoErro: `HTTP_${resposta.status}`,
      duracaoMs,
      usage: null,
    };
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return {
      status: "INVALID_RESPONSE",
      answers: null,
      modelRequested: pedido.model,
      modelObserved: null,
      modelMismatch: null,
      statusHttp: resposta.status,
      codigoErro: "INVALID_JSON",
      duracaoMs: Math.round(performance.now() - inicio),
      usage: null,
    };
  }

  return parsearRespostaJev(corpo, pedido, Math.round(performance.now() - inicio));
}
