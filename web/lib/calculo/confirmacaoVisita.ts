import { corpoDaResposta, ehNotaDeMensagemEnviada, ehNotaDeResposta } from "./notas";
import { parseDate } from "../datas";
import type { NotaImovel } from "../tipos";
import {
  TIPO_AGENDA_VISITA,
  type CompromissoAutomatico,
} from "./webhookWhatsapp";

export interface ConfirmacaoVisitaPendente {
  data: string;
  hora: string;
}

function registro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

/** Valida o metadado que veio do browser ou de uma nota JSONB antiga. */
export function confirmacaoVisitaValida(
  valor: unknown,
  hoje: string,
): ConfirmacaoVisitaPendente | null {
  const candidato = registro(valor);
  const data = typeof candidato.data === "string" ? candidato.data : "";
  const hora = typeof candidato.hora === "string" ? candidato.hora : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;

  const dataReal = parseDate(data);
  const [ano, mes, dia] = data.split("-").map(Number);
  if (
    !dataReal ||
    dataReal.getFullYear() !== ano ||
    dataReal.getMonth() !== mes - 1 ||
    dataReal.getDate() !== dia ||
    data < hoje
  ) {
    return null;
  }
  return { data, hora };
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Só aceita confirmações curtas e inequívocas. Uma recusa vence qualquer “ok”. */
export function respostaConfirmaVisita(texto: string): boolean {
  const resposta = normalizar(texto);
  if (!resposta || resposta.length > 80) return false;
  if (
    /\b(nao|cancel|remarc|imprevisto|outro horario|outra hora|nao consigo|nao posso|talvez)\b/.test(resposta)
  ) {
    return false;
  }

  const semSaudacao = resposta
    .replace(/^(bom dia|boa tarde|boa noite|ola|oi)\b\s*/, "")
    .trim();
  return /^(ok|sim|confirmad[oa]|combinad[oa]|tudo certo|pode ser|esta tudo certo|continua tudo certo)(\s+(obrigad[oa]|por favor))?$/.test(
    semSaudacao,
  );
}

function ehMensagemDaConversa(nota: NotaImovel): boolean {
  return ehNotaDeMensagemEnviada(nota) || ehNotaDeResposta(nota);
}

function ehSaudacaoIsolada(nota: NotaImovel): boolean {
  if (!ehNotaDeResposta(nota)) return false;
  return /^(bom dia|boa tarde|boa noite|ola|oi)$/.test(normalizar(corpoDaResposta(nota.texto)));
}

/**
 * Promove a confirmação pendente da última mensagem enviada para compromisso.
 * A rota chama esta função com as notas lidas antes de gravar a resposta atual.
 */
export function compromissoDaConfirmacaoDeVisita(
  notas: NotaImovel[] | null | undefined,
  respostaAtual: string,
  rotulo: string,
  hoje: string,
): CompromissoAutomatico | null {
  if (!respostaConfirmaVisita(respostaAtual)) return null;

  const conversa = [...(notas || [])]
    .filter(ehMensagemDaConversa)
    .sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.id || "").localeCompare(b.id || ""));
  let indiceConfirmacao = -1;
  let confirmacao: ConfirmacaoVisitaPendente | null = null;
  for (let indice = conversa.length - 1; indice >= 0; indice -= 1) {
    const nota = conversa[indice];
    if (!ehNotaDeMensagemEnviada(nota)) continue;
    const candidata = confirmacaoVisitaValida(nota.confirmacaoVisita, hoje);
    if (candidata) {
      indiceConfirmacao = indice;
      confirmacao = candidata;
      break;
    }
  }
  if (!confirmacao) return null;

  // “Bom dia” + “ok” costuma chegar em dois eventos. Só essa saudação neutra
  // pode ficar no meio; pergunta, recusa ou nova fala do corretor encerra o
  // vínculo para um “ok” posterior não agendar fora de contexto.
  const intermediarias = conversa.slice(indiceConfirmacao + 1);
  if (intermediarias.some((nota) => !ehSaudacaoIsolada(nota))) return null;

  return {
    titulo: `Visita — ${rotulo}`,
    tipo: TIPO_AGENDA_VISITA,
    data: confirmacao.data,
    hora: confirmacao.hora,
    notas: "Visita confirmada pelo proprietário em resposta à mensagem de confirmação no WhatsApp.",
  };
}
