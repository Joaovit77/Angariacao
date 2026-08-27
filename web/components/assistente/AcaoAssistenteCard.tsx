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
  if (acao.estado === "succeeded") return acao.tipo === "agendar_visita" ? "Visita agendada" : "Compromisso criado";
  if (acao.estado === "cancelled") return "Ação cancelada";
  if (acao.estado === "expired") return "Confirmação expirada";
  return "Não foi possível concluir";
}

export default function AcaoAssistenteCard({ acao, processando, aoConfirmar, aoCancelar }: Props) {
  const pendente = acao.estado === "ready_for_confirmation";
  return (
    <section className={`${styles.acaoCard} ${styles[`acao_${acao.estado}`]}`} aria-busy={processando}>
      <header className={styles.acaoCabecalho}>
        <span aria-hidden="true">{pendente ? "🛡" : acao.estado === "succeeded" ? "✓" : "○"}</span>
        <span>
          <strong>{tituloDoEstado(acao)}</strong>
          <small>{pendente ? "Revise os detalhes antes de confirmar." : acao.erro || "O estado desta ação foi atualizado."}</small>
        </span>
      </header>

      <dl className={styles.acaoDetalhes}>
        <div><dt>Operação</dt><dd>{acao.operacao}</dd></div>
        {acao.tipo === "criar_compromisso" ? (
          <>
            <div><dt>Título</dt><dd>{acao.dados.titulo}</dd></div>
            <div><dt>Tipo</dt><dd>{acao.dados.tipo}</dd></div>
          </>
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
      </dl>

      {pendente && (
        <>
          <p className={styles.acaoSeguranca}>
            🔒 O Assistente só executa após sua confirmação. Válida até {fmtDataHoraIso(acao.expiraEm)}.
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
