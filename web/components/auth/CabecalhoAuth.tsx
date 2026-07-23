"use client";

/* ================================================================
   CABEÇALHO DA APRESENTAÇÃO
   A barra que acompanha a landing: marca à esquerda, acesso à
   direita. Ela é o único caminho para o formulário — que virou
   modal —, então fica grudada no topo (sticky) o tempo todo: em
   qualquer ponto da apresentação o "Entrar" está a um clique.

   O fundo sólido só aparece depois que a página sai do topo, e quem
   avisa é uma SENTINELA de 1px observada acima do cabeçalho — não um
   listener de scroll. Assim o navegador decide quando avaliar, em vez
   de rodar código nosso a cada quadro de rolagem.
   ================================================================ */
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

interface Props {
  aoEntrar: () => void;
  aoCriarConta: () => void;
}

export default function CabecalhoAuth({ aoEntrar, aoCriarConta }: Props) {
  const sentinelaRef = useRef<HTMLDivElement | null>(null);
  const [fixado, setFixado] = useState(false);

  useEffect(() => {
    const alvo = sentinelaRef.current;
    if (!alvo) return;
    const observador = new IntersectionObserver(
      ([entrada]) => setFixado(!entrada.isIntersecting),
      { threshold: 0 },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelaRef} className="vitrine-sentinela" aria-hidden="true" />
      <header className={`vitrine-topo${fixado ? " fixado" : ""}`}>
        <div className="vitrine-topo-fita">
          <div className="brand vitrine-topo-marca">
            <Image className="brand-mark" src="/logo.png" alt="Angariações" width={40} height={40} />
            <div className="brand-text">
              <span className="brand-title">Angariações</span>
              <span className="brand-sub">Controle de Locação</span>
            </div>
          </div>

          <div className="vitrine-topo-acoes">
            <button type="button" className="btn btn-ghost btn-sm vitrine-so-largo" onClick={aoCriarConta}>
              Criar conta
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={aoEntrar}>
              Fazer login
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
