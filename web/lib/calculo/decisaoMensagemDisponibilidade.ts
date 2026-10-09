/* ================================================================
   DECISÃO ANTES DE ENVIAR UMA VERIFICAÇÃO DE DISPONIBILIDADE (M3)

   "Agendar" não é "garantir o envio": a mensagem foi válida quando nasceu e
   pode ter deixado de fazer sentido antes da data. Esta função responde, no
   instante do envio e sem banco, o que fazer com uma mensagem do tipo
   `verificacao-disponibilidade`, a partir do estado atual do imóvel e da
   avaliação temporal do M2 (`calculo/evidenciaDisponibilidade.ts`):

   - `cancelar`   o imóvel saiu da carteira ou fechou (`retirado`, ou status
                  fora de `DISPONIBILIDADE_STATUS_ALVO`, a mesma régua do
                  lembrete em `deveTerVerificacaoAberta`). Pergunta sem
                  sentido; cancela com motivo auditável. Cobre também o
                  `indisponivel` do M2, que só nasce desses mesmos estados.
                  Também cancela o imóvel com finalidade `venda` (IV-4B1):
                  a pergunta é de locação. Mesmo motivo de banco
                  (`imovel-indisponivel`), com `causa: "finalidade-venda"`
                  para o evento. As causas acima vêm antes: imóvel retirado,
                  Locado ou fora da fase cancela pela régua de sempre, com a
                  evidência de sempre, qualquer que seja a finalidade.
   - `reagendar`  há evidência positiva vigente em E e a mensagem cairia antes
                  de `E + VERIFICACAO_DISPONIBILIDADE_DIAS`: a pergunta já foi
                  respondida naquele contato, e a próxima verificação conta a
                  partir dele. Mesma cadência do lembrete da Agenda, mesma
                  constante. Nada é cancelado: a mensagem continua existindo,
                  só muda de dia (mesma hora do dia).
   - `enviar`     sem evidência estruturada, ou evidência `conflitante` (o M2
                  não conseguiu ordenar positiva e negativa). Nos dois casos
                  a função não inventa conclusão: a mensagem segue o fluxo de
                  sempre. `conflitante` não é disponível nem indisponível.

   Mensagem `livre` nunca passa por aqui: quem chama filtra pelo `tipo`.
   ================================================================ */
import { VERIFICACAO_DISPONIBILIDADE_DIAS } from "../constantes";
import {
  addDaysISO,
  dataOperacionalDeTimestamp,
  inicioDoDiaOperacionalISO,
  isoDeTimestamp,
  timestampDeIso,
} from "../datas";
import type { MensagemAgendada, MotivoCancelamentoMensagemAgendada } from "../mensagensAgendadas";
import type { Imovel } from "../tipos";
import type { AvaliacaoTemporalDisponibilidade, EvidenciaDisponibilidade } from "./evidenciaDisponibilidade";
import {
  CAUSA_FINALIDADE_VENDA_DISPONIBILIDADE,
  participaVerificacaoDisponibilidadeLocacao,
} from "./finalidadeOperacional";
import { deveTerVerificacaoAberta } from "./followup";

export type DecisaoMensagemDisponibilidade =
  | {
      acao: "enviar";
      estado: AvaliacaoTemporalDisponibilidade["estado"];
      /** Por que não houve transição, em vocabulário fechado. */
      motivo: "sem-evidencia" | "conflitante" | "cadencia-cumprida";
    }
  | {
      acao: "cancelar";
      motivo: Extract<MotivoCancelamentoMensagemAgendada, "imovel-indisponivel" | "imovel-excluido">;
      evidencia: EvidenciaDisponibilidade | null;
      fato: string;
      /** Só quando o cancelamento não vem do estado do imóvel, e sim da
          finalidade `venda` (IV-4B1). Ausente nas demais causas. */
      causa?: typeof CAUSA_FINALIDADE_VENDA_DISPONIBILIDADE;
    }
  | {
      acao: "reagendar";
      motivo: "disponibilidade-confirmada";
      /** Instante civil da evidência positiva vigente (E). */
      dataEvidencia: string;
      /** Dia civil operacional em que a mensagem passa a vencer (E + cadência). */
      novoDiaEnvio: string;
      /** Novo `data_envio` (ISO com fuso), na mesma hora do dia do original. */
      novaDataEnvio: string;
      evidencia: EvidenciaDisponibilidade;
    };

export interface EntradaDecisaoMensagemDisponibilidade {
  mensagem: Pick<MensagemAgendada, "tipo" | "dataEnvio" | "imovelId">;
  /** `null` quando a linha do imóvel não existe mais para esta conta. */
  imovel: Imovel | null;
  avaliacao: AvaliacaoTemporalDisponibilidade | null;
}

