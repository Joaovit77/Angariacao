import {
  destinoWhatsappPorJidsConhecidos,
  idExternoDaNotaWhatsapp,
  jidsDaEvolutionPorIdsConhecidos,
} from "@/lib/calculo/importacaoConversaWhatsapp";
import type { NotaImovel } from "@/lib/tipos";

const MAX_ANCORAS_ENVIO = 6;

async function buscarMensagemPorId(
  base: string,
  instancia: string,
  token: string,
  id: string,
): Promise<unknown | null> {
  try {
    const resposta = await fetch(`${base}/chat/findMessages/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify({
        where: { key: { id } },
        take: 20,
        skip: 0,
        orderBy: { messageTimestamp: "desc" },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resposta.ok) return null;
    return await resposta.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Recupera o JID observado na conversa sem aceitar identificador do browser.
    Os únicos vínculos válidos são ids externos persistidos nas notas do imóvel
    lido sob RLS; isso cobre a troca número ↔ LID sem abrir envio arbitrário. */
export async function destinoAncoradoDaConversa(
  base: string,
  instancia: string,
  token: string,
  telefone: string,
  notas: NotaImovel[],
): Promise<string | null> {
  const ids = notas
    .map(idExternoDaNotaWhatsapp)
    .filter((id): id is string => !!id)
    .slice(-MAX_ANCORAS_ENVIO)
    .reverse();
  if (ids.length === 0) return null;
  const respostas = (
    await Promise.all(ids.map((id) => buscarMensagemPorId(base, instancia, token, id)))
  ).filter((corpo): corpo is unknown => corpo !== null);
  const jids = jidsDaEvolutionPorIdsConhecidos(respostas, ids);
  return destinoWhatsappPorJidsConhecidos(jids, telefone);
}
