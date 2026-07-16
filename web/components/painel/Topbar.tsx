"use client";

/* ================================================================
   BARRA DE TOPO (app bar) — mobile e desktop
   Mostra o NOME da tela atual (contexto) + sino de notificações +
   menu do usuário. O hambúrguer aqui é SÓ do mobile (CSS): lá a barra
   lateral é uma gaveta fora da tela, então o botão precisa morar no
   topo. No desktop ele vive na própria barra lateral, acima do logo
   (ver BarraLateral) — no topo-esquerdo fixo, sem ser puxado para o
   meio pela centralização do conteúdo. O logo pequeno também só no
   mobile (no desktop a sidebar já o tem).
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
    // A barra ocupa a largura toda: título junto ao menu, à esquerda, e o sino
    // e o avatar no canto direito. (O conteúdo do .main é que fica
    // centralizado; a barra não acompanha, senão os ícones "saem do canto".)
    <header className="topbar">
      <button
        type="button"
        className={`menu-toggle topbar-menu${menuAtivo ? " is-x" : ""}`}
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
