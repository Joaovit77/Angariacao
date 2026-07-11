"use client";

/* ================================================================
   SIDEBAR
   Port das linhas 193–245 do index.html + wireNav()/updateNavBadges()
   do app.js. Os itens continuam sendo <button> (o CSS .nav-item não
   reseta o sublinhado de <a>), mas agora navegam por URL — cada view
   virou uma rota (§4 do MIGRATION_NEXT.md).
   ================================================================ */
import Image from "next/image";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import { STATUS_FLOW } from "@/lib/constantes";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

const STATUS_FUNIL: readonly string[] = STATUS_FLOW;

type Badge = "pipeline" | "agenda";

interface ItemNav {
  rota: string;
  texto: string;
  icone: React.ReactNode;
  badge?: Badge;
}

const ITENS: ItemNav[] = [
  {
    rota: "/dashboard",
    texto: "Dashboard",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    rota: "/pipeline",
    texto: "Pipeline",
    badge: "pipeline",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3h18v4H3zM3 10h12v4H3zM3 17h7v4H3z" />
      </svg>
    ),
  },
  {
    rota: "/metas",
    texto: "Metas",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    ),
  },
  {
    rota: "/agenda",
    texto: "Agenda",
    badge: "agenda",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </svg>
    ),
  },
  {
    rota: "/insights",
    texto: "Insights",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18h6M10 22h4M12 2a6 6 0 0 0-4 10.5c.7.66 1 1.3 1 2.5h6c0-1.2.3-1.84 1-2.5A6 6 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    rota: "/mapa",
    texto: "Mapa",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z" />
        <path d="M8 2v16M16 6v16" />
      </svg>
    ),
  },
  {
    rota: "/relatorios",
    texto: "Relatórios",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" />
      </svg>
    ),
  },
  {
    rota: "/roadmap",
    texto: "Integrações & IA",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
      </svg>
    ),
  },
];

const ESTILO_ITEM_RODAPE = { padding: "7px 8px", fontSize: "12.5px" };

export default function BarraLateral({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const abrirModal = useUiModal((s) => s.abrirModal);

  // Prefetch das rotas: os itens são <button> com router.push (não <Link>),
  // então o Next não faz o prefetch automático. Sem isto, cada clique só
  // começa a buscar o chunk/RSC da view depois do clique, atrasando a pintura
  // (INP alto). Aquece o cache no mount. (No dev o prefetch é no-op — a
  // lentidão ao navegar em localhost é a compilação sob demanda, não isto.)
  useEffect(() => {
    for (const item of ITENS) router.prefetch(item.rota);
  }, [router]);

  // updateNavBadges(): pipeline = imóveis no funil ainda não locados;
  // agenda = compromissos pendentes.
  const badges: Record<Badge, number> = {
    pipeline: imoveis.filter((i) => STATUS_FUNIL.includes(i.status) && i.status !== "Locado").length,
    agenda: agenda.filter((a) => !a.done).length,
  };

  function navegar(rota: string) {
    router.push(rota);
    aoFechar();
  }

  async function sair() {
    aoFechar();
    await getSupabase().auth.signOut();
  }

  return (
    <aside className={`sidebar${aberta ? " open" : ""}`} id="sidebar">
      <div className="brand">
        <Image className="brand-mark" src="/logo.png" alt="Angariações" width={52} height={52} />
        <div className="brand-text">
          <span className="brand-title">Angariações</span>
          <span className="brand-sub">Controle de Locação</span>
        </div>
      </div>

      <div className="nav-group">
        {ITENS.map((item) => (
          <button
            key={item.rota}
            type="button"
            className={`nav-item${pathname === item.rota ? " active" : ""}`}
            onClick={() => navegar(item.rota)}
          >
            {item.icone}
            {item.texto}
            {item.badge && <span className="nav-item-badge">{badges[item.badge]}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user" id="sidebar-user">
          {rotuloUsuario(usuario)}
        </div>
        <button
          type="button"
          className="nav-item"
          style={ESTILO_ITEM_RODAPE}
          onClick={() => {
            aoFechar();
            abrirModal("config");
          }}
        >
          ⚙ Configurações
        </button>
        <button type="button" className="nav-item" style={ESTILO_ITEM_RODAPE} onClick={sair}>
          ↩ Sair
        </button>
        Dados salvos na nuvem
        <br />
        (Supabase), por login.
      </div>
    </aside>
  );
}
