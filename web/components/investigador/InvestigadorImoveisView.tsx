"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  LIMITE_CONSULTA_INVESTIGADOR,
  type CorrespondenciaInvestigacao,
  type EtapaInvestigacao,
  type ResultadoInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { fmtMoney } from "@/lib/formatadores";
import { carregarContextoInvestigador, investigarImovel } from "@/lib/investigadorImoveis";
import type { ReferenciaContextoInvestigador } from "@/lib/calculo/contextoInvestigador";
import { urlAvaliacaoDoComparavel } from "@/lib/calculo/contextoAvaliacao";
import styles from "./InvestigadorImoveisView.module.css";

type EtapaVisual = "preparando" | EtapaInvestigacao | "concluido";

const ETAPAS: { id: Exclude<EtapaVisual, "concluido">; titulo: string; detalhe: string }[] = [
  { id: "preparando", titulo: "Preparando investigação", detalhe: "Validando sua sessão e as informações fornecidas." },
  { id: "gerando-buscas", titulo: "Gerando buscas", detalhe: "Criando poucas variações relevantes para economizar requisições." },
  { id: "pesquisando-web", titulo: "Pesquisando na web", detalhe: "Consultando os resultados do Google pelo provedor configurado." },
  { id: "normalizando-resultados", titulo: "Organizando resultados", detalhe: "Canonicalizando fontes e removendo repetições desnecessárias." },
  { id: "cruzando-informacoes", titulo: "Cruzando informações", detalhe: "Comparando referências, endereço e características observadas." },
];

const ROTULO_CONFIANCA = {
  "muito-forte": "Correspondência muito forte",
  forte: "Correspondência forte",
  possivel: "Correspondência possível",
  indicio: "Indício",
} as const;

function IconeInvestigador() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  );
}

function Caracteristicas({ resultado }: { resultado: CorrespondenciaInvestigacao }) {
  const itens = [
    resultado.area !== null ? `${resultado.area.toLocaleString("pt-BR")} m²` : null,
    resultado.quartos !== null ? `${resultado.quartos} quarto${resultado.quartos === 1 ? "" : "s"}` : null,
    resultado.vagas !== null ? `${resultado.vagas} vaga${resultado.vagas === 1 ? "" : "s"}` : null,
  ].filter((item): item is string => item !== null);
  return itens.length ? <div className={styles.caracteristicas}>{itens.map((item) => <span key={item}>{item}</span>)}</div> : null;
}

function CardResultado({ resultado }: { resultado: CorrespondenciaInvestigacao }) {
  return (
    <article className={styles.resultadoCard}>
      <div className={styles.resultadoTopo}>
        <span className={`${styles.confianca} ${styles[resultado.confianca]}`}>
          {ROTULO_CONFIANCA[resultado.confianca]}
        </span>
        {resultado.preco !== null ? <strong>{fmtMoney(resultado.preco)}</strong> : null}
      </div>
      <h3>{resultado.titulo}</h3>
      <Caracteristicas resultado={resultado} />
      {resultado.endereco || resultado.condominio || resultado.referencia ? (
        <dl className={styles.dadosEncontrados}>
          {resultado.condominio ? <><dt>Empreendimento</dt><dd>{resultado.condominio}</dd></> : null}
          {resultado.endereco ? <><dt>Endereço</dt><dd>{resultado.endereco}</dd></> : null}
          {resultado.referencia ? <><dt>Referência</dt><dd>{resultado.referencia}</dd></> : null}
        </dl>
      ) : null}
      {resultado.descricao ? <p className={styles.descricao}>{resultado.descricao}</p> : null}
      <div className={styles.evidencias}>
        <span>Evidências favoráveis</span>
        {resultado.evidencias.length ? (
          <ul>{resultado.evidencias.map((item) => <li key={item}>✓ {item}</li>)}</ul>
        ) : (
          <p>O resultado apareceu nas buscas, mas não trouxe coincidências estruturadas suficientes.</p>
        )}
      </div>
      {resultado.contradicoes.length ? (
        <div className={styles.contradicoes}>
          <span>Contradições observadas</span>
          <ul>{resultado.contradicoes.map((item) => <li key={item}>⚠ {item}</li>)}</ul>
        </div>
      ) : null}
      <div className={styles.fonte}>
        <div>
          <span>Fonte encontrada</span>
          <strong>{resultado.dominio}</strong>
          <small>Encontrada em {resultado.consultas.length} busca{resultado.consultas.length === 1 ? "" : "s"}</small>
        </div>
        <div className={styles.acoesResultado}>
          {resultado.comparavelId ? (
            <Link className="btn btn-primary" href={urlAvaliacaoDoComparavel(resultado.comparavelId)}>
              Usar na Avaliação
            </Link>
          ) : null}
          <a className="btn btn-ghost" href={resultado.url} target="_blank" rel="noreferrer">
            Abrir fonte ↗
          </a>
        </div>
      </div>
    </article>
  );
}

