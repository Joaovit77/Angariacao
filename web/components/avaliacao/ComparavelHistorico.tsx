import {
  apresentarFatosHistoricosComparavel,
  type FatosHistoricosComparavel,
} from "@/lib/calculo/historicoComparaveisMercado";
import { fmtDate, fmtMoney } from "@/lib/formatadores";

interface Props {
  historico: FatosHistoricosComparavel | null | undefined;
  hoje: string;
}

export default function ComparavelHistorico({ historico, hoje }: Props) {
  if (!historico) {
    return (
      <div className="avaliacao-comparavel-historico" aria-label="Histórico observado do comparável">
        <span className="avaliacao-comparavel-historico-limite">Histórico limitado</span>
      </div>
    );
  }

  const apresentacao = apresentarFatosHistoricosComparavel(historico, hoje);
  const alteracao = apresentacao.ultimaAlteracaoPreco;
  const temDetalhes = historico.primeiraObservacaoConhecida
    || historico.ultimaObservacaoConhecida
    || apresentacao.textoQuantidadeObservacoes
    || alteracao;

  if (!temDetalhes) {
    return (
      <div className="avaliacao-comparavel-historico" aria-label="Histórico observado do comparável">
        <span className="avaliacao-comparavel-historico-limite">Histórico limitado</span>
      </div>
    );
  }

  const direcaoPreco = alteracao?.diferenca && alteracao.diferenca < 0 ? "Redução" : "Aumento";

  return (
    <div className="avaliacao-comparavel-historico" aria-label="Histórico observado do comparável">
      <div className="avaliacao-comparavel-historico-resumo">
        {apresentacao.textoFrescor && <span>{apresentacao.textoFrescor}</span>}
        {historico.foiReobservado && apresentacao.textoQuantidadeObservacoes && (
          <span>{apresentacao.textoQuantidadeObservacoes}</span>
        )}
        {alteracao && <span>Mudança de preço observada</span>}
        {!apresentacao.textoFrescor && (
          <span className="avaliacao-comparavel-historico-limite">Histórico limitado</span>
        )}
      </div>

      <details className="avaliacao-comparavel-historico-detalhes">
        <summary>Ver histórico observado</summary>
        <div>
          {apresentacao.primeiraObservacaoData && (
            <span>Primeira observação: {fmtDate(apresentacao.primeiraObservacaoData)}</span>
          )}
          {apresentacao.ultimaObservacaoData && (
            <span>Última observação: {fmtDate(apresentacao.ultimaObservacaoData)}</span>
          )}
          {apresentacao.textoQuantidadeObservacoes && (
            <span>{apresentacao.textoQuantidadeObservacoes}.</span>
          )}
          {alteracao && (
            <div className="avaliacao-comparavel-historico-preco">
              <strong>{fmtMoney(alteracao.valorAnterior)} → {fmtMoney(alteracao.valorAtual)}</strong>
              <span>
                {direcaoPreco} observada de {fmtMoney(Math.abs(alteracao.diferenca))} em {fmtDate(alteracao.observadoEm.slice(0, 10))}.
              </span>
              {historico.alteracoesPrecoObservadas.length > 1 && (
                <span>{historico.alteracoesPrecoObservadas.length} mudanças de preço observadas.</span>
              )}
            </div>
          )}
          <p>
            A data representa a última vez em que o anúncio foi efetivamente observado. A ausência
            em coletas posteriores não significa que o imóvel deixou de estar disponível.
          </p>
        </div>
      </details>
    </div>
  );
}
