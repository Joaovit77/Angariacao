"use client";

import { useEffect, useRef, useState } from "react";

import { useSessao } from "@/components/SessaoProvider";
import type { EtiquetaDoImovel } from "@/lib/calculo/etiquetasProspeccao";
import { vigenciaDasEtiquetas, type DetalheImovelIdentificado } from "@/lib/prospeccao";
import {
  armazemRascunhoCaptura,
  avaliarRascunho,
  fotoPerdidaNaCameraNativa,
  type ArmazemRascunhoCaptura,
  type RascunhoCaptura,
} from "@/lib/rascunhoCaptura";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";

import CardIdentificado from "./CardIdentificado";
import ConfirmacaoRegistro from "./ConfirmacaoRegistro";
import PainelIdentificado from "./PainelIdentificado";
import styles from "./Prospeccao.module.css";

function etiquetasAtuais(detalhe: DetalheImovelIdentificado | null): EtiquetaDoImovel[] {
  if (!detalhe) return [];
  return vigenciaDasEtiquetas(detalhe).filter((etiqueta) => etiqueta.vigenteNoAvistamentoCorrente);
}

function horaCurta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function rotuloTotalImoveis(total: number): string {
  return `${total} no total`;
}

export default function ProspeccaoView({
  armazemRascunho,
}: {
  /** Injetável para teste; em produção é o IndexedDB do aparelho. */
  armazemRascunho?: ArmazemRascunhoCaptura;
}) {
  const { usuario } = useSessao();
  const [armazem] = useState<ArmazemRascunhoCaptura>(() => armazemRascunho ?? armazemRascunhoCaptura());
  const [rascunhoPendente, setRascunhoPendente] = useState<RascunhoCaptura | null>(null);
  const itens = useProspeccao((estado) => estado.itens);
  const detalhe = useProspeccao((estado) => estado.detalhe);
  const selecionadoId = useProspeccao((estado) => estado.selecionadoId);
  const pagina = useProspeccao((estado) => estado.pagina);
  const porPagina = useProspeccao((estado) => estado.porPagina);
  const total = useProspeccao((estado) => estado.total);
  const temMais = useProspeccao((estado) => estado.temMais);
  const carregando = useProspeccao((estado) => estado.carregando);
  const salvando = useProspeccao((estado) => estado.salvando);
  const aviso = useProspeccao((estado) => estado.aviso);
  const incluirOcultos = useProspeccao((estado) => estado.incluirOcultos);
  const definirIncluirOcultos = useProspeccao((estado) => estado.definirIncluirOcultos);
  const erro = useProspeccao((estado) => estado.erro);
  const carregarPagina = useProspeccao((estado) => estado.carregarPagina);
  const carregarDetalhe = useProspeccao((estado) => estado.carregarDetalhe);
  const limparSelecao = useProspeccao((estado) => estado.limparSelecao);
  const ultimoRegistro = useProspeccao((estado) => estado.ultimoRegistro);
  const dispensarUltimoRegistro = useProspeccao((estado) => estado.dispensarUltimoRegistro);
  const painelRef = useRef<HTMLDivElement | null>(null);
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const modalDeAvistamentoAberto = useUiModal((estado) => estado.modal?.tipo === "avistamento");
  const etiquetasSelecionadas = etiquetasAtuais(detalhe);
  const usuarioId = usuario?.id ?? null;

  useEffect(() => {
    void carregarPagina(1, porPagina);
  }, [carregarPagina, porPagina]);

  // Depois de uma recarga o corretor cai AQUI, não no modal. Se o aparelho
  // guardou um registro interrompido, é esta tela que precisa dizer.
  //
  // Depende do id, não do objeto `usuario`: o SessaoProvider troca o objeto
  // a cada evento de sessão, e voltar da câmera dispara um. Enquanto o modal
  // de avistamento está aberto o rascunho existe de propósito, então o
  // aviso fica calado; ao fechar, reavalia (o rascunho pode ter sido limpo).
  useEffect(() => {
    if (!usuarioId || modalDeAvistamentoAberto) return;
    let cancelado = false;
    void (async () => {
      const rascunho = await armazem.ler(usuarioId);
      if (cancelado) return;
      const veredito = avaliarRascunho(rascunho, usuarioId, rascunho?.imovelIdentificadoId ?? null);
      if (veredito === "expirado") void armazem.limpar(usuarioId);
      setRascunhoPendente(veredito === "restauravel" ? rascunho : null);
    })();
    return () => { cancelado = true; };
  }, [armazem, usuarioId, modalDeAvistamentoAberto]);

  function retomarRascunho() {
    if (!rascunhoPendente) return;
    setRascunhoPendente(null);
    abrirModal("avistamento", rascunhoPendente.imovelIdentificadoId ?? undefined);
  }

  // "Concluir" encerra a tarefa de campo: some a confirmação e a seleção,
  // e a tela volta à lista. "Ver detalhes" leva ao painel, que em tela
  // estreita fica abaixo da lista.
  function concluirRegistro() {
    dispensarUltimoRegistro();
    limparSelecao();
  }

  function verDetalhesDoRegistro() {
    dispensarUltimoRegistro();
    painelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  async function mudarPagina(proximaPagina: number) {
    const carregou = await carregarPagina(proximaPagina, porPagina);
    if (carregou) limparSelecao();
  }

  return (
    <div className={styles.pagina}>
      <section className={styles.hero}>
        <div className={styles.heroTexto}>
          <div className={styles.heroIcone} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 20V9l8-5 8 5v11" />
              <path d="M8 20v-6h8v6M3 20h18" />
              <path d="m16.5 5.5 1-2 1 2 2 .9-2 .9-1 2-1-2-2-.9z" />
            </svg>
          </div>
          <div>
            <span className={styles.sobretitulo}>MEMÓRIA DE CAMPO</span>
            <h2>Garimpo em Campo</h2>
            <p className={styles.heroDescricao}>
              Registre os imóveis que você vê na rua e mantenha cada passagem separada no histórico.
            </p>
          </div>
        </div>
        {/* Sem id, o modal cria um LOCAL novo com o seu primeiro avistamento.
            "Primeiro" é do local, não da conta: depois que já há registros o
            rótulo precisa dizer isso, senão parece que nada foi salvo. */}
        <button
          type="button"
          className="btn btn-primary"
          disabled={salvando}
          onClick={() => abrirModal("avistamento")}
        >
          {total > 0 ? "Registrar novo local" : "Registrar imóvel visto"}
        </button>
      </section>

      {rascunhoPendente && usuarioId && !modalDeAvistamentoAberto ? (
        <div className={styles.rascunhoPendente} role="status">
          <div>
            <strong>
              {fotoPerdidaNaCameraNativa(rascunhoPendente)
                ? "A foto da câmera do aparelho não chegou."
                : rascunhoPendente.destino
                  ? "Uma foto ficou pendente de envio."
                  : "Um registro de campo não foi concluído."}
            </strong>
            <span>
              {fotoPerdidaNaCameraNativa(rascunhoPendente)
                ? `A página foi recarregada ao voltar da câmera às ${horaCurta(rascunhoPendente.cameraNativaEm ?? "")}. Nada foi enviado. Retome e fotografe por "Fotografar fachada", que usa a câmera aqui na página.`
                : `${rascunhoPendente.foto ? "Foto e dados" : "Dados"} de ${horaCurta(rascunhoPendente.salvoEm)} estão guardados neste aparelho. Nada foi perdido.`}
            </span>
          </div>
          <button type="button" className="btn btn-sm btn-primary" disabled={salvando} onClick={retomarRascunho}>
            Retomar
          </button>
        </div>
      ) : null}

      {aviso ? (
        <div className={styles.estado} role="status">
          <div>
            <strong>União confirmada; atualização pendente.</strong>
            <p>{aviso}</p>
            <button type="button" className="btn btn-sm" disabled={carregando || salvando}
              onClick={() => void carregarPagina(1, porPagina)}>Recarregar registros</button>
          </div>
        </div>
      ) : null}

      {erro ? (
        <div className={`${styles.estado} ${styles.erro}`} role="alert">
          <div>
            <strong>Não foi possível concluir a operação.</strong>
            <p>{erro}</p>
            {!itens.length ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void carregarPagina(pagina, porPagina)}
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ultimoRegistro && detalhe && detalhe.identificado.id === ultimoRegistro.imovelIdentificadoId
        && !modalDeAvistamentoAberto ? (
        <ConfirmacaoRegistro
          key={ultimoRegistro.avistamentoId}
          detalhe={detalhe}
          avistamentoId={ultimoRegistro.avistamentoId}
          novoLocal={ultimoRegistro.novoLocal}
          aoConcluir={concluirRegistro}
          aoVerDetalhes={verDetalhesDoRegistro}
        />
      ) : null}

      {carregando && !itens.length ? (
        <div className={styles.estado} role="status">Carregando os imóveis vistos em campo…</div>
      ) : !erro && !aviso && !itens.length ? (
        <div className={styles.estado}>
          <div>
            <strong>
              {incluirOcultos ? "Nenhum imóvel registrado ainda." : "Nenhum imóvel ativo por aqui."}
            </strong>
            <p>
              {incluirOcultos
                ? "Registre a primeira passagem por um imóvel para começar sua memória de campo."
                : "Os descartados, unidos a outro registro e em exclusão ficam em “Mostrar ocultos”."}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={salvando}
              onClick={() => abrirModal("avistamento")}
            >
              Registrar imóvel visto
            </button>
            {!incluirOcultos ? (
              <label className={styles.filtroOcultos}>
                <input
                  type="checkbox"
                  checked={incluirOcultos}
                  disabled={carregando || salvando}
                  onChange={(evento) => void definirIncluirOcultos(evento.target.checked)}
                />
                Mostrar ocultos
              </label>
            ) : null}
          </div>
        </div>
      ) : itens.length ? (
        <div className={styles.conteudo}>
          <section className={styles.lista} aria-label="Imóveis vistos em campo">
            <div className={styles.listaCabecalho}>
              <h3>Imóveis vistos em campo</h3>
              <span>{carregando ? "Atualizando…" : rotuloTotalImoveis(total)}</span>
            </div>
            {/* Descartar preserva tudo e só esconde; fundido e exclusão pendente
                também saem da lista normal. O filtro traz os três de volta. */}
            <label className={styles.filtroOcultos}>
              <input
                type="checkbox"
                checked={incluirOcultos}
                disabled={carregando || salvando}
                onChange={(evento) => void definirIncluirOcultos(evento.target.checked)}
              />
              Mostrar ocultos (descartados, unidos a outro registro e em exclusão)
            </label>
            <div className={styles.cards}>
              {itens.map((identificado) => (
                <CardIdentificado
                  identificado={identificado}
                  selecionado={selecionadoId === identificado.id}
                  desabilitado={salvando}
                  etiquetasAtuais={
                    detalhe?.identificado.id === identificado.id ? etiquetasSelecionadas : []
                  }
                  aoSelecionar={(id) => void carregarDetalhe(id, true)}
                  key={identificado.id}
                />
              ))}
            </div>
            <div className={styles.paginacao}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={pagina <= 1 || carregando || salvando}
                onClick={() => void mudarPagina(pagina - 1)}
              >
                Anterior
              </button>
              <span>Página {pagina}</span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!temMais || carregando || salvando}
                onClick={() => void mudarPagina(pagina + 1)}
              >
                Próxima
              </button>
            </div>
          </section>

          {detalhe && detalhe.identificado.id === selecionadoId ? (
            <div ref={painelRef} className={styles.painelAncora}>
              <PainelIdentificado detalhe={detalhe} />
            </div>
          ) : (
            <div className={styles.estado} role={carregando && selecionadoId ? "status" : undefined}>
              <div>
                <strong>
                  {carregando && selecionadoId ? "Carregando detalhe…" : "Escolha um imóvel na lista"}
                </strong>
                <p>O que sabemos agora e o histórico de passagens aparecem aqui.</p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
