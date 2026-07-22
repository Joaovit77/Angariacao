"use client";

/* ================================================================
   CELEBRAÇÃO (o card de parabéns)
   Aparece por cima de tudo quando um imóvel chega em "Angariado" ou
   quando a meta do mês é batida. Quem decide o texto é o módulo puro
   lib/calculo/celebracao.ts; aqui só se desenha.

   Montado no layout do painel, irmão do <main> e do ModalOverlay:
   a comemoração nasce no fim de um salvamento que FECHA o modal, e
   dentro dele seria desmontada junto.

   Some sozinha depois de FECHAR_MS. Uma comemoração que exige clique
   para sair vira obstáculo na quarta vez — o corretor angaria vários
   imóveis no mesmo dia, e a graça é o instante, não o aviso. Esc, o
   botão e o clique no fundo antecipam a saída.
   ================================================================ */
import { useEffect } from "react";
import { useCelebracao } from "@/lib/celebracao";

/** Tempo até sumir sozinha. */
const FECHAR_MS = 6500;

/** Papeizinhos do confete. Posições/tempos derivados do índice, não
    sorteados: valor aleatório no render quebraria a hidratação e a
    pureza que o React Compiler cobra. O olho não distingue. */
const CONFETES = Array.from({ length: 16 }, (_, i) => ({
  esquerda: (i * 6.7 + 3) % 100,
  atraso: (i % 8) * 0.14,
  duracao: 2.4 + ((i * 3) % 5) * 0.28,
  giro: i % 2 === 0 ? 360 : -320,
  cor: ["var(--accent)", "var(--good)", "var(--accent-strong)", "var(--info)"][i % 4],
}));

export default function Celebracao() {
  const celebracao = useCelebracao((s) => s.celebracao);
  const encerrar = useCelebracao((s) => s.encerrar);

  useEffect(() => {
    if (!celebracao) return;
    const t = setTimeout(encerrar, FECHAR_MS);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") encerrar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [celebracao, encerrar]);

  if (!celebracao) return null;

  return (
    <div className="celebracao-fundo" onClick={encerrar} role="presentation">
      <div className="celebracao-confete" aria-hidden>
        {CONFETES.map((c, i) => (
          <span
            key={i}
            className="celebracao-papel"
            style={{
              left: `${c.esquerda}%`,
              background: c.cor,
              animationDelay: `${c.atraso}s`,
              animationDuration: `${c.duracao}s`,
              ["--giro" as string]: `${c.giro}deg`,
            }}
          />
        ))}
      </div>

      <div
        className={`celebracao-card celebracao-${celebracao.tipo}`}
        role="alertdialog"
        aria-live="assertive"
        aria-label={celebracao.titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="celebracao-icone" aria-hidden>
          {celebracao.icone}
        </div>
        <div className="celebracao-titulo">{celebracao.titulo}</div>
        <p className="celebracao-mensagem">{celebracao.mensagem}</p>
        {celebracao.detalhe && <p className="celebracao-detalhe">{celebracao.detalhe}</p>}
        <button type="button" className="btn btn-primary" onClick={encerrar}>
          Continuar
        </button>
      </div>
    </div>
  );
}