function Processamento({ etapa }: { etapa: EtapaVisual }) {
  const atual = etapa === "concluido" ? ETAPAS.length : ETAPAS.findIndex((item) => item.id === etapa);
  return (
    <section className={styles.processamento} aria-live="polite" aria-label="Andamento da investigação">
      <div className={styles.processamentoCabecalho}>
        <span className={styles.pulso} aria-hidden="true" />
        <div>
          <strong>{etapa === "concluido" ? "Investigação concluída" : "Investigação em andamento"}</strong>
          <small>As etapas abaixo refletem o processamento real.</small>
        </div>
      </div>
      <ol>
        {ETAPAS.map((item, indice) => {
          const estado = indice < atual || etapa === "concluido" ? "concluida" : indice === atual ? "ativa" : "pendente";
          return (
            <li key={item.id} data-estado={estado}>
              <i aria-hidden="true">{estado === "concluida" ? "✓" : indice + 1}</i>
              <div><strong>{item.titulo}</strong><small>{item.detalhe}</small></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface Props {
  imovelIdInicial?: string | null;
  referenciaInicial?: ReferenciaContextoInvestigador | null;
}

const ROTULO_ORIGEM_CONTEXTO = {
  pipeline: "Pipeline",
  radar: "Radar",
  central: "Central de Angariação",
} as const;

export default function InvestigadorImoveisView({ imovelIdInicial, referenciaInicial }: Props) {
  const origemInicial = referenciaInicial?.origem || (imovelIdInicial ? "imovel" : null);
  const idInicial = referenciaInicial?.id || imovelIdInicial || null;
  const [consulta, setConsulta] = useState("");
  const [carregandoContexto, setCarregandoContexto] = useState(Boolean(idInicial));
  const [origemContexto, setOrigemContexto] = useState<keyof typeof ROTULO_ORIGEM_CONTEXTO | null>(null);
  const [avisoContexto, setAvisoContexto] = useState("");
  const [processando, setProcessando] = useState(false);
  const [etapa, setEtapa] = useState<EtapaVisual | null>(null);
  const [consultasRealizadas, setConsultasRealizadas] = useState<string[]>([]);
  const [resultado, setResultado] = useState<ResultadoInvestigacao | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!origemInicial || !idInicial) return;
    const controlador = new AbortController();
    carregarContextoInvestigador({ origem: origemInicial, id: idInicial }, controlador.signal)
      .then((contexto) => {
        setConsulta(contexto.consulta);
        setOrigemContexto(contexto.origem);
      })
      .catch((causa) => {
        if (causa instanceof DOMException && causa.name === "AbortError") return;
        setAvisoContexto(
          causa instanceof Error
            ? causa.message
            : "Não foi possível carregar o imóvel indicado. Você ainda pode preencher a pesquisa manualmente.",
        );
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCarregandoContexto(false);
    });
    return () => controlador.abort();
  }, [idInicial, origemInicial]);

  async function investigar(evento: FormEvent) {
    evento.preventDefault();
    const limpa = consulta.replace(/\s+/g, " ").trim();
    if (limpa.length < 3 || processando) return;

    setProcessando(true);
    setEtapa("preparando");
    setConsultasRealizadas([]);
    setResultado(null);
    setErro("");
    let falhaRecebida = "";
    try {
      await investigarImovel(limpa, (eventoRecebido) => {
        if (eventoRecebido.tipo === "etapa") setEtapa(eventoRecebido.etapa);
        if (eventoRecebido.tipo === "consultas") setConsultasRealizadas(eventoRecebido.consultas);
        if (eventoRecebido.tipo === "resultado") {
          setResultado(eventoRecebido.dados);
          setEtapa("concluido");
        }
        if (eventoRecebido.tipo === "erro") falhaRecebida = eventoRecebido.mensagem;
      });
      if (falhaRecebida) {
        setErro(falhaRecebida);
        setEtapa(null);
      }
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Não foi possível concluir a investigação.");
      setEtapa(null);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className={styles.pagina}>
      <section className={styles.hero}>
        <div className={styles.heroIcone}><IconeInvestigador /></div>
        <div>
          <span className={styles.sobretitulo}>PESQUISA ASSISTIDA</span>
          <h2>Investigador de Imóveis</h2>
          <p>Informe o que você sabe. Pode ser um endereço, referência, condomínio ou uma combinação de características.</p>
        </div>
      </section>

      {origemContexto ? (
        <div className={styles.contexto} role="status">
          Dados do imóvel carregados do {ROTULO_ORIGEM_CONTEXTO[origemContexto]}. Revise a consulta antes de investigar.
        </div>
      ) : null}
      {avisoContexto ? <div className={styles.aviso} role="alert">{avisoContexto}</div> : null}

      <form className={styles.formulario} onSubmit={investigar}>
        <label htmlFor="consulta-investigador">O que você sabe sobre o imóvel?</label>
        <textarea
          id="consulta-investigador"
          value={consulta}
          maxLength={LIMITE_CONSULTA_INVESTIGADOR}
          onChange={(evento) => setConsulta(evento.target.value)}
          placeholder={carregandoContexto ? "Carregando dados do imóvel…" : "Endereço, referência, condomínio ou características..."}
          rows={4}
          disabled={processando || carregandoContexto}
        />
        <div className={styles.formularioRodape}>
          <span>
            {carregandoContexto
              ? "Resolvendo o imóvel com segurança…"
              : `${consulta.length}/${LIMITE_CONSULTA_INVESTIGADOR} · Não inclua dados pessoais desnecessários.`}
          </span>
          <button className="btn btn-primary" type="submit" disabled={processando || carregandoContexto || consulta.trim().length < 3}>
            {processando ? "Investigando…" : "Investigar imóvel"}
          </button>
        </div>
      </form>

      {erro ? <div className={styles.erro} role="alert">{erro}</div> : null}
      {etapa ? <Processamento etapa={etapa} /> : null}

      {consultasRealizadas.length ? (
        <details className={styles.consultas} open={Boolean(resultado)}>
          <summary>
            {consultasRealizadas.length} de até 3 pesquisa{consultasRealizadas.length === 1 ? "" : "s"} realizada{consultasRealizadas.length === 1 ? "" : "s"}
          </summary>
          <ol>{consultasRealizadas.map((item) => <li key={item}>{item}</li>)}</ol>
          {resultado?.encerramentoAntecipado ? (
            <p>{resultado.pesquisasEvitadas} pesquisa{resultado.pesquisasEvitadas === 1 ? "" : "s"} evitada{resultado.pesquisasEvitadas === 1 ? "" : "s"} porque já havia evidência suficiente.</p>
          ) : null}
        </details>
      ) : null}

      {resultado ? (
        <section className={styles.resultados}>
          <div className={styles.resultadosCabecalho}>
            <div>
              <span>POSSÍVEIS CORRESPONDÊNCIAS</span>
              <h2>{resultado.resultados.length} resultado{resultado.resultados.length === 1 ? "" : "s"} após remover duplicatas</h2>
            </div>
            <small>A classificação indica probabilidade de correspondência, não confirmação factual.</small>
          </div>
          {resultado.aviso ? <div className={styles.aviso}>{resultado.aviso}</div> : null}
          {resultado.resultados.length ? (
            <div className={styles.gradeResultados}>
              {resultado.resultados.map((item) => <CardResultado key={item.url} resultado={item} />)}
            </div>
          ) : (
            <div className={styles.vazio}>
              <strong>Nenhuma correspondência encontrada</strong>
              <span>Tente acrescentar cidade, bairro, referência ou uma característica específica.</span>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
