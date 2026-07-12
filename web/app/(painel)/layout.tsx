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
import Topbar from "@/components/painel/Topbar";
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
      {/* BARRA DE TOPO (nome da tela + notificações + usuário) */}
      <Topbar aoAbrirMenu={() => setGavetaAberta((v) => !v)} />

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
