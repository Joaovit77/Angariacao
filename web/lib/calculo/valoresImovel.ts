/* ================================================================
   VALORES DO IMÓVEL PARA EXIBIÇÃO (Imóvel de venda, IV-3A)

   Qual preço a tela mostra para um imóvel, conforme a finalidade. É só
   leitura: não muda o que está gravado. Um imóvel de venda que já teve
   aluguel continua com o aluguel guardado; a tela só não o mostra como
   preço da venda.

   - locacao        → aluguel
   - venda          → valor de venda
   - locacao_venda  → os dois, nessa ordem
   - sem finalidade → aluguel, sem rótulo, como sempre foi (o imóvel não é
                      classificado por isso)

   `valor: null` é "não informado" e quem formata decide como mostrar
   (`fmtMoney` mostra "—"); 0 é zero de verdade.
   ================================================================ */
import { FINALIDADES_IMOVEL, ROTULO_FINALIDADE_IMOVEL, type FinalidadeImovel } from "../constantes";
import type { Imovel } from "../tipos";

export interface ValorExibido {
  tipo: "aluguel" | "venda";
  rotulo: "Aluguel" | "Venda";
  valor: number | null;
}

export interface ExibicaoValoresImovel {
  /** `null` quando o imóvel ainda não tem finalidade (ou ela é desconhecida). */
  finalidade: FinalidadeImovel | null;
  rotuloFinalidade: string | null;
  valores: ValorExibido[];
}

const numero = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function exibicaoValoresImovel(
  imovel: Pick<Imovel, "finalidade" | "valorAluguel" | "valorVenda">,
): ExibicaoValoresImovel {
  const finalidade = FINALIDADES_IMOVEL.find((f) => f === imovel.finalidade) ?? null;
  const aluguel: ValorExibido = { tipo: "aluguel", rotulo: "Aluguel", valor: numero(imovel.valorAluguel) };
  const venda: ValorExibido = { tipo: "venda", rotulo: "Venda", valor: numero(imovel.valorVenda) };
  const valores =
    finalidade === "venda" ? [venda] : finalidade === "locacao_venda" ? [aluguel, venda] : [aluguel];
  return {
    finalidade,
    rotuloFinalidade: finalidade ? ROTULO_FINALIDADE_IMOVEL[finalidade] : null,
    valores,
  };
}
