"use client";

import { fmtDataHoraIso } from "@/lib/datas";
import { fmtDate } from "@/lib/formatadores";
import type { AcaoAssistente } from "@/lib/assistente/tipos";
import styles from "./Assistente.module.css";

interface Props {
  acao: AcaoAssistente;
  processando: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

function tituloDoEstado(acao: AcaoAssistente): string {
  if (acao.estado === "ready_for_confirmation") return "Confirmação necessária";
  if (acao.estado === "succeeded") {
    if (acao.tipo === "alterar_status_sem_resposta_em_lote") return "Alteração concluída";
    if (acao.tipo === "agendar_visita") return "Visita agendada";
    if (acao.tipo === "criar_compromisso") return "Compromisso criado";
    if (acao.tipo === "registrar_tentativa") return "Tentativa registrada";
    if (acao.tipo === "criar_followup") return "Follow-up criado";
    if (acao.tipo === "reagendar_followup") return "Follow-up reagendado";
    return "Follow-up concluído";
  }
  if (acao.estado === "cancelled") return "Ação cancelada";
  if (acao.estado === "expired") return "Confirmação expirada";
  return "Não foi possível concluir";
}

function motivoIgnorado(motivo: "status_alterado" | "nao_elegivel" | "imovel_indisponivel"): string {
  if (motivo === "status_alterado") return "status alterado após a preparação";
  if (motivo === "nao_elegivel") return "recebeu resposta ou deixou de atender aos critérios";
  return "não está mais disponível na carteira";
}

export default function AcaoAssistenteCard({ acao, processando, aoConfirmar, aoCancelar }: Props) {
  const pendente = acao.estado === "ready_for_confirmation";
  return (
    <section className={`${styles.acaoCard} ${styles[`acao_${acao.estado}`]}`} aria-busy={processando}>
      <header className={styles.acaoCabecalho}>
        <span aria-hidden="true">{pendente ? "🛡" : acao.estado === "succeeded" ? "✓" : "○"}</span>
        <span>
          <strong>{tituloDoEstado(acao)}</strong>
          <small>{pendente ? "Revise os detalhes antes de confirmar." : acao.erro || acao.motivo.descricao}</small>
        </span>
      </header>

      {acao.tipo === "alterar_status_sem_resposta_em_lote" ? (
        <>
          <dl className={styles.acaoDetalhes}>
            <div><dt>Operação</dt><dd>{acao.operacao}</dd></div>
            <div><dt>Novo status</dt><dd>{acao.dados.statusDestino}</dd></div>
            <div><dt>Imóveis preparados</dt><dd>{acao.dados.quantidade}</dd></div>
            <div className={styles.acaoLinhaCompleta}><dt>Impacto</dt><dd>{acao.impacto}</dd></div>
          </dl>
          <details className={styles.acaoLista} open={acao.dados.quantidade <= 5}>
            <summary>Ver {acao.dados.quantidade === 1 ? "1 imóvel" : `${acao.dados.quantidade} imóveis`}</summary>
            <ul>
              {acao.entidade.imoveis.map((imovel) => (
                <li key={imovel.id}>
                  <strong>{imovel.codigo}</strong>
                  <span>{imovel.endereco}</span>
                  <small>{imovel.tentativas} tentativa{imovel.tentativas === 1 ? "" : "s"} · {imovel.statusPreparado} → {acao.dados.statusDestino}</small>
                </li>
              ))}
            </ul>
          </details>
          {acao.resultado && (
            <div className={styles.acaoResultado}>
              <strong>{acao.resultado.totalAlterados} alterado{acao.resultado.totalAlterados === 1 ? "" : "s"}</strong>
              {acao.resultado.totalIgnorados > 0 && (
                <>
                  <span>{acao.resultado.totalIgnorados} não alterado{acao.resultado.totalIgnorados === 1 ? "" : "s"}</span>
                  <ul>
                    {acao.resultado.ignorados.map((imovel) => (
                      <li key={imovel.id}><b>{imovel.codigo}</b>: {motivoIgnorado(imovel.motivo)}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </>
      ) : acao.tipo === "registrar_tentativa" ? (
        <dl className={styles.acaoDetalhes}>
          <div><dt>Operação</dt><dd>{acao.operacao}</dd></div>
          <div><dt>Imóvel</dt><dd>{acao.entidade.codigo}</dd></div>
          <div><dt>Canal</dt><dd>{acao.dados.canal}</dd></div>
          <div><dt>Resultado</dt><dd>{acao.dados.resultado}</dd></div>
          {acao.dados.observacao ? <div className={styles.acaoLinhaCompleta}><dt>Observação</dt><dd>{acao.dados.observacao}</dd></div> : null}
          <div className={styles.acaoLinhaCompleta}><dt>Motivo</dt><dd>{acao.motivo.descricao}</dd></div>
          <div className={styles.acaoLinhaCompleta}><dt>Impacto</dt><dd>{acao.impacto}</dd></div>
        </dl>
      ) : (
        <dl className={styles.acaoDetalhes}>
          <div><dt>Operação</dt><dd>{acao.operacao}</dd></div>
          {acao.tipo === "criar_compromisso" ? (
            <>
              <div><dt>Título</dt><dd>{acao.dados.titulo}</dd></div>
              <div><dt>Tipo</dt><dd>{acao.dados.tipo}</dd></div>
            </>
          ) : null}
          {acao.tipo === "reagendar_followup" ? (
            <div><dt>Data anterior</dt><dd>{fmtDate(acao.dados.dataAnterior)}{acao.dados.horaAnterior ? ` às ${acao.dados.horaAnterior}` : ""}</dd></div>
          ) : null}
          {acao.entidade.imovelId ? <div><dt>Imóvel</dt><dd>{acao.entidade.codigo}</dd></div> : null}
          {acao.entidade.endereco ? <div className={styles.acaoLinhaCompleta}><dt>Endereço</dt><dd>{acao.entidade.endereco}</dd></div> : null}
          <div><dt>Data</dt><dd>{fmtDate(acao.dados.data)}</dd></div>
          <div><dt>Horário</dt><dd>{acao.dados.hora || "Não informado"}</dd></div>
          {acao.entidade.responsavel ? <div><dt>Responsável</dt><dd>{acao.entidade.responsavel}</dd></div> : null}
          {acao.tipo === "criar_compromisso" && acao.dados.observacao
            ? <div className={styles.acaoLinhaCompleta}><dt>Observação</dt><dd>{acao.dados.observacao}</dd></div>
            : null}
          <div className={styles.acaoLinhaCompleta}><dt>Impacto</dt><dd>{acao.impacto}</dd></div>
          <div className={styles.acaoLinhaCompleta}><dt>Motivo</dt><dd>{acao.motivo.descricao}</dd></div>
        </dl>
      )}

      {pendente && (
        <>
          <p className={styles.acaoSeguranca}>
            🔒 O Assistente só executa após sua confirmação. {acao.expiraEm ? `Válida até ${fmtDataHoraIso(acao.expiraEm)}.` : ""}
          </p>
          <div className={styles.acaoBotoes}>
            <button type="button" className={styles.acaoConfirmar} onClick={aoConfirmar} disabled={processando}>
              {processando ? "Executando…" : "✓ Confirmar"}
            </button>
            <button type="button" className={styles.acaoCancelar} onClick={aoCancelar} disabled={processando}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
