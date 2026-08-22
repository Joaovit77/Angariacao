import type { SlideApresentacao as DadosSlide } from "./dadosApresentacao";

interface Props {
  slide: DadosSlide;
  indice: number;
  total: number;
  aoEntrar: () => void;
}

export default function SlideApresentacao({ slide, indice, total, aoEntrar }: Props) {
  const fluxo = slide.fluxo;

  return (
    <div className="apresentacao-copy">
      <span className="apresentacao-sobrelinha">
        {String(indice + 1).padStart(2, "0")} / {String(total).padStart(2, "0")} · LONDRINA
      </span>

      <h1 className={indice === 0 ? "apresentacao-titulo abertura" : "apresentacao-titulo"}>
        {slide.titulo}
      </h1>
      <p className="apresentacao-descricao">{slide.descricao}</p>

      {fluxo ? (
        <ol className="apresentacao-fluxo" aria-label="Etapas da operação de angariação">
          {fluxo.map((etapa, etapaIndice) => (
            <li key={etapa}>
              <span>{etapa}</span>
              {etapaIndice < fluxo.length - 1 ? <i aria-hidden="true">{"\u2192"}</i> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {slide.cta ? (
        <div className="apresentacao-acoes-slide">
          <button type="button" className="apresentacao-cta" onClick={aoEntrar}>
            {slide.cta}
            <span aria-hidden="true">{"\u2192"}</span>
          </button>
          {indice === 0 ? (
            <a className="apresentacao-link-conhecer" href="#conheca-o-sistema">
              Conheça o sistema <span aria-hidden="true">{"\u2193"}</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
