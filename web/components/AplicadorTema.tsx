"use client";

/* ================================================================
   APLICADOR DE TEMA
   Não desenha nada: só liga o `sincronizarTema` ao ciclo de vida da
   página. Mora no layout RAIZ (e não no do painel) porque a tela de
   acesso também é pintada pelos mesmos tokens — o corretor que prefere
   claro não pode ver a tela de login escura.
   ================================================================ */
import { useEffect } from "react";
import { sincronizarTema } from "@/lib/tema";

export default function AplicadorTema() {
  useEffect(() => sincronizarTema(), []);
  return null;
}
