"use client";

/* ================================================================
   CONTADOR (count-up)
   Anima um número de 0 até o valor no mount e, em mudanças de dado,
   do último valor mostrado até o novo. Usa requestAnimationFrame +
   easeOutCubic. Se o usuário pediu "reduzir movimento" no sistema,
   mostra o valor final direto, sem animar.

   Recebe um `formatar` opcional (ex.: fmtMoney) para desenhar o
   número — assim moeda/percentual contam formatados a cada frame.
   ================================================================ */
import { useEffect, useRef, useState } from "react";

function prefereMenosMovimento() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function Contador({
  valor,
  formatar,
  duracao = 600,
}: {
  valor: number;
  formatar?: (n: number) => string;
  duracao?: number;
}) {
  const fmt = formatar ?? ((n: number) => String(Math.round(n)));
  // Começa em 0 (mount anima 0 → valor); com "reduzir movimento", já no valor.
  const [display, setDisplay] = useState<number>(() => (prefereMenosMovimento() ? valor : 0));
  const deRef = useRef<number>(prefereMenosMovimento() ? valor : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const ate = valor;
    const de = deRef.current;
    // Sem animação (usuário pediu menos movimento, ou o valor não mudou):
    // vai direto ao valor no próximo frame — setState fica no rAF, nunca
    // síncrono no corpo do efeito.
    if (prefereMenosMovimento() || de === ate) {
      deRef.current = ate;
      const id = requestAnimationFrame(() => setDisplay(ate));
      return () => cancelAnimationFrame(id);
    }
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(de + (ate - de) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(passo);
      } else {
        deRef.current = ate;
      }
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [valor, duracao]);

  return <>{fmt(display)}</>;
}
