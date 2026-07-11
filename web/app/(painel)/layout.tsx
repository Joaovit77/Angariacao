"use client";

/* ================================================================
   SHELL AUTENTICADO
   Port do #app-shell do index.html (barra mobile + gaveta + sidebar
   + <main>) e da proteção que o handleUnauthenticated() fazia: sem
   sessão, volta para a tela de acesso.

   Enquanto carregarEstado() não termina, o <main> mostra o mesmo
   "Carregando seus dados..." do handleAuthenticated().
   ================================================================ */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessao } from "@/components/SessaoProvider";
import BarraLateral from "@/components/painel/BarraLateral";
import EsqueletoPainel from "@/components/painel/EsqueletoPainel";
import ModalOverlay from "@/components/modais/ModalOverlay";
import { useAppStore } from "@/lib/store";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { estado } = useSessao();
  const router = useRouter();
  const pathname = usePathname();
  const carregado = useAppStore((s) => s.carregado);
  const [gavetaAberta, setGavetaAberta] = useState(false);

  useEffect(() => {
    if (estado === "anon" || estado === "recuperacao") router.replace("/");
  }, [estado, router]);

  if (estado !== "auth") return null;

  return (
    <>
    <div className="app-shell" id="app-shell">
      {/* BARRA SUPERIOR MOBILE (só aparece em telas estreitas) */}
      <div className="mobile-topbar">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setGavetaAberta((v) => !v)}
          aria-label="Abrir menu"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: "18px", height: "18px" }}
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <div className="brand" style={{ border: "none", padding: 0, margin: 0 }}>
          <div className="brand-mark">A</div>
          <div className="brand-text">
            <span className="brand-title">Angariações</span>
          </div>
        </div>
      </div>

      {/* FUNDO ESCURO ATRÁS DA GAVETA (mobile) */}
      <div
        className={`sidebar-backdrop${gavetaAberta ? " open" : ""}`}
        id="sidebar-backdrop"
        onClick={() => setGavetaAberta(false)}
      />

      <BarraLateral aberta={gavetaAberta} aoFechar={() => setGavetaAberta(false)} />

      <main className="main" id="main-content">
        {carregado ? (
          <div key={pathname} className="view-anim">
            {children}
          </div>
        ) : (
          <EsqueletoPainel />
        )}
      </main>
    </div>

    {/* Irmão do .app-shell, como no index.html original. */}
    <ModalOverlay />
    </>
  );
}
