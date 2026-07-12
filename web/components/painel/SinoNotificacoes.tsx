"use client";

/* ================================================================
   SINO DE NOTIFICAÇÕES (topbar)
   Reúne o que precisa de ação AGORA, reusando o núcleo (sem recalcular):
   - compromissos da agenda não concluídos e vencidos/hoje;
   - imóveis parados (isStale) há mais de STALE_DAYS_THRESHOLD dias.
   O contador soma os dois; o dropdown lista e leva à tela certa.
   ================================================================ */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isStale } from "@/lib/calculo/motor";
import { todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";

export default function SinoNotificacoes() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hoje = todayISO();
  const pendentes = agenda.filter((a) => !a.done && a.date <= hoje);
  const parados = imoveis.filter(isStale);
  const total = pendentes.length + parados.length;

  // Fecha ao clicar fora. O listener só existe enquanto está aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  function irPara(rota: string) {
    setAberto(false);
    router.push(rota);
  }

  return (
    <div className="topbar-pop-wrap" ref={wrapRef}>
      <button
        type="button"
        className="topbar-icon-btn"
        aria-label={total > 0 ? `Notificações: ${total} pendência(s)` : "Notificações"}
        onClick={() => setAberto((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && <span className="topbar-badge">{total > 9 ? "9+" : total}</span>}
      </button>

      {aberto && (
        <div className="topbar-pop">
          <div className="topbar-pop-head">Notificações</div>

          {total === 0 && <div className="topbar-pop-empty">Tudo em dia — nada pendente. ✓</div>}

          {pendentes.slice(0, 6).map((a) => (
            <button key={a.id} type="button" className="topbar-pop-item" onClick={() => irPara("/agenda")}>
              <span className="topbar-pop-ic">☎</span>
              <span className="topbar-pop-txt">
                <strong>{a.title}</strong>
                <span>{a.date < hoje ? "Atrasado" : "Vence hoje"}</span>
              </span>
            </button>
          ))}

          {parados.length > 0 && (
            <button type="button" className="topbar-pop-item" onClick={() => irPara("/insights")}>
              <span className="topbar-pop-ic">⏳</span>
              <span className="topbar-pop-txt">
                <strong>
                  {parados.length} imóvel(is) parado(s)
                </strong>
                <span>Sem avançar há mais de 7 dias</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
