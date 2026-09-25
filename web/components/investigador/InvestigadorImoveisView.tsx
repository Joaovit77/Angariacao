"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  LIMITE_CONSULTA_INVESTIGADOR,
  MAXIMO_BUSCAS_POR_INVESTIGACAO,
  type MemoriaInvestigacao,
  type CorrespondenciaInvestigacao,
  type EtapaInvestigacao,
  type ResultadoInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { fmtMoney } from "@/lib/formatadores";
import { carregarContextoInvestigador, investigarImovel } from "@/lib/investigadorImoveis";
import type { ReferenciaContextoInvestigador } from "@/lib/calculo/contextoInvestigador";
import { urlAvaliacaoDoComparavel } from "@/lib/calculo/contextoAvaliacao";
import { CATALOGO_ATRIBUTOS_MEMORIA } from "@/lib/calculo/memoriaIdentidade";
import type { ComparacaoConfirmada } from "@/lib/calculo/contextoConfirmadoInvestigador";
import styles from "./InvestigadorImoveisView.module.css";

type EtapaVisual = "preparando" | EtapaInvestigacao | "concluido";

const ETAPAS: { id: Exclude<EtapaVisual, "concluido">; titulo: string; detalhe: string }[] = [
  { id: "preparando", titulo: "Preparando", detalhe: "Conferindo sua sessão e a consulta." },
  { id: "gerando-buscas", titulo: "Planejando pesquisas", detalhe: "Poucas variações da sua consulta, da mais específica para a mais ampla." },
  { id: "pesquisando-web", titulo: "Pesquisando na web", detalhe: "Buscando anúncios e páginas públicas." },
  { id: "normalizando-resultados", titulo: "Organizando resultados", detalhe: "Juntando páginas repetidas." },
  { id: "cruzando-informacoes", titulo: "Comparando com a consulta", detalhe: "Conferindo endereço, referência e características." },
];

const ROTULO_CONFIANCA = {
  "muito-forte": "Correspondência muito forte",
  forte: "Correspondência forte",
  possivel: "Correspondência possível",
  indicio: "Indício",
} as const;

// Mesmo texto que a rota envia quando a busca terminou sem nenhum card e sem
// falha parcial; o estado vazio já diz isso, então o aviso não se repete.
export const AVISO_SEM_RESULTADOS = "Nenhuma possível correspondência apareceu nessas buscas.";

function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

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

function atributoEmTexto(atributo: ComparacaoConfirmada["atributo"]): string {
  const rotulo = CATALOGO_ATRIBUTOS_MEMORIA[atributo].rotulo;
  return rotulo.charAt(0).toLocaleLowerCase("pt-BR") + rotulo.slice(1);
}

/** B3.2a: bloco à parte das evidências. Compara o anúncio com o que uma
    pessoa já confirmou; não diz que o anúncio está certo nem muda a faixa. */
function ComparacaoMemoria({ comparacoes }: { comparacoes: ComparacaoConfirmada[] }) {
  const visiveis = comparacoes.filter((item) => item.estado !== "sem_dado_no_resultado");
  if (!visiveis.length) return null;
  return (
    <div className={styles.memoriaConfirmada} data-memoria-confirmada>
      <strong>Comparado com o que você confirmou</strong>
      <ul>
        {visiveis.map((item) => (
          <li key={item.atributo} data-comparacao={item.estado}>
            <span aria-hidden="true">{item.estado === "coincide" ? "=" : "≠"}</span>
            {item.estado === "coincide" ? "Bate com o que você confirmou: " : "Diferente do que você confirmou: "}
            {atributoEmTexto(item.atributo)}
          </li>
        ))}
      </ul>
      <small>Essa comparação não altera a correspondência.</small>
    </div>
  );
}

