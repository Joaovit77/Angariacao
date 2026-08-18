/* ================================================================
   IMPORTAÇÃO DE CONVERSA DO WHATSAPP — núcleo puro

   A Evolution mudou envelopes e nomes de timestamp entre versões. Esta
   fronteira aceita as formas conhecidas, normaliza e FILTRA novamente pelo
   telefone canônico. O filtro local é obrigatório: a própria Evolution já
   teve versões em que `findMessages` ignorava o `remoteJid` enviado.

   As notas geradas têm prefixo e origem próprios. Elas enriquecem somente o
   contexto do agente de atendimento; não são uma resposta nova, não mexem no
   ranking e não criam agenda/status retroativamente.
   ================================================================ */
import { instanteParaISOOperacional } from "@/lib/datas";
import {
  PREFIXO_ID_NOTA,
  PREFIXO_ID_NOTA_ENVIADA,
  PREFIXO_ID_NOTA_IMPORTADA_ENVIADA,
  PREFIXO_ID_NOTA_IMPORTADA_RECEBIDA,
  PREFIXO_TEXTO_ENVIADA,
  PREFIXO_TEXTO_RESPOSTA,
  SUFIXO_ID_ENCERRAMENTO,
} from "@/lib/calculo/notas";
import { telefoneCanonico, textoDaMensagem } from "@/lib/calculo/webhookWhatsapp";
import type { NotaImovel } from "@/lib/tipos";

export const LIMITE_IMPORTACAO_CONVERSA = 30;
const MAX_TEXTO_IMPORTADO = 1000;

export interface MensagemRecenteWhatsapp {
  id: string;
  direcao: "recebida" | "enviada";
  texto: string;
  data: string;
  tipo: string;
  jaImportada: boolean;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function registrosDoEnvelope(corpo: unknown): unknown[] {
  if (Array.isArray(corpo)) return corpo;
  const raiz = objeto(corpo);
  const mensagens = raiz.messages;
  if (Array.isArray(mensagens)) return mensagens;
  const registros = objeto(mensagens).records;
  if (Array.isArray(registros)) return registros;
  const dados = objeto(raiz.data);
  if (Array.isArray(dados.records)) return dados.records;
  const registrosDados = objeto(dados.messages).records;
  return Array.isArray(registrosDados) ? registrosDados : [];
}

function telefoneDaLinha(linha: Record<string, unknown>): string | null {
  const chave = objeto(linha.key);
  const candidatos = [
    chave.remoteJid,
    chave.remoteJidAlt,
    linha.remoteJid,
    linha.remoteJidAlt,
  ];
  for (const candidato of candidatos) {
    const jid = texto(candidato);
    if (!jid || jid.includes("@g.us") || jid.startsWith("status@")) continue;
    const canonico = telefoneCanonico(jid.split("@")[0]);
    if (canonico) return canonico;
  }
  return null;
}

function idDaLinha(linha: Record<string, unknown>): string {
  const chave = objeto(linha.key);
  const candidatos = [chave.id, linha.messageId, linha.id];
  for (const candidato of candidatos) {
    const id = texto(candidato).trim();
    if (id) return id.slice(0, 200);
  }
  return "";
}

const ROTULOS_MIDIA: Record<string, string> = {
  audioMessage: "áudio",
  imageMessage: "imagem",
  videoMessage: "vídeo",
  documentMessage: "documento",
  stickerMessage: "figurinha",
  locationMessage: "localização",
  contactMessage: "contato",
};

function corpoDaLinha(linha: Record<string, unknown>, tipo: string): string {
  const mensagem = linha.message ?? objeto(linha.data).message;
  const extraido = textoDaMensagem(mensagem).trim();
  const corpo = extraido || `[${ROTULOS_MIDIA[tipo] || "mensagem sem texto"}]`;
  return corpo.length > MAX_TEXTO_IMPORTADO ? `${corpo.slice(0, MAX_TEXTO_IMPORTADO)}…` : corpo;
}

function dataDaLinha(linha: Record<string, unknown>): string | null {
  const candidatos = [linha.messageTimestamp, linha.timestamp, linha.createdAt];
  for (const candidato of candidatos) {
    if (typeof candidato !== "string" && typeof candidato !== "number") continue;
    const data = instanteParaISOOperacional(candidato);
    if (data) return data;
  }
  return null;
}

/** Recupera o id externo de qualquer nota de WhatsApp já registrada. */
export function idExternoDaNotaWhatsapp(nota: Pick<NotaImovel, "id">): string | null {
  const id = nota.id || "";
  if (id.startsWith(PREFIXO_ID_NOTA_IMPORTADA_RECEBIDA)) return id.slice(PREFIXO_ID_NOTA_IMPORTADA_RECEBIDA.length);
  if (id.startsWith(PREFIXO_ID_NOTA_IMPORTADA_ENVIADA)) return id.slice(PREFIXO_ID_NOTA_IMPORTADA_ENVIADA.length);
  if (id.startsWith(PREFIXO_ID_NOTA_ENVIADA)) return id.slice(PREFIXO_ID_NOTA_ENVIADA.length);
  if (id.startsWith(PREFIXO_ID_NOTA) && !id.endsWith(SUFIXO_ID_ENCERRAMENTO)) return id.slice(PREFIXO_ID_NOTA.length);
  return null;
}

/** Traduz a resposta da Evolution em uma prévia cronológica e segura. */
export function mensagensRecentesDaEvolution(
  corpo: unknown,
  telefone: string,
  notasExistentes: NotaImovel[] | null | undefined,
  limite = LIMITE_IMPORTACAO_CONVERSA,
): MensagemRecenteWhatsapp[] {
  const alvo = telefoneCanonico(telefone);
  if (!alvo) return [];
  const existentes = new Set((notasExistentes || []).map(idExternoDaNotaWhatsapp).filter(Boolean));
  const unicas = new Map<string, MensagemRecenteWhatsapp>();

  for (const bruto of registrosDoEnvelope(corpo)) {
    const linha = objeto(bruto);
    if (telefoneDaLinha(linha) !== alvo) continue;
    const id = idDaLinha(linha);
    const data = dataDaLinha(linha);
    if (!id || !data) continue;
    const chave = objeto(linha.key);
    const direcao = chave.fromMe === true || linha.fromMe === true ? "enviada" : "recebida";
    const tipo = texto(linha.messageType) || "desconhecido";
    unicas.set(id, {
      id,
      direcao,
      texto: corpoDaLinha(linha, tipo),
      data,
      tipo,
      jaImportada: existentes.has(id),
    });
  }

  return [...unicas.values()]
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
    .slice(-Math.max(1, Math.min(limite, LIMITE_IMPORTACAO_CONVERSA)));
}

/** Nota de contexto. `lida` reforça que a entrada retroativa não deve cobrar
    ação mesmo se um leitor futuro passar a reconhecer a origem importada. */
export function notaDaMensagemImportada(mensagem: MensagemRecenteWhatsapp): NotaImovel {
  const enviada = mensagem.direcao === "enviada";
  return {
    id: `${enviada ? PREFIXO_ID_NOTA_IMPORTADA_ENVIADA : PREFIXO_ID_NOTA_IMPORTADA_RECEBIDA}${mensagem.id}`,
    texto: `${enviada ? PREFIXO_TEXTO_ENVIADA : PREFIXO_TEXTO_RESPOSTA}${mensagem.texto.trim()}`,
    data: mensagem.data,
    direcao: mensagem.direcao,
    autor: enviada ? "corretor" : "proprietario",
    tipo: mensagem.tipo,
    origem: "importacao-evolution",
    ...(!enviada ? { lida: true } : {}),
  };
}
