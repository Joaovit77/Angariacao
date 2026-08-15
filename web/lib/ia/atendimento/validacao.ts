import {
  MAX_PROTOCOLOS_APLICAVEIS,
  MAX_TEXTO_RASCUNHO,
  type DecisaoAtendimento,
  type ProtocoloPrompt,
  type ValidacaoAtendimento,
} from "./contratos";

const MAX_CONTEXTO_ATENDIMENTO = 200;

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
  if (!valor || typeof valor !== "object") return false;
  const v = valor as Record<keyof ValidacaoAtendimento, unknown>;
  return [
    "aprovada",
    "respondeAMensagem",
    "coerenteComHistorico",
    "semProtocoloDesnecessario",
    "somenteFatosComFonte",
    "semDesvioDeAssunto",
    "informacaoSuficienteParaEstaResposta",
    "seguraParaSugerir",
  ].every((campo) => v[campo as keyof ValidacaoAtendimento] === true);
}
