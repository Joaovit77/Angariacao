"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import ControlesApresentacao from "./ControlesApresentacao";
import SlideApresentacao from "./SlideApresentacao";
import VideoAbertura from "./VideoAbertura";
import { SLIDES_APRESENTACAO } from "./dadosApresentacao";

interface Props {
  aoEntrar: () => void;
  pausadaExternamente?: boolean;
}

const TEMPO_AUTOPLAY_MS = 6500;
const CONSULTA_MOVIMENTO_REDUZIDO = "(prefers-reduced-motion: reduce)";
const CONSULTA_FOTO_UNICA_MOBILE = "(max-width: 720px)";

function indiceCircular(indice: number): number {
  const total = SLIDES_APRESENTACAO.length;
  return (indice + total) % total;
}

function assinarMovimentoReduzido(aoMudar: () => void) {
  const consulta = window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

function prefereMovimentoReduzido() {
  return window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO).matches;
}
function assinarFotoUnicaMobile(aoMudar: () => void) {
  const consulta = window.matchMedia(CONSULTA_FOTO_UNICA_MOBILE);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

function usaFotoUnicaMobile() {
  return window.matchMedia(CONSULTA_FOTO_UNICA_MOBILE).matches;
}

export default function Apresentacao({ aoEntrar, pausadaExternamente = false }: Props) {
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [indiceSolicitado, setIndiceSolicitado] = useState<number | null>(null);
  const [indicesCarregados, setIndicesCarregados] = useState<number[]>([]);
  const [cicloContador, setCicloContador] = useState(0);
  const [pausado, setPausado] = useState(false);
  const carregadosRef = useRef(new Set<number>());
  const solicitadoRef = useRef<number | null>(null);
  const toqueRef = useRef<{ x: number; y: number } | null>(null);
  const movimentoReduzido = useSyncExternalStore(
    assinarMovimentoReduzido,
    prefereMovimentoReduzido,
    () => false,
  );
  const fotoUnicaMobile = useSyncExternalStore(
    assinarFotoUnicaMobile,
    usaFotoUnicaMobile,
    // O HTML inicial mais econômico serve só a abertura. No desktop, o
    // snapshot real monta as demais fotos logo depois da hidratação.
    () => true,
  );

  const navegarPara = useCallback((novoIndice: number, reiniciarContador = true) => {
    const indice = indiceCircular(novoIndice);
    if (reiniciarContador) setCicloContador((ciclo) => ciclo + 1);

    if (usaFotoUnicaMobile() || carregadosRef.current.has(indice)) {
      solicitadoRef.current = null;
      setIndiceSolicitado(null);
      setIndiceAtivo(indice);
      return;
    }

    solicitadoRef.current = indice;
    setIndiceSolicitado(indice);
  }, []);

  function registrarImagemCarregada(indice: number) {
    if (!carregadosRef.current.has(indice)) {
      carregadosRef.current.add(indice);
      setIndicesCarregados((atuais) => (atuais.includes(indice) ? atuais : [...atuais, indice]));
    }

    if (solicitadoRef.current !== indice) return;
    solicitadoRef.current = null;
    setIndiceSolicitado(null);
    setIndiceAtivo(indice);
  }

  const imagemAtivaCarregada = fotoUnicaMobile
    ? indicesCarregados.includes(0)
    : indicesCarregados.includes(indiceAtivo);
  const autoplayPausado =
    movimentoReduzido ||
    pausado ||
    pausadaExternamente ||
    indiceSolicitado !== null ||
    !imagemAtivaCarregada;

  useEffect(() => {
    if (autoplayPausado) return;

    const contador = window.setTimeout(
      () => navegarPara(indiceAtivo + 1, false),
      TEMPO_AUTOPLAY_MS,
    );
    return () => window.clearTimeout(contador);
  }, [autoplayPausado, cicloContador, indiceAtivo, navegarPara]);

  function aoTeclar(evento: React.KeyboardEvent<HTMLElement>) {
    if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
    if (evento.key === "ArrowLeft") {
      evento.preventDefault();
      navegarPara(indiceAtivo - 1);
    } else if (evento.key === "ArrowRight") {
      evento.preventDefault();
      navegarPara(indiceAtivo + 1);
    }
  }

  function aoIniciarToque(evento: React.TouchEvent<HTMLElement>) {
    const toque = evento.touches[0];
    toqueRef.current = toque ? { x: toque.clientX, y: toque.clientY } : null;
  }

  function aoEncerrarToque(evento: React.TouchEvent<HTMLElement>) {
    const inicio = toqueRef.current;
    const toque = evento.changedTouches[0];
    toqueRef.current = null;
    if (!inicio || !toque) return;

    const deltaX = toque.clientX - inicio.x;
    const deltaY = toque.clientY - inicio.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    navegarPara(indiceAtivo + (deltaX < 0 ? 1 : -1));
  }

  function aoFinalizarVideoAbertura() {
    if (
      usaFotoUnicaMobile() ||
      indiceAtivo !== 0 ||
      pausado ||
      pausadaExternamente ||
      solicitadoRef.current !== null
    ) return;
    navegarPara(1, false);
  }
  const proximoPrecarregamento = indiceCircular(indiceAtivo + 1);

  return (
    <section
      className="auth-showcase apresentacao"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Apresentação do sistema Angariação. Use as setas para mudar de slide."
      tabIndex={0}
      onKeyDown={aoTeclar}
      onTouchStart={aoIniciarToque}
      onTouchEnd={aoEncerrarToque}
    >
      <div className="apresentacao-imagens" aria-live="off">
        <div
          className={`apresentacao-foto${
            fotoUnicaMobile || indiceAtivo === 0 ? " ativo" : ""
          }`}
          aria-hidden={!fotoUnicaMobile && indiceAtivo !== 0}
        >
          <VideoAbertura
            ativo={
              (fotoUnicaMobile || indiceAtivo === 0) && !pausado && !pausadaExternamente
            }
            repetir={fotoUnicaMobile}
            movimentoReduzido={movimentoReduzido}
            aoCarregar={() => registrarImagemCarregada(0)}
            aoFinalizar={aoFinalizarVideoAbertura}
          />
        </div>

        {!fotoUnicaMobile &&
          SLIDES_APRESENTACAO.slice(1).map((slide, deslocamento) => {
            const indice = deslocamento + 1;
            const montada =
              indice === indiceAtivo ||
              indice === indiceSolicitado ||
              indice === proximoPrecarregamento ||
              indicesCarregados.includes(indice);
            if (!montada) return null;

            return (
              <div
                className={`apresentacao-foto${indice === indiceAtivo ? " ativo" : ""}`}
                aria-hidden={indice !== indiceAtivo}
                key={slide.imagem}
              >
                <Image
                  className={`apresentacao-imagem enquadramento-${slide.enquadramento}`}
                  src={slide.imagem}
                  alt={indice === indiceAtivo ? slide.alt : ""}
                  fill
                  sizes="100vw"
                  loading="lazy"
                  onLoad={() => registrarImagemCarregada(indice)}
                  draggable={false}
                />
              </div>
            );
          })}
      </div>

      <div className="apresentacao-contraste" aria-hidden="true" />

      <div className="apresentacao-conteudo" aria-live="off">
        <SlideApresentacao
          key={indiceAtivo}
          slide={SLIDES_APRESENTACAO[indiceAtivo]}
          indice={indiceAtivo}
          total={SLIDES_APRESENTACAO.length}
          aoEntrar={aoEntrar}
        />
      </div>

      <p className="apresentacao-creditos">Imagens disponibilizadas pelo Pexels</p>

      <ControlesApresentacao
        slides={SLIDES_APRESENTACAO}
        indiceAtivo={indiceAtivo}
        pausado={pausado}
        movimentoReduzido={movimentoReduzido}
        autoplayPausado={autoplayPausado}
        cicloContador={cicloContador}
        duracaoAutoplayMs={TEMPO_AUTOPLAY_MS}
        aoAnterior={() => navegarPara(indiceAtivo - 1)}
        aoProximo={() => navegarPara(indiceAtivo + 1)}
        aoAlternarPausa={() => setPausado((valor) => !valor)}
        aoSelecionar={navegarPara}
      />
    </section>
  );
}
