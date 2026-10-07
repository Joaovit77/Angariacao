/* Valores do imóvel no Pipeline (Imóvel de venda, IV-3A): card do Kanban,
   célula da lista e painel lateral usam a mesma regra
   (`exibicaoValoresImovel`), para nenhuma superfície mostrar o aluguel antigo
   como preço de um imóvel de venda. Só leitura. */
import { exibicaoValoresImovel } from "@/lib/calculo/valoresImovel";
import { fmtMoney } from "@/lib/formatadores";
import type { Imovel } from "@/lib/tipos";

type ImovelComValores = Pick<Imovel, "finalidade" | "valorAluguel" | "valorVenda">;

/** Card e lista. Sem finalidade, o aluguel sozinho, como sempre foi. Com
    finalidade, cada valor leva o rótulo (é ele que diz se é aluguel ou
    venda), um por linha; "Locação e venda" mostra os dois. */
export function ValoresImovelCompacto({ imovel }: { imovel: ImovelComValores }) {
  const { finalidade, valores } = exibicaoValoresImovel(imovel);
  if (!finalidade) return <>{fmtMoney(valores[0].valor)}</>;
  return (
    <>
      {valores.map((v) => (
        <span key={v.tipo} className="valor-imovel-linha" data-valor={v.tipo}>
          {v.rotulo} {fmtMoney(v.valor)}
        </span>
      ))}
    </>
  );
}

/** Linhas do painel lateral: a finalidade sempre ("Não informado" quando não
    há) e os valores dela. Sem finalidade, o "Valor" de antes, que é o
    aluguel. */
export function linhasValoresDrawer(imovel: ImovelComValores): { label: string; value: string }[] {
  const { finalidade, rotuloFinalidade, valores } = exibicaoValoresImovel(imovel);
  const linhaFinalidade = { label: "Finalidade", value: rotuloFinalidade ?? "Não informado" };
  if (!finalidade) return [linhaFinalidade, { label: "Valor", value: fmtMoney(valores[0].valor) }];
  return [
    linhaFinalidade,
    ...valores.map((v) => ({
      label: v.tipo === "aluguel" ? "Valor do aluguel" : "Valor de venda",
      value: fmtMoney(v.valor),
    })),
  ];
}
