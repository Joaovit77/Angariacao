export type NivelAutonomiaAssistente = "low" | "medium" | "high" | "critical";

export type ModoExecucaoAssistente = "automatico" | "confirmacao" | "bloqueado";

export type TipoAcaoOperacionalAssistente =
  | "agendar_visita"
  | "criar_compromisso"
  | "alterar_status_sem_resposta_em_lote"
  | "registrar_tentativa"
  | "criar_followup"
  | "reagendar_followup"
  | "concluir_followup"
  | "concluir_followups_por_resposta";

export type OperacaoCriticaAssistente =
  | "excluir_imovel"
  | "editar_dado_sensivel"
  | "enviar_mensagem_externa"
  | "alterar_status_arbitrario";

export interface PoliticaAcaoAssistente {
  nivel: NivelAutonomiaAssistente;
  modo: ModoExecucaoAssistente;
  reversivel: boolean;
}

/**
 * Política fechada do produto. O modelo pode escolher uma ferramenta, mas não
 * escolhe o nível de autonomia nem remove a confirmação. Preferências por
 * usuário poderão futuramente restringir este catálogo; nunca ampliá-lo além
 * do teto definido aqui.
 */
export const POLITICAS_ACOES_ASSISTENTE: Record<TipoAcaoOperacionalAssistente, PoliticaAcaoAssistente> = {
  agendar_visita: { nivel: "high", modo: "confirmacao", reversivel: true },
  criar_compromisso: { nivel: "high", modo: "confirmacao", reversivel: true },
  alterar_status_sem_resposta_em_lote: { nivel: "high", modo: "confirmacao", reversivel: false },
  registrar_tentativa: { nivel: "high", modo: "confirmacao", reversivel: true },
  criar_followup: { nivel: "low", modo: "automatico", reversivel: true },
  reagendar_followup: { nivel: "low", modo: "automatico", reversivel: true },
  concluir_followup: { nivel: "low", modo: "automatico", reversivel: true },
  concluir_followups_por_resposta: { nivel: "low", modo: "automatico", reversivel: true },
};

export const POLITICAS_CRITICAS_ASSISTENTE: Record<OperacaoCriticaAssistente, PoliticaAcaoAssistente> = {
  excluir_imovel: { nivel: "critical", modo: "bloqueado", reversivel: false },
  editar_dado_sensivel: { nivel: "critical", modo: "bloqueado", reversivel: false },
  enviar_mensagem_externa: { nivel: "critical", modo: "bloqueado", reversivel: false },
  alterar_status_arbitrario: { nivel: "critical", modo: "bloqueado", reversivel: false },
};

export function politicaDaAcaoAssistente(tipo: TipoAcaoOperacionalAssistente): PoliticaAcaoAssistente {
  return POLITICAS_ACOES_ASSISTENTE[tipo];
}
