import { DISPONIBILIDADE_STATUS_ALVO } from "./followup";
import { addMonthsCivilISO, agoraTimestamp, dataOperacionalDeTimestamp, inicioDoDiaOperacionalISO, isoDeTimestamp, timestampDeIso } from "../datas";
import { telefoneValido, type TipoMensagemAgendada, type TipoMensagemComum } from "../mensagensAgendadas";

export const ERROS_RETOMADA = {
  "feature-desabilitada": "A programação de retomada está disponível somente no desenvolvimento local autorizado.",
  "imovel-inexistente": "O imóvel não foi encontrado. Reabra o cadastro.",
  "imovel-nao-retirado": "Somente imóveis atualmente retirados podem ter retomada programada.",
  "estado-incompativel": "O estado ou a identidade da programação é incompatível com a retomada.",
  "retomada-inexistente": "A retomada não foi encontrada. Reabra a programação.",
  "retomada-conflitante": "Já existe uma retomada ativa para este imóvel. Reabra a programação.",
  "destinatario-ausente": "O imóvel não possui destinatário com telefone válido. Corrija o cadastro antes de programar.",
  "data-invalida": "Escolha uma data e um horário válidos no futuro (horário de Brasília).",
  "texto-ausente": "Escreva o texto da retomada.",
  "conflito-edicao": "A programação mudou enquanto a janela estava aberta. Reabra para conferir o estado atual.",
  "sessao-invalida": "Sua sessão expirou. Entre novamente.",
  "falha-operacao": "Não foi possível carregar ou salvar a retomada. Tente novamente.",
} as const;
export type ErroRetomada = keyof typeof ERROS_RETOMADA;
export function ehErroRetomada(valor: unknown): valor is ErroRetomada {
  return typeof valor === "string" && Object.hasOwn(ERROS_RETOMADA, valor);
}
export type ContextoMensagem = { modo: "comum"; tipo: TipoMensagemComum } | { modo: "retomada"; retomadaImovelId: string } | { modo: "invalido" };

/** Uma linha persistida com identidade válida pode selecionar a retomada.
 * Identidades concorrentes nunca são escolhidas silenciosamente. */
export function resolverContextoMensagem(entrada: {
  tipo?: TipoMensagemAgendada; imovelIdRelacionado?: string; agendaIdRelacionado?: string;
  retomadaImovelId?: string; persistida?: { tipo: unknown; imovelId: string | null; agendaId: string | null };
}): ContextoMensagem {
  const p = entrada.persistida;
  const retomada = entrada.retomadaImovelId;
  if (p && entrada.tipo && p.tipo !== entrada.tipo
    && (p.tipo === "retomada-retirado" || entrada.tipo === "retomada-retirado")) return { modo: "invalido" };
  if (retomada !== undefined || p?.tipo === "retomada-retirado") {
    const alvo = retomada ?? p?.imovelId;
    if (!alvo?.trim() || entrada.imovelIdRelacionado !== undefined || entrada.agendaIdRelacionado !== undefined
      || (entrada.tipo && entrada.tipo !== "retomada-retirado")
      || (p && (p.tipo !== "retomada-retirado" || p.imovelId !== alvo || p.agendaId !== null))) return { modo: "invalido" };
    return { modo: "retomada", retomadaImovelId: alvo };
  }
  const tipo = p?.tipo ?? entrada.tipo ?? "livre";
  return tipo === "livre" || tipo === "verificacao-disponibilidade" ? { modo: "comum", tipo } : { modo: "invalido" };
}

export function validarImovelRetomada(imovel: { retirado: boolean | null; status: string; proprietario_telefone: string | null } | null): ErroRetomada | null {
  if (!imovel) return "imovel-inexistente";
  if (imovel.retirado !== true) return "imovel-nao-retirado";
  if (!DISPONIBILIDADE_STATUS_ALVO.some((status) => status === imovel.status)) return "estado-incompativel";
  if (!telefoneValido(imovel.proprietario_telefone || "")) return "destinatario-ausente";
  return null;
}

/** Default B4 aprovado: somente nome e endereço persistidos, sem inferência ou envio. */
export function textoInicialRetomada(imovel: { proprietario_nome: string | null; endereco?: string | null }): string {
  const primeiro = (imovel.proprietario_nome || "").trim().split(/\s+/)[0];
  const nomeValido = /^\p{L}[\p{L}\p{M}'’-]*$/u.test(primeiro)
    && /\p{L}.*\p{L}/u.test(primeiro)
    && !/^(propriet[aá]ri[oa]|contato|desconhecid[oa]|sem|n[aã]o|sr|sra|dr|dra)$/i.test(primeiro);
  const saudacao = nomeValido ? `Olá, ${primeiro}! Tudo bem?` : "Olá! Tudo bem?";
  const endereco = (imovel.endereco || "").trim().replace(/\s+/g, " ");
  const partes = endereco.match(/^([^,]+?)(?:,\s*|\s+)(\d+[A-Za-z]?)(?:\s*,.*)?$/u);
  let referencia = "em questão";
  if (partes && /\p{L}.*\p{L}/u.test(partes[1])) {
    const logradouro = partes[1].trim();
    const preposicao = /^(rua|r\.|avenida|av\.|travessa|tv\.|alameda|estrada|praça|rodovia|via)\s/i.test(logradouro) ? "da"
      : /^(beco|largo|caminho|acesso|viaduto)\s/i.test(logradouro) ? "do" : "em";
    referencia = `${preposicao} ${logradouro}, ${partes[2]}`;
  }
  return `${saudacao} Estou retomando nosso contato sobre o imóvel ${referencia}. Gostaria de saber se ele continua fora de disponibilidade ou se podemos conversar novamente sobre a possibilidade de anunciá-lo conosco.`;
}

/** Data civil em Brasília, com dia limitado ao último do mês de destino. */
export function dataPadraoRetomada(meses: 3 | 6 | 12 = 6, agora = agoraTimestamp()): { data: string; hora: string } {
  const hoje = dataOperacionalDeTimestamp(agora)!;
  return { data: addMonthsCivilISO(hoje, meses)!, hora: "09:00" };
}

export function dataHoraRetomadaParaIso(data: string, hora: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
  const inicio = timestampDeIso(inicioDoDiaOperacionalISO(data));
  if (inicio === null) return null;
  const [h, m] = hora.split(":").map(Number);
  return isoDeTimestamp(inicio + (h * 60 + m) * 60_000);
}
export function validarFormularioRetomada(data: string, hora: string, texto: string, agora = agoraTimestamp()): ErroRetomada | null {
  const instante = timestampDeIso(dataHoraRetomadaParaIso(data, hora));
  if (instante === null || instante <= agora) return "data-invalida";
  return texto.trim() ? null : "texto-ausente";
}

/** O banco continua autoridade final. Não devolver detalhes brutos ao browser. */
export function erroBancoRetomada(erro: { code?: string; message?: string }): ErroRetomada {
  if (erro.code === "23505") return "retomada-conflitante";
  if (erro.code === "23514") return "estado-incompativel";
  return "falha-operacao";
}
