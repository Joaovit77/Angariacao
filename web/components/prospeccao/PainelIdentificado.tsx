"use client";

import { useState } from "react";

import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { fmtDataHoraIso } from "@/lib/datas";
import type {
  AvistamentoLongitudinal,
  DetalheImovelIdentificado,
  EtiquetaIdentificado,
} from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";

import DialogoExcluirIdentificado, { AVISO_CANCELAR_EXCLUSAO } from "./DialogoExcluirIdentificado";
import LinhaDoTempoAvistamentos from "./LinhaDoTempoAvistamentos";
import styles from "./Prospeccao.module.css";
import SeloExclusaoPendente from "./SeloExclusaoPendente";

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
        Corrigir observação do avistamento corrente
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
        {salvando ? "Salvando…" : "Salvar correção"}
      </button>
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
        {salvando ? "Salvando…" : "Definir tipo"}
      </button>
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
  const rotulo = obterEtiquetaCatalogo(etiqueta.categoria, etiqueta.codigo)?.rotulo
    ?? etiqueta.codigo;
  const podeConfirmar = etiqueta.estado === "inferida";
  const podeContestar = etiqueta.estado === "inferida" || etiqueta.estado === "confirmada";

  return (
    <div className={styles.etiqueta}>
      <div>
        <strong>{rotulo}</strong>
        <small>{etiqueta.origem} · {etiqueta.estado}</small>
      </div>
      {podeConfirmar || podeContestar ? (
        <div className={styles.etiquetaAcoes}>
          {podeConfirmar ? (
            <button
              type="button"
              className="btn btn-sm"
              disabled={salvando}
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
              onClick={() => void contestar(identificadoId, etiqueta.id)}
            >
              Contestar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function PainelIdentificado({
  detalhe,
}: {
  detalhe: DetalheImovelIdentificado;
}) {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const descartar = useProspeccao((estado) => estado.descartar);
  const cancelarExclusao = useProspeccao((estado) => estado.cancelarExclusao);
  const removerFoto = useProspeccao((estado) => estado.removerFoto);
  const salvando = useProspeccao((estado) => estado.salvando);
  const [dialogoExclusao, setDialogoExclusao] = useState<"fechado" | "novo" | "retomada">("fechado");
  const item = detalhe.identificado;
  // §13.4: com a exclusão iniciada, o registro é retomável e nada mais.
  const exclusaoPendente = Boolean(item.exclusaoSolicitadaEm);
  const corrente = detalhe.avistamentos.find(
    (avistamento) => avistamento.id === item.avistamentoCorrenteId,
  ) ?? null;
  const etiquetasAtuais = [
    ...detalhe.etiquetasDoImovel,
    ...(corrente?.etiquetas ?? []),
  ].filter((etiqueta) => etiqueta.estado === "inferida" || etiqueta.estado === "confirmada");
  const podeDescartar = item.situacao === "identificado" || item.situacao === "investigando";

  async function confirmarDescarte() {
    if (!window.confirm("Descartar esta identificação e preservar todo o histórico?")) return;
    await descartar(item.id, "Descartado manualmente no Garimpo em Campo");
  }

  async function confirmarCancelamentoDaExclusao() {
    if (!window.confirm(AVISO_CANCELAR_EXCLUSAO)) return;
    await cancelarExclusao(item.id);
  }

  async function confirmarRemocaoDeFoto(fotoId: string) {
    if (!window.confirm("Remover esta foto do avistamento? O arquivo será apagado do Storage.")) return;
    await removerFoto(item.id, fotoId);
  }

  if (exclusaoPendente) {
    return (
      <article className={styles.painel} aria-label="Detalhe do imóvel identificado">
        <div className={styles.painelCabecalho}>
          <div>
            <span className={styles.sobretitulo}>IDENTIDADE DE CAMPO</span>
            <h3>{enderecoCompleto(detalhe)}</h3>
            <p>Registro bloqueado: só é possível retomar ou cancelar a exclusão.</p>
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
            <h4>Linha do tempo</h4>
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
    <article className={styles.painel} aria-label="Detalhe do imóvel identificado">
      <div className={styles.painelCabecalho}>
        <div>
          <span className={styles.sobretitulo}>IDENTIDADE DE CAMPO</span>
          <h3>{enderecoCompleto(detalhe)}</h3>
          <p>Registro independente do Pipeline, com os avistamentos preservados por data.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => abrirModal("avistamento", item.id)}
        >
          Novo avistamento
        </button>
      </div>

      <div className={styles.dados}>
        <div className={styles.dado}><span>Situação</span><strong>{item.situacao}</strong></div>
        <div className={styles.dado}><span>Tipo</span><strong>{item.tipo ?? "Não definido"}</strong></div>
        <div className={styles.dado}>
          <span>Último avistamento</span>
          <strong>{fmtDataHoraIso(item.ultimoAvistamentoEm) || "Não registrado"}</strong>
        </div>
      </div>

      <div className={styles.acoes}>
        {podeDescartar ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={salvando}
            onClick={() => void confirmarDescarte()}
          >
            Descartar identificação
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

      <section className={styles.secao}>
        <div className={styles.secaoCabecalho}>
          <h4>Tipo declarado</h4>
          <span>A definição manual preserva a proveniência.</span>
        </div>
        <SeletorTipoManual
          key={`${item.id}:${item.tipo ?? "sem-tipo"}`}
          identificadoId={item.id}
          tipoAtual={item.tipo}
        />
      </section>

      {corrente ? (
        <section className={styles.secao}>
          <div className={styles.secaoCabecalho}>
            <h4>Observação corrente</h4>
            <span>Revisão {corrente.observacaoRevisao}</span>
          </div>
          <FormularioCorrecao
            key={`${corrente.id}:${corrente.observacaoRevisao}`}
            identificadoId={item.id}
            avistamento={corrente}
          />
        </section>
      ) : null}

      <section className={styles.secao}>
        <div className={styles.secaoCabecalho}>
          <h4>Etiquetas atuais</h4>
          <span>{etiquetasAtuais.length} vigente{etiquetasAtuais.length === 1 ? "" : "s"}</span>
        </div>
        {etiquetasAtuais.length ? (
          <div className={styles.etiquetas}>
            {etiquetasAtuais.map((etiqueta) => (
              <EtiquetaAtual identificadoId={item.id} etiqueta={etiqueta} key={etiqueta.id} />
            ))}
          </div>
        ) : <p className={styles.vazioInterno}>Nenhuma etiqueta atual registrada.</p>}
      </section>

      <section className={styles.secao}>
        <div className={styles.secaoCabecalho}>
          <h4>Linha do tempo</h4>
          <span>{detalhe.avistamentos.length} evento{detalhe.avistamentos.length === 1 ? "" : "s"}</span>
        </div>
        <LinhaDoTempoAvistamentos
          avistamentos={detalhe.avistamentos}
          avistamentoCorrenteId={item.avistamentoCorrenteId}
          aoRemoverFoto={salvando ? undefined : (fotoId) => void confirmarRemocaoDeFoto(fotoId)}
        />
      </section>
    </article>
  );
}
