import type { Metadata } from "next";
import ConversasView from "@/components/respostas/ConversasView";

export const metadata: Metadata = {
  title: "Mensagens | Angario",
  description: "Conversas com proprietários e contexto das negociações.",
};

export default function Pagina() {
  return <ConversasView />;
}
