"use client";

import { useAppStore } from "@/lib/store";
import { useAssistenteFlutuanteAtivo } from "@/lib/assistente/preferenciaFlutuante";
import ConversaAssistente from "./ConversaAssistente";
import { useEstadoAssistente } from "./AssistenteProvider";
import styles from "./Assistente.module.css";

export default function AssistenteView() {
  const permitido = useAppStore((estado) => estado.iaDisponivel);
  const [flutuanteAtivo, definirFlutuanteAtivo] = useAssistenteFlutuanteAtivo();
  const { limparConversa } = useEstadoAssistente();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Assistente</h1>
          <p className="page-sub">Consulte sua operação com os mesmos dados e recursos do atalho flutuante</p>
        </div>
        {permitido && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={limparConversa}>
            Limpar conversa
          </button>
        )}
      </div>

      {!permitido ? (
        <section className={styles.indisponivel} role="status">
          <strong>Assistente indisponível</strong>
          <p>Esta conta não tem permissão para usar os recursos de IA.</p>
        </section>
      ) : (
        <div className={styles.paginaLayout}>
          <section className={styles.paginaPainel} aria-label="Conversa com o Assistente">
            <header className={styles.paginaCabecalho}>
              <span className={styles.paginaMarca} aria-hidden="true">✦</span>
              <span>
                <strong>Assistente</strong>
                <small>Somente leitura</small>
              </span>
            </header>
            <ConversaAssistente />
          </section>

          <aside className={styles.preferencia} aria-labelledby="assistente-flutuante-titulo">
            <span className={styles.preferenciaRotulo}>Preferência da interface</span>
            <h2 id="assistente-flutuante-titulo">Assistente flutuante</h2>
            <p>
              Escolha se o atalho móvel deve aparecer nas outras telas do painel.
              Esta opção não desativa o Assistente nem os demais recursos de IA.
            </p>
            <div className={styles.preferenciaOpcoes} role="group" aria-label="Exibição do Assistente flutuante">
              <button
                type="button"
                className={flutuanteAtivo ? styles.preferenciaAtiva : undefined}
                aria-pressed={flutuanteAtivo}
                onClick={() => definirFlutuanteAtivo(true)}
              >
                Ativado
              </button>
              <button
                type="button"
                className={!flutuanteAtivo ? styles.preferenciaAtiva : undefined}
                aria-pressed={!flutuanteAtivo}
                onClick={() => definirFlutuanteAtivo(false)}
              >
                Desativado
              </button>
            </div>
            <small>A escolha fica salva neste navegador.</small>
          </aside>
        </div>
      )}
    </>
  );
}
