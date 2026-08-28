import { RESULTADOS_COM_RESPOSTA } from "../constantes";
import type { Imovel } from "../tipos";
import { ehNotaRecebidaNaConversa } from "./notas";

export const STATUS_ORIGEM_SEM_RESPOSTA = "Novo contato";
export const STATUS_DESTINO_SEM_RESPOSTA = "Sem resposta";
export const MIN_TENTATIVAS_PARA_SEM_RESPOSTA = 3;

export type MotivoInelegibilidadeSemResposta =
  | "status_incompativel"
  | "imovel_retirado"
  | "pre_cadastro"
  | "tentativas_insuficientes"
  | "houve_resposta";

/**
 * Regra determinística da ação confirmável do Assistente.
 *
 * A contagem usa tentativas registradas, não mensagens enviadas. Qualquer
 * resposta observada — pelo resultado de uma tentativa ou pelo histórico
 * recebido da conversa — impede concluir que o proprietário segue em silêncio.
 */
export function motivoInelegibilidadeSemResposta(
  imovel: Imovel,
): MotivoInelegibilidadeSemResposta | null {
  if (imovel.status !== STATUS_ORIGEM_SEM_RESPOSTA) return "status_incompativel";
  if (imovel.retirado) return "imovel_retirado";
  if (imovel.preCadastro) return "pre_cadastro";

  const tentativas = imovel.tentativas || [];
  if (tentativas.length < MIN_TENTATIVAS_PARA_SEM_RESPOSTA) {
    return "tentativas_insuficientes";
  }

  const resultadosComResposta = new Set<string>(RESULTADOS_COM_RESPOSTA);
  if (tentativas.some((tentativa) => resultadosComResposta.has(tentativa.resultado))) {
    return "houve_resposta";
  }
  if ((imovel.notas || []).some(ehNotaRecebidaNaConversa)) return "houve_resposta";

  return null;
}

export function imovelElegivelParaSemResposta(imovel: Imovel): boolean {
  return motivoInelegibilidadeSemResposta(imovel) === null;
}
