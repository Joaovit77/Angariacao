/* ================================================================
   FINALIDADE NOS FLUXOS OPERACIONAIS (IV-4)

   Onde a finalidade do imóvel (`Imovel.finalidade`) decide se um fluxo
   pensado para locação pode rodar. A fonte de verdade de cada guarda é o
   servidor; este módulo é a mesma regra no app, para a tela não oferecer o
   que o banco vai recusar. Cada regra que também existe no SQL tem um teste
   amarrando as duas (`imovel-venda-iv4a-banco.test.ts`).

   IV-4A: o ledger de locação (prévia, confirmação, locação, repasse e
   Locado por esse fluxo), guardado em `private.prever_locacoes`.

   IV-4B1: a verificação de disponibilidade de LOCAÇÃO, guardada no worker
   de mensagens agendadas (`decisaoMensagemDisponibilidade`), no instante do
   envio. Sem SQL: o worker relê o imóvel e decide ali.

   Cada fluxo tem o seu predicado, mesmo quando a matriz hoje é igual: são
   contratos diferentes e podem divergir (o imóvel das duas finalidades
   depois de Locado, por exemplo), sem que mudar um arraste o outro.
   ================================================================ */
import type { FinalidadeImovel } from "../constantes";

/** Código do erro por item que `private.prever_locacoes` devolve para venda. */
export const CODIGO_FINALIDADE_VENDA_LOCACAO = "finalidade_venda";

/** Mesmo texto do erro do banco, para a tela e o servidor dizerem igual. */
export const MENSAGEM_FINALIDADE_VENDA_LOCACAO = "Imóvel com finalidade Venda não pode ser marcado como locado.";

/**
 * O imóvel pode entrar no fluxo de locação ("Marcar como locado")?
 *
 * Só `venda` fica de fora. `locacao` e `locacao_venda` passam, e o imóvel sem
 * finalidade (null ou campo ausente) também: é "não informado", e passar é
 * compatibilidade com o comportamento de antes, não classificação como
 * locação. A comparação é com `venda`, nunca "diferente de locação", que
 * barraria o legado e o imóvel das duas finalidades.
 */
export function podeParticiparFluxoLocacao(finalidade: FinalidadeImovel | null | undefined): boolean {
  return finalidade !== "venda";
}

/** Causa do não envio de uma verificação de disponibilidade para imóvel de
    venda: vai no detalhe do evento do worker. O motivo gravado na mensagem
    continua `imovel-indisponivel`; não existe motivo próprio no banco. */
export const CAUSA_FINALIDADE_VENDA_DISPONIBILIDADE = "finalidade-venda";

/**
 * O imóvel pode receber a verificação de disponibilidade de LOCAÇÃO ("ainda
 * está disponível para locação?")?
 *
 * Só `venda` fica de fora: o proprietário que só vende não recebe pergunta de
 * locação. `locacao` e `locacao_venda` passam (o lado locação do imóvel das
 * duas finalidades se encerra pelo status, Locado, e não por aqui), e o
 * imóvel sem finalidade (null ou campo ausente) também passa, por
 * compatibilidade, sem ser classificado como locação.
 *
 * Contrato próprio, separado de {@link podeParticiparFluxoLocacao}: hoje as
 * duas matrizes coincidem, e há teste fixando cada uma.
 */
export function participaVerificacaoDisponibilidadeLocacao(finalidade: FinalidadeImovel | null | undefined): boolean {
  return finalidade !== "venda";
}
