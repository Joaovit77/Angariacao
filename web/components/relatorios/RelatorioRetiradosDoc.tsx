import type { RelatorioRetirados } from "@/lib/calculo/relatorioRetirados";

/** O mesmo documento atende à tela e à impressão; os números e a formatação
    vêm do núcleo puro, inclusive os valores históricos não informados. */
export default function RelatorioRetiradosDoc({
  r,
  responsavel,
  emitidoEm,
}: {
  r: RelatorioRetirados;
  responsavel: string;
  emitidoEm: string;
}) {
  return (
    <div className="report-doc rr-doc">
      <div className="report-print-header">
        <div className="rph-brand">
          Angario<span className="rph-brand-sub">Imóveis atualmente retirados</span>
        </div>
        <div className="rph-meta">
          <span>Responsável: {responsavel}</span>
          <span>Emitido em: {emitidoEm}</span>
        </div>
      </div>
      <h2>Relatório de imóveis atualmente retirados</h2>
      <p className="report-period">Fotografia da carteira no momento da consulta</p>
      <p className="section-note rr-recorte">
        Inclui somente imóveis que estão retirados agora. Imóveis reativados ficam fora;
        uma nova retirada aparece com os dados atuais. Não representa o histórico de todas as retiradas.
      </p>
      <dl className="rr-filtros-aplicados">
        <div><dt>Motivo</dt><dd>{r.filtrosAplicados.motivo}</dd></div>
        <div><dt>Data da retirada</dt><dd>{r.filtrosAplicados.periodo}</dd></div>
      </dl>
      {r.erroFiltro ? <p className="section-note" role="alert">{r.erroFiltro}</p> : (
        <>
          <div className="rr-resumo" aria-label="Resumo dos imóveis retirados">
            <div className="report-stat">
              <div className="report-stat-label">Total filtrado</div>
              <div className="report-stat-value">{r.total}</div>
            </div>
            <div className="report-stat">
              <div className="report-stat-label">Sem data informada</div>
              <div className="report-stat-value">{r.semData}</div>
            </div>
          </div>
          <div className="report-section-title">Distribuição por motivo</div>
          {r.total === 0 ? (
            <p className="section-note">Nenhum imóvel atualmente retirado corresponde aos filtros aplicados.</p>
          ) : (
            <>
              <ul className="rr-motivos" aria-label="Distribuição dos imóveis retirados por motivo">
                {r.porMotivo.map((motivo) => (
                  <li key={motivo.rotulo}><span>{motivo.rotulo}</span><strong>{motivo.quantidade}</strong></li>
                ))}
              </ul>
              <div className="report-section-title">Imóveis atualmente retirados</div>
              <div className="table-scroll">
                <table className="rr-tabela" aria-label="Imóveis atualmente retirados">
                  <thead>
                    <tr>
                      <th scope="col">Código</th><th scope="col">Referência CRM</th>
                      <th scope="col">Endereço</th><th scope="col">Tipo</th><th scope="col">Status</th>
                      <th scope="col">Data da retirada</th><th scope="col">Motivo</th><th scope="col">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.linhas.map((linha) => (
                      <tr key={linha.id}>
                        <td className="cell-strong">{linha.codigo}</td><td>{linha.referenciaCrm}</td>
                        <td>{linha.endereco}</td><td>{linha.tipo}</td><td>{linha.status}</td>
                        <td>{linha.dataRetirada}</td><td>{linha.motivo}</td>
                        <td className="rr-observacao">{linha.observacao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="section-note rr-nota-dados">
            Dados ausentes aparecem como “Não informado”. O intervalo considera somente datas de retirada
            informadas, com limites inclusivos. Todas as contagens usam o mesmo conjunto da tabela.
          </p>
        </>
      )}
    </div>
  );
}
