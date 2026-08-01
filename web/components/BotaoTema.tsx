"use client";

/* ================================================================
   BOTÃO DE TEMA (claro / escuro)
   Um clique, sem menu: só há dois temas, e um seletor de três estados
   ("sistema") pediria uma tela de preferências que este painel não tem.

   O ÍCONE é escolhido pelo CSS (`.tema-toggle`), não por estado do
   React — os dois ficam no HTML e o `data-tema` do <html> esconde um.
   É o que permite o tema ser aplicado antes da hidratação sem o servidor
   e o cliente discordarem sobre qual ícone desenhar.
   ================================================================ */
import { alternarTema } from "@/lib/tema";

export default function BotaoTema({ className = "topbar-icon-btn" }: { className?: string }) {
  return (
    <button
      type="button"
      className={`${className} tema-toggle`}
      onClick={() => alternarTema()}
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar entre tema claro e escuro"
    >
      <span className="tema-ic tema-ic-claro" aria-hidden="true">
        ☀
      </span>
      <span className="tema-ic tema-ic-escuro" aria-hidden="true">
        ☾
      </span>
    </button>
  );
}
