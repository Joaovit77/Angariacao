import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { FalhaIa } from "@/lib/calculo/ia";
import {
  registrarEvento,
  registrarUsoDaResposta,
  type MetadadosUsoIa,
  type RotaIaRegistro,
} from "@/lib/servidor/registro";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { MAX_TOKENS_IA, MODELO_TEXTO_IA } from "./config";
import type {
  EsforcoIaPermitido,
  ModeloIaPermitido,
  VersaoConfiguracaoIa,
} from "@/lib/ia/configuracao";
import { aplicarSystemPromptAngario } from "@/lib/ia/system-prompt";
import { exigirAutorizacaoOpenAIReal } from "@/lib/servidor/openai-real";

export interface FormatoEstruturadoOpenAI {
  nome: string;
  esquema: Record<string, unknown>;
}

export interface PedidoExecutorOpenAI {
  tipo: string;
  mensagens: OpenAI.Chat.ChatCompletionMessageParam[];
  reasoningEffort: NonNullable<
    OpenAI.Chat.ChatCompletionCreateParamsNonStreaming["reasoning_effort"]
  >;
  maxCompletionTokens?: number;
  formato?: FormatoEstruturadoOpenAI;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /** `false` só para fluxos que leem a conclusão com as próprias regras
      (F1 e as operações de /api/ia, migrados no IA-M1b): o executor não
      interpreta o texto (nem emite o log de recusa/truncamento dele) e
      o chamador recebe só a conclusão. Ausente: comportamento de sempre. */
  interpretarTexto?: false;
  /** Agrupa as chamadas de uma mesma execução (IA-M1c-A). Nunca vai no
      corpo enviado ao provedor; ausente, cada chamada ganha um id próprio. */
  execucaoId?: string;
}

/** Qual rota de `ia_configuracoes` o executor está servindo e de onde veio
    a versão usada. Só alimenta a telemetria de `ia_uso`. */
export interface ContextoConfiguracaoExecutor {
  nome: RotaIaRegistro;
  versao: number | null;
  origem: VersaoConfiguracaoIa["origem"];
}

export function contextoDaConfiguracao(
  configuracao: VersaoConfiguracaoIa,
  nome: RotaIaRegistro,
): ContextoConfiguracaoExecutor {
  return { nome, versao: configuracao.versao, origem: configuracao.origem };
}

export interface ResultadoExecutorOpenAI {
  conclusao: OpenAI.Chat.ChatCompletion;
  texto: string;
}

export interface ExecutorOpenAI {
  executar(
    pedido: PedidoExecutorOpenAI & { interpretarTexto: false },
  ): Promise<Pick<ResultadoExecutorOpenAI, "conclusao">>;
  executar(pedido: PedidoExecutorOpenAI): Promise<ResultadoExecutorOpenAI>;
}

/** Traduz a falha do SDK para o vocabulário que a UI já conhece. */
export function classificarErroIa(e: unknown): FalhaIa {
  if (e instanceof OpenAI.RateLimitError) return "limite-excedido";
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError)
    return "nao-configurado";
  return "falha-ia";
}

/** Preserva o tratamento existente para recusa e resposta truncada. */
export function textoDaResposta(conclusao: OpenAI.Chat.ChatCompletion): string {
  const escolha = conclusao.choices[0];
  if (!escolha) return "";
  if (escolha.message.refusal) {
    console.error("IA: o modelo recusou responder.");
    return "";
  }
  if (escolha.finish_reason === "length") {
    console.error("IA: resposta truncada em MAX_TOKENS.");
    return "";
  }
  return (escolha.message.content || "").trim();
}

const textoCurto = (valor: unknown, maximo: number, padrao?: RegExp): string | null =>
  typeof valor === "string" && valor.length > 0 && valor.length <= maximo && (!padrao || padrao.test(valor))
    ? valor
    : null;

/**
 * Metadados seguros de uma conclusão. Tudo é lido com encadeamento
 * opcional: uma resposta fora da tipagem (por exemplo, sem `choices`) não
 * pode lançar aqui, porque o contrato legado dessa resposta pertence a
 * quem chamou o executor. Valores do provedor fora do formato viram null.
 */
