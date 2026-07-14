"use client";

/* ================================================================
   BARRA DE TOPO (app bar) — mobile e desktop
   Mostra o NOME da tela atual (contexto) + sino de notificações +
   menu do usuário. No mobile ganha o botão do menu (hambúrguer) e um
   logo pequeno; no desktop o hambúrguer/logo somem (a sidebar já os tem).
   O título aqui substitui o <h1 class="page-title"> que cada view
   renderizava — agora vive num só lugar.
   ================================================================ */
import Image from "next/image";
import { usePathname } from "next/navigation";
import SinoNotificacoes from "./SinoNotificacoes";
import MenuUsuario from "./MenuUsuario";

const TITULOS: Record<string, string> = {
  "/home": "Início",
  "/dashboard": "Dashboard",
  "/pipeline": "Pipeline",
  "/metas": "Metas",
  "/agenda": "Agenda",
  "/insights": "Insights",
  "/mapa": "Mapa",
  "/relatorios": "Relatórios",
  "/roadmap": "Integrações & IA",
};

export default function Topbar({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const pathname = usePathname();
  const titulo = TITULOS[pathname] ?? "Angariações";

  return (
    <header className="topbar">
      <button type="button" className="topbar-menu" onClick={aoAbrirMenu} aria-label="Abrir menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <Image className="topbar-logo" src="/logo.png" alt="" width={28} height={28} />
      <h1 className="topbar-title">{titulo}</h1>
      <div className="topbar-actions">
        <SinoNotificacoes />
        <MenuUsuario />
      </div>
    </header>
  );
}
