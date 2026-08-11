export type StatusMensagemAgendada = "agendada" | "processando" | "enviada" | "erro" | "cancelada";

export interface MensagemAgendada {
  id: string;
  userId: string;
  imovelId: string | null;
  nomeProprietario: string;
  telefone: string;
  mensagem: string;
  dataEnvio: string;
  status: StatusMensagemAgendada;
  enviadoEm: string | null;
  erro: string | null;
}

export interface DbMensagemAgendada {
  id: string;
  user_id: string;
  imovel_id: string | null;
  nome_proprietario: string;
  telefone: string;
  mensagem: string;
  data_envio: string;
  status: StatusMensagemAgendada;
  enviado_em: string | null;
  erro: string | null;
}

export function fromDbMensagem(r: DbMensagemAgendada): MensagemAgendada {
  return { id: r.id, userId: r.user_id, imovelId: r.imovel_id, nomeProprietario: r.nome_proprietario,
    telefone: r.telefone, mensagem: r.mensagem, dataEnvio: r.data_envio, status: r.status,
    enviadoEm: r.enviado_em, erro: r.erro };
}

export function telefoneValido(telefone: string): boolean {
  const digitos = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return digitos.length === 10 || digitos.length === 11;
}
