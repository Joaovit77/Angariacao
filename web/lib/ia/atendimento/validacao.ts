import {
  MAX_PROTOCOLOS_APLICAVEIS,
  MAX_TEXTO_RASCUNHO,
  type DecisaoAtendimento,
  type ProtocoloPrompt,
  type ValidacaoAtendimento,
} from "./contratos";

const MAX_CONTEXTO_ATENDIMENTO = 200;

export type MotivoBloqueioAtendimento =
  | "baixa-confianca"
  | "contexto-incompleto"
  | "decisao-bloqueada"
  | "geracao-reprovada"
  | "protocolo-inadequado"
  | "informacao-sem-fonte"
  | "desvio-de-assunto";

export function normalizarDecisaoAtendimento(
  valor: unknown,
  protocolos: readonly ProtocoloPrompt[],
): DecisaoAtendimento | null {
  if (!valor || typeof valor !== "object") return null;
  const d = valor as Record<string, unknown>;
  if (!["alta", "media", "baixa"].includes(String(d.nivelConfianca))) return null;
  if (
    typeof d.precisaIntervencaoHumana !== "boolean" ||
    typeof d.podeResponderComSeguranca !== "boolean"
  )
    return null;
  const titulos = new Set(protocolos.map((p) => p.titulo));
  const lista = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  return {
    intencao:
      typeof d.intencao === "string" && d.intencao.trim()
        ? d.intencao.trim().slice(0, MAX_CONTEXTO_ATENDIMENTO)
        : "outro assunto",
    contextoRelevante:
      typeof d.contextoRelevante === "string"
        ? d.contextoRelevante.trim().slice(0, MAX_TEXTO_RASCUNHO)
        : "",
    protocolosAplicaveis: lista(d.protocolosAplicaveis)
      .filter((t) => titulos.has(t))
      .slice(0, MAX_PROTOCOLOS_APLICAVEIS),
    informacoesFaltantes: lista(d.informacoesFaltantes).slice(0, 8),
    nivelConfianca: String(d.nivelConfianca) as DecisaoAtendimento["nivelConfianca"],
    precisaIntervencaoHumana: d.precisaIntervencaoHumana,
    podeResponderComSeguranca: d.podeResponderComSeguranca,
  };
}

export function validacaoAprovaAtendimento(valor: unknown): valor is ValidacaoAtendimento {
  return motivoReprovacaoValidacaoAtendimento(valor) === null;
}

export function motivoBloqueioDecisaoAtendimento(
  decisao: DecisaoAtendimento,
): MotivoBloqueioAtendimento | null {
  if (!decisao.precisaIntervencaoHumana && decisao.podeResponderComSeguranca) return null;
  if (decisao.nivelConfianca === "baixa") return "baixa-confianca";
  if (decisao.informacoesFaltantes.length > 0) return "contexto-incompleto";
  return "decisao-bloqueada";
}

/**
 * Traduz os campos objetivos do validador no motivo interno da reprova.
 * `undefined` significa resposta estruturalmente invalida do modelo; `null`,
 * aprovacao. Nenhum texto da conversa ou raciocinio do modelo e retornado.
 */
export function motivoReprovacaoValidacaoAtendimento(
  valor: unknown,
): MotivoBloqueioAtendimento | null | undefined {
  if (!valor || typeof valor !== "object") return undefined;
  const v = valor as Record<keyof ValidacaoAtendimento, unknown>;
  const campos = [
    "aprovada",
    "respondeAMensagem",
    "coerenteComHistorico",
    "semProtocoloDesnecessario",
    "somenteFatosComFonte",
    "semDesvioDeAssunto",
    "informacaoSuficienteParaEstaResposta",
    "seguraParaSugerir",
  ] as const;
  if (campos.some((campo) => typeof v[campo] !== "boolean")) return undefined;
  if (campos.every((campo) => v[campo] === true)) return null;
  if (v.semProtocoloDesnecessario === false) return "protocolo-inadequado";
  if (v.somenteFatosComFonte === false) return "informacao-sem-fonte";
  if (v.semDesvioDeAssunto === false) return "desvio-de-assunto";
  if (v.informacaoSuficienteParaEstaResposta === false) return "contexto-incompleto";
  if (v.seguraParaSugerir === false) return "baixa-confianca";
  return "geracao-reprovada";
}
