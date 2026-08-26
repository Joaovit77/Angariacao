import type { Metadata } from "next";
import AssistenteView from "@/components/assistente/AssistenteView";

export const metadata: Metadata = {
  title: "Assistente | Angario",
  description: "Consultas em modo somente leitura sobre a operação imobiliária.",
};

export default function Pagina() {
  return <AssistenteView />;
}
