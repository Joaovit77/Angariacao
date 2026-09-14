"use client";

/* Painel do imóvel visto em campo (C4 → C9.1).

   A ordem é a da leitura em campo: o que é e onde; o que precisa de
   atenção (e só quando precisa); o que sabemos agora; as ações; o que já
   foi visto e não voltou; o histórico de passagens; localização e
   possíveis duplicatas; por último, os detalhes da análise para quem
   quiser conferir. Tudo aqui é apresentação: estados, vigência, revisão e
   RPCs são os mesmos do C9. */
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";

import { identidadeParaDedupe, vigenciaDasEtiquetas } from "@/lib/prospeccao";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { fmtDataHoraIso } from "@/lib/datas";
import type {
  AvistamentoLongitudinal,
  DetalheImovelIdentificado,
  EtiquetaIdentificado,
} from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";

import CandidatosDuplicidade from "./CandidatosDuplicidade";
import DialogoExcluirIdentificado, { AVISO_CANCELAR_EXCLUSAO } from "./DialogoExcluirIdentificado";

const MapaProspeccao = dynamic(() => import("./MapaProspeccao"), { ssr: false });
import AvisoRevisaoConflito from "./AvisoRevisaoConflito";
import { ROTULOS_SITUACAO, tipoComMarca } from "./CardIdentificado";
import {
  ChipEtiqueta,
  EXPLICACAO_APOIO,
  HistoricoEtiquetas,
  apoioNoTexto,
  descreverProveniencia,
  explicarEtiqueta,
  rotuloEtiqueta,
} from "./EtiquetasImovel";
import LinhaDoTempoAvistamentos from "./LinhaDoTempoAvistamentos";
import styles from "./Prospeccao.module.css";
import SeloExclusaoPendente from "./SeloExclusaoPendente";
import { mensagemFalhaAnalise } from "./textosAnalise";

export const EXPLICACAO_CONFIRMAR =
  "Você passa a confirmar esta informação. Se o texto for corrigido depois, a confirmação é mantida, mas pode aparecer para revisão.";
export const EXPLICACAO_INCORRETA =
  "Ela deixa de aparecer como informação atual e permanece no histórico.";
export const EXPLICACAO_CONFIRMAR_TIPO =
  "Você confirma a sugestão de tipo. Ela ficará marcada como confirmada por você.";
export const EXPLICACAO_INFORMAR_TIPO =
  "Substitui a sugestão automática por uma informação definida por você.";
export const EXPLICACAO_CORRIGIR_TEXTO =
  "A análise será refeita sobre o texto novo. Informações que você confirmou são mantidas e podem aparecer para revisão.";

function enderecoCompleto(detalhe: DetalheImovelIdentificado): string {
  const item = detalhe.identificado;
  const endereco = [item.logradouro, item.numero].filter(Boolean).join(", ");
  const complemento = [item.unidade, item.bloco, item.edificio].filter(Boolean).join(" · ");
  const local = [item.bairro, item.cidade, item.estado].filter(Boolean).join(" · ");
  return [endereco, complemento, local].filter(Boolean).join(" — ")
    || item.pontoReferencia
    || "Local ainda sem endereço";
}

