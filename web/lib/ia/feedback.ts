/**
 * Contratos compartilhados do feedback de mensagens sugeridas pela IA.
 *
 * Esta camada descreve somente coleta e validação objetiva. Ela não lê,
 * altera nem projeta preferências no System Prompt ou nos Protocolos.
 */

export const RESULTADOS_FEEDBACK_SUGESTAO_IA = ["aprovado", "editado", "rejeitado"] as const;
export type ResultadoFeedbackSugestaoIa = (typeof RESULTADOS_FEEDBACK_SUGESTAO_IA)[number];

export const MOTIVOS_REJEICAO_SUGESTAO_IA = [
  "muito-formal",
  "muito-longo",
  "muito-generico",
  "tom-inadequado",
  "informacao-incorreta",
  "outro",
] as const;
export type MotivoRejeicaoSugestaoIa = (typeof MOTIVOS_REJEICAO_SUGESTAO_IA)[number];

export const ROTULOS_MOTIVOS_REJEICAO_SUGESTAO_IA: Record<MotivoRejeicaoSugestaoIa, string> = {
  "muito-formal": "Muito formal",
  "muito-longo": "Muito longo",
  "muito-generico": "Muito genérico",
  "tom-inadequado": "Tom inadequado",
  "informacao-incorreta": "Informação incorreta",
  outro: "Outro",
};

export const ORIGENS_SUGESTAO_IA = [
  "central-mensagens",
  "caixa-respostas",
  "notas",
  "assistente",
  "pipeline-anuncio",
  "outro",
] as const;
export type OrigemSugestaoIa = (typeof ORIGENS_SUGESTAO_IA)[number];

export interface ReferenciaSugestaoIa {
  id: string;
  textoSugerido: string;
  feedbackResultado?: ResultadoFeedbackSugestaoIa;
}

export interface PedidoFeedbackSugestaoIa {
  sugestaoId: string;
  resultado: ResultadoFeedbackSugestaoIa;
  motivo?: MotivoRejeicaoSugestaoIa | null;
  comentario?: string | null;
  textoFinal?: string | null;
}

export function ehResultadoFeedbackSugestaoIa(valor: unknown): valor is ResultadoFeedbackSugestaoIa {
  return (
    typeof valor === "string" &&
    (RESULTADOS_FEEDBACK_SUGESTAO_IA as readonly string[]).includes(valor)
  );
}

export function ehMotivoRejeicaoSugestaoIa(valor: unknown): valor is MotivoRejeicaoSugestaoIa {
  return (
    typeof valor === "string" &&
    (MOTIVOS_REJEICAO_SUGESTAO_IA as readonly string[]).includes(valor)
  );
}

export function normalizarOrigemSugestaoIa(valor: unknown): OrigemSugestaoIa {
  return typeof valor === "string" && (ORIGENS_SUGESTAO_IA as readonly string[]).includes(valor)
    ? (valor as OrigemSugestaoIa)
    : "outro";
}

/** O envio usa trim; a comparação segue exatamente o texto que saiu. */
export function textoFinalDiferenteDaSugestao(textoSugerido: string, textoFinal: string): boolean {
  return textoSugerido.trim() !== textoFinal.trim();
}

export function feedbackDoEnvio(
  sugestao: ReferenciaSugestaoIa,
  textoFinal: string,
): PedidoFeedbackSugestaoIa {
  const final = textoFinal.trim();
  return textoFinalDiferenteDaSugestao(sugestao.textoSugerido, final)
    ? { sugestaoId: sugestao.id, resultado: "editado", textoFinal: final }
    : { sugestaoId: sugestao.id, resultado: "aprovado" };
}
