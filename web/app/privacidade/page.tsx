/* ROTA PÚBLICA: /privacidade
   Ver o comentário de /termos: pública porque precisa ser lida antes do
   cadastro, e porque um proprietário que receba uma mensagem e queira
   saber quem trata seus dados não tem — nem deve ter — login aqui. */
import type { Metadata } from "next";
import DocumentoLegal from "@/components/legal/DocumentoLegal";
import { PRIVACIDADE } from "@/lib/legal/conteudo";

export const metadata: Metadata = {
  title: "Política de Privacidade — Painel de Angariações",
};

export default function Pagina() {
  return <DocumentoLegal doc={PRIVACIDADE} />;
}