function FormularioCorrecao({
  identificadoId,
  avistamento,
}: {
  identificadoId: string;
  avistamento: AvistamentoLongitudinal;
}) {
  const [observacao, setObservacao] = useState(avistamento.observacao);
  const corrigir = useProspeccao((estado) => estado.corrigirObservacao);
  const salvando = useProspeccao((estado) => estado.salvando);
  const alterada = observacao !== avistamento.observacao;

  async function salvar() {
    if (!alterada || salvando) return;
    await corrigir(identificadoId, avistamento.id, observacao);
  }

  return (
    <div className={styles.formularioCompacto}>
      <label htmlFor={`observacao-${avistamento.id}`}>
        Texto da última passagem
        <textarea
          id={`observacao-${avistamento.id}`}
          maxLength={2000}
          rows={3}
          value={observacao}
          onChange={(evento) => setObservacao(evento.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!alterada || salvando}
        onClick={() => void salvar()}
      >
        {salvando ? "Salvando…" : "Salvar texto corrigido"}
      </button>
      <small className={styles.explicacao}>{EXPLICACAO_CORRIGIR_TEXTO}</small>
    </div>
  );
}

const ROTULOS_ESTADO_TIPO: Record<NonNullable<DetalheImovelIdentificado["identificado"]["tipoEstado"]>, string> = {
  declarado: "informado por você",
  inferido: "sugestão da IA",
  confirmado: "confirmado por você",
};

/** O tipo com a marca de quem disse: apresentação, não segunda fonte
    (§7.2). Confirmar uma sugestão da IA NÃO a torna manual: a origem
    `ia-texto` e os ids da execução ficam como estão; muda só o estado. */
function TipoComProveniencia({ detalhe }: { detalhe: DetalheImovelIdentificado }) {
  const item = detalhe.identificado;
  const confirmarTipo = useProspeccao((estado) => estado.confirmarTipo);
  const salvando = useProspeccao((estado) => estado.salvando);
  if (!item.tipo) {
    return (
      <div className={styles.tipoAtual}>
        <strong>Tipo não definido</strong>
        <small className={styles.explicacao}>Informe o tipo em “Ações”, ou aguarde a sugestão da próxima análise.</small>
      </div>
    );
  }
  const estadoTipo = item.tipoEstado;
  const classeMarca = estadoTipo === "inferido"
    ? styles.tipoInferido
    : estadoTipo === "confirmado" ? styles.tipoConfirmado : styles.tipoDeclarado;
  const passagem = detalhe.avistamentos.find((candidato) => candidato.id === item.tipoAvistamentoId);
  let explicacao = "";
  if (item.tipoOrigem === "ia-texto" && estadoTipo === "confirmado") {
    explicacao = `Sugestão da IA confirmada por você${item.tipoConfirmadoEm ? ` em ${fmtDataHoraIso(item.tipoConfirmadoEm)}` : ""}.`;
  } else if (item.tipoOrigem === "ia-texto") {
    explicacao = `Sugestão da IA a partir do texto${passagem ? ` da passagem de ${fmtDataHoraIso(passagem.observadoEm)}` : ""}; ainda não confirmada por uma pessoa.`;
  } else if (item.tipoOrigem === "manual") {
    explicacao = "Informado por você.";
  }
  return (
    <div className={styles.tipoAtual}>
      <strong>
        {item.tipo}
        {estadoTipo ? (
          <span className={`${styles.tipoMarca} ${classeMarca}`} data-tipo-estado={estadoTipo}>
            {ROTULOS_ESTADO_TIPO[estadoTipo]}
          </span>
        ) : null}
      </strong>
      {explicacao ? <small className={styles.explicacao}>{explicacao}</small> : null}
      {estadoTipo === "inferido" && item.tipoOrigem === "ia-texto" ? (
        <>
          <button
            type="button"
            className="btn btn-sm"
            disabled={salvando}
            aria-describedby={`explicacao-confirmar-tipo-${item.id}`}
            onClick={() => void confirmarTipo(item.id)}
          >
            Confirmar que é {item.tipo}
          </button>
          <small className={styles.explicacao} id={`explicacao-confirmar-tipo-${item.id}`}>{EXPLICACAO_CONFIRMAR_TIPO}</small>
        </>
      ) : null}
    </div>
  );
}

function SeletorTipoManual({
  identificadoId,
  tipoAtual,
}: {
  identificadoId: string;
  tipoAtual: DetalheImovelIdentificado["identificado"]["tipo"];
}) {
  const [tipo, setTipo] = useState(tipoAtual ?? "");
  const definirTipo = useProspeccao((estado) => estado.definirTipo);
  const salvando = useProspeccao((estado) => estado.salvando);
  const alterado = tipo !== (tipoAtual ?? "");

  return (
    <div className={styles.formularioCompacto}>
      <label htmlFor={`tipo-${identificadoId}`}>
        Tipo do imóvel
        <select
          id={`tipo-${identificadoId}`}
          value={tipo}
          onChange={(evento) => setTipo(evento.target.value)}
        >
          <option value="">Não definido</option>
          {TIPOS_IMOVEL.map((opcao) => <option value={opcao} key={opcao}>{opcao}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!alterado || salvando}
        onClick={() => void definirTipo(
          identificadoId,
          TIPOS_IMOVEL.find((opcao) => opcao === tipo) ?? null,
        )}
      >
        {salvando ? "Salvando…" : "Informar o tipo"}
      </button>
      <small className={styles.explicacao}>{EXPLICACAO_INFORMAR_TIPO}</small>
    </div>
  );
}

function EtiquetaAtual({
  identificadoId,
  etiqueta,
}: {
  identificadoId: string;
  etiqueta: EtiquetaIdentificado;
}) {
  const confirmar = useProspeccao((estado) => estado.confirmarEtiqueta);
  const contestar = useProspeccao((estado) => estado.contestarEtiqueta);
  const salvando = useProspeccao((estado) => estado.salvando);
  // Só a sugestão pede assinatura; a etiqueta aplicada à mão já é humana.
  const podeConfirmar = etiqueta.estado === "inferida" && etiqueta.origem !== "manual";
  const podeContestar = etiqueta.estado === "inferida" || etiqueta.estado === "confirmada";

  return (
    <div className={styles.etiqueta} data-etiqueta-id={etiqueta.id}>
      <div>
        <ChipEtiqueta etiqueta={etiqueta} />
        <small className={styles.explicacao}>{explicarEtiqueta(etiqueta)}</small>
      </div>
      {podeConfirmar || podeContestar ? (
        <div className={styles.etiquetaAcoes}>
          {podeConfirmar ? (
            <button
              type="button"
              className="btn btn-sm"
              disabled={salvando}
              aria-describedby={`explicacao-confirmar-${identificadoId}`}
              onClick={() => void confirmar(identificadoId, etiqueta.id)}
            >
              Confirmar
            </button>
          ) : null}
          {podeContestar ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={salvando}
              aria-describedby={`explicacao-incorreta-${identificadoId}`}
              onClick={() => void contestar(identificadoId, etiqueta.id)}
            >
              Marcar como incorreta
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type NivelAtencao = "atencao" | "erro" | "info";

export default function PainelIdentificado({
  detalhe,
}: {
  detalhe: DetalheImovelIdentificado;
}) {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const descartar = useProspeccao((estado) => estado.descartar);
  const cancelarExclusao = useProspeccao((estado) => estado.cancelarExclusao);
  const removerFoto = useProspeccao((estado) => estado.removerFoto);
  const classificarAvistamento = useProspeccao((estado) => estado.classificarAvistamento);
  const classificandoAvistamentoId = useProspeccao((estado) => estado.classificandoAvistamentoId);
  const falhaAnalise = useProspeccao((estado) => estado.falhaAnalise) ?? null;
  const salvando = useProspeccao((estado) => estado.salvando);
  const carregarDetalhe = useProspeccao((estado) => estado.carregarDetalhe);
  const carregando = useProspeccao((estado) => estado.carregando);
  const [dialogoExclusao, setDialogoExclusao] = useState<"fechado" | "novo" | "retomada">("fechado");
  const item = detalhe.identificado;
  // §13.4: com a exclusão iniciada, o registro é retomável e nada mais.
  const exclusaoPendente = Boolean(item.exclusaoSolicitadaEm);
  const corrente = detalhe.avistamentos.find(
    (avistamento) => avistamento.id === item.avistamentoCorrenteId,
  ) ?? null;
  // Vigência derivada (§6.1): atual = vigente na passagem mais recente ou
  // afirmação humana sobre o lugar; o resto é histórico, nunca a união.
  const vigencia = vigenciaDasEtiquetas(detalhe);
  const codigosAtuais = new Set(
    vigencia.filter((etiqueta) => etiqueta.vigenteNoAvistamentoCorrente)
      .map((etiqueta) => `${etiqueta.categoria}:${etiqueta.codigo}`),
  );
  const etiquetasAtuais = [
    ...detalhe.etiquetasDoImovel,
    ...(corrente?.etiquetas ?? []),
  ].filter((etiqueta) =>
    (etiqueta.estado === "inferida" || etiqueta.estado === "confirmada")
    && codigosAtuais.has(`${etiqueta.categoria}:${etiqueta.codigo}`));
  const historicoEtiquetas = vigencia.filter((etiqueta) => !etiqueta.vigenteNoAvistamentoCorrente);
  const podeDescartar = item.situacao === "identificado" || item.situacao === "investigando";
  const situacao = ROTULOS_SITUACAO[item.situacao];
  const ultimaPassagem = fmtDataHoraIso(item.ultimoAvistamentoEm);
  const resumoCabecalho = [
    tipoComMarca(item),
    situacao || null,
    ultimaPassagem ? `Última passagem ${ultimaPassagem}` : "Sem passagem registrada",
  ].filter(Boolean).join(" · ");

  // O que pede atenção, e só quando pede. Níveis: atenção (revisar),
  // erro (a análise não aconteceu), informação (algo aguarda você).
  const sugestoesPendentes = etiquetasAtuais.filter(
    (etiqueta) => etiqueta.estado === "inferida" && etiqueta.origem !== "manual",
  ).length;
  const naoAnalisada = Boolean(corrente)
    && (corrente!.classificacaoEstado === "pendente" || corrente!.classificacaoEstado === "indisponivel");
  const analisando = Boolean(corrente) && classificandoAvistamentoId === corrente!.id;
  const motivoFalha = corrente && naoAnalisada && !analisando && falhaAnalise?.avistamentoId === corrente.id
    ? mensagemFalhaAnalise(falhaAnalise.codigo)
    : corrente && naoAnalisada && !analisando && corrente.classificacaoEstado === "indisponivel"
      ? mensagemFalhaAnalise("indisponivel")
      : null;
  const confirmadasDaPassagem = (corrente?.etiquetas ?? [])
    .filter((etiqueta) => etiqueta.estado === "confirmada")
    .map((etiqueta) => rotuloEtiqueta(etiqueta));
  const atencao: { chave: string; nivel: NivelAtencao; conteudo: ReactNode }[] = [];
  if (corrente?.revisaoConflitoEm) {
    atencao.push({
      chave: "conflito",
      nivel: "atencao",
      conteudo: (
        <AvisoRevisaoConflito
          revisaoConflitoEm={corrente.revisaoConflitoEm}
          revisaoObservacao={corrente.observacaoRevisao}
          etiquetasConfirmadas={confirmadasDaPassagem}
        />
      ),
    });
  }
  if (corrente && motivoFalha) {
    atencao.push({
      chave: "falha",
      nivel: "erro",
      conteudo: (
        <div className={styles.atencaoItemCorpo} role="status">
          <div>
            <strong>Não foi possível analisar a observação.</strong>
            <p>{motivoFalha}</p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void classificarAvistamento(item.id, corrente.id)}
          >
            Tentar de novo
          </button>
        </div>
      ),
    });
  } else if (corrente && analisando) {
    atencao.push({
      chave: "analisando",
      nivel: "info",
      conteudo: (
        <div className={styles.atencaoItemCorpo} role="status">
          <div><strong>Analisando a observação…</strong></div>
          <button type="button" className="btn btn-sm btn-ghost" disabled>Analisar agora</button>
        </div>
      ),
    });
  } else if (corrente && naoAnalisada) {
    atencao.push({
      chave: "nao-analisada",
      nivel: "info",
      conteudo: (
        <div className={styles.atencaoItemCorpo} role="status">
          <div>
            <strong>
              {corrente.observacaoRevisao > 1
                ? "O texto foi corrigido; a análise será refeita."
                : "A observação desta passagem ainda não foi analisada."}
            </strong>
            <p>A análise identifica, no texto, sinais como placa, imóvel fechado ou obra. Você confirma depois.</p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void classificarAvistamento(item.id, corrente.id)}
          >
            Analisar agora
          </button>
        </div>
      ),
    });
  }
  if (sugestoesPendentes > 0) {
    atencao.push({
      chave: "sugestoes",
      nivel: "info",
      conteudo: (
        <div className={styles.atencaoItemCorpo}>
          <div>
            <strong>
              {sugestoesPendentes === 1
                ? "1 sugestão da IA ainda não confirmada."
                : `${sugestoesPendentes} sugestões da IA ainda não confirmadas.`}
            </strong>
            <p>Confirme o que você viu no local ou marque como incorreta. Até lá, continua valendo como sugestão.</p>
          </div>
        </div>
      ),
    });
  }

  async function confirmarDescarte() {
    if (!window.confirm("Descartar este imóvel? Ele sai da lista, mas nada é apagado: o histórico fica preservado e você pode voltar a vê-lo em “Mostrar ocultos”.")) return;
    await descartar(item.id, "Descartado manualmente no Garimpo em Campo");
  }

  async function confirmarCancelamentoDaExclusao() {
    if (!window.confirm(AVISO_CANCELAR_EXCLUSAO)) return;
    await cancelarExclusao(item.id);
  }

  async function confirmarRemocaoDeFoto(fotoId: string) {
    if (!window.confirm("Remover esta foto desta passagem? O arquivo de foto será apagado.")) return;
    await removerFoto(item.id, fotoId);
  }

  if (item.situacao === "fundido" && !exclusaoPendente) {
    return (
      <article className={styles.painel} aria-label="Detalhe do imóvel visto em campo">
        <div className={styles.painelCabecalho}>
          <div>
            <span className={styles.sobretitulo}>UNIDO A OUTRO REGISTRO</span>
            <h3>{enderecoCompleto(detalhe)}</h3>
            <p>Este registro foi unido a outro em {fmtDataHoraIso(item.fundidoEm)}.</p>
          </div>
        </div>
        <div className={styles.resumoFusao}>
          <p>Ele fica aqui como memória da união. Todas as passagens e fotos estão no registro principal.</p>
          {item.fundidoEmImovelId ? (
            <button type="button" className="btn btn-primary" disabled={salvando || carregando}
              onClick={() => void carregarDetalhe(item.fundidoEmImovelId!)}>
              Abrir registro principal e histórico unido
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  if (exclusaoPendente) {
    return (
      <article className={styles.painel} aria-label="Detalhe do imóvel visto em campo">
        <div className={styles.painelCabecalho}>
          <div>
            <span className={styles.sobretitulo}>IMÓVEL VISTO EM CAMPO</span>
            <h3>{enderecoCompleto(detalhe)}</h3>
            <p>Exclusão em andamento: só é possível retomar ou cancelar.</p>
          </div>
        </div>
        <SeloExclusaoPendente
          exclusaoSolicitadaEm={item.exclusaoSolicitadaEm ?? ""}
          ocupado={salvando || dialogoExclusao !== "fechado"}
          aoRetomar={() => setDialogoExclusao("retomada")}
          aoCancelar={() => void confirmarCancelamentoDaExclusao()}
        />
        {dialogoExclusao !== "fechado" ? (
          <DialogoExcluirIdentificado
            imovelIdentificadoId={item.id}
            retomada
            aoFechar={() => setDialogoExclusao("fechado")}
          />
        ) : null}
        <section className={styles.secao}>
          <div className={styles.secaoCabecalho}>
            <h4>Histórico de passagens</h4>
            <span>Somente leitura durante a exclusão</span>
          </div>
          <LinhaDoTempoAvistamentos
            avistamentos={detalhe.avistamentos}
            avistamentoCorrenteId={item.avistamentoCorrenteId}
          />
        </section>
      </article>
    );
  }

  return (
    <article className={styles.painel} aria-label="Detalhe do imóvel visto em campo">
      {/* 1. Cabeçalho: o que é, onde, quando foi visto por último. */}
      <div className={styles.painelCabecalho}>
        <div>
          <span className={styles.sobretitulo}>IMÓVEL VISTO EM CAMPO</span>
          <h3>{enderecoCompleto(detalhe)}</h3>
          <p data-resumo-cabecalho>{resumoCabecalho}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={salvando}
          onClick={() => abrirModal("avistamento", item.id)}
        >
          Nova passagem
        </button>
      </div>

      {/* 2. Precisa de atenção: só existe quando há algo a fazer. */}
      {atencao.length ? (
        <section className={`${styles.secao} ${styles.atencao}`} aria-label="Precisa de atenção">
          <div className={styles.secaoCabecalho}>
            <h4>Precisa de atenção</h4>
          </div>
          <ul className={styles.atencaoLista}>
            {atencao.map((entrada) => (
              <li key={entrada.chave} className={styles.atencaoItem} data-nivel={entrada.nivel} data-atencao={entrada.chave}>
                {entrada.conteudo}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 3. O que sabemos agora: tipo e etiquetas vigentes, com quem disse. */}
      <section className={styles.secao} aria-label="O que sabemos agora">
        <div className={styles.secaoCabecalho}>
          <h4>O que sabemos agora</h4>
          <span>
            {etiquetasAtuais.length
              ? `${etiquetasAtuais.length} informaç${etiquetasAtuais.length === 1 ? "ão" : "ões"} da passagem mais recente`
              : "Passagem mais recente"}
          </span>
        </div>
        <TipoComProveniencia detalhe={detalhe} />
        {etiquetasAtuais.length ? (
          <>
            <div className={styles.etiquetas}>
              {etiquetasAtuais.map((etiqueta) => (
                <EtiquetaAtual identificadoId={item.id} etiqueta={etiqueta} key={etiqueta.id} />
              ))}
            </div>
            <p className={styles.legendaAcoes}>
              <span id={`explicacao-confirmar-${item.id}`}><b>Confirmar:</b> {EXPLICACAO_CONFIRMAR}</span>
              {" "}
              <span id={`explicacao-incorreta-${item.id}`}><b>Marcar como incorreta:</b> {EXPLICACAO_INCORRETA}</span>
            </p>
          </>
        ) : (
          <p className={styles.vazioInterno}>
            {corrente?.classificacaoEstado === "nao_aplicavel"
              ? "Sem texto suficiente para analisar nesta passagem."
              : "Nada identificado ainda nesta observação."}
          </p>
        )}
      </section>

      {/* 4. Ações principais, recolhidas: corrigir o texto e informar o tipo. */}
      <section className={styles.secao} aria-label="Ações">
        <div className={styles.secaoCabecalho}>
          <h4>Ações</h4>
        </div>
        {corrente ? (
          <details className={styles.detalhes} data-acao="corrigir-texto">
            <summary>Corrigir o texto da última passagem</summary>
            <div className={styles.detalhesCorpo}>
              <FormularioCorrecao
                key={`${corrente.id}:${corrente.observacaoRevisao}`}
                identificadoId={item.id}
                avistamento={corrente}
              />
            </div>
          </details>
        ) : null}
        <details className={styles.detalhes} data-acao="informar-tipo">
          <summary>Informar o tipo</summary>
          <div className={styles.detalhesCorpo}>
            <SeletorTipoManual
              key={`${item.id}:${item.tipo ?? "sem-tipo"}`}
              identificadoId={item.id}
              tipoAtual={item.tipo}
            />
          </div>
        </details>
      </section>

      {/* 5. Visto anteriormente: o que já foi percebido e não voltou. */}
      {historicoEtiquetas.length ? (
        <section className={styles.secao}>
          <div className={styles.secaoCabecalho}>
            <h4>Visto anteriormente</h4>
            <span>O que já foi percebido neste imóvel e não voltou a aparecer na passagem mais recente.</span>
          </div>
          <HistoricoEtiquetas historico={historicoEtiquetas} />
        </section>
      ) : null}

      {/* 6. Histórico de passagens. */}
      <section className={styles.secao}>
        <div className={styles.secaoCabecalho}>
          <h4>Histórico de passagens</h4>
          <span>{detalhe.avistamentos.length} passage{detalhe.avistamentos.length === 1 ? "m" : "ns"}</span>
        </div>
        <LinhaDoTempoAvistamentos
          avistamentos={detalhe.avistamentos}
          avistamentoCorrenteId={item.avistamentoCorrenteId}
          aoRemoverFoto={salvando ? undefined : (fotoId) => void confirmarRemocaoDeFoto(fotoId)}
          aoClassificar={(avistamentoId) => void classificarAvistamento(item.id, avistamentoId)}
          classificandoAvistamentoId={classificandoAvistamentoId}
          falhaAnalise={falhaAnalise}
        />
      </section>

      {/* 7. Localização e possíveis duplicatas. */}
      <section className={styles.secao}>
        <div className={styles.secaoCabecalho}>
          <h4>Localização</h4>
          <span>Posição aproximada; o círculo é a margem de erro.</span>
        </div>
        {item.latitude !== null && item.longitude !== null ? (
          <MapaProspeccao
            localizacao={{
              latitude: item.latitude,
              longitude: item.longitude,
              acuraciaMetros: item.acuraciaMetros,
              precisaoLocalizacao: item.precisaoLocalizacao,
            }}
          />
        ) : (
          <p className={styles.vazioInterno}>
            Sem localização registrada. A próxima passagem com GPS ou endereço preenche aqui.
          </p>
        )}
      </section>

      <CandidatosDuplicidade
        key={item.id}
        identificado={item}
        fotosIdentificado={detalhe.avistamentos.reduce((total, avistamento) => total + avistamento.fotos.length, 0)}
        alvo={identidadeParaDedupe(item)}
        situacao={item.situacao}
        avistamentosTotal={item.avistamentosTotal}
      />

      {/* 8. Detalhes da análise: auditoria para quem quiser conferir. */}
      <section className={styles.secao}>
        <details className={styles.detalhes} data-detalhes data-detalhes-analise>
          <summary>Detalhes da análise</summary>
          <div className={styles.detalhesCorpo}>
            <ul className={styles.detalhesLista}>
              {item.tipo && item.tipoOrigem === "ia-texto" ? (
                <li>
                  Tipo {item.tipo}: a partir do texto
                  {item.tipoConfianca !== null ? ` · apoio no texto: ${apoioNoTexto(item.tipoConfianca)}` : ""}
                  {item.tipoEstado === "confirmado" && item.tipoConfirmadoEm ? ` · confirmado por você em ${fmtDataHoraIso(item.tipoConfirmadoEm)}` : ""}.
                </li>
              ) : item.tipo ? (
                <li>Tipo {item.tipo}: informado por você.</li>
              ) : null}
              {etiquetasAtuais.map((etiqueta) => (
                <li key={etiqueta.id}>{rotuloEtiqueta(etiqueta)}: {descreverProveniencia(etiqueta)}.</li>
              ))}
              {!etiquetasAtuais.length && !item.tipo ? <li>Nenhuma informação atual para detalhar.</li> : null}
            </ul>
            <small className={styles.explicacao}>{EXPLICACAO_APOIO}</small>
          </div>
        </details>
      </section>

      {/* Outras ações: raras e com consequência; ficam longe do polegar. */}
      <div className={`${styles.acoes} ${styles.acoesSecundarias}`}>
        {podeDescartar ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={salvando}
            title="Sai da lista; nada é apagado."
            onClick={() => void confirmarDescarte()}
          >
            Descartar
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-danger"
          disabled={salvando || dialogoExclusao !== "fechado"}
          onClick={() => setDialogoExclusao("novo")}
        >
          Excluir permanentemente
        </button>
      </div>
      {dialogoExclusao !== "fechado" ? (
        <DialogoExcluirIdentificado
          imovelIdentificadoId={item.id}
          aoFechar={() => setDialogoExclusao("fechado")}
        />
      ) : null}
    </article>
  );
}
