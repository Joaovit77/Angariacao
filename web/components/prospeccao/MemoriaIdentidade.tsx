"use client";

/* Memória de identidade do imóvel (C13C): camada de leitura + confirmação
   humana sobre o que o núcleo do C13A já decidiu.

   O componente NÃO decide vigência, conflito nem prioridade: recebe o
   detalhe que o painel já tem, pede ao store as investigações e afirmações
   (sob RLS, só quando o detalhe abre), compõe pelo núcleo puro e renderiza
   o read model de `leituraMemoria`. Confirmar chama a RPC do C13A pelo
   store; a origem, a fonte, o valor e a data de observação ficam como
   estavam. Nada aqui chama IA, promove, muda situação ou escreve por
   visualizar. No celular a seção nasce recolhida, com o resumo no título. */
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { urlInvestigadorDoImovelIdentificado } from "@/lib/calculo/contextoInvestigador";
import {
  TEXTO_NUNCA_INVESTIGADO,
  TEXTO_SEM_DESCOBERTAS,
  TITULO_DIVERGENCIA,
  lerMemoria,
  type AfirmacaoLeitura,
  type EventoLeitura,
  type FatoLeitura,
  type LeituraMemoria,
} from "@/lib/calculo/leituraMemoria";
import { montarMemoriaIdentidade } from "@/lib/calculo/memoriaIdentidade";
import type { DetalheImovelIdentificado, MemoriaIdentificadoCarregada } from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";

import styles from "./Prospeccao.module.css";

export const TITULO_MEMORIA = "Memória do imóvel";
export const TITULO_O_QUE_SABEMOS = "O que sabemos";
export const TITULO_HISTORICO_MEMORIA = "Histórico";
export const ROTULO_CONFIRMAR_INFORMACAO = "Confirmar informação";
export const PERGUNTA_CONFIRMAR_INFORMACAO = "Confirmar esta informação como válida?";
export const ERRO_CARREGAR_MEMORIA = "Não foi possível carregar a memória.";
export const ERRO_CONFIRMAR_INFORMACAO = "Não foi possível confirmar a informação. Ela continua como hipótese.";
export const NOTA_MEMORIA =
  "Informações encontradas fora do campo, com a fonte de cada uma. Hipótese é o que a web disse; Confirmado é o que você validou.";

function MarcaEstado({ afirmacao }: { afirmacao: AfirmacaoLeitura }) {
  const classe = afirmacao.estado === "confirmada" ? styles.chipConfirmada : styles.chipInferida;
  return (
    <span className={`${styles.chipMarca} ${classe}`} data-memoria-estado={afirmacao.estado}>
      {afirmacao.rotuloEstado}
    </span>
  );
}

function Fonte({ afirmacao }: { afirmacao: AfirmacaoLeitura }) {
  const { fonte } = afirmacao;
  if (fonte.url) {
    return (
      <a href={fonte.url} target="_blank" rel="noopener noreferrer" data-memoria-fonte="link">
        Fonte: {fonte.rotulo} ↗
      </a>
    );
  }
  return <span data-memoria-fonte="texto">{fonte.rotulo}</span>;
}

function Quando({ afirmacao }: { afirmacao: AfirmacaoLeitura }) {
  if (afirmacao.estado === "confirmada" && afirmacao.confirmadoEmTexto) {
    return (
      <span>
        Confirmado em <time dateTime={afirmacao.confirmadoEm ?? undefined}>{afirmacao.confirmadoEmTexto}</time>
      </span>
    );
  }
  if (!afirmacao.observadoEmTexto) return null;
  return (
    <span>
      Visto em <time dateTime={afirmacao.observadoEm}>{afirmacao.observadoEmTexto}</time>
    </span>
  );
}

