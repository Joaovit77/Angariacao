"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./Prospeccao.module.css";

/* ================================================================
   CÂMERA EM PÁGINA

   O input com capture="environment" troca de aplicativo: a página sai de
   cena, o app de câmera entra e, em aparelhos apertados, o Chrome Android
   descarta a aba por memória e não entrega a foto na volta ("Devido à
   insuficiência de memória, não foi possível concluir a operação
   anterior"). Visto no smoke de 11/09.

   Aqui a câmera é um <video> dentro da própria página: nada sai de cena,
   o quadro é capturado num canvas e vira um File que segue pelo mesmo
   processamento de sempre. O input nativo continua como alternativa.
   ================================================================ */

export interface DependenciasCameraFachada {
  obterStream: (restricoes: MediaStreamConstraints) => Promise<MediaStream>;
  capturarQuadro: (video: HTMLVideoElement) => Promise<Blob>;
}

export const RESTRICOES_CAMERA_FACHADA: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 2048 },
    height: { ideal: 1536 },
  },
};

export function cameraEmPaginaDisponivel(): boolean {
  return typeof navigator !== "undefined"
    && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function mensagemErroCamera(falha: unknown): string {
  const nome = falha instanceof Error ? falha.name : "";
  if (nome === "NotAllowedError" || nome === "SecurityError") {
    return "A câmera não foi liberada para o site. Libere nas permissões do navegador ou use a câmera do aparelho.";
  }
  if (nome === "NotFoundError" || nome === "OverconstrainedError") {
    return "Nenhuma câmera foi encontrada neste aparelho. Use a câmera do aparelho.";
  }
  if (nome === "NotReadableError" || nome === "AbortError") {
    return "A câmera está em uso por outro aplicativo. Feche-o ou use a câmera do aparelho.";
  }
  return "Não foi possível abrir a câmera aqui. Use a câmera do aparelho.";
}

export async function capturarQuadroDoVideo(video: HTMLVideoElement): Promise<Blob> {
  const largura = video.videoWidth;
  const altura = video.videoHeight;
  if (!largura || !altura) throw new Error("A câmera ainda não entregou imagem. Tente de novo.");
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("Não foi possível desenhar a imagem.");
  contexto.drawImage(video, 0, 0, largura, altura);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a foto."))),
      "image/jpeg",
      0.92,
    );
  });
}

function pararStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((faixa) => faixa.stop());
}

export default function CameraFachada({
  aoCapturar,
  aoCancelar,
  aoFalhar,
  dependencias,
}: {
  aoCapturar: (arquivo: File) => void;
  aoCancelar: () => void;
  /** A câmera não abriu (permissão, ausência, em uso). O pai volta ao input nativo. */
  aoFalhar: (mensagem: string) => void;
  dependencias?: Partial<DependenciasCameraFachada>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Callbacks em refs: o pai pode recriá-los a cada render, e isso não
  // pode reabrir a câmera.
  const aoFalharRef = useRef(aoFalhar);
  const obterStreamRef = useRef(dependencias?.obterStream);
  useEffect(() => {
    aoFalharRef.current = aoFalhar;
    obterStreamRef.current = dependencias?.obterStream;
  });
  const capturarQuadro = dependencias?.capturarQuadro ?? capturarQuadroDoVideo;
  const [pronta, setPronta] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    const obter = obterStreamRef.current
      ?? ((restricoes: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(restricoes));
    void (async () => {
      try {
        const stream = await obter(RESTRICOES_CAMERA_FACHADA);
        if (cancelado) {
          pararStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // autoplay com playsInline e muted costuma passar; se não, o
            // quadro ainda pode ser capturado quando houver dados.
          }
        }
        if (!cancelado) setPronta(true);
      } catch (falha) {
        if (!cancelado) aoFalharRef.current(mensagemErroCamera(falha));
      }
    })();
    return () => {
      cancelado = true;
      pararStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  async function capturar() {
    const video = videoRef.current;
    if (!video || capturando) return;
    setCapturando(true);
    setErro("");
    try {
      const blob = await capturarQuadro(video);
      const arquivo = new File([blob], "fachada.jpg", { type: blob.type || "image/jpeg" });
      pararStream(streamRef.current);
      streamRef.current = null;
      aoCapturar(arquivo);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível capturar a foto.");
      setCapturando(false);
    }
  }

  return (
    <div className={styles.cameraFachada} aria-label="Câmera">
      <div className={styles.cameraQuadro}>
        {/* muted + playsInline: sem isso o Android/iOS bloqueia o autoplay. */}
        <video ref={videoRef} autoPlay muted playsInline aria-label="Visor da câmera" />
        {!pronta ? <span className={styles.cameraAviso}>Abrindo a câmera…</span> : null}
      </div>
      {erro ? <p className={styles.erroCaptura} role="alert">{erro}</p> : null}
      <div className={styles.cameraAcoes}>
        <button type="button" className="btn btn-sm" onClick={aoCancelar} disabled={capturando}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => void capturar()}
          disabled={!pronta || capturando}
        >
          {capturando ? "Capturando…" : "Capturar"}
        </button>
      </div>
    </div>
  );
}
