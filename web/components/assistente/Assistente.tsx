"use client";

import { type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { perguntarAoAssistente } from "@/lib/assistente/cliente";
import { montarContextoAssistente } from "@/lib/assistente/contexto";
import { compactarBlocosParaHistorico } from "@/lib/assistente/historico";
import type { MensagemAssistente } from "@/lib/assistente/tipos";
import { limitarPosicaoAssistente, type PosicaoAssistente } from "@/lib/assistente/posicao";
import { useAppStore } from "@/lib/store";
import { usePipelineUi } from "@/lib/uiPipeline";
import { useUiModal } from "@/lib/uiModal";
import RespostaEstruturada from "./RespostaEstruturada";
import TextoMarkdownSeguro from "./TextoMarkdownSeguro";
import styles from "./Assistente.module.css";

const BOAS_VINDAS: MensagemAssistente = { id: "boas-vindas", papel: "assistente", texto: "Olá! Posso consultar sua carteira, agenda, follow-ups e indicadores. Estou em modo somente leitura." };

export default function Assistente() {
  const permitido = useAppStore((s) => s.iaDisponivel);
  const pathname = usePathname();
  const drawerId = usePipelineUi((s) => s.drawerImovelId);
  const modal = useUiModal((s) => s.modal);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([BOAS_VINDAS]);
  const [carregando, setCarregando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const painelRef = useRef<HTMLElement>(null);
  const limparArrasteRef = useRef<() => void>(() => undefined);
  const requisicaoRef = useRef<AbortController | null>(null);
  const montadoRef = useRef(true);
  const [posicao, setPosicao] = useState<PosicaoAssistente | null>(null);
  const contexto = useMemo(() => montarContextoAssistente(pathname, drawerId, modal), [pathname, drawerId, modal]);
  const drawerAtivo = contexto.superficie === "drawer";
  const modalAtivo = modal !== null;
  const estiloPainel: CSSProperties = posicao
    ? { zIndex: "var(--layer-assistente)", left: posicao.x, top: posicao.y, right: "auto", bottom: "auto" }
    : { zIndex: "var(--layer-assistente)" };

  useEffect(() => { if (aberto) fim.current?.scrollIntoView({ behavior: "smooth" }); }, [aberto, mensagens, carregando]);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      requisicaoRef.current?.abort();
      limparArrasteRef.current();
    };
  }, []);
  useEffect(() => {
    function ajustarAoViewport() {
      if (window.innerWidth <= 720) {
        setPosicao(null);
        return;
      }
      setPosicao((atual) => {
        const painel = painelRef.current;
        return atual && painel
          ? limitarPosicaoAssistente(atual.x, atual.y, painel.offsetWidth, painel.offsetHeight, window.innerWidth, window.innerHeight)
          : atual;
      });
    }
    window.addEventListener("resize", ajustarAoViewport);
    return () => window.removeEventListener("resize", ajustarAoViewport);
  }, []);
  if (!permitido) return null;

  function cancelarConsulta() {
    requisicaoRef.current?.abort();
    requisicaoRef.current = null;
    setCarregando(false);
  }

  function fecharAssistente() {
    cancelarConsulta();
    setAberto(false);
  }

  function limparConversa() {
    cancelarConsulta();
    setMensagens([BOAS_VINDAS]);
  }

  function iniciarArraste(event: ReactPointerEvent<HTMLElement>) {
    if (window.innerWidth <= 720 || (event.target as HTMLElement).closest("button")) return;
    const painel = painelRef.current;
    if (!painel) return;
    event.preventDefault();
    const rect = painel.getBoundingClientRect();
    const deslocamentoX = event.clientX - rect.left;
    const deslocamentoY = event.clientY - rect.top;
    const mover = (e: PointerEvent) => {
      setPosicao(limitarPosicaoAssistente(
        e.clientX - deslocamentoX,
        e.clientY - deslocamentoY,
        painel.offsetWidth,
        painel.offsetHeight,
        window.innerWidth,
        window.innerHeight,
      ));
    };
    const encerrar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", encerrar);
      limparArrasteRef.current = () => undefined;
    };
    limparArrasteRef.current();
    limparArrasteRef.current = encerrar;
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", encerrar, { once: true });
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || carregando) return;
    const usuario: MensagemAssistente = { id: crypto.randomUUID(), papel: "usuario", texto: pergunta };
    const anteriores = mensagens;
    setMensagens((atuais) => [...atuais, usuario]);
    setTexto("");
    setCarregando(true);
    const controller = new AbortController();
    requisicaoRef.current = controller;
    try {
      const resposta = await perguntarAoAssistente({
        mensagem: pergunta,
        contexto,
        historico: anteriores.filter((m) => m.id !== "boas-vindas").map(({ papel, texto: textoAnterior, blocos }) => ({
          papel,
          texto: textoAnterior,
          ...(blocos?.length ? { resultados: compactarBlocosParaHistorico(blocos) } : {}),
        })),
      }, { signal: controller.signal });
      if (resposta.ok === false && resposta.codigo === "cancelado") return;
      setMensagens((atuais) => [...atuais, resposta.ok ? resposta.mensagem : { id: crypto.randomUUID(), papel: "assistente", texto: resposta.erro }]);
    } finally {
      if (requisicaoRef.current === controller) requisicaoRef.current = null;
      if (montadoRef.current && !requisicaoRef.current) setCarregando(false);
    }
  }

  return <>
    <button className={`${styles.acionador} assistente-acionador-global${drawerAtivo ? " assistente-acionador-com-drawer" : ""}`} style={{ zIndex: "var(--layer-assistente)" }} type="button" onClick={() => aberto ? fecharAssistente() : setAberto(true)} aria-label={aberto ? "Fechar assistente" : "Abrir assistente"} aria-expanded={aberto}><span aria-hidden="true">✦</span><span>Assistente</span></button>
    {aberto && <aside ref={painelRef} className={`${styles.painel} assistente-painel-global${drawerAtivo && !posicao ? " assistente-com-drawer" : ""}${modalAtivo && !posicao ? " assistente-com-modal" : ""}${posicao ? " assistente-posicionado" : ""}`} style={estiloPainel} aria-label="Assistente de IA">
      <header className={`${styles.cabecalho} assistente-cabecalho-arraste`} onPointerDown={iniciarArraste} title="Arraste para mover o Assistente"><div className="assistente-identidade"><span className="assistente-alca" aria-hidden="true">⠿</span><span><strong>Assistente</strong><small>Somente leitura · {contexto.pagina}</small></span></div><div>{posicao && <button type="button" onClick={() => setPosicao(null)} title="Restaurar posição">⌂</button>}<button type="button" onClick={limparConversa} title="Limpar conversa">↻</button><button type="button" onClick={fecharAssistente} aria-label="Fechar Assistente">×</button></div></header>
      <div className={styles.mensagens} aria-live="polite">
        {mensagens.map((mensagem) => <article className={`${styles.mensagem} ${mensagem.papel === "usuario" ? styles.usuario : styles.assistente}`} key={mensagem.id}>{mensagem.papel === "assistente" ? <TextoMarkdownSeguro texto={mensagem.texto} /> : <p>{mensagem.texto}</p>}{mensagem.blocos && <RespostaEstruturada blocos={mensagem.blocos} />}</article>)}
        {carregando && <div className={styles.digitando} role="status">Consultando dados com segurança…</div>}<div ref={fim} />
      </div>
      <form className={styles.formulario} onSubmit={enviar}><textarea value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder="Pergunte sobre sua carteira…" aria-label="Pergunta ao Assistente" rows={2} maxLength={4000} disabled={carregando} /><button type="submit" disabled={carregando || !texto.trim()} aria-label="Enviar pergunta">➜</button></form>
      <small className={styles.rodape}>O histórico existe apenas nesta sessão do painel.</small>
    </aside>}
  </>;
}