function CardResultado({
  resultado,
  comparacoes,
  compacto,
}: {
  resultado: CorrespondenciaInvestigacao;
  comparacoes: ComparacaoConfirmada[];
  compacto: boolean;
}) {
  return (
    <article className={`${styles.resultadoCard} ${compacto ? styles.resultadoCompacto : ""}`} data-faixa={resultado.confianca}>
      <div className={styles.resultadoTopo}>
        <span className={`${styles.confianca} ${styles[resultado.confianca]}`}>
          {ROTULO_CONFIANCA[resultado.confianca]}
        </span>
        {resultado.preco !== null ? <span className={styles.preco}>{fmtMoney(resultado.preco)}</span> : null}
      </div>
      <h4>{resultado.titulo}</h4>
      <Caracteristicas resultado={resultado} />
      {resultado.endereco || resultado.condominio || resultado.referencia ? (
        <dl className={styles.dadosEncontrados}>
          {resultado.condominio ? <><dt>Empreendimento</dt><dd>{resultado.condominio}</dd></> : null}
          {resultado.endereco ? <><dt>Endereço</dt><dd>{resultado.endereco}</dd></> : null}
          {resultado.referencia ? <><dt>Referência</dt><dd>{resultado.referencia}</dd></> : null}
        </dl>
      ) : null}
      {resultado.descricao ? <p className={styles.descricao}>{resultado.descricao}</p> : null}
      {resultado.evidencias.length ? (
        <div className={styles.evidencias}>
          <span>O que bate</span>
          <ul>
            {resultado.evidencias.map((item) => (
              <li key={item}><span aria-hidden="true">✓</span>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.semEvidencias}>Nenhum dado em comum com a sua consulta foi identificado.</p>
      )}
      {resultado.contradicoes.length ? (
        <div className={styles.contradicoes}>
          <span>O que diverge</span>
          <ul>
            {resultado.contradicoes.map((item) => (
              <li key={item}><span aria-hidden="true">⚠</span>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ComparacaoMemoria comparacoes={comparacoes} />
      <div className={styles.fonte}>
        <strong className={styles.dominio} title={resultado.dominio}>{resultado.dominio}</strong>
        <div className={styles.acoesResultado}>
          {resultado.comparavelId ? (
            <Link className="btn btn-primary" href={urlAvaliacaoDoComparavel(resultado.comparavelId)}>
              Usar na Avaliação
            </Link>
          ) : null}
          <a className="btn" href={resultado.url} target="_blank" rel="noreferrer">
            Abrir fonte <span aria-hidden="true">↗</span>
            <span className={styles.somenteLeitor}> (abre em nova aba)</span>
          </a>
        </div>
      </div>
    </article>
  );
}

function GrupoResultados({
  id,
  titulo,
  explicacao,
  itens,
  resultado,
  compacto,
}: {
  id: string;
  titulo: string;
  explicacao: string;
  itens: CorrespondenciaInvestigacao[];
  resultado: ResultadoInvestigacao;
  compacto: boolean;
}) {
  if (!itens.length) return null;
  return (
    <section className={styles.grupo} aria-labelledby={id} data-grupo={id}>
      <div className={styles.grupoCabecalho}>
        <h3 id={id}>{titulo} <span>({itens.length})</span></h3>
        <p>{explicacao}</p>
      </div>
      <div className={styles.gradeResultados}>
        {itens.map((item) => (
          <CardResultado
            key={item.url}
            resultado={item}
            compacto={compacto}
            comparacoes={resultado.memoriaConfirmada?.porResultado.find((comparacao) => comparacao.url === item.url)?.comparacoes ?? []}
          />
        ))}
      </div>
    </section>
  );
}

/** Texto da única região viva do painel. Só usa o que o stream entrega: a
    etapa atual e as pesquisas já concluídas (nunca a que está rodando). */
export function textoAndamentoInvestigacao(etapa: EtapaVisual, pesquisasConcluidas: number): string {
  if (etapa === "concluido") {
    return pesquisasConcluidas
      ? `${plural(pesquisasConcluidas, "pesquisa realizada", "pesquisas realizadas")}.`
      : "Resultados prontos.";
  }
  if (etapa === "pesquisando-web") {
    return pesquisasConcluidas
      ? `Pesquisando na web… ${pesquisasConcluidas} de até ${MAXIMO_BUSCAS_POR_INVESTIGACAO} pesquisas concluídas.`
      : "Pesquisando na web… a primeira pesquisa está em andamento.";
  }
  const atual = ETAPAS.find((item) => item.id === etapa);
  return atual ? `${atual.titulo}… ${atual.detalhe}` : "";
}

function Processamento({
  etapa,
  pesquisasConcluidas,
  consultas,
  pesquisasEvitadas,
}: {
  etapa: EtapaVisual;
  pesquisasConcluidas: number;
  consultas: string[];
  pesquisasEvitadas: number;
}) {
  const concluida = etapa === "concluido";
  const atual = concluida ? ETAPAS.length : ETAPAS.findIndex((item) => item.id === etapa);
  return (
    <section
      className={styles.processamento}
      data-concluida={concluida ? "sim" : "nao"}
      aria-label="Andamento da investigação"
    >
      <div className={styles.processamentoCabecalho}>
        <span className={concluida ? styles.concluidoIcone : styles.pulso} aria-hidden="true">{concluida ? "✓" : null}</span>
        <div>
          <strong>{concluida ? "Investigação concluída" : "Investigação em andamento"}</strong>
          <small role="status" aria-live="polite">{textoAndamentoInvestigacao(etapa, pesquisasConcluidas)}</small>
        </div>
      </div>
      {!concluida ? (
        <ol>
          {ETAPAS.map((item, indice) => {
            const estado = indice < atual ? "concluida" : indice === atual ? "ativa" : "pendente";
            return (
              <li key={item.id} data-estado={estado} aria-current={estado === "ativa" ? "step" : undefined}>
                <i aria-hidden="true">{estado === "concluida" ? "✓" : indice + 1}</i>
                <div><strong>{item.titulo}</strong><small>{item.detalhe}</small></div>
              </li>
            );
          })}
        </ol>
      ) : consultas.length ? (
        <details className={styles.consultas}>
          <summary>Ver {consultas.length === 1 ? "a pesquisa feita" : `as ${consultas.length} pesquisas feitas`}</summary>
          <ol>{consultas.map((item) => <li key={item}>{item}</li>)}</ol>
          {pesquisasEvitadas ? (
            <p>
              {plural(pesquisasEvitadas, "pesquisa dispensada", "pesquisas dispensadas")} porque já havia sinais suficientes.
            </p>
          ) : null}
        </details>
      ) : null}
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
  garimpo: "Garimpo em Campo",
} as const;

const PREPOSICAO_ORIGEM_CONTEXTO: Record<keyof typeof ROTULO_ORIGEM_CONTEXTO, string> = {
  pipeline: "do",
  radar: "do",
  central: "da",
  garimpo: "do",
};

/** C13B: o que a tela diz sobre a memória do imóvel depois da pesquisa.
    Só contagens; a memória em si é lida no Garimpo (C13C). Falha é
    explícita: a pesquisa aconteceu, mas nada foi guardado. */
export function mensagemMemoriaInvestigacao(memoria: MemoriaInvestigacao): string {
  const n = memoria.atributosSalvos;
  const informacoes = n === 1 ? "1 informação" : `${n} informações`;
  switch (memoria.estado) {
    case "salva":
      return n > 0
        ? `Memória do imóvel atualizada: ${informacoes} estruturada${n === 1 ? "" : "s"} salva${n === 1 ? "" : "s"} com a fonte.`
        : "Investigação registrada na memória do imóvel. Nenhuma informação estruturada foi encontrada desta vez.";
    case "repetida":
      return "Esta investigação já estava registrada na memória do imóvel.";
    case "recusada":
      return "Investigação concluída, mas a memória do imóvel não aceitou o registro. Verifique a situação do registro no Garimpo em Campo.";
    case "falhou":
      return "Investigação concluída, mas a memória do imóvel não foi salva. Investigue novamente para tentar de novo.";
    default:
      return "Investigação concluída. A memória do imóvel não está disponível neste ambiente.";
  }
}

/** Divide só para apresentação, pela faixa que já veio do servidor. `filter`
    é estável: cada grupo mantém exatamente a ordem recebida, e a união dos
    dois é a lista inteira (as quatro faixas são cobertas). */
export function agruparResultadosPorFaixa(resultados: readonly CorrespondenciaInvestigacao[]) {
  const melhor = (item: CorrespondenciaInvestigacao) => item.confianca === "muito-forte" || item.confianca === "forte";
  return {
    melhores: resultados.filter(melhor),
    outros: resultados.filter((item) => !melhor(item)),
  };
}

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
      // Na origem do Garimpo a referência vai junto: o servidor confere a
      // posse e, concluída a pesquisa, grava a memória e anota a data na
      // mesma transação (C13B). Nada muda de situação nem vira
      // oportunidade; o que aconteceu com a memória volta em `memoria`.
      await investigarImovel(limpa, (eventoRecebido) => {
        if (eventoRecebido.tipo === "etapa") setEtapa(eventoRecebido.etapa);
        if (eventoRecebido.tipo === "consultas") setConsultasRealizadas(eventoRecebido.consultas);
        if (eventoRecebido.tipo === "resultado") {
          setResultado(eventoRecebido.dados);
          setEtapa("concluido");
        }
        if (eventoRecebido.tipo === "erro") falhaRecebida = eventoRecebido.mensagem;
      }, undefined, referenciaInicial);
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

  const grupos = resultado ? agruparResultadosPorFaixa(resultado.resultados) : null;
  const avisoResultado = resultado?.aviso && !(resultado.resultados.length === 0 && resultado.aviso === AVISO_SEM_RESULTADOS)
    ? resultado.aviso
    : "";

  return (
    <div className={styles.pagina}>
      <section className={styles.hero}>
        <div className={styles.heroIcone}><IconeInvestigador /></div>
        <p>
          <strong>Procure o imóvel em anúncios e páginas públicas.</strong>{" "}
          Informe endereço, referência, condomínio ou características; o resultado mostra o que bate e o que diverge.
        </p>
      </section>

      {origemContexto ? (
        <div className={styles.contexto} role="status">
          {`Dados do imóvel carregados ${PREPOSICAO_ORIGEM_CONTEXTO[origemContexto]} ${ROTULO_ORIGEM_CONTEXTO[origemContexto]}. Revise a consulta antes de investigar.`}
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
          aria-describedby="ajuda-consulta-investigador"
          disabled={processando || carregandoContexto}
        />
        <div className={styles.formularioRodape}>
          <span id="ajuda-consulta-investigador">
            {carregandoContexto
              ? "Carregando dados do imóvel…"
              : `Você pode editar o texto antes de investigar. Não inclua dados pessoais. ${consulta.length}/${LIMITE_CONSULTA_INVESTIGADOR}`}
          </span>
          <button className="btn btn-primary" type="submit" disabled={processando || carregandoContexto || consulta.trim().length < 3}>
            {processando ? "Investigando…" : "Investigar imóvel"}
          </button>
        </div>
      </form>

      {erro ? <div className={styles.erro} role="alert">{erro}</div> : null}
      {etapa ? (
        <Processamento
          etapa={etapa}
          pesquisasConcluidas={etapa === "concluido" && resultado ? resultado.consultas.length : consultasRealizadas.length}
          consultas={resultado?.consultas ?? []}
          pesquisasEvitadas={resultado?.encerramentoAntecipado ? resultado.pesquisasEvitadas : 0}
        />
      ) : null}

      {resultado && grupos ? (
        <section className={styles.resultados} aria-labelledby="titulo-resultados-investigador">
          <div className={styles.resultadosCabecalho}>
            <span>POSSÍVEIS CORRESPONDÊNCIAS</span>
            <h2 id="titulo-resultados-investigador">{plural(resultado.resultados.length, "resultado", "resultados")}</h2>
            <p>
              A faixa indica o quanto o anúncio se parece com a sua consulta. Ela não confirma que é o mesmo imóvel:
              abra a fonte para conferir.
            </p>
          </div>
          {avisoResultado ? <div className={styles.aviso}>{avisoResultado}</div> : null}
          {resultado.memoria ? (
            <div
              className={resultado.memoria.estado === "falhou" ? styles.erro : styles.contexto}
              role={resultado.memoria.estado === "falhou" ? "alert" : "status"}
              data-memoria={resultado.memoria.estado}
            >
              {mensagemMemoriaInvestigacao(resultado.memoria)}
            </div>
          ) : null}
          {resultado.memoriaConfirmada?.conflitosConfirmacoes.length ? (
            <p className={styles.memoriaConflito} role="status">
              Há confirmações incompatíveis na memória; esses atributos não foram usados na comparação.
            </p>
          ) : null}
          {resultado.resultados.length ? (
            <>
              <GrupoResultados
                id="grupo-melhores"
                titulo="Melhores correspondências"
                explicacao="Têm dados de identificação em comum com a sua consulta."
                itens={grupos.melhores}
                resultado={resultado}
                compacto={false}
              />
              <GrupoResultados
                id="grupo-outros"
                titulo="Outros resultados"
                explicacao="Pouca informação em comum com a sua consulta ou algo divergente. Confira na fonte antes de usar."
                itens={grupos.outros}
                resultado={resultado}
                compacto
              />
            </>
          ) : (
            <div className={styles.vazio} data-vazio>
              <strong>Nenhuma correspondência encontrada</strong>
              <span>Tente acrescentar cidade, bairro, referência ou uma característica específica.</span>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
