"use client";

/* ================================================================
   SIDEBAR
   Port das linhas 193–245 do index.html + wireNav()/updateNavBadges()
   do app.js. Os itens continuam sendo <button> (o CSS .nav-item não
   reseta o sublinhado de <a>), mas agora navegam por URL — cada view
   virou uma rota (§4 do MIGRATION_NEXT.md).
   ================================================================ */
import Image from "next/image";
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import { contarRespostasPendentes } from "@/lib/calculo/respostas";
import { STATUS_FLOW } from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";

const STATUS_FUNIL: readonly string[] = STATUS_FLOW;

type Badge = "pipeline" | "agenda" | "respostas" | "radar";

interface ItemNav {
  rota: string;
  texto: string;
  icone: React.ReactNode;
  badge?: Badge;
}

const ITENS: ItemNav[] = [
  {
    rota: "/home",
    texto: "Início",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
      </svg>
    ),
  },
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
    rota: "/central-angariacao",
    texto: "Central de Angariação",
    badge: "radar",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5M11 7v8M7 11h8" />
      </svg>
    ),
  },
  {
    rota: "/respostas",
    texto: "Respostas",
    badge: "respostas",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20l1.9-4.1A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z" />
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
    // Perto do fim de propósito: é tela de referência, aberta para escrever uma
    // vez e revisar de vez em quando, não trabalho do dia. Sem badge pelo mesmo
    // motivo — não há nada aqui que se acumule cobrando atenção.
    rota: "/protocolos",
    texto: "Protocolos",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M9 7h7M9 11h7" />
      </svg>
    ),
  },
  // "Integrações & IA" (/roadmap) fica fora do menu por ora — a página segue
  // no código (app/(painel)/roadmap) para reativar quando as integrações
  // entrarem: basta devolver este item ao array.
];

/** Fora do array acima porque não é do corretor: só aparece para quem tem
    o cargo (`ehAdmin`, confirmado pelo servidor). Esconder é conveniência
    — quem souber o endereço chega na página, e lá toda consulta volta 403
    sem o cargo. */
const ITEM_ADMIN: ItemNav = {
  rota: "/admin",
  texto: "Administração",
  icone: (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

export default function BarraLateral({
  aberta,
  aoFechar,
  aoAlternar,
  menuAtivo,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aoAlternar: () => void;
  menuAtivo: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const ehAdmin = useAppStore((s) => s.ehAdmin);
  const operaCarteira = useAppStore((s) => s.operaCarteira);
  const radarNovos = useAppStore((s) => s.radarNovos);

  /* Três menus, não dois. Quem opera o sistema sem trabalhar carteira
     vê SÓ a Administração: as dez telas de corretor abririam numa
     parede de zeros — e pior que vazias, elas mentem, porque uma caixa
     de respostas em branco diz "nada chegou" quando o que houve é que
     a conta não tem número de WhatsApp e nunca vai receber nada.
     Continua sendo conveniência: as rotas do corretor não recusam
     ninguém (são a carteira dele, vazia), e quem chegar por URL cai no
     redirecionamento do shell. */
  const itens = useMemo(() => {
    if (!ehAdmin) return ITENS;
    return operaCarteira ? [...ITENS, ITEM_ADMIN] : [ITEM_ADMIN];
  }, [ehAdmin, operaCarteira]);

  // Prefetch das rotas: os itens são <button> com router.push (não <Link>),
  // então o Next não faz o prefetch automático. Sem isto, cada clique só
  // começa a buscar o chunk/RSC da view depois do clique, atrasando a pintura
  // (INP alto). Aquece o cache no mount. (No dev o prefetch é no-op — a
  // lentidão ao navegar em localhost é a compilação sob demanda, não isto.)
  useEffect(() => {
    for (const item of itens) router.prefetch(item.rota);
  }, [router, itens]);

  // A caixa varre as notas de todos os imóveis; ao contrário dos outros dois
  // badges (um filter simples), vale memoizar — a barra re-renderiza a cada
  // navegação.
  const respostasPendentes = useMemo(() => contarRespostasPendentes(imoveis, todayISO()), [imoveis]);

  // updateNavBadges(): pipeline = imóveis no funil ainda não locados;
  // agenda = compromissos pendentes; respostas = imóveis com mensagem do
  // proprietário ainda não tratada.
  const badges: Record<Badge, number> = {
    pipeline: imoveis.filter((i) => STATUS_FUNIL.includes(i.status) && i.status !== "Locado").length,
    agenda: agenda.filter((a) => !a.done).length,
    respostas: respostasPendentes,
    radar: radarNovos,
  };

  function navegar(rota: string) {
    router.push(rota);
    aoFechar();
  }

  return (
    <aside className={`sidebar${aberta ? " open" : ""}`} id="sidebar">
      {/* Faixa de cabeçalho da barra: no desktop tem a mesma altura da topbar,
          e a sua borda inferior CONTINUA a borda dela — uma linha só
          atravessando o app. Dentro, o hambúrguer; o logo fica abaixo. */}
      <div className="sidebar-head">
        <button
          type="button"
          className={`menu-toggle sidebar-menu${menuAtivo ? " is-x" : ""}`}
          onClick={aoAlternar}
          aria-label="Alternar menu"
          aria-expanded={menuAtivo}
        >
          <span className="ham" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>

      <div className="brand">
        <Image className="brand-mark" src="/logo.png" alt="Angariações" width={52} height={52} />
        <div className="brand-text">
          <span className="brand-title">Angariações</span>
          <span className="brand-sub">Controle de Locação</span>
        </div>
      </div>

      <div className="nav-group">
        {itens.map((item) => (
          <button
            key={item.rota}
            type="button"
            className={`nav-item${pathname === item.rota ? " active" : ""}`}
            onClick={() => navegar(item.rota)}
            data-tip={item.texto}
          >
            {item.icone}
            {/* Rótulo em span: some quando a barra recolhe (vira só ícones);
                o data-tip vira tooltip no hover nesse estado. */}
            <span className="nav-item-txt">{item.texto}</span>
            {item.badge && <span className="nav-item-badge">{badges[item.badge]}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user" id="sidebar-user">
          {rotuloUsuario(usuario)}
        </div>
        Dados salvos na nuvem
        <br />
        (Supabase), por login.
      </div>
    </aside>
  );
}
