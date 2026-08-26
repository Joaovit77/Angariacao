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
import Celebracao from "@/components/painel/Celebracao";
import IndicadorFollowUp from "@/components/painel/IndicadorFollowUp";
import SincronizacaoRespostas from "@/components/painel/SincronizacaoRespostas";
import MonitorRadarAngariacao from "@/components/central/MonitorRadarAngariacao";
import ModalOverlay from "@/components/modais/ModalOverlay";
import PortaoTermos from "@/components/legal/PortaoTermos";
import RodapeApp from "@/components/RodapeApp";
import Assistente from "@/components/assistente/Assistente";
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
  const { estado, usuario } = useSessao();
  const router = useRouter();
  const pathname = usePathname();
  const carregado = useAppStore((s) => s.carregado);
  const ehAdmin = useAppStore((s) => s.ehAdmin);
  const operaCarteira = useAppStore((s) => s.operaCarteira);
  const cargoConfirmado = useAppStore((s) => s.cargoUsuarioId === usuario?.id);
  // gaveta = drawer do mobile; recolhida = trilha de ícones do desktop.
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const ehDesktop = useSyncExternalStore(assinarViewport, ehDesktopAgora, () => true);
  const recolhida = useSyncExternalStore(assinarRecolhida, lerRecolhida, () => false);

  useEffect(() => {
    if (estado === "anon" || estado === "recuperacao") router.replace("/");
  }, [estado, router]);

  /* Quem só OPERA o sistema não tem carteira, e por isso não tem view de
     corretor: a barra já esconde os itens, e isto fecha a porta da URL
     digitada para qualquer tela operacional da carteira.

     `cargoConfirmado` inclui o id da sessão atual: além de esperar a
     resposta, impede o cargo de uma conta anterior de decidir a nova. */
  useEffect(() => {
    if (cargoConfirmado && ehAdmin && !operaCarteira && pathname !== "/admin") {
      router.replace("/admin");
    }
  }, [cargoConfirmado, ehAdmin, operaCarteira, pathname, router]);

  if (estado !== "auth") return null;

  /* Nunca monta o shell com o perfil provisório. Antes, os valores seguros
     iniciais faziam a conta de operação parecer corretor durante a consulta. */
  if (!cargoConfirmado || (ehAdmin && !operaCarteira && pathname !== "/admin")) {
    return (
      <div className="perfil-gate" role="status" aria-live="polite">
        <div className="perfil-gate-marca" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z" />
            <path d="M8.5 12.5l2.2 2.2 4.8-5" />
          </svg>
        </div>
        <strong>{cargoConfirmado ? "Abrindo a Administração" : "Confirmando seu perfil"}</strong>
        <span>Aguarde só um instante.</span>
        <div className="perfil-gate-linha" aria-hidden="true"><i /></div>
      </div>
    );
  }

  // Um só hambúrguer: no desktop recolhe/expande a trilha; no mobile
  // abre/fecha a gaveta.
  function alternarMenu() {
    if (ehDesktop) definirRecolhida(!recolhida);
    else setGavetaAberta((v) => !v);
  }

  // Ao navegar, só a GAVETA do mobile fecha (senão ela taparia a tela inteira
  // que o usuário acabou de abrir). No desktop a barra fica como estava: com o
  // conteúdo centralizado, a barra expandida cai quase toda na margem vazia,
  // então não há motivo para recolhê-la sozinha — quem decide é o hambúrguer,
  // e a escolha é lembrada.
  function fecharMenu() {
    setGavetaAberta(false);
  }

  // Ícone vira X quando o menu está "expandido/aberto" no contexto atual.
  const menuAtivo = ehDesktop ? !recolhida : gavetaAberta;
  const ocultarAssistente = pathname === "/respostas" || pathname === "/mensagens";

  return (
    <PortaoTermos>
    <div className={`app-shell${recolhida ? " recolhida" : ""}`} id="app-shell">
      {/* BARRA DE TOPO (nome da tela + notificações + usuário) */}
      <Topbar aoAlternar={alternarMenu} menuAtivo={menuAtivo} />

      {/* FUNDO ESCURO ATRÁS DA GAVETA (mobile) */}
      <div
        className={`sidebar-backdrop${gavetaAberta ? " open" : ""}`}
        id="sidebar-backdrop"
        onClick={() => setGavetaAberta(false)}
      />

      <BarraLateral
        aberta={gavetaAberta}
        aoFechar={fecharMenu}
        aoAlternar={alternarMenu}
        menuAtivo={menuAtivo}
      />

      <main className="main" id="main-content">
        {carregado || pathname === "/admin" ? (
          <div key={pathname} className="view-anim">
            {children}
          </div>
        ) : (
          <EsqueletoPainel />
        )}
        <RodapeApp />
      </main>
    </div>

    {/* Irmão do .app-shell, como no index.html original. */}
    <ModalOverlay />
    {/* Fora do <main>: a fila do follow-up precisa seguir visível ao trocar
        de view, e é aqui que ela não é desmontada pela navegação. */}
    <IndicadorFollowUp />
    {/* Também fora do <main>: a comemoração nasce no fim de um salvamento que
        fecha o modal, e precisa sobreviver a esse fechamento. */}
    <Celebracao />
    {/* Idem: a assinatura do Realtime não pode ser derrubada e reaberta a cada
        navegação. Não renderiza nada — só mantém o store em dia com o banco. */}
    <SincronizacaoRespostas />
    {/* Busca no máximo um radar vencido por rodada e só enquanto o painel está aberto. */}
    <MonitorRadarAngariacao />
    {ocultarAssistente ? null : <Assistente />}
    </PortaoTermos>
  );
}
