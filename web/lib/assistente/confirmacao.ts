import type { ItemHistoricoAssistente } from "./tipos";

export type DecisaoTextualAcao = "confirmar" | "cancelar";

const CONFIRMACOES = new Set([
  "confirmar",
  "confirmo",
  "confirmado",
  "pode confirmar",
  "pode criar",
  "pode fazer",
  "pode executar",
  "pode agendar",
  "claro pode criar",
  "ok pode criar",
  "sim crie",
  "sim agende",
  "sim pode criar",
  "sim pode fazer",
  "sim pode executar",
]);

const CANCELAMENTOS = new Set([
  "cancelar",
  "cancele",
  "pode cancelar",
  "desisto",
  "nao crie",
  "nao faca",
  "deixa pra la",
  "deixe pra la",
]);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Só aceita frases completas e inequívocas. Um "sim" isolado ou uma frase
    que contenha outros pedidos nunca atravessa a barreira de confirmação. */
export function classificarDecisaoTextual(texto: string): DecisaoTextualAcao | null {
  const valor = normalizar(texto);
  if (CONFIRMACOES.has(valor)) return "confirmar";
  if (CANCELAMENTOS.has(valor)) return "cancelar";
  return null;
}

export function acaoPendenteMaisRecente(
  historico: ItemHistoricoAssistente[],
): NonNullable<ItemHistoricoAssistente["acao"]> | null {
  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    const acao = historico[indice]?.acao;
    if (acao) return acao.estado === "ready_for_confirmation" ? acao : null;
  }
  return null;
}
