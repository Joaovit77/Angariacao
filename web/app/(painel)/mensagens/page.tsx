import type { Metadata } from "next";
import MensagensAgendadasView from "@/components/mensagens/MensagensAgendadasView";

export const metadata: Metadata = {
  title: "Mensagens | Angario",
  description: "Gestão de mensagens agendadas.",
};

export default function Pagina() {
  return <MensagensAgendadasView />;
}