/** Dia civil operacional (America/Sao_Paulo) de um `data_envio`. */
export function diaOperacionalDoEnvio(dataEnvio: string): string | null {
  const instante = timestampDeIso(dataEnvio);
  return instante === null ? null : dataOperacionalDeTimestamp(instante);
}

/**
 * Move um `data_envio` para outro dia civil operacional preservando a hora do
 * dia. Devolve `null` quando alguma das datas não é válida.
 */
export function moverEnvioParaDia(dataEnvio: string, novoDia: string): string | null {
  const instante = timestampDeIso(dataEnvio);
  const diaAtual = diaOperacionalDoEnvio(dataEnvio);
  if (instante === null || !diaAtual) return null;
  const inicioAtual = timestampDeIso(inicioDoDiaOperacionalISO(diaAtual));
  const inicioNovo = timestampDeIso(inicioDoDiaOperacionalISO(novoDia));
  if (inicioAtual === null || inicioNovo === null) return null;
  const deslocamentoNoDia = instante - inicioAtual;
  return isoDeTimestamp(inicioNovo + deslocamentoNoDia);
}

/** Dia civil em que a próxima verificação passa a fazer sentido depois de
    uma evidência positiva em `dataEvidencia` (civil, com ou sem hora). */
export function diaDaProximaVerificacao(dataEvidencia: string): string | null {
  return addDaysISO(dataEvidencia.slice(0, 10), VERIFICACAO_DISPONIBILIDADE_DIAS);
}

/** Imóvel de venda não recebe a pergunta de locação (IV-4B1). */
function cancelarPorFinalidadeVenda(): DecisaoMensagemDisponibilidade {
  return {
    acao: "cancelar",
    motivo: "imovel-indisponivel",
    evidencia: null,
    fato: "Imóvel com finalidade Venda: a verificação de disponibilidade é de locação.",
    causa: CAUSA_FINALIDADE_VENDA_DISPONIBILIDADE,
  };
}

export function decidirMensagemDisponibilidade(
  entrada: EntradaDecisaoMensagemDisponibilidade,
): DecisaoMensagemDisponibilidade {
  const { mensagem, imovel, avaliacao } = entrada;
  if (mensagem.tipo !== "verificacao-disponibilidade") {
    return { acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" };
  }

  if (mensagem.imovelId && !imovel) {
    return {
      acao: "cancelar",
      motivo: "imovel-excluido",
      evidencia: null,
      fato: "O imóvel desta mensagem não existe mais nesta conta.",
    };
  }
  if (!imovel || !avaliacao) {
    // Imóvel sem avaliação (só quem chama sem o M2 chega aqui): a venda
    // explícita não sai mesmo assim; o resto segue como sempre.
    if (imovel && !participaVerificacaoDisponibilidadeLocacao(imovel.finalidade)) return cancelarPorFinalidadeVenda();
    // Sem imóvel vinculado não há o que reavaliar: comportamento de sempre.
    return { acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" };
  }

  const negativa = avaliacao.negativaMaisRecente;
  if (imovel.retirado || !deveTerVerificacaoAberta(imovel.status) || avaliacao.estado === "indisponivel") {
    return {
      acao: "cancelar",
      motivo: "imovel-indisponivel",
      evidencia: negativa,
      fato: negativa?.fato
        ?? (imovel.retirado
          ? "Proprietário retirou o imóvel da carteira."
          : `Imóvel em "${imovel.status}", fora da fase em que se confirma disponibilidade.`),
    };
  }

  // Ainda elegível pelo status: a finalidade decide antes de qualquer
  // reagendamento ou envio (e, no worker, antes da consolidação).
  if (!participaVerificacaoDisponibilidadeLocacao(imovel.finalidade)) return cancelarPorFinalidadeVenda();

  if (avaliacao.estado === "disponivel" && avaliacao.dataEvidenciaPositiva && avaliacao.positivaMaisRecente) {
    const novoDia = diaDaProximaVerificacao(avaliacao.dataEvidenciaPositiva);
    const diaEnvio = diaOperacionalDoEnvio(mensagem.dataEnvio);
    if (novoDia && diaEnvio && diaEnvio < novoDia) {
      const novaDataEnvio = moverEnvioParaDia(mensagem.dataEnvio, novoDia);
      if (novaDataEnvio) {
        return {
          acao: "reagendar",
          motivo: "disponibilidade-confirmada",
          dataEvidencia: avaliacao.dataEvidenciaPositiva,
          novoDiaEnvio: novoDia,
          novaDataEnvio,
          evidencia: avaliacao.positivaMaisRecente,
        };
      }
    }
    return { acao: "enviar", estado: "disponivel", motivo: "cadencia-cumprida" };
  }

  return {
    acao: "enviar",
    estado: avaliacao.estado,
    motivo: avaliacao.estado === "conflitante" ? "conflitante" : "sem-evidencia",
  };
}
