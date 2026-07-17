"use client";

/* ================================================================
   RODAPÉ DO APP
   Mesmo rodapé no painel (fim do <main>) e na tela de acesso: uma
   assinatura centrada, com o oferecimento como protagonista (fonte
   display + dourado do acento) e marca/versão discretas embaixo.
   Só marca, oferecimento e versão — nada que dependa de sessão, pra
   poder viver dos dois lados do login.
   ================================================================ */
import { todayISO } from "@/lib/datas";
import { VERSAO_APP } from "@/lib/versao";

export default function RodapeApp({ variante }: { variante?: "auth" }) {
  const ano = todayISO().slice(0, 4);

  return (
    <footer className={`rodape-app${variante === "auth" ? " rodape-app-auth" : ""}`}>
      <div className="rodape-rotulo">Um oferecimento</div>
      <div className="rodape-oferecimento">Grupo SophiaHub</div>
      <div className="rodape-risco" aria-hidden="true" />
      {/* O ano vem do relógio de quem renderiza: no virar do ano o servidor
          (UTC) e o browser (BRT) podem discordar por algumas horas. */}
      <div className="rodape-assinatura" suppressHydrationWarning>
        Painel de Angariações © {ano} · <span className="rodape-versao">v{VERSAO_APP}</span>
      </div>
    </footer>
  );
}
