import type { NivelAutonomiaAssistente, TipoAcaoOperacionalAssistente } from "./politicas";

export type PapelAssistente = "usuario" | "assistente";

export type EstadoAcaoAssistente =
  | "ready_for_confirmation"
  | "succeeded"
  | "cancelled"
  | "expired"
  | "failed";

export type OrigemAcaoAssistente = "assistente" | "automacao" | "evento_whatsapp";

export interface MotivoAcaoAssistente {
  codigo: string;
  descricao: string;
  dados?: Record<string, string | number | boolean | null>;
}

export interface BaseAcaoAssistente {
  id: string;
  tipo: TipoAcaoOperacionalAssistente;
  estado: EstadoAcaoAssistente;
  expiraEm: string | null;
  operacao: string;
  impacto: string;
  origem: OrigemAcaoAssistente;
  nivelAutonomia: NivelAutonomiaAssistente;
  requerConfirmacao: boolean;
  motivo: MotivoAcaoAssistente;
  erro?: string;
}

export interface AcaoAgendarVisitaAssistente extends BaseAcaoAssistente {
  tipo: "agendar_visita";
  operacao: "Agendar visita";
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
}

export interface AcaoCriarCompromissoAssistente extends BaseAcaoAssistente {
  tipo: "criar_compromisso";
  operacao: "Criar compromisso";
  entidade: {
    imovelId: string | null;
    codigo: string | null;
    endereco: string | null;
    responsavel: string | null;
  };
  dados: {
    titulo: string;
    tipo: string;
    data: string;
    hora: string | null;
    observacao: string | null;
  };
  resultado?: {
    agendaId: string;
  };
}

export interface ImovelAcaoStatusSemResposta {
  id: string;
  codigo: string;
  endereco: string;
  statusPreparado: "Novo contato";
  tentativas: number;
}

export interface ImovelIgnoradoAcaoStatusSemResposta {
  id: string;
  codigo: string;
  motivo: "status_alterado" | "nao_elegivel" | "imovel_indisponivel";
}

export interface AcaoAlterarStatusSemRespostaAssistente extends BaseAcaoAssistente {
  tipo: "alterar_status_sem_resposta_em_lote";
  operacao: "Alterar status em lote";
  entidade: {
    imoveis: ImovelAcaoStatusSemResposta[];
  };
  dados: {
    statusDestino: "Sem resposta";
    quantidade: number;
  };
  resultado?: {
    alterados: Array<Pick<ImovelAcaoStatusSemResposta, "id" | "codigo">>;
    ignorados: ImovelIgnoradoAcaoStatusSemResposta[];
    totalAlterados: number;
    totalIgnorados: number;
  };
}

export interface EntidadeAcompanhamentoAssistente {
  imovelId: string;
  codigo: string;
  endereco: string;
  responsavel: string;
}

export interface AcaoRegistrarTentativaAssistente extends BaseAcaoAssistente {
  tipo: "registrar_tentativa";
  operacao: "Registrar tentativa de contato";
  entidade: EntidadeAcompanhamentoAssistente;
  dados: {
    tentativaId: string;
    canal: string;
    resultado: string;
    observacao: string | null;
  };
  resultado?: {
    tentativaId: string;
    imovelId: string;
  };
}

export interface AcaoCriarFollowUpAssistente extends BaseAcaoAssistente {
  tipo: "criar_followup";
  operacao: "Criar follow-up";
  entidade: EntidadeAcompanhamentoAssistente & { agendaId: string };
  dados: {
    titulo: string;
    data: string;
    hora: string | null;
  };
  resultado?: { agendaId: string };
}

export interface AcaoReagendarFollowUpAssistente extends BaseAcaoAssistente {
  tipo: "reagendar_followup";
  operacao: "Reagendar follow-up";
  entidade: EntidadeAcompanhamentoAssistente & { agendaId: string };
  dados: {
    titulo: string;
    dataAnterior: string;
    horaAnterior: string | null;
    data: string;
    hora: string | null;
  };
  resultado?: { agendaId: string };
}

export interface AcaoConcluirFollowUpAssistente extends BaseAcaoAssistente {
  tipo: "concluir_followup";
  operacao: "Concluir follow-up";
  entidade: EntidadeAcompanhamentoAssistente & { agendaId: string };
  dados: {
    titulo: string;
    data: string;
    hora: string | null;
  };
  resultado?: { agendaId: string };
}

export type AcaoAssistente =
  | AcaoAgendarVisitaAssistente
  | AcaoCriarCompromissoAssistente
  | AcaoAlterarStatusSemRespostaAssistente
  | AcaoRegistrarTentativaAssistente
  | AcaoCriarFollowUpAssistente
  | AcaoReagendarFollowUpAssistente
  | AcaoConcluirFollowUpAssistente;

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

export interface ItemConversaRespondidaAssistente {
  imovelId: string;
  codigo: string;
  proprietario: string;
  status: string;
  ultimaResposta: string;
  ultimaRespostaEm: string;
  aguardandoCorretor: boolean;
  naoLidas: number;
  rascunhoDisponivel: boolean;
}

export type BlocoAssistente =
  | { tipo: "imoveis"; titulo: string; itens: ItemImovelAssistente[] }
  | { tipo: "agenda"; titulo: string; itens: ItemAgendaAssistente[] }
  | { tipo: "mensagens_agendadas"; titulo: string; itens: ItemMensagemAgendadaAssistente[] }
  | { tipo: "conversas_respondidas"; titulo: string; itens: ItemConversaRespondidaAssistente[] }
  | { tipo: "metricas"; titulo: string; itens: Array<{ rotulo: string; valor: string; detalhe?: string }> }
  | { tipo: "historico"; titulo: string; itens: Array<{ data: string; tipo: string; texto: string }> };

export interface MensagemAssistente {
  id: string;
  papel: PapelAssistente;
  texto: string;
  blocos?: BlocoAssistente[];
  acao?: AcaoAssistente;
  comandoUi?: ComandoUiAssistente;
}

export type ComandoUiAssistente =
  | { tipo: "abrir_followup_lote" }
  | {
      tipo: "rascunhar_resposta";
      imovelId: string;
      codigo: string;
      proprietario: string;
    };

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
  | { tipo: "conversas_respondidas"; itens: Array<{ imovelId: string; codigo: string; proprietario: string; ultimaRespostaEm: string; aguardandoCorretor: boolean }> }
  | { tipo: "metricas"; itens: Array<{ rotulo: string; valor: string }> };

export type AcaoHistoricoAssistente = {
  [Tipo in AcaoAssistente["tipo"]]: Pick<
    Extract<AcaoAssistente, { tipo: Tipo }>,
    "id" | "tipo" | "estado" | "entidade" | "dados"
  >;
}[AcaoAssistente["tipo"]];

export interface ItemHistoricoAssistente {
  papel: PapelAssistente;
  texto: string;
  resultados?: ResultadoHistoricoAssistente[];
  acao?: AcaoHistoricoAssistente;
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
  sessaoId: string;
}

export interface PedidoCancelarAcaoAssistente {
  tipo: "cancelar_acao";
  acaoId: string;
  sessaoId: string;
}

export type RespostaAssistente =
  | { ok: true; mensagem: MensagemAssistente; modelo: string }
  | { ok: false; erro: string; codigo?: string };
