/* ROTA PÚBLICA: /termos
   Fora do grupo (painel) de propósito — precisa ser legível ANTES de
   criar conta. Uma tela de cadastro que pede aceite de um documento que
   só abre depois do login não é aceite de nada. */
import type { Metadata } from "next";
import DocumentoLegal from "@/components/legal/DocumentoLegal";
import { TERMOS } from "@/lib/legal/conteudo";

export const metadata: Metadata = {
  title: "Termos de Uso — Painel de Angariações",
};

export default function Pagina() {
  return <DocumentoLegal doc={TERMOS} />;
}
