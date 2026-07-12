"use client";

/* ================================================================
   MENU DO USUÁRIO (topbar)
   Avatar com a inicial do corretor. Abre um menu com Configurações e
   Sair — resolvendo o acesso ao logout que antes ficava só no rodapé
   da barra lateral (enterrado no mobile).
   ================================================================ */
import { useEffect, useRef, useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useUiModal } from "@/lib/uiModal";

export default function MenuUsuario() {
  const { usuario } = useSessao();
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const rotulo = rotuloUsuario(usuario);
  const inicial = (rotulo.trim()[0] || "?").toUpperCase();

  // Fecha ao clicar fora. O listener só existe enquanto está aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  async function sair() {
    setAberto(false);
    await getSupabase().auth.signOut();
  }

  return (
    <div className="topbar-pop-wrap" ref={wrapRef}>
      <button type="button" className="topbar-avatar" aria-label="Menu do usuário" onClick={() => setAberto((v) => !v)}>
        {inicial}
      </button>

      {aberto && (
        <div className="topbar-pop topbar-pop-user">
          <div className="topbar-pop-user-head">{rotulo}</div>
          <button
            type="button"
            className="topbar-pop-item"
            onClick={() => {
              setAberto(false);
              abrirModal("config");
            }}
          >
            <span className="topbar-pop-ic">⚙</span>
            <span className="topbar-pop-txt">
              <strong>Configurações</strong>
            </span>
          </button>
          <button type="button" className="topbar-pop-item" onClick={sair}>
            <span className="topbar-pop-ic">↩</span>
            <span className="topbar-pop-txt">
              <strong>Sair</strong>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
