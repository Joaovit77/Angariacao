import type { Metadata } from "next";
import CerebroIaView from "@/components/cerebro-ia/CerebroIaView";

export const metadata: Metadata = {
  title: "Cérebro da IA | Angario",
  description: "Veja como a IA do Angario interpreta, consulta, valida e responde.",
};

export default function Pagina() {
  return <CerebroIaView />;
}
