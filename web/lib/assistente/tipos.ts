export type PapelAssistente = "usuario" | "assistente";

export type EstadoAcaoAssistente =
  | "ready_for_confirmation"
  | "succeeded"
  | "cancelled"
  | "expired"
  | "failed";

export interface AcaoAgendarVisitaAssistente {
  id: string;
  tipo: "agendar_visita";
  estado: EstadoAcaoAssistente;
  expiraEm: string;
  operacao: "Agendar visita";
  impacto: string;
  entidade: {
    imovelId: string;
    codigo: string;
    endereco: string;
    responsavel: string;
  };
  dados: {
    data: string;
    hora: string;
  };
  resultado?: {
    agendaId: string;
  };
  erro?: string;
}

export type AcaoAssistente = AcaoAgendarVisitaAssistente;

export interface ContextoEntidade {
  tipo: "imovel" | "agenda";
  id: string;
}

export interface ContextoAssistente {
  rota: string;
  pagina: string;
  superficie?: "pagina" | "drawer" | "modal";
  entidade?: ContextoEntidade;
}

export interface ItemImovelAssistente {
  id: string;
  codigo: string;
  endereco: string;
  bairro: string;
  status: string;
  responsavel: string;
  diasSemMovimento?: number | null;
  /** Preenchidos apenas em consultas históricas de marco. O status acima
      continua sendo o estado atual exibido no card. */
  marco?: "angariado" | "publicado" | "locado";
  marcoEm?: string | null;
}

export interface ItemAgendaAssistente {
  id: string;
  titulo: string;
  tipo: string;
  data: string;
  hora: string;
  concluido: boolean;
  imovelId?: string | null;
}

export interface ItemMensagemAgendadaAssistente {
  id: string;
  imovelId?: string | null;
  nomeProprietario: string;
  resumoMensagem: string;
  dataEnvio: string;
  status: string;
}

export type BlocoAssistente =
  | { tipo: "imoveis"; titulo: string; itens: ItemImovelAssistente[] }
  | { tipo: "agenda"; titulo: string; itens: ItemAgendaAssistente[] }
  | { tipo: "mensagens_agendadas"; titulo: string; itens: ItemMensagemAgendadaAssistente[] }
  | { tipo: "metricas"; titulo: string; itens: Array<{ rotulo: string; valor: string; detalhe?: string }> }
  | { tipo: "historico"; titulo: string; itens: Array<{ data: string; tipo: string; texto: string }> };

export interface MensagemAssistente {
  id: string;
  papel: PapelAssistente;
  texto: string;
  blocos?: BlocoAssistente[];
  acao?: AcaoAssistente;
}

export type ResultadoHistoricoAssistente =
  | { tipo: "imoveis"; itens: Array<{
      id: string;
      codigo: string;
      bairro: string;
      status: string;
      marco?: "angariado" | "publicado" | "locado";
      marcoEm?: string | null;
    }> }
  | { tipo: "agenda"; itens: Array<{ id: string; titulo: string; data: string; imovelId?: string | null }> }
  | { tipo: "mensagens_agendadas"; itens: Array<{ id: string; nomeProprietario: string; dataEnvio: string; status: string; imovelId?: string | null }> }
  | { tipo: "metricas"; itens: Array<{ rotulo: string; valor: string }> };

export interface ItemHistoricoAssistente {
  papel: PapelAssistente;
  texto: string;
  resultados?: ResultadoHistoricoAssistente[];
  acao?: Pick<AcaoAgendarVisitaAssistente, "id" | "tipo" | "estado" | "entidade" | "dados">;
}

export interface PedidoAssistente {
  mensagem: string;
  contexto: ContextoAssistente;
  historico: ItemHistoricoAssistente[];
  /** Identifica apenas a conversa aberta neste navegador. Serve para
      substituir previews anteriores sem criar memória permanente. */
  sessaoId?: string;
}

export interface PedidoPrepararAcaoAssistente {
  tipo: "preparar_acao";
  acao: "agendar_visita";
  sessaoId: string;
  parametros: {
    imovelId: string;
    data: string;
    hora: string;
  };
}

export interface PedidoConfirmarAcaoAssistente {
  tipo: "confirmar_acao";
  acaoId: string;
}

export interface PedidoCancelarAcaoAssistente {
  tipo: "cancelar_acao";
  acaoId: string;
}

export type RespostaAssistente =
  | { ok: true; mensagem: MensagemAssistente; modelo: string }
  | { ok: false; erro: string; codigo?: string };
