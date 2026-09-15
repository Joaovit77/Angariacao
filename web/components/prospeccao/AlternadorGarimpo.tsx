"use client";

/* Navegação interna do módulo (C12): alterna entre a visão operacional
   do Garimpo e o Catálogo Visual. Mesmo desenho do `view-toggle` do
   Pipeline (Lista / Kanban), com links em vez de botões; nenhuma entrada
   nova no menu lateral. */
import Link from "next/link";

import styles from "./Prospeccao.module.css";

export const ROTAS_GARIMPO = {
  garimpo: "/garimpo-em-campo",
  catalogo: "/garimpo-em-campo/catalogo",
} as const;

export default function AlternadorGarimpo({ ativo }: { ativo: keyof typeof ROTAS_GARIMPO }) {
  return (
    <nav className={styles.alternador} aria-label="Visão do Garimpo em Campo" data-alternador-garimpo>
      <Link
        href={ROTAS_GARIMPO.garimpo}
        className={ativo === "garimpo" ? styles.alternadorAtivo : ""}
        aria-current={ativo === "garimpo" ? "page" : undefined}
      >
        Garimpo
      </Link>
      <Link
        href={ROTAS_GARIMPO.catalogo}
        className={ativo === "catalogo" ? styles.alternadorAtivo : ""}
        aria-current={ativo === "catalogo" ? "page" : undefined}
      >
        Catálogo
      </Link>
    </nav>
  );
}
