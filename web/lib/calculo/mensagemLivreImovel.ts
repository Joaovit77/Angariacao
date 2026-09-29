/* ================================================================
   MENSAGEM LIVRE VINCULADA A IMÓVEL QUE SAIU DA CARTEIRA

   Uma mensagem `livre` com `imovel_id` não passa pela revalidação da
   verificação de disponibilidade (M2/M4). Sem esta regra, nada impedia que
   ela saísse para um imóvel já Perdido: foi o que aconteceu com o LD-163 em
   26/09/2026, Perdido desde 12/08, com uma mensagem agendada em 11/08.

   A lista é deliberadamente estreita, e NÃO é o alvo do M4
   (`DISPONIBILIDADE_STATUS_ALVO`): uma livre para imóvel em negociação,
   pausado ou recém-captado continua legítima. Só bloqueia o que é saída
   definitiva da carteira. Reconquista de imóvel Perdido, se um dia existir,
   será um fluxo explícito separado, não uma exceção aqui.

   Um núcleo só, lido pelo worker (no instante do envio) e pelo modal (na
   criação), para as duas pontas não divergirem.
   ================================================================ */

export const STATUS_BLOQUEIAM_MENSAGEM_LIVRE = ["Perdido", "Locado"] as const;

export interface EstadoImovelMensagemLivre {
  status: string | null | undefined;
  retirado?: boolean | null;
}

/** O imóvel não aceita mais mensagem livre vinculada a ele. */
export function imovelBloqueiaMensagemLivre(imovel: EstadoImovelMensagemLivre): boolean {
  if (imovel.retirado === true) return true;
  const bloqueados: readonly string[] = STATUS_BLOQUEIAM_MENSAGEM_LIVRE;
  return bloqueados.includes(imovel.status ?? "");
}

export const AVISO_IMOVEL_INATIVO_MENSAGEM =
  "Este imóvel não está ativo (Perdido, Locado ou retirado). Não é possível agendar mensagem vinculada a ele.";