function metadadosDaConclusao(
  conclusao: OpenAI.Chat.ChatCompletion,
  base: Pick<MetadadosUsoIa, "execucaoId" | "rota" | "esforco" | "configOrigem" | "configVersao" | "duracaoMs">,
): MetadadosUsoIa {
  const bruta = conclusao as unknown as {
    model?: unknown;
    _request_id?: unknown;
    choices?: Array<{ finish_reason?: unknown; message?: { refusal?: unknown } }>;
    usage?: { completion_tokens_details?: { reasoning_tokens?: unknown } | null } | null;
  };
  const escolha = Array.isArray(bruta.choices) ? bruta.choices[0] : undefined;
  const raciocinio = bruta.usage?.completion_tokens_details?.reasoning_tokens;
  return {
    ...base,
    modeloServido: textoCurto(bruta.model, 120),
    requisicaoProvedorId: textoCurto(bruta._request_id, 200, /^[\w.:-]+$/),
    motivoFim: textoCurto(escolha?.finish_reason, 32, /^[a-z_]+$/),
    recusa: escolha ? !!escolha.message?.refusal : null,
    tokensRaciocinio: typeof raciocinio === "number" && Number.isInteger(raciocinio) && raciocinio >= 0
      ? raciocinio
      : null,
  };
}

/** Categoria de uma falha na chamada ao provedor (IA-M1c-B). Só telemetria:
    o vocabulário da tela continua sendo o de `classificarErroIa`. */
export type CategoriaFalhaProvedor =
  | "cancelada"
  | "timeout"
  | "conexao"
  | "limite-de-taxa"
  | "autenticacao"
  | "requisicao-recusada"
  | "erro-do-provedor"
  | "desconhecida";

/**
 * Ordem obrigatória: `APIConnectionTimeoutError` herda de
 * `APIConnectionError`, então o timeout precisa ser testado antes da
 * conexão. O status vem do saneamento de `sanitizarErroExterno`.
 */
export function categorizarFalhaProvedor(erro: unknown): CategoriaFalhaProvedor {
  if (erro instanceof OpenAI.APIUserAbortError) return "cancelada";
  if (erro instanceof OpenAI.APIConnectionTimeoutError) return "timeout";
  if (erro instanceof OpenAI.APIConnectionError) return "conexao";
  const status = sanitizarErroExterno(erro, "iaTexto").status;
  if (status === 429) return "limite-de-taxa";
  if (status === 401 || status === 403) return "autenticacao";
  if (status === 400 || status === 404 || status === 422) return "requisicao-recusada";
  if (status !== null && status >= 500) return "erro-do-provedor";
  return "desconhecida";
}

/** `requestID` do erro do SDK, com o mesmo contrato do `_request_id` do
    sucesso. Lido dentro de try: um getter malformado vira null. */
function requisicaoDoErro(erro: unknown): string | null {
  try {
    return erro && typeof erro === "object" && "requestID" in erro
      ? textoCurto(erro.requestID, 200, /^[\w.:-]+$/)
      : null;
  } catch {
    return null;
  }
}

/**
 * Um evento `ia-chamada-falhou` por falha do provedor: lista fechada de
 * campos, sem mensagem, stack, corpo, cabeçalhos ou qualquer texto do erro.
 * Nível `aviso`, para não entrar na contagem de erros do admin
 * (`errosPorCorretor`), onde a mesma falha já conta pelo evento do fluxo.
 * Nunca lança: quem chamou recebe a exceção original de qualquer jeito.
 */
export function registrarFalhaDaChamada(
  erro: unknown,
  userId: string | null,
  campos: {
    tipo: string;
    execucaoId: string;
    rota: RotaIaRegistro | null;
    esforco: string | null;
    configOrigem: VersaoConfiguracaoIa["origem"] | null;
    configVersao: number | null;
    modelo: string;
    duracaoMs: number;
  },
): void {
  try {
    registrarEvento({
      userId,
      categoria: "ia",
      nivel: "aviso",
      evento: "ia-chamada-falhou",
      detalhe: JSON.stringify({
        tipo: campos.tipo,
        execucao_id: campos.execucaoId,
        rota: campos.rota,
        esforco: campos.esforco,
        config_origem: campos.configOrigem,
        config_versao: campos.configVersao,
        modelo: campos.modelo,
        categoria: categorizarFalhaProvedor(erro),
        status_http: sanitizarErroExterno(erro, "iaTexto").status,
        requisicao_provedor_id: requisicaoDoErro(erro),
        duracao_ms: campos.duracaoMs,
      }),
    });
  } catch {
    // A telemetria nunca substitui nem mascara a falha original.
  }
}

