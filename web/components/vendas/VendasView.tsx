"use client";

/* Vendas V1 (B3.4a): lista e detalhe, só leitura. Segue o desenho de Repasses: a View carrega
   pela camada de persistência (vendasLeitura, sob RLS), recarrega com o evento
   `vendas:atualizadas` e mostra carregando, erro com nova tentativa e vazio. Criação e operações
   entram nas fatias seguintes; até lá não há botão que grave. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listarOportunidadesVenda, type CodigoErroLeituraVenda, type OportunidadeListadaVenda } from "@/lib/persistencia/vendasLeitura";
import DrawerOportunidadeVenda from "./DrawerOportunidadeVenda";
import "./vendas.css";
import { FILTROS_ETAPA_VENDA, FILTROS_INICIAIS_VENDA, filtrarOportunidadesVenda, type FiltroEtapaVenda, type FiltrosVenda } from "./filtrosVenda";
import {
  MENSAGENS_ERRO_LEITURA_VENDA, ROTULOS_ESTADO_VENDA, detalheImovelVenda, fmtInstanteVenda, fmtValorVenda,
  rotuloInteressadoVenda, tituloImovelVenda, valorPrincipalVenda,
} from "./rotulosVenda";

export const EVENTO_VENDAS_ATUALIZADAS = "vendas:atualizadas";

function rotuloFiltroEtapa(filtro: FiltroEtapaVenda): string {
  if (filtro === "todas") return "Todas as etapas";
  if (filtro === "abertas") return "Abertas";
  return ROTULOS_ESTADO_VENDA[filtro];
}

export default function VendasView() {
  const [itens, setItens] = useState<OportunidadeListadaVenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<CodigoErroLeituraVenda | null>(null);
  const [filtros, setFiltros] = useState<FiltrosVenda>(FILTROS_INICIAIS_VENDA);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const atual = ++pedido.current;
    setCarregando(true);
    setErro(null);
    const resultado = await listarOportunidadesVenda();
    if (atual !== pedido.current) return;
    if (resultado.ok) setItens(resultado.dados); else setErro(resultado.erro);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const inicial = window.setTimeout(() => void carregar(), 0);
    const atualizar = () => void carregar();
    window.addEventListener(EVENTO_VENDAS_ATUALIZADAS, atualizar);
    return () => {
      window.clearTimeout(inicial);
      window.removeEventListener(EVENTO_VENDAS_ATUALIZADAS, atualizar);
      pedido.current += 1;
    };
  }, [carregar]);

  const filtrados = useMemo(() => filtrarOportunidadesVenda(itens, filtros), [itens, filtros]);
  const arquivadasOcultas = filtros.mostrarArquivadas ? 0 : itens.filter((item) => item.oportunidade.arquivadaEm !== null).length;
  // O detalhe lê da lista atual: depois de recarregar, mostra a versão nova (ou fecha, se sumiu).
  const selecionada = selecionadaId === null ? null : itens.find((item) => item.oportunidade.id === selecionadaId) ?? null;
  const fecharDetalhe = useCallback(() => setSelecionadaId(null), []);

  function alterarFiltro<K extends keyof FiltrosVenda>(campo: K, valor: FiltrosVenda[K]) {
    setFiltros((atuais) => ({ ...atuais, [campo]: valor }));
  }

  return (
    <section className="vendas-view" aria-label="Vendas">
      <div className="page-head">
        <div><p className="page-sub">Oportunidades de venda da sua conta, com o interessado, o imóvel e a etapa de cada uma.</p></div>
      </div>

      <div className="vendas-toolbar">
        <input
          type="search"
          className="search-input"
          placeholder="Buscar por interessado ou imóvel"
          aria-label="Buscar por interessado ou imóvel"
          value={filtros.busca}
          onChange={(evento) => alterarFiltro("busca", evento.target.value)}
        />
        <select className="filter-select" aria-label="Filtrar por etapa" value={filtros.etapa} onChange={(evento) => alterarFiltro("etapa", evento.target.value as FiltroEtapaVenda)}>
          {FILTROS_ETAPA_VENDA.map((filtro) => <option key={filtro} value={filtro}>{rotuloFiltroEtapa(filtro)}</option>)}
        </select>
        <label>
          <input type="checkbox" checked={filtros.mostrarArquivadas} onChange={(evento) => alterarFiltro("mostrarArquivadas", evento.target.checked)} />{" "}
          Mostrar arquivadas
        </label>
        {!carregando && !erro && <span className="vendas-result-count" aria-live="polite">{filtrados.length} de {itens.length}</span>}
      </div>

      {carregando ? (
        <div className="card empty-state" role="status"><p>Carregando oportunidades…</p></div>
      ) : erro ? (
        <div className="card empty-state" role="alert">
          <h3>Não foi possível carregar as oportunidades</h3>
          <p>{MENSAGENS_ERRO_LEITURA_VENDA[erro]}</p>
          <button type="button" className="btn" onClick={() => void carregar()}>Tentar novamente</button>
        </div>
      ) : itens.length === 0 ? (
        <div className="card empty-state"><h3>Nenhuma oportunidade de venda</h3><p>Ainda não há oportunidades de venda registradas nesta conta.</p></div>
      ) : filtrados.length === 0 ? (
        <div className="card empty-state">
          <h3>Nenhuma oportunidade neste filtro</h3>
          {arquivadasOcultas > 0 && <p>{arquivadasOcultas} arquivada(s) oculta(s). Marque &quot;Mostrar arquivadas&quot; para incluí-las.</p>}
        </div>
      ) : (
        <div className="card vendas-table-scroll">
          <table className="vendas-list" aria-label="Oportunidades de venda">
            <thead><tr>
              <th scope="col">Interessado</th><th scope="col">Imóvel</th><th scope="col">Etapa</th>
              <th scope="col">Valor</th><th scope="col">Atualizado em</th><th scope="col">Abrir</th>
            </tr></thead>
            <tbody>{filtrados.map(({ oportunidade, interessadoNome, imovel }) => {
              const nome = rotuloInteressadoVenda(interessadoNome);
              const detalhe = detalheImovelVenda(imovel);
              return (
                <tr key={oportunidade.id}>
                  <td><strong>{nome}</strong></td>
                  <td>{tituloImovelVenda(imovel)}{detalhe && <div><small>{detalhe}</small></div>}</td>
                  <td>
                    <span className="badge">{ROTULOS_ESTADO_VENDA[oportunidade.estado]}</span>
                    {oportunidade.arquivadaEm !== null && <div><small>Arquivada</small></div>}
                  </td>
                  <td>{fmtValorVenda(valorPrincipalVenda(oportunidade.estado, oportunidade.valores))}</td>
                  <td>{fmtInstanteVenda(oportunidade.atualizadoEm)}</td>
                  <td>
                    <button type="button" className="btn btn-sm" onClick={() => setSelecionadaId(oportunidade.id)} aria-label={`Abrir oportunidade de ${nome}`}>
                      Abrir
                    </button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {selecionada && <DrawerOportunidadeVenda key={selecionada.oportunidade.id} item={selecionada} aoFechar={fecharDetalhe} />}
    </section>
  );
}
