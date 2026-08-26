"use client";

import { type FormEvent, useEffect, useRef } from "react";
import RespostaEstruturada from "./RespostaEstruturada";
import TextoMarkdownSeguro from "./TextoMarkdownSeguro";
import { useEstadoAssistente } from "./AssistenteProvider";
import { useContextoAssistenteAtual } from "./useContextoAssistenteAtual";
import styles from "./Assistente.module.css";

export default function ConversaAssistente() {
  const { mensagens, texto, carregando, setTexto, enviar } = useEstadoAssistente();
  const { contexto } = useContextoAssistenteAtual();
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, carregando]);

  function enviarFormulario(event: FormEvent) {
    event.preventDefault();
    void enviar(contexto);
  }

  return (
    <>
      <div className={styles.mensagens} aria-live="polite">
        {mensagens.map((mensagem) => (
          <article
            className={`${styles.mensagem} ${mensagem.papel === "usuario" ? styles.usuario : styles.assistente}`}
            key={mensagem.id}
          >
            {mensagem.papel === "assistente"
              ? <TextoMarkdownSeguro texto={mensagem.texto} />
              : <p>{mensagem.texto}</p>}
            {mensagem.blocos && <RespostaEstruturada blocos={mensagem.blocos} />}
          </article>
        ))}
        {carregando && (
          <div className={styles.digitando} role="status">
            Consultando dados com segurança…
          </div>
        )}
        <div ref={fim} />
      </div>
      <form className={styles.formulario} onSubmit={enviarFormulario}>
        <textarea
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" && !evento.shiftKey) {
              evento.preventDefault();
              evento.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Pergunte sobre sua carteira…"
          aria-label="Pergunta ao Assistente"
          rows={2}
          maxLength={4000}
          disabled={carregando}
        />
        <button type="submit" disabled={carregando || !texto.trim()} aria-label="Enviar pergunta">
          ➜
        </button>
      </form>
      <small className={styles.rodape}>O histórico existe apenas nesta sessão do painel.</small>
    </>
  );
}
