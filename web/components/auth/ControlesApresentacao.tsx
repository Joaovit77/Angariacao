import type { CSSProperties } from "react";
import type { SlideApresentacao } from "./dadosApresentacao";

type EstiloControles = CSSProperties & {
  "--duracao-autoplay": string;
};

interface Props {
  slides: readonly SlideApresentacao[];
  indiceAtivo: number;
  pausado: boolean;
  movimentoReduzido: boolean;
  autoplayPausado: boolean;
  cicloContador: number;
  duracaoAutoplayMs: number;
  aoAnterior: () => void;
  aoProximo: () => void;
  aoAlternarPausa: () => void;
  aoSelecionar: (indice: number) => void;
}

function IconeSeta({ direcao }: { direcao: "anterior" | "proximo" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {direcao === "anterior" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function ControlesApresentacao({
  slides,
  indiceAtivo,
  pausado,
  movimentoReduzido,
  autoplayPausado,
  cicloContador,
  duracaoAutoplayMs,
  aoAnterior,
  aoProximo,
  aoAlternarPausa,
  aoSelecionar,
}: Props) {
  const estiloControles: EstiloControles = {
    "--duracao-autoplay": `${duracaoAutoplayMs}ms`,
  };

  return (
    <div
      className={`apresentacao-controles${autoplayPausado ? " pausada" : ""}`}
      style={estiloControles}
      role="group"
      aria-label="Controles da apresentação"
    >
      <div className="apresentacao-setas">
        <button type="button" onClick={aoAnterior} aria-label="Voltar ao slide anterior">
          <IconeSeta direcao="anterior" />
        </button>
        <button
          type="button"
          className="apresentacao-pausa"
          onClick={aoAlternarPausa}
          disabled={movimentoReduzido}
          aria-label={
            movimentoReduzido
              ? "Apresentação automática desativada pela preferência de movimento reduzido"
              : pausado ? "Retomar apresentação automática" : "Pausar apresentação automática"
          }
          aria-pressed={movimentoReduzido ? undefined : pausado}
        >
          <span aria-hidden="true">{pausado || movimentoReduzido ? "\u25b6" : "\u2161"}</span>
        </button>
        <button type="button" onClick={aoProximo} aria-label="Avançar ao próximo slide">
          <IconeSeta direcao="proximo" />
        </button>
      </div>

      <div className="apresentacao-indicadores" role="group" aria-label="Escolher slide">
        {slides.map((slide, indice) => (
          <button
            type="button"
            key={slide.imagem}
            className={indice === indiceAtivo ? "ativo" : ""}
            onClick={() => aoSelecionar(indice)}
            aria-label={`Ir para o slide ${indice + 1}: ${slide.titulo}`}
            aria-current={indice === indiceAtivo ? "true" : undefined}
          >
            <span
              key={indice === indiceAtivo ? `${slide.imagem}-${cicloContador}` : slide.imagem}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
