"use client";

/* ================================================================
   RODAPÉ DO APP
   Mesmo rodapé no painel (fim do <main>) e na tela de acesso: uma
   assinatura centrada, com o oferecimento como protagonista (fonte
   display + dourado do acento) e marca/versão discretas embaixo.
   Só marca, oferecimento e versão — nada que dependa de sessão, pra
   poder viver dos dois lados do login.
   ================================================================ */
import Image from "next/image";
import Link from "next/link";
import { todayISO } from "@/lib/datas";
import { legalPublicavel } from "@/lib/legal/identidade";
import { VERSAO_APP } from "@/lib/versao";

export default function RodapeApp({ variante }: { variante?: "auth" }) {
  const ano = todayISO().slice(0, 4);

  return (
    <footer className={`rodape-app${variante === "auth" ? " rodape-app-auth" : ""}`}>
      <div className="rodape-rotulo">Um oferecimento</div>
      <div className="rodape-oferecimento">
        <Image
          className="rodape-logo-digimob-escuro"
          src="/logo-digimob-escuro.png"
          alt="Digimob"
          width={2172}
          height={724}
        />
        <Image
          className="rodape-logo-digimob-claro"
          src="/logo-digimob-claro.png"
          alt="Digimob"
          width={2172}
          height={724}
        />
      </div>
      <div className="rodape-risco" aria-hidden="true" />
      {/* O ano vem do relógio de quem renderiza: no virar do ano o servidor
          (UTC) e o browser (BRT) podem discordar por algumas horas. */}
      <div className="rodape-assinatura" suppressHydrationWarning>
        Angario CRM © {ano} · <span className="rodape-versao">v{VERSAO_APP}</span>
      </div>
      {/* Os documentos ficam no rodapé, que é onde as pessoas os procuram
          — e este rodapé vive dos DOIS lados do login, então valem tanto
          para quem já usa quanto para quem está decidindo se cria conta.

          Só aparecem quando publicáveis: link de rodapé para um documento
          que se abre dizendo "ainda não publicável" é pior que link
          nenhum. As páginas seguem acessíveis por URL direta para
          revisão. Ver `legalPublicavel`. */}
      {legalPublicavel() && (
        <div className="rodape-legal">
          <Link href="/termos">Termos de Uso</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/privacidade">Privacidade</Link>
        </div>
      )}
    </footer>
  );
}
