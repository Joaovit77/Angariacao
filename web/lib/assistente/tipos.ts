export type PapelAssistente = "usuario" | "assistente";

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
}

export type ResultadoHistoricoAssistente =
  | { tipo: "imoveis"; itens: Array<{ id: string; codigo: string; bairro: string; status: string }> }
  | { tipo: "agenda"; itens: Array<{ id: string; titulo: string; data: string; imovelId?: string | null }> }
  | { tipo: "mensagens_agendadas"; itens: Array<{ id: string; nomeProprietario: string; dataEnvio: string; status: string; imovelId?: string | null }> }
  | { tipo: "metricas"; itens: Array<{ rotulo: string; valor: string }> };

export interface ItemHistoricoAssistente {
  papel: PapelAssistente;
  texto: string;
  resultados?: ResultadoHistoricoAssistente[];
}

export interface PedidoAssistente {
  mensagem: string;
  contexto: ContextoAssistente;
  historico: ItemHistoricoAssistente[];
}

export type RespostaAssistente =
  | { ok: true; mensagem: MensagemAssistente; modelo: string }
  | { ok: false; erro: string; codigo?: string };
