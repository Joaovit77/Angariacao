"use client";

import { useId, useState } from "react";
import { ROTULO_FINALIDADE_IMOVEL, ROTULO_FINALIDADE_IMOVEL_DESCONHECIDA } from "@/lib/constantes";
import { fmtValorImovel } from "@/lib/calculo/valoresImovel";
import type { ErroLeituraImoveisVenda, ImovelCandidatoVenda } from "@/lib/persistencia/vendasImoveisLeitura";
import "./seletorImovelVenda.css";

export type EstadoSeletorImovelVenda =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro"; readonly erro: ErroLeituraImoveisVenda }
  | { readonly tipo: "pronto"; readonly imoveis: readonly ImovelCandidatoVenda[] };

export interface SeletorImovelVendaProps {
  readonly estado: EstadoSeletorImovelVenda;
  /** Seleção do formulário em memória. Este bloco não executa persistência. */
  readonly selecionadoId?: string | null;
  readonly onSelecionar?: (imovel: ImovelCandidatoVenda) => void;
  readonly onTentarNovamente?: () => void;
}

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const ERROS: Record<ErroLeituraImoveisVenda, string> = {
  "nao-autenticado": "Sua sessão expirou. Entre novamente para consultar sua carteira.",
  "transporte-indisponivel": "Verifique a internet e tente novamente.",
  "resposta-invalida": "Os dados recebidos não puderam ser apresentados. Tente novamente.",
  "falha-interna": "Tente novamente em alguns instantes.",
};

/** Bloco independente para futura seleção. Não monta a página Vendas nem cria oportunidade. */
export default function SeletorImovelVenda({ estado, selecionadoId = null, onSelecionar, onTentarNovamente }: SeletorImovelVendaProps) {
  const id = useId();
  const [busca, setBusca] = useState("");
  const imoveis = estado.tipo === "pronto" ? estado.imoveis : [];
  const termo = normalizar(busca);
  const filtrados = imoveis.filter((i) => normalizar([i.codigo, i.endereco, i.bairro, i.referenciaCrm].filter(Boolean).join(" ")).includes(termo));
  const selecionado = imoveis.find((i) => i.id === selecionadoId);

  return (
    <section className="vendas-imoveis-seletor" aria-labelledby={`${id}-titulo`} aria-busy={estado.tipo === "carregando"}>
      <div className="vendas-imoveis-cabecalho">
        <h3 id={`${id}-titulo`}>Imóveis da carteira</h3>
        <p>Consulte a finalidade e a situação atual de cada imóvel.</p>
      </div>
      {estado.tipo === "carregando" ? <p role="status">Carregando imóveis…</p> : null}
      {estado.tipo === "erro" ? (
        <div role="alert" className="vendas-imoveis-estado">
          <strong>Não foi possível carregar os imóveis.</strong>
          <p>{ERROS[estado.erro]}</p>
          {onTentarNovamente ? <button type="button" className="btn btn-secondary" onClick={onTentarNovamente}>Tentar novamente</button> : null}
        </div>
      ) : null}
      {estado.tipo === "pronto" ? (
        <>
          <label className="vendas-imoveis-busca" htmlFor={`${id}-busca`}>
            Buscar imóvel
            <input id={`${id}-busca`} type="search" className="search-input" placeholder="Código, endereço ou bairro" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <p className="vendas-imoveis-contagem" role="status">{filtrados.length} de {imoveis.length} imóveis</p>
          {selecionado ? <p className="vendas-imoveis-selecao">Selecionado: {selecionado.codigo || selecionado.endereco || "Imóvel sem código"}</p> : null}
          {imoveis.length === 0 ? <p className="vendas-imoveis-estado">Nenhum imóvel na carteira.</p> : filtrados.length === 0 ? <p className="vendas-imoveis-estado">Nenhum imóvel encontrado nesta busca.</p> : (
            <ul className="vendas-imoveis-lista" aria-label="Imóveis candidatos">
              {filtrados.map((imovel) => {
                const venda = imovel.finalidade === "venda" || imovel.finalidade === "locacao_venda";
                return (
                  <li key={imovel.id} className="vendas-imoveis-opcao" data-selecionado={imovel.id === selecionadoId}>
                    <div className="vendas-imoveis-identificacao">
                      {onSelecionar ? <input type="radio" name={`${id}-imovel`} aria-label={`Selecionar ${imovel.codigo || imovel.endereco || "imóvel sem código"}`} checked={imovel.id === selecionadoId} onChange={() => onSelecionar(imovel)} /> : null}
                      <div>
                        <strong>{imovel.codigo || "Sem código"}</strong>
                        <p>{imovel.endereco || "Endereço não informado"}</p>
                        <p className="vendas-imoveis-local">{[imovel.bairro, imovel.cidade, imovel.estado, imovel.referenciaCrm && `Ref. ${imovel.referenciaCrm}`, imovel.unidade && `Unidade ${imovel.unidade}`, imovel.bloco && `Bloco ${imovel.bloco}`].filter(Boolean).join(" · ")}</p>
                      </div>
                      {imovel.retirado ? <span className="vendas-imoveis-retirado">Retirado</span> : null}
                    </div>
                    <dl className="vendas-imoveis-dados">
                      <div><dt>Finalidade</dt><dd>{imovel.finalidade === null ? ROTULO_FINALIDADE_IMOVEL_DESCONHECIDA : ROTULO_FINALIDADE_IMOVEL[imovel.finalidade]}</dd></div>
                      <div><dt>Status</dt><dd>{imovel.status}</dd></div>
                      {venda ? <div><dt>Valor de venda</dt><dd>{imovel.valorVenda === null ? "Não informado" : fmtValorImovel(imovel.valorVenda)}</dd></div> : null}
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
