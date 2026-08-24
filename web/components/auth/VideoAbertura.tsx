"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const DURACAO_TRANSICAO_LOOP_SEGUNDOS = 0.85;

interface Props {
  poster: string;
  video: string;
  ativo: boolean;
  repetir: boolean;
  movimentoReduzido: boolean;
  aoCarregar: () => void;
  aoFinalizar: () => void;
}

export default function VideoAbertura({
  poster,
  video,
  ativo,
  repetir,
  movimentoReduzido,
  aoCarregar,
  aoFinalizar,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const aoCarregarRef = useRef(aoCarregar);
  const carregamentoConfirmadoRef = useRef(false);
  const [carregado, setCarregado] = useState(false);
  const [finalizandoLoop, setFinalizandoLoop] = useState(false);
  const [falhaVideo, setFalhaVideo] = useState(false);

  const confirmarCarregamento = useCallback(() => {
    if (carregamentoConfirmadoRef.current) return;
    carregamentoConfirmadoRef.current = true;
    setCarregado(true);
    aoCarregarRef.current();
  }, []);
  const registrarFalha = useCallback(() => {
    setFalhaVideo(true);
    aoCarregarRef.current();
  }, []);


  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      confirmarCarregamento();
    }

    if (!ativo || movimentoReduzido) {
      video.pause();
      if (movimentoReduzido) video.currentTime = 0;
      return;
    }

    video.currentTime = 0;
    void video.play().catch(() => {
      // O primeiro quadro permanece visível quando o navegador bloqueia o autoplay.
    });
  }, [ativo, movimentoReduzido, confirmarCarregamento]);

  function acompanharLoop(evento: React.SyntheticEvent<HTMLVideoElement>) {
    if (movimentoReduzido || !repetir) return;

    const video = evento.currentTarget;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const tempoRestante = video.duration - video.currentTime;
    if (tempoRestante <= DURACAO_TRANSICAO_LOOP_SEGUNDOS) {
      setFinalizandoLoop(true);
    } else if (video.currentTime < 0.35) {
      setFinalizandoLoop(false);
    }
  }

  return (
    <>
      {falhaVideo && (
        <Image
          className="apresentacao-video-poster"
          src={poster}
          alt=""
          fill
          sizes="100vw"
          draggable={false}
          aria-hidden="true"
        />
      )}
      <video
        ref={videoRef}
        className={`apresentacao-imagem apresentacao-video enquadramento-abertura${
          carregado && (!repetir || !finalizandoLoop) ? " visivel" : ""
        }`}
        autoPlay={ativo && !movimentoReduzido}
        muted
        loop={repetir}
        playsInline
        preload={movimentoReduzido ? "metadata" : "auto"}
        aria-hidden="true"
        onLoadedData={confirmarCarregamento}
        onCanPlay={confirmarCarregamento}
        onTimeUpdate={acompanharLoop}
        onEnded={aoFinalizar}
        onError={registrarFalha}
      >
        <source src={video} type="video/mp4" />
      </video>
    </>
  );
}
