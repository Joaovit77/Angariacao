export type StatusMensagemAgendada = "agendada" | "processando" | "enviada" | "erro" | "cancelada";
export type TipoMensagemAgendada = "livre" | "verificacao-disponibilidade";
export type MotivoCancelamentoMensagemAgendada =
  | "usuario"
  | "imovel-indisponivel"
  | "disponibilidade-confirmada"
  | "imovel-excluido"
  /** Absorvida por outra verificação do mesmo proprietário no mesmo dia; a
      âncora está em `consolidadaEmMensagemId`. */
  | "contato-consolidado";
export type OrigemCancelamentoMensagemAgendada = "usuario" | "automacao" | "worker";
/** Único motivo de reagendamento automático: a cadência recomeça na evidência
    positiva mais recente (`E + VERIFICACAO_DISPONIBILIDADE_DIAS`). */
export type MotivoReagendamentoMensagemAgendada = "disponibilidade-confirmada";

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
  /** Por quais imóveis a mensagem perguntou. `null` = somente `imovelId`.
      Preenchido pelo worker quando uma mensagem absorve outras do mesmo
      proprietário; é a lista, e não o texto, que diz o que foi perguntado. */
  imoveisConsultados: string[] | null;
  /** A mensagem que absorveu esta, quando cancelada como `contato-consolidado`. */
  consolidadaEmMensagemId: string | null;
  /** Reserva de consolidação (antes do POST): a âncora para a qual esta linha
      está reservada enquanto `processando`; em `erro`, o vínculo de uma
      consolidação interrompida/incerta. Nunca significa contato realizado. */
  reservadaParaMensagemId: string | null;
  reagendadaEm: string | null;
  reagendamentoMotivo: MotivoReagendamentoMensagemAgendada | null;
  /** O `data_envio` de antes do primeiro reagendamento automático. */
  dataEnvioOriginal: string | null;
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
  imoveis_consultados?: string[] | null;
  consolidada_em_mensagem_id?: string | null;
  reservada_para_mensagem_id?: string | null;
  reagendada_em?: string | null;
  reagendamento_motivo?: MotivoReagendamentoMensagemAgendada | null;
  data_envio_original?: string | null;
}

export function fromDbMensagem(r: DbMensagemAgendada): MensagemAgendada {
  return { id: r.id, userId: r.user_id, imovelId: r.imovel_id, nomeProprietario: r.nome_proprietario,
    tipo: r.tipo ?? "livre", agendaId: r.agenda_id ?? null,
    telefone: r.telefone, mensagem: r.mensagem, dataEnvio: r.data_envio, status: r.status,
    enviadoEm: r.enviado_em, erro: r.erro,
    cancelamentoMotivo: r.cancelamento_motivo ?? null,
    cancelamentoOrigem: r.cancelamento_origem ?? null,
    canceladaEm: r.cancelada_em ?? null,
    imoveisConsultados: r.imoveis_consultados ?? null,
    consolidadaEmMensagemId: r.consolidada_em_mensagem_id ?? null,
    reservadaParaMensagemId: r.reservada_para_mensagem_id ?? null,
    reagendadaEm: r.reagendada_em ?? null,
    reagendamentoMotivo: r.reagendamento_motivo ?? null,
    dataEnvioOriginal: r.data_envio_original ?? null };
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
