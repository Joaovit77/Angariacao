"use client";

/* ================================================================
   FAIXA DE NAVEGAÇÃO DA ANGARIAÇÃO
   Alterna entre as ferramentas de captação sem entrada própria no
   menu lateral (lá só existe "Angariação"). Mesmo desenho das abas
   da Central e do alternador Garimpo/Catálogo, com links. Montada
   pelo shell autenticado acima do conteúdo das rotas da área.
   ================================================================ */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { FERRAMENTAS_ANGARIACAO, rotaCorresponde } from "./ferramentasAngariacao";

export default function NavAngariacao() {
  const pathname = usePathname();
  // O contador do Radar pertence à Central: aparece só no link dela.
  const radarNovos = useAppStore((s) => s.radarNovos);

  return (
    <nav className="nav-angariacao" aria-label="Ferramentas de angariação">
      {FERRAMENTAS_ANGARIACAO.map((ferramenta) => {
        const ativa = rotaCorresponde(pathname, ferramenta.rota);
        return (
          <Link
            key={ferramenta.rota}
            href={ferramenta.rota}
            className={ativa ? "active" : ""}
            aria-current={ativa ? "page" : undefined}
          >
            {ferramenta.icone}
            <span>{ferramenta.texto}</span>
            {ferramenta.badge === "radar" && radarNovos > 0 && (
              <span className="nav-angariacao-badge">{radarNovos}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
