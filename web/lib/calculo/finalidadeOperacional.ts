/* ================================================================
   FINALIDADE NOS FLUXOS OPERACIONAIS (IV-4)

   Onde a finalidade do imóvel (`Imovel.finalidade`) decide se um fluxo
   pensado para locação pode rodar. A fonte de verdade de cada guarda é o
   servidor; este módulo é a mesma regra no app, para a tela não oferecer o
   que o banco vai recusar. Cada regra que também existe no SQL tem um teste
   amarrando as duas (`imovel-venda-iv4a-banco.test.ts`).

   Por enquanto só o IV-4A: o ledger de locação (prévia, confirmação,
   locação, repasse e Locado por esse fluxo), guardado em
   `private.prever_locacoes`.
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
