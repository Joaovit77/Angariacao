"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  rotuloCarteiraSemBloqueio,
  type CorrespondenciaSemBloqueio,
} from "@/lib/calculo/repeticaoCentralAngariacao";

const MARGEM_TELA = 16;
const LARGURA_PAINEL = 280;

/** Posição do painel na tela: abaixo da etiqueta, ou acima quando ela está na
    parte de baixo; nunca ultrapassa a largura da tela. */
interface PosicaoPainel {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

function posicaoAoLado(etiqueta: DOMRect): PosicaoPainel {
  const width = Math.min(LARGURA_PAINEL, window.innerWidth - MARGEM_TELA * 2);
  const left = Math.min(Math.max(MARGEM_TELA, etiqueta.left), window.innerWidth - MARGEM_TELA - width);
  return etiqueta.bottom > window.innerHeight * 0.6
    ? { left, width, bottom: window.innerHeight - etiqueta.top + 6 }
    : { left, width, top: etiqueta.bottom + 6 };
}

/**
 * Etiqueta do card para anúncio de imóvel que já esteve na carteira mas não o
 * esconde (hoje, status "Perdido"). Clique, toque ou teclado abrem um painel
 * pequeno com código, status e motivo da perda de cada imóvel. O painel vai
 * para o <body> porque o card corta o que ultrapassa a borda.
 */
export default function EtiquetaCarteiraSemBloqueio({
  correspondencias,
}: {
  correspondencias?: readonly CorrespondenciaSemBloqueio[];
}) {
  const [posicao, setPosicao] = useState<PosicaoPainel | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const idPainel = useId();
  const aberto = posicao !== null;

  useEffect(() => {
    if (!aberto) return;
    const fecharSeFora = (evento: PointerEvent) => {
      const alvo = evento.target as Node;
      if (painel.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setPosicao(null);
    };
    const fecharComEscape = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      setPosicao(null);
      botao.current?.focus();
    };
    // Rolagem ou mudança de tamanho descolaria o painel da etiqueta.
    const fechar = () => setPosicao(null);
    document.addEventListener("pointerdown", fecharSeFora);
    document.addEventListener("keydown", fecharComEscape);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("pointerdown", fecharSeFora);
      document.removeEventListener("keydown", fecharComEscape);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  const rotulo = rotuloCarteiraSemBloqueio(correspondencias);
  if (!rotulo || !correspondencias) return null;

  function alternar(evento: MouseEvent<HTMLButtonElement>) {
    evento.stopPropagation();
    if (aberto || !botao.current) {
      setPosicao(null);
      return;
    }
    setPosicao(posicaoAoLado(botao.current.getBoundingClientRect()));
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        className="carteira-sem-bloqueio"
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        onClick={alternar}
      >
        {rotulo.texto}
      </button>
      {aberto && createPortal(
        <div
          ref={painel}
          id={idPainel}
          className="carteira-popover"
          style={posicao}
          onClick={(evento) => evento.stopPropagation()}
        >
          <strong>Já esteve na carteira</strong>
          <ul>
            {correspondencias.map((item, indice) => (
              <li key={`${item.codigo}-${indice}`}>
                <span className="carteira-popover-imovel">{item.codigo} · {item.status}</span>
                {item.motivoPerda && (
                  <>
                    <span className="carteira-popover-rotulo">Motivo da perda</span>
                    <span>{item.motivoPerda}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
