import type { Metadata } from "next";
import ConversasView from "@/components/respostas/ConversasView";

export const metadata: Metadata = {
  title: "Mensagens | Angario",
  description: "Conversas com proprietários e contexto das negociações.",
};

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ imovel?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const imovelInicial = Array.isArray(parametros.imovel) ? parametros.imovel[0] : parametros.imovel;
  return <ConversasView key={imovelInicial || "sem-imovel"} imovelInicial={imovelInicial || null} />;
}
