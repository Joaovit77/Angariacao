export type StatusMensagemAgendada = "agendada" | "processando" | "enviada" | "erro" | "cancelada";
export type TipoMensagemAgendada = "livre" | "verificacao-disponibilidade";
export type MotivoCancelamentoMensagemAgendada =
  | "usuario"
  | "imovel-indisponivel"
  | "disponibilidade-confirmada"
  | "imovel-excluido";
export type OrigemCancelamentoMensagemAgendada = "usuario" | "automacao" | "worker";

export interface MensagemAgendada {
  id: string;
  userId: string;
  imovelId: string | null;
  tipo: TipoMensagemAgendada;
  agendaId: string | null;
  nomeProprietario: string;
  telefone: string;
  mensagem: string;
  dataEnvio: string;
  status: StatusMensagemAgendada;
  enviadoEm: string | null;
  erro: string | null;
  cancelamentoMotivo: MotivoCancelamentoMensagemAgendada | null;
  cancelamentoOrigem: OrigemCancelamentoMensagemAgendada | null;
  canceladaEm: string | null;
}

export interface DbMensagemAgendada {
  id: string;
  user_id: string;
  imovel_id: string | null;
  /** Opcionais apenas para leitura compatível de fixtures/linhas anteriores à
   * migration. No banco migrado, `tipo` é sempre preenchido. */
  tipo?: TipoMensagemAgendada | null;
  agenda_id?: string | null;
  nome_proprietario: string;
  telefone: string;
  mensagem: string;
  data_envio: string;
  status: StatusMensagemAgendada;
  enviado_em: string | null;
  erro: string | null;
  cancelamento_motivo?: MotivoCancelamentoMensagemAgendada | null;
  cancelamento_origem?: OrigemCancelamentoMensagemAgendada | null;
  cancelada_em?: string | null;
}

export function fromDbMensagem(r: DbMensagemAgendada): MensagemAgendada {
  return { id: r.id, userId: r.user_id, imovelId: r.imovel_id, nomeProprietario: r.nome_proprietario,
    tipo: r.tipo ?? "livre", agendaId: r.agenda_id ?? null,
    telefone: r.telefone, mensagem: r.mensagem, dataEnvio: r.data_envio, status: r.status,
    enviadoEm: r.enviado_em, erro: r.erro,
    cancelamentoMotivo: r.cancelamento_motivo ?? null,
    cancelamentoOrigem: r.cancelamento_origem ?? null,
    canceladaEm: r.cancelada_em ?? null };
}

export function telefoneValido(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return digitos.length === 10 || digitos.length === 11;
}

export function mensagemAgendadaAtiva(mensagem: MensagemAgendada): boolean {
  return mensagem.status === "agendada" || mensagem.status === "processando";
}

/** O filtro opera por conversa, portanto duas mensagens pendentes do mesmo
 * imóvel continuam contando uma única conversa. Itens sem imóvel permanecem
 * acessíveis na gestão completa, mas não podem ser ligados a uma conversa. */
export function imoveisComAgendamentoAtivo(mensagens: MensagemAgendada[]): Set<string> {
  return new Set(
    mensagens
      .filter((mensagem) => mensagem.imovelId && mensagemAgendadaAtiva(mensagem))
      .map((mensagem) => mensagem.imovelId as string),
  );
}
