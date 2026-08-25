"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import BotaoTema from "@/components/BotaoTema";
import MarcaApp from "@/components/MarcaApp";

interface Props {
  aoEntrar: () => void;
  aoCriarConta: () => void;
}

const assinarCliente = () => () => {};
const lerCliente = () => true;
const lerServidor = () => false;

const LINKS_FUNCIONALIDADES = [
  ["#dashboard", "Dashboard"],
  ["#pipeline", "Pipeline"],
  ["#agenda", "Agenda"],
  ["#inteligencia-artificial", "Inteligência artificial"],
  ["#avaliacao-de-imoveis", "Avaliação de imóveis"],
  ["#whatsapp", "WhatsApp"],
  ["#mapa-inteligente", "Mapa inteligente"],
  ["#relatorios", "Relatórios"],
  ["#integracoes", "Integrações"],
] as const;

export default function CabecalhoApresentacao({ aoEntrar, aoCriarConta }: Props) {
  const [foraDaFoto, setForaDaFoto] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const botaoMenuRef = useRef<HTMLButtonElement | null>(null);
  const botaoFecharRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const portalDisponivel = useSyncExternalStore(assinarCliente, lerCliente, lerServidor);

  useEffect(() => {
    const apresentacao = document.querySelector<HTMLElement>(".apresentacao");
    if (!apresentacao) return;

    const observador = new IntersectionObserver(
      ([entrada]) => setForaDaFoto(!entrada.isIntersecting),
      { rootMargin: "-64px 0px 0px", threshold: 0 },
    );

    observador.observe(apresentacao);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (!menuMobileAberto) return;

    const consultaMobile = window.matchMedia("(max-width: 720px)");

    function fecharAoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setMenuMobileAberto(false);
        window.requestAnimationFrame(() => botaoMenuRef.current?.focus());
        return;
      }
      if (evento.key !== "Tab") return;

      const focaveis = menuRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis || focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    function fecharAoSairDoMobile(evento: MediaQueryListEvent) {
      if (!evento.matches) setMenuMobileAberto(false);
    }

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", fecharAoTeclar);
    consultaMobile.addEventListener("change", fecharAoSairDoMobile);
    window.requestAnimationFrame(() => botaoFecharRef.current?.focus());

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", fecharAoTeclar);
      consultaMobile.removeEventListener("change", fecharAoSairDoMobile);
    };
  }, [menuMobileAberto]);

  function navegarPara(destino: string) {
    setMenuMobileAberto(false);
    window.history.replaceState(null, "", destino);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(destino)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }

  function entrarPeloMenu() {
    setMenuMobileAberto(false);
    aoEntrar();
  }

  function fecharMenuMobile() {
    setMenuMobileAberto(false);
    window.requestAnimationFrame(() => botaoMenuRef.current?.focus());
  }

  return (
    <>
      <header
        className={`vitrine-topo apresentacao-topo${foraDaFoto ? " fora-da-foto" : ""}`}
      >
        <div className="vitrine-topo-fita">
          <button
            type="button"
            className="apresentacao-menu-toggle"
            aria-label="Abrir menu de navegação"
            aria-expanded={menuMobileAberto}
            aria-controls="apresentacao-menu-mobile"
            onClick={() => setMenuMobileAberto(true)}
            ref={botaoMenuRef}
          >
            <span aria-hidden="true"><i /><i /><i /></span>
          </button>

          <div className="brand vitrine-topo-marca">
            <MarcaApp className="brand-mark" alt="Angario" />
            <div className="brand-text">
              <span className="brand-title">Angario</span>
              <span className="brand-sub">CRM imobiliário</span>
            </div>
          </div>

          <div className="vitrine-topo-acoes">
            <a
              className="btn btn-ghost btn-sm apresentacao-conhecer-topo"
              href="#conheca-o-sistema"
            >
              <span className="longo">Conheça o sistema</span>
              <span className="curto">Conheça</span>
            </a>
            <BotaoTema />
            <button
              type="button"
              className="btn btn-ghost btn-sm vitrine-so-largo"
              onClick={aoCriarConta}
            >
              Criar conta
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={aoEntrar}>
              Entrar
            </button>
          </div>
        </div>
      </header>

      {portalDisponivel && createPortal(
        <>
          <button
            type="button"
            className={`apresentacao-menu-backdrop${menuMobileAberto ? " aberto" : ""}`}
            aria-label="Fechar menu de navegação"
            tabIndex={menuMobileAberto ? 0 : -1}
            onClick={fecharMenuMobile}
          />
          <aside
            className={`apresentacao-menu-drawer${menuMobileAberto ? " aberto" : ""}`}
            id="apresentacao-menu-mobile"
            role="dialog"
            aria-modal="true"
            aria-label="Navegação da página pública"
            aria-hidden={!menuMobileAberto}
            inert={!menuMobileAberto}
            ref={menuRef}
          >
            <div className="apresentacao-menu-cabecalho">
              <div className="brand apresentacao-menu-marca">
                <MarcaApp className="brand-mark" />
                <div className="brand-text">
                  <span className="brand-title">Angario</span>
                  <span className="brand-sub">CRM imobiliário</span>
                </div>
              </div>
              <button
                type="button"
                className="apresentacao-menu-fechar"
                aria-label="Fechar menu de navegação"
                onClick={fecharMenuMobile}
                ref={botaoFecharRef}
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <nav className="apresentacao-menu-conteudo" aria-label="Navegação principal">
              <span className="apresentacao-menu-rotulo">Navegação</span>
              <a
                href="#auth-screen"
                onClick={(evento) => {
                  evento.preventDefault();
                  navegarPara("#auth-screen");
                }}
              >
                Início
              </a>
              <a
                href="#conheca-o-sistema"
                onClick={(evento) => {
                  evento.preventDefault();
                  navegarPara("#conheca-o-sistema");
                }}
              >
                Conheça o sistema
              </a>

              <span className="apresentacao-menu-rotulo">Funcionalidades</span>
              {LINKS_FUNCIONALIDADES.map(([destino, rotulo]) => (
                <a
                  href={destino}
                  onClick={(evento) => {
                    evento.preventDefault();
                    navegarPara(destino);
                  }}
                  key={destino}
                >
                  {rotulo}
                </a>
              ))}
            </nav>

            <div className="apresentacao-menu-rodape">
              <div className="apresentacao-menu-tema">
                <span>
                  <strong>Tema</strong>
                  <small>Claro ou escuro</small>
                </span>
                <BotaoTema className="apresentacao-menu-tema-toggle" />
              </div>
              <button type="button" className="btn btn-primary" onClick={entrarPeloMenu}>
                Entrar no sistema
              </button>
            </div>
          </aside>
        </>,
        document.body,
      )}
    </>
  );
}