/**
 * Executor comum das operações OpenAI.
 *
 * Recebe o cliente já criado para que autenticação, ciclo de vida e rollback
 * continuem sob controle do chamador. O uso é registrado antes de qualquer
 * parse, exatamente como na rota original.
 */
function criarExecutor(
  openai: OpenAI,
  userId: string | null,
  rota?: { modelo: ModeloIaPermitido; esforco: EsforcoIaPermitido },
  clienteMockado = false,
  contexto?: ContextoConfiguracaoExecutor,
): ExecutorOpenAI {
  return {
    async executar(pedido: PedidoExecutorOpenAI): Promise<ResultadoExecutorOpenAI> {
      if (!clienteMockado) exigirAutorizacaoOpenAIReal();
      const modelo = rota?.modelo || MODELO_TEXTO_IA;
      const esforco = rota?.esforco || pedido.reasoningEffort;
      const execucaoId = pedido.execucaoId || randomUUID();
      const inicio = performance.now();
      // Só a chamada ao provedor fica no try: a trava de ambiente acima é a
      // aplicação decidindo não chamar, e não gera `ia-chamada-falhou`.
      let conclusao: OpenAI.Chat.ChatCompletion;
      try {
        conclusao = await openai.chat.completions.create({
          model: modelo,
          max_completion_tokens: pedido.maxCompletionTokens ?? MAX_TOKENS_IA,
          reasoning_effort: esforco,
          ...(pedido.formato
            ? {
                response_format: {
                  type: "json_schema" as const,
                  json_schema: {
                    name: pedido.formato.nome,
                    strict: true,
                    schema: pedido.formato.esquema,
                  },
                },
              }
            : {}),
          messages: aplicarSystemPromptAngario(pedido.mensagens),
        }, {
          ...(pedido.tipo.startsWith("rascunhar-resposta-") ? { maxRetries: 0, timeout: 45_000 } : {}),
          ...(pedido.maxRetries != null ? { maxRetries: pedido.maxRetries } : {}),
          ...(pedido.timeoutMs != null ? { timeout: pedido.timeoutMs } : {}),
          ...(pedido.signal ? { signal: pedido.signal } : {}),
        });
      } catch (erro) {
        registrarFalhaDaChamada(erro, userId, {
          tipo: pedido.tipo,
          execucaoId,
          rota: contexto?.nome ?? null,
          esforco,
          configOrigem: contexto?.origem ?? null,
          configVersao: contexto?.versao ?? null,
          modelo,
          duracaoMs: Math.max(0, Math.round(performance.now() - inicio)),
        });
        throw erro;
      }

      const duracaoMs = Math.max(0, Math.round(performance.now() - inicio));

      registrarUsoDaResposta(userId, pedido.tipo, modelo, conclusao.usage, metadadosDaConclusao(conclusao, {
        execucaoId,
        rota: contexto?.nome ?? null,
        esforco,
        configOrigem: contexto?.origem ?? null,
        configVersao: contexto?.versao ?? null,
        duracaoMs,
      }));
      if (pedido.interpretarTexto === false) return { conclusao, texto: "" };
      return { conclusao, texto: textoDaResposta(conclusao) };
    },
  };
}

export function criarExecutorOpenAI(
  openai: OpenAI,
  userId: string | null,
  rota?: { modelo: ModeloIaPermitido; esforco: EsforcoIaPermitido },
  contexto?: ContextoConfiguracaoExecutor,
): ExecutorOpenAI {
  return criarExecutor(openai, userId, rota, false, contexto);
}

/**
 * Entrada exclusiva para unit tests com um cliente inteiramente falso.
 * Ela não aceita uso fora do ambiente de testes e nunca deve receber uma
 * instância real do SDK.
 */
export function criarExecutorOpenAIMockParaTeste(
  openaiMock: OpenAI,
  userId: string | null,
  rota?: { modelo: ModeloIaPermitido; esforco: EsforcoIaPermitido },
  contexto?: ContextoConfiguracaoExecutor,
): ExecutorOpenAI {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("O executor mockado da OpenAI só pode ser usado em NODE_ENV=test.");
  }
  return criarExecutor(openaiMock, userId, rota, true, contexto);
}
