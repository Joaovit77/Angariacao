"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { limitarPosicaoAssistente, type PosicaoAssistente } from "@/lib/assistente/posicao";
import { useAssistenteFlutuanteAtivo } from "@/lib/assistente/preferenciaFlutuante";
import { useAppStore } from "@/lib/store";
import ConversaAssistente from "./ConversaAssistente";
import { useEstadoAssistente } from "./AssistenteProvider";
import { useContextoAssistenteAtual } from "./useContextoAssistenteAtual";
import styles from "./Assistente.module.css";

const CHAVE_POSICAO_ACIONADOR = "angariacao:assistente:posicao-acionador";
const LIMIAR_ARRASTE = 5;

export default function Assistente() {
  const permitido = useAppStore((estado) => estado.iaDisponivel);
  const [flutuanteAtivo] = useAssistenteFlutuanteAtivo();
  const { cancelarConsulta, limparConversa } = useEstadoAssistente();
  const { contexto, modalAtivo } = useContextoAssistenteAtual();
  const [aberto, setAberto] = useState(false);
  const painelRef = useRef<HTMLElement>(null);
  const acionadorRef = useRef<HTMLButtonElement>(null);
  const limparArrasteRef = useRef<() => void>(() => undefined);
  const limparArrasteAcionadorRef = useRef<() => void>(() => undefined);
  const acionadorFoiArrastadoRef = useRef(false);
  const [posicao, setPosicao] = useState<PosicaoAssistente | null>(null);
  const [posicaoAcionador, setPosicaoAcionador] = useState<PosicaoAssistente | null>(null);
  const drawerAtivo = contexto.superficie === "drawer";
  const estiloPainel: CSSProperties = posicao
    ? { zIndex: "var(--layer-assistente)", left: posicao.x, top: posicao.y, right: "auto", bottom: "auto" }
    : { zIndex: "var(--layer-assistente)" };
  const estiloAcionador: CSSProperties = posicaoAcionador
    ? { zIndex: "var(--layer-assistente)", left: posicaoAcionador.x, top: posicaoAcionador.y, right: "auto", bottom: "auto" }
    : { zIndex: "var(--layer-assistente)" };

  useEffect(() => () => {
    limparArrasteRef.current();
    limparArrasteAcionadorRef.current();
  }, []);

  useEffect(() => {
    if (!permitido || !flutuanteAtivo) return;
    const acionador = acionadorRef.current;
    if (!acionador) return;
    try {
      const salva = JSON.parse(localStorage.getItem(CHAVE_POSICAO_ACIONADOR) || "null") as Partial<PosicaoAssistente> | null;
      if (salva && Number.isFinite(salva.x) && Number.isFinite(salva.y)) {
        setPosicaoAcionador(limitarPosicaoAssistente(
          salva.x as number,
          salva.y as number,
          acionador.offsetWidth,
          acionador.offsetHeight,
          window.innerWidth,
          window.innerHeight,
        ));
      }
    } catch {
      /* Armazenamento indisponível ou valor antigo inválido. */
    }
  }, [permitido, flutuanteAtivo]);

  useEffect(() => {
    if (!posicaoAcionador) return;
    try {
      localStorage.setItem(CHAVE_POSICAO_ACIONADOR, JSON.stringify(posicaoAcionador));
    } catch {
      /* O arraste continua funcional mesmo sem persistência local. */
    }
  }, [posicaoAcionador]);

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
      setPosicaoAcionador((atual) => {
        const acionador = acionadorRef.current;
        return atual && acionador
          ? limitarPosicaoAssistente(atual.x, atual.y, acionador.offsetWidth, acionador.offsetHeight, window.innerWidth, window.innerHeight)
          : atual;
      });
    }
    window.addEventListener("resize", ajustarAoViewport);
    return () => window.removeEventListener("resize", ajustarAoViewport);
  }, []);

  if (!permitido || !flutuanteAtivo) return null;

  function fecharAssistente() {
    cancelarConsulta();
    setAberto(false);
  }

  function iniciarArraste(event: ReactPointerEvent<HTMLElement>) {
    if (window.innerWidth <= 720 || (event.target as HTMLElement).closest("button")) return;
    const painel = painelRef.current;
    if (!painel) return;
    event.preventDefault();
    const rect = painel.getBoundingClientRect();
    const deslocamentoX = event.clientX - rect.left;
    const deslocamentoY = event.clientY - rect.top;
    const mover = (evento: PointerEvent) => {
      setPosicao(limitarPosicaoAssistente(
        evento.clientX - deslocamentoX,
        evento.clientY - deslocamentoY,
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

  function iniciarArrasteAcionador(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const acionador = acionadorRef.current;
    if (!acionador) return;
    const rect = acionador.getBoundingClientRect();
    const inicioX = event.clientX;
    const inicioY = event.clientY;
    const deslocamentoX = inicioX - rect.left;
    const deslocamentoY = inicioY - rect.top;
    const pointerId = event.pointerId;
    acionadorFoiArrastadoRef.current = false;

    const mover = (evento: PointerEvent) => {
      if (evento.pointerId !== pointerId) return;
      if (!acionadorFoiArrastadoRef.current && Math.hypot(evento.clientX - inicioX, evento.clientY - inicioY) < LIMIAR_ARRASTE) return;
      acionadorFoiArrastadoRef.current = true;
      setPosicaoAcionador(limitarPosicaoAssistente(
        evento.clientX - deslocamentoX,
        evento.clientY - deslocamentoY,
        acionador.offsetWidth,
        acionador.offsetHeight,
        window.innerWidth,
        window.innerHeight,
      ));
    };
    const encerrar = (evento: PointerEvent) => {
      if (evento.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", encerrar);
      window.removeEventListener("pointercancel", encerrar);
      limparArrasteAcionadorRef.current = () => undefined;
    };
    limparArrasteAcionadorRef.current();
    limparArrasteAcionadorRef.current = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", encerrar);
      window.removeEventListener("pointercancel", encerrar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", encerrar);
    window.addEventListener("pointercancel", encerrar);
  }

  function acionarAssistente(event: ReactMouseEvent<HTMLButtonElement>) {
    if (acionadorFoiArrastadoRef.current) {
      event.preventDefault();
      acionadorFoiArrastadoRef.current = false;
      return;
    }
    if (aberto) fecharAssistente();
    else setAberto(true);
  }

  return (
    <>
      <button
        ref={acionadorRef}
        className={`${styles.acionador} assistente-acionador-global${drawerAtivo ? " assistente-acionador-com-drawer" : ""}`}
        style={estiloAcionador}
        type="button"
        onPointerDown={iniciarArrasteAcionador}
        onClick={acionarAssistente}
        aria-label={aberto ? "Fechar assistente" : "Abrir assistente"}
        aria-expanded={aberto}
        title="Clique para abrir ou arraste para mover"
      >
        <span aria-hidden="true">✦</span>
        <span>Assistente</span>
      </button>
      {aberto && (
        <aside
          ref={painelRef}
          className={`${styles.painel} assistente-painel-global${drawerAtivo && !posicao ? " assistente-com-drawer" : ""}${modalAtivo && !posicao ? " assistente-com-modal" : ""}${posicao ? " assistente-posicionado" : ""}`}
          style={estiloPainel}
          aria-label="Assistente de IA"
        >
          <header
            className={`${styles.cabecalho} assistente-cabecalho-arraste`}
            onPointerDown={iniciarArraste}
            title="Arraste para mover o Assistente"
          >
            <div className="assistente-identidade">
              <span className="assistente-alca" aria-hidden="true">⠿</span>
              <span>
                <strong>Assistente</strong>
                <small>Somente leitura · {contexto.pagina}</small>
              </span>
            </div>
            <div>
              {posicao && (
                <button type="button" onClick={() => setPosicao(null)} title="Restaurar posição">
                  ⌂
                </button>
              )}
              <button type="button" onClick={limparConversa} title="Limpar conversa">↻</button>
              <button type="button" onClick={fecharAssistente} aria-label="Fechar Assistente">×</button>
            </div>
          </header>
          <ConversaAssistente />
        </aside>
      )}
    </>
  );
}
