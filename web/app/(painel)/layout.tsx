"use client";

/* ================================================================
   SHELL AUTENTICADO
   Port do #app-shell do index.html (barra mobile + gaveta + sidebar
   + <main>) e da proteção que o handleUnauthenticated() fazia: sem
   sessão, volta para a tela de acesso.

   Enquanto carregarEstado() não termina, o <main> mostra o mesmo
   "Carregando seus dados..." do handleAuthenticated().
   ================================================================ */
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessao } from "@/components/SessaoProvider";
import BarraLateral from "@/components/painel/BarraLateral";
import Topbar from "@/components/painel/Topbar";
import EsqueletoPainel from "@/components/painel/EsqueletoPainel";
import ModalOverlay from "@/components/modais/ModalOverlay";
import { useAppStore } from "@/lib/store";

const CHAVE_RECOLHIDA = "sidebar-recolhida";

// Desktop = acima do breakpoint mobile (720px). Lido como store externo
// (useSyncExternalStore) em vez de setState num efeito, pra não esbarrar na
// regra do React de não sincronizar estado dentro de useEffect.
const consultaDesktop = "(min-width: 721px)";
function assinarViewport(cb: () => void) {
  const mq = window.matchMedia(consultaDesktop);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const ehDesktopAgora = () => window.matchMedia(consultaDesktop).matches;

// Preferência de "barra recolhida", persistida em localStorage e exposta
// como store externo. Ler assim (em vez de useState + useEffect) evita tanto
// o setState-em-efeito quanto o mismatch de hidratação: o snapshot do servidor
// é sempre `false` (barra expandida) e o React concilia com o cliente depois.
const ouvintesRecolhida = new Set<() => void>();
function assinarRecolhida(cb: () => void) {
  ouvintesRecolhida.add(cb);
  return () => {
    ouvintesRecolhida.delete(cb);
  };
}
function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE_RECOLHIDA) === "1";
  } catch {
    return false;
  }
}
function definirRecolhida(valor: boolean) {
  try {
    localStorage.setItem(CHAVE_RECOLHIDA, valor ? "1" : "0");
  } catch {
    /* modo privado / storage indisponível: só não persiste */
  }
  ouvintesRecolhida.forEach((cb) => cb());
}

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { estado } = useSessao();
  const router = useRouter();
  const pathname = usePathname();
  const carregado = useAppStore((s) => s.carregado);
  // gaveta = drawer do mobile; recolhida = trilha de ícones do desktop.
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const ehDesktop = useSyncExternalStore(assinarViewport, ehDesktopAgora, () => true);
  const recolhida = useSyncExternalStore(assinarRecolhida, lerRecolhida, () => false);

  useEffect(() => {
    if (estado === "anon" || estado === "recuperacao") router.replace("/");
  }, [estado, router]);

  if (estado !== "auth") return null;

  // Um só hambúrguer: no desktop recolhe/expande a trilha; no mobile
  // abre/fecha a gaveta.
  function alternarMenu() {
    if (ehDesktop) definirRecolhida(!recolhida);
    else setGavetaAberta((v) => !v);
  }

  // Fechar ao navegar: no desktop a barra expandida flutua por cima do
  // conteúdo, então clicar num item recolhe (libera o conteúdo); no mobile
  // fecha a gaveta.
  function fecharMenu() {
    setGavetaAberta(false);
    if (ehDesktop) definirRecolhida(true);
  }

  // Ícone vira X quando o menu está "expandido/aberto" no contexto atual.
  const menuAtivo = ehDesktop ? !recolhida : gavetaAberta;

  return (
    <>
    <div className={`app-shell${recolhida ? " recolhida" : ""}`} id="app-shell">
      {/* BARRA DE TOPO (nome da tela + notificações + usuário) */}
      <Topbar aoAlternar={alternarMenu} menuAtivo={menuAtivo} />

      {/* FUNDO ESCURO ATRÁS DA GAVETA (mobile) */}
      <div
        className={`sidebar-backdrop${gavetaAberta ? " open" : ""}`}
        id="sidebar-backdrop"
        onClick={() => setGavetaAberta(false)}
      />

      <BarraLateral aberta={gavetaAberta} aoFechar={fecharMenu} />

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
