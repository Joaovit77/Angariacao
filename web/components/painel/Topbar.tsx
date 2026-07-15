"use client";

/* ================================================================
   BARRA DE TOPO (app bar) — mobile e desktop
   Mostra o NOME da tela atual (contexto) + sino de notificações +
   menu do usuário. O hambúrguer aparece nas DUAS larguras: no desktop
   ele recolhe/expande a barra lateral (trilha de ícones ↔ menu
   completo); no mobile abre/fecha a gaveta. O ícone vira X quando o
   menu está "ativo" (expandido no desktop, gaveta aberta no mobile).
   O logo pequeno segue só no mobile (no desktop a sidebar já o tem).
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

export default function Topbar({
  aoAlternar,
  menuAtivo,
}: {
  aoAlternar: () => void;
  menuAtivo: boolean;
}) {
  const pathname = usePathname();
  const titulo = TITULOS[pathname] ?? "Angariações";

  return (
    <header className="topbar">
      <button
        type="button"
        className={`topbar-menu${menuAtivo ? " is-x" : ""}`}
        onClick={aoAlternar}
        aria-label="Alternar menu"
        aria-expanded={menuAtivo}
      >
        {/* Três barras que viram X via CSS (.topbar-menu.is-x). */}
        <span className="ham" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
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
