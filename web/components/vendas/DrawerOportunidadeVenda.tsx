"use client";

/* Detalhe de uma oportunidade de venda (B3.4a): só leitura. Estilos próprios de Vendas
   e tokens de camadas compartilhados. As ações de etapa, imóvel, valores, ganho, perda e
   arquivamento entram no B3.4c; aqui não existe nenhum botão que grave. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { EventoPersistidoVenda } from "@/lib/persistencia/vendasComandos";
import { listarEventosVenda, type CodigoErroLeituraVenda, type OportunidadeListadaVenda } from "@/lib/persistencia/vendasLeitura";
import {
  MENSAGENS_ERRO_LEITURA_VENDA, ROTULOS_ESTADO_VENDA, ROTULOS_EVENTO_VENDA, ROTULOS_MOTIVO_PERDA_VENDA, ROTULOS_VALOR_VENDA,
  TEXTO_NAO_INFORMADO_VENDA, TEXTO_SEM_IMOVEL_VENDA, detalheEventoVenda, detalheImovelVenda, fmtDataFatoVenda, fmtInstanteVenda,
  fmtValorVenda, origemImovelVenda, rotuloInteressadoVenda, rotuloOrigemVenda, tituloImovelVenda,
} from "./rotulosVenda";

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="drawer-info-item">
      <span>{rotulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

type Historico =
  | { estado: "carregando" }
  | { estado: "erro"; codigo: CodigoErroLeituraVenda }
  | { estado: "pronto"; eventos: EventoPersistidoVenda[] };

export default function DrawerOportunidadeVenda({ item, aoFechar }: { item: OportunidadeListadaVenda; aoFechar: () => void }) {
  const { oportunidade, interessadoNome, imovel } = item;
  const idTitulo = useId();
  const fechar = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLElement>(null);
  const [historico, setHistorico] = useState<Historico>({ estado: "carregando" });

  const pedido = useRef(0);

  const carregarHistorico = useCallback(async () => {
    const atual = ++pedido.current;
    setHistorico({ estado: "carregando" });
    const resultado = await listarEventosVenda(oportunidade.id);
    if (atual !== pedido.current) return; // Uma leitura mais nova já foi pedida; esta resposta é descartada.
    setHistorico(resultado.ok ? { estado: "pronto", eventos: resultado.dados } : { estado: "erro", codigo: resultado.erro });
  }, [oportunidade.id]);

  // A versão entra na dependência: quando a lista recarrega com outra versão, o histórico acompanha.
  useEffect(() => {
    const inicial = window.setTimeout(() => void carregarHistorico(), 0);
    return () => { window.clearTimeout(inicial); pedido.current += 1; };
  }, [carregarHistorico, oportunidade.versao]);

  // Teclado: abre com o foco no fechar, Esc fecha e o foco volta para quem abriu.
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fechar.current?.focus();
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") { evento.preventDefault(); aoFechar(); return; }
      if (evento.key !== "Tab") return;
      const controles = [...(painel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? [])];
      const primeiro = controles[0], ultimo = controles.at(-1);
      if (!primeiro || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault(); ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault(); primeiro.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      if (anterior?.isConnected) anterior.focus();
    };
  }, [aoFechar]);

  const encerramento = oportunidade.encerramento;
  const detalheImovel = detalheImovelVenda(imovel);

  return (
    <>
      <div className="vendas-drawer-backdrop" aria-hidden="true" onClick={aoFechar}></div>
      <aside ref={painel} className="vendas-drawer" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <div className="vendas-drawer-head">
          <div>
            <div className="vendas-drawer-kicker">Oportunidade de venda</div>
            <h2 id={idTitulo}>{rotuloInteressadoVenda(interessadoNome)}</h2>
          </div>
          <button ref={fechar} type="button" className="icon-btn" onClick={aoFechar} aria-label="Fechar detalhes da oportunidade" title="Fechar painel">
            ×
          </button>
        </div>
        <div className="vendas-drawer-body">
          <div className="drawer-status-line">
            <span className="badge">{ROTULOS_ESTADO_VENDA[oportunidade.estado]}</span>
            {oportunidade.arquivadaEm !== null && <span className="badge">Arquivada</span>}
          </div>
          <div className="drawer-info-grid">
            <Info rotulo="Etapa" valor={ROTULOS_ESTADO_VENDA[oportunidade.estado]} />
            <Info rotulo="Criada em" valor={fmtInstanteVenda(oportunidade.criadoEm)} />
            <Info rotulo="Atualizada em" valor={fmtInstanteVenda(oportunidade.atualizadoEm)} />
            <Info rotulo="Interessado" valor={rotuloInteressadoVenda(interessadoNome)} />
          </div>

          <section className="drawer-section" aria-label="Imóvel">
            <div className="drawer-section-title">Imóvel</div>
            {imovel.tipo === "nenhum" ? (
              <div className="drawer-notes">{TEXTO_SEM_IMOVEL_VENDA}</div>
            ) : (
              <div className="drawer-notes">
                <strong>{tituloImovelVenda(imovel)}</strong>
                {detalheImovel && <div>{detalheImovel}</div>}
                <div>{origemImovelVenda(imovel)}</div>
              </div>
            )}
          </section>

          <section className="drawer-section" aria-label="Valores">
            <div className="drawer-section-title">Valores</div>
            <div className="drawer-info-grid">
              <Info rotulo={ROTULOS_VALOR_VENDA.valorNegocioPrevisto} valor={fmtValorVenda(oportunidade.valores.valorNegocioPrevisto)} />
              <Info rotulo={ROTULOS_VALOR_VENDA.receitaPrevista} valor={fmtValorVenda(oportunidade.valores.receitaPrevista)} />
              {oportunidade.estado === "ganha" && (
                <Info rotulo={ROTULOS_VALOR_VENDA.valorNegocioFechado} valor={fmtValorVenda(oportunidade.valores.valorNegocioFechado)} />
              )}
            </div>
          </section>

          <section className="drawer-section" aria-label="Origem">
            <div className="drawer-section-title">Origem</div>
            <div className="drawer-notes">{rotuloOrigemVenda(oportunidade.origem)}</div>
          </section>

          {encerramento !== null && (
            <section className="drawer-section" aria-label="Encerramento">
              <div className="drawer-section-title">Encerramento</div>
              <div className="drawer-info-grid">
                <Info rotulo="Resultado" valor={encerramento.tipo === "ganho" ? "Venda ganha" : "Venda perdida"} />
                <Info rotulo="Data do fato" valor={fmtDataFatoVenda(encerramento.dataFato)} />
                {encerramento.tipo === "ganho" ? (
                  <Info rotulo="Registro da formalização" valor={encerramento.registroFormalizacao} />
                ) : (
                  <>
                    <Info rotulo="Motivo" valor={ROTULOS_MOTIVO_PERDA_VENDA[encerramento.motivo]} />
                    <Info rotulo="Justificativa" valor={encerramento.justificativa?.trim() || TEXTO_NAO_INFORMADO_VENDA} />
                  </>
                )}
                {oportunidade.arquivadaEm !== null && <Info rotulo="Arquivada em" valor={fmtInstanteVenda(oportunidade.arquivadaEm)} />}
              </div>
            </section>
          )}

          <section className="drawer-section" aria-label="Histórico">
            <div className="drawer-section-title">Histórico</div>
            {historico.estado === "carregando" ? (
              <div className="drawer-notes" role="status">Carregando histórico…</div>
            ) : historico.estado === "erro" ? (
              <div className="drawer-notas-resumo" role="alert">
                <span className="drawer-notes">Não foi possível carregar o histórico. {MENSAGENS_ERRO_LEITURA_VENDA[historico.codigo]}</span>
                <button type="button" className="btn btn-sm" onClick={() => void carregarHistorico()}>Tentar novamente</button>
              </div>
            ) : historico.eventos.length === 0 ? (
              <div className="drawer-notes">Nenhum evento registrado.</div>
            ) : (
              <ol className="timeline" aria-label="Eventos da oportunidade">
                {historico.eventos.map((evento) => {
                  const detalhe = detalheEventoVenda(evento);
                  return (
                    <li key={evento.versao} className="timeline-item">
                      <div className="timeline-data">{fmtInstanteVenda(evento.registradoEm)}</div>
                      <div className="timeline-titulo">{ROTULOS_EVENTO_VENDA[evento.tipo]}</div>
                      {detalhe && <div className="timeline-detalhe">{detalhe}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
