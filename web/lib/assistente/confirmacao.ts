import type { AcaoAssistente, ItemHistoricoAssistente } from "./tipos";

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

export function textoResultadoConfirmacao(acao: AcaoAssistente): string {
  if (acao.estado === "succeeded") {
    if (acao.tipo === "alterar_status_sem_resposta_em_lote") {
      const alterados = acao.resultado?.totalAlterados || 0;
      const ignorados = acao.resultado?.totalIgnorados || 0;
      if (alterados === 0) {
        return `Nenhum imóvel foi alterado. ${ignorados === 1 ? "1 imóvel deixou" : `${ignorados} imóveis deixaram`} de ser elegível desde a preparação.`;
      }
      const sucesso = `Pronto. ${alterados === 1 ? "1 imóvel foi alterado" : `${alterados} imóveis foram alterados`} para Sem resposta. A alteração foi registrada no histórico de cada imóvel.`;
      return ignorados > 0
        ? `${sucesso}\n\n${ignorados === 1 ? "1 imóvel não foi alterado porque deixou" : `${ignorados} imóveis não foram alterados porque deixaram`} de ser elegível desde a preparação.`
        : sucesso;
    }
    if (acao.tipo === "agendar_visita") return `✓ Visita agendada\n\n${acao.entidade.codigo}\n${acao.dados.data} às ${acao.dados.hora}`;
    if (acao.tipo === "registrar_tentativa") return `✓ Tentativa registrada\n\n${acao.entidade.codigo}\n${acao.dados.canal} · ${acao.dados.resultado}`;
    if (acao.tipo === "criar_followup") return `✓ Follow-up criado\n\n${acao.entidade.codigo}\n${acao.dados.data}${acao.dados.hora ? ` às ${acao.dados.hora}` : ""}`;
    if (acao.tipo === "reagendar_followup") return `✓ Follow-up reagendado\n\n${acao.entidade.codigo}\n${acao.dados.data}${acao.dados.hora ? ` às ${acao.dados.hora}` : ""}`;
    if (acao.tipo === "concluir_followup") return `✓ Follow-up concluído\n\n${acao.entidade.codigo}\n${acao.dados.titulo}`;
    return `✓ Compromisso criado\n\n${acao.dados.titulo}\n${acao.dados.data}${acao.dados.hora ? ` às ${acao.dados.hora}` : ""}`;
  }
  if (acao.estado === "expired") return "A confirmação expirou. Prepare a ação novamente; nada foi alterado.";
  if (acao.estado === "cancelled") return "Ação cancelada. Nada foi alterado.";
  return acao.erro || "Não foi possível concluir a ação. Nenhuma alteração adicional foi realizada.";
}