function Afirmacao({
  afirmacao,
  ocupado,
  aoConfirmar,
}: {
  afirmacao: AfirmacaoLeitura;
  ocupado: boolean;
  aoConfirmar: (afirmacao: AfirmacaoLeitura) => void;
}) {
  return (
    <div className={styles.memoriaAfirmacao} data-memoria-afirmacao={afirmacao.id}>
      <div className={styles.memoriaValorLinha}>
        <strong className={styles.memoriaValor}>{afirmacao.valor}</strong>
        <MarcaEstado afirmacao={afirmacao} />
      </div>
      <small className={styles.memoriaMeta}>
        <Fonte afirmacao={afirmacao} />
        <Quando afirmacao={afirmacao} />
      </small>
      {afirmacao.podeConfirmar ? (
        <button
          type="button"
          className={`btn btn-sm ${styles.memoriaConfirmar}`}
          disabled={ocupado}
          onClick={() => aoConfirmar(afirmacao)}
        >
          {ROTULO_CONFIRMAR_INFORMACAO}
        </button>
      ) : null}
    </div>
  );
}

function Fato({
  fato,
  ocupado,
  aoConfirmar,
}: {
  fato: FatoLeitura;
  ocupado: boolean;
  aoConfirmar: (afirmacao: AfirmacaoLeitura) => void;
}) {
  return (
    <li className={styles.memoriaFato} data-memoria-fato={fato.atributo} data-memoria-divergente={fato.divergente ? "" : undefined}>
      <span className={styles.memoriaRotulo}>{fato.rotulo}</span>
      <Afirmacao afirmacao={fato.vigente} ocupado={ocupado} aoConfirmar={aoConfirmar} />
      {fato.divergente ? (
        <div className={styles.conflito} data-memoria-conflito>
          <strong>{TITULO_DIVERGENCIA}</strong>
          <p>Também encontrado:</p>
          <ul className={styles.memoriaOutros}>
            {fato.divergentes.map((outro) => (
              <li key={outro.id}>
                <Afirmacao afirmacao={outro} ocupado={ocupado} aoConfirmar={aoConfirmar} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function Historico({ eventos }: { eventos: EventoLeitura[] }) {
  if (!eventos.length) return null;
  return (
    <details className={styles.detalhes} data-memoria-historico>
      <summary>{TITULO_HISTORICO_MEMORIA}</summary>
      <div className={styles.detalhesCorpo}>
        <ul className={styles.memoriaHistorico}>
          {eventos.map((evento) => (
            <li key={evento.chave} data-memoria-evento={evento.tipo}>
              <time dateTime={evento.em}>{evento.emTexto}</time>
              <div>
                <strong>{evento.titulo}</strong>
                {evento.detalhe ? <small>{evento.detalhe}</small> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export default function MemoriaIdentidade({
  detalhe,
  recolhida,
}: {
  detalhe: DetalheImovelIdentificado;
  /** No celular a seção nasce recolhida; o resumo fica no título. */
  recolhida: boolean;
}) {
  const item = detalhe.identificado;
  const carregarMemoria = useProspeccao((estado) => estado.carregarMemoria);
  const confirmarAtributo = useProspeccao((estado) => estado.confirmarAtributo);
  const salvando = useProspeccao((estado) => estado.salvando);
  const idCorpo = useId();

  // Recolhida por padrão no celular, aberta em tela larga; mudar de tela
  // volta ao padrão, e o toque da pessoa vale até lá.
  const [aberta, setAberta] = useState(!recolhida);
  const [recolhidaVista, setRecolhidaVista] = useState(recolhida);
  if (recolhida !== recolhidaVista) {
    setRecolhidaVista(recolhida);
    setAberta(!recolhida);
  }

  // Uma leitura por chave (registro + revisão). A revisão sobe depois de
  // confirmar ou ao tentar de novo; uma resposta de chave anterior nunca
  // escreve na tela. "Carregando" é a ausência de resposta para a chave.
  const [revisao, setRevisao] = useState(0);
  const chave = `${item.id}:${revisao}`;
  const [resposta, setResposta] = useState<{ chave: string; memoria: MemoriaIdentificadoCarregada | null } | null>(null);
  useEffect(() => {
    let cancelado = false;
    void carregarMemoria(item.id).then((memoria) => {
      if (cancelado) return;
      setResposta({ chave, memoria });
    });
    return () => { cancelado = true; };
  }, [carregarMemoria, item.id, chave]);
  const respostaAtual = resposta?.chave === chave ? resposta : null;
  const carregando = respostaAtual === null;
  const falhou = respostaAtual !== null && respostaAtual.memoria === null;

  // Composição pelo núcleo do C13A e leitura pelo read model: o detalhe
  // relido pelo store (promoção, tipo) entra sem nova consulta ao banco.
  const leitura = useMemo<LeituraMemoria | null>(() => {
    if (!respostaAtual?.memoria) return null;
    const composta = montarMemoriaIdentidade(detalhe, respostaAtual.memoria.investigacoes, respostaAtual.memoria.atributos);
    return lerMemoria(composta, item);
  }, [respostaAtual, detalhe, item]);

  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function confirmar(afirmacao: AfirmacaoLeitura) {
    if (confirmando || salvando) return;
    if (!window.confirm(PERGUNTA_CONFIRMAR_INFORMACAO)) return;
    setErroConfirmacao(null);
    setConfirmando(true);
    const ok = await confirmarAtributo(afirmacao.id);
    setConfirmando(false);
    if (!ok) {
      setErroConfirmacao(ERRO_CONFIRMAR_INFORMACAO);
      return;
    }
    // O banco é quem sabe a data da confirmação: relê em vez de supor.
    setRevisao((atual) => atual + 1);
  }

  const ocupado = confirmando || salvando;
  const legenda = leitura?.resumo.texto ?? null;

  return (
    <section className={styles.secao} aria-label={TITULO_MEMORIA} data-secao-memoria>
      <div className={styles.secaoCabecalho}>
        <h4 className={styles.memoriaTitulo}>
          <button
            type="button"
            className={styles.memoriaAlternar}
            aria-expanded={aberta}
            aria-controls={idCorpo}
            onClick={() => setAberta((atual) => !atual)}
          >
            {TITULO_MEMORIA}
          </button>
        </h4>
        {legenda ? <span data-memoria-resumo>{legenda}</span> : null}
      </div>
      <div id={idCorpo} hidden={!aberta} className={styles.secaoRecolhivelCorpo} data-memoria-corpo>
        {carregando ? (
          <p className={styles.vazioInterno} role="status">Carregando a memória…</p>
        ) : falhou || !leitura ? (
          <div className={styles.memoriaErro} role="status" data-memoria-erro>
            <p className={styles.vazioInterno}>{ERRO_CARREGAR_MEMORIA}</p>
            <button type="button" className="btn btn-sm" onClick={() => setRevisao((atual) => atual + 1)}>Tentar de novo</button>
          </div>
        ) : (
          <MemoriaPronta
            leitura={leitura}
            identificadoId={item.id}
            ocupado={ocupado}
            erroConfirmacao={erroConfirmacao}
            aoConfirmar={(afirmacao) => void confirmar(afirmacao)}
          />
        )}
      </div>
    </section>
  );
}

function MemoriaPronta({
  leitura,
  identificadoId,
  ocupado,
  erroConfirmacao,
  aoConfirmar,
}: {
  leitura: LeituraMemoria;
  identificadoId: string;
  ocupado: boolean;
  erroConfirmacao: string | null;
  aoConfirmar: (afirmacao: AfirmacaoLeitura) => void;
}) {
  return (
    <>
      {leitura.fatos.length ? (
        <>
          <p className={styles.secaoNota}>{NOTA_MEMORIA}</p>
          <h5 className={styles.memoriaSubtitulo}>{TITULO_O_QUE_SABEMOS}</h5>
          <ul className={styles.memoriaFatos} data-memoria-fatos>
            {leitura.fatos.map((fato) => (
              <Fato key={fato.atributo} fato={fato} ocupado={ocupado} aoConfirmar={aoConfirmar} />
            ))}
          </ul>
        </>
      ) : (
        <div className={styles.memoriaVazia} data-memoria-vazia={leitura.investigado ? "sem-descobertas" : "nunca-investigado"}>
          <p className={styles.vazioInterno}>{leitura.investigado ? TEXTO_SEM_DESCOBERTAS : TEXTO_NUNCA_INVESTIGADO}</p>
          {!leitura.investigado ? (
            <Link className="btn btn-sm btn-ghost" href={urlInvestigadorDoImovelIdentificado(identificadoId)}>
              Investigar na web
            </Link>
          ) : null}
        </div>
      )}
      {erroConfirmacao ? <p className={styles.memoriaErroConfirmacao} role="alert">{erroConfirmacao}</p> : null}
      <Historico eventos={leitura.historico} />
    </>
  );
}
