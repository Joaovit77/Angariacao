import type { PedidoAssistente, RespostaAssistente } from "@/lib/assistente/tipos";

let concluir: (() => void) | null = null;
export function concluirConsultaSintetica() { concluir?.(); concluir = null; }
export function perguntarAoAssistente(_pedido: PedidoAssistente, opcoes: { signal?: AbortSignal } = {}): Promise<RespostaAssistente> {
  return new Promise((resolve) => {
    concluir = () => resolve({ ok: true, modelo: "sintetico", mensagem: { id: crypto.randomUUID(), papel: "assistente", texto: "Resposta sintética preservada após o modal." } });
    opcoes.signal?.addEventListener("abort", () => {
      concluir = null;
      resolve({ ok: false, codigo: "cancelado", erro: "Consulta sintética cancelada." });
    }, { once: true });
  });
}
function foraDoEscopo(): never { throw new Error("Ação fora do escopo do smoke visual."); }
export const prepararAcaoAssistente = foraDoEscopo;
export const confirmarAcaoDoAssistente = foraDoEscopo;
export const cancelarAcaoDoAssistente = foraDoEscopo;
export const executarAnaliseAprofundada = foraDoEscopo;
