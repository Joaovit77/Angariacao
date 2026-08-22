"use client";

import { useEffect, useState } from "react";
import BotaoTema from "@/components/BotaoTema";
import MarcaApp from "@/components/MarcaApp";

interface Props {
  aoEntrar: () => void;
  aoCriarConta: () => void;
}

export default function CabecalhoApresentacao({ aoEntrar, aoCriarConta }: Props) {
  const [foraDaFoto, setForaDaFoto] = useState(false);

  useEffect(() => {
    const apresentacao = document.querySelector<HTMLElement>(".apresentacao");
    if (!apresentacao) return;

    const observador = new IntersectionObserver(
      ([entrada]) => setForaDaFoto(!entrada.isIntersecting),
      { rootMargin: "-64px 0px 0px", threshold: 0 },
    );

    observador.observe(apresentacao);
    return () => observador.disconnect();
  }, []);

  return (
    <header
      className={`vitrine-topo apresentacao-topo${foraDaFoto ? " fora-da-foto" : ""}`}
    >
      <div className="vitrine-topo-fita">
        <div className="brand vitrine-topo-marca">
          <MarcaApp className="brand-mark" alt="Angariação" />
          <div className="brand-text">
            <span className="brand-title">Angariação</span>
            <span className="brand-sub">Inteligência imobiliária</span>
          </div>
        </div>

        <div className="vitrine-topo-acoes">
          <a
            className="btn btn-ghost btn-sm apresentacao-conhecer-topo"
            href="#conheca-o-sistema"
          >
            <span className="longo">Conheça o sistema</span>
            <span className="curto">Conheça</span>
          </a>
          <BotaoTema />
          <button
            type="button"
            className="btn btn-ghost btn-sm vitrine-so-largo"
            onClick={aoCriarConta}
          >
            Criar conta
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={aoEntrar}>
            Entrar
          </button>
        </div>
      </div>
    </header>
  );
}
