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

   `valor: null` é "não informado" e aparece como "—"; 0 é zero de verdade
   e aparece como "R$ 0".

   O texto já sai pronto (`texto`), pela mesma regra nas três superfícies
   (card, lista e painel): reais inteiros quando o valor é inteiro, centavos
   só quando existem (IV-3A.2). Depende do valor, não da finalidade: um
   aluguel com centavos também os mostra.
   ================================================================ */
import { FINALIDADES_IMOVEL, ROTULO_FINALIDADE_IMOVEL, type FinalidadeImovel } from "../constantes";
import { fmtMoney, fmtMoneyFull } from "../formatadores";
import type { Imovel } from "../tipos";

export interface ValorExibido {
  tipo: "aluguel" | "venda";
  rotulo: "Aluguel" | "Venda";
  valor: number | null;
  /** `valor` formatado por `fmtValorImovel`. */
  texto: string;
}

export interface ExibicaoValoresImovel {
  /** `null` quando o imóvel ainda não tem finalidade (ou ela é desconhecida). */
  finalidade: FinalidadeImovel | null;
  rotuloFinalidade: string | null;
  valores: ValorExibido[];
}

const numero = (v: number | null | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** "R$ 500.000" para valor inteiro, "R$ 450.000,55" quando há centavos, "—"
    para null. O `fmtMoney` sozinho arredondaria 450000.55 para "R$ 450.001",
    um preço que não é o cadastrado. Os centavos contam depois de arredondar
    para 2 casas (é o que a coluna numeric guarda), então um resíduo de ponto
    flutuante não vira ",00". */
export function fmtValorImovel(v: number | null | undefined): string {
  const n = numero(v);
  if (n === null) return fmtMoney(null);
  return Math.round(Math.abs(n) * 100) % 100 === 0 ? fmtMoney(n) : fmtMoneyFull(n);
}

const valorExibido = (tipo: ValorExibido["tipo"], v: number | null | undefined): ValorExibido => ({
  tipo,
  rotulo: tipo === "aluguel" ? "Aluguel" : "Venda",
  valor: numero(v),
  texto: fmtValorImovel(v),
});

export function exibicaoValoresImovel(
  imovel: Pick<Imovel, "finalidade" | "valorAluguel" | "valorVenda">,
): ExibicaoValoresImovel {
  const finalidade = FINALIDADES_IMOVEL.find((f) => f === imovel.finalidade) ?? null;
  const aluguel = valorExibido("aluguel", imovel.valorAluguel);
  const venda = valorExibido("venda", imovel.valorVenda);
  const valores =
    finalidade === "venda" ? [venda] : finalidade === "locacao_venda" ? [aluguel, venda] : [aluguel];
  return {
    finalidade,
    rotuloFinalidade: finalidade ? ROTULO_FINALIDADE_IMOVEL[finalidade] : null,
    valores,
  };
}
