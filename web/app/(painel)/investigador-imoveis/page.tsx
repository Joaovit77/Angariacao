import InvestigadorImoveisView from "@/components/investigador/InvestigadorImoveisView";

interface Props {
  searchParams: Promise<{ imovel?: string | string[] }>;
}

export default async function Pagina({ searchParams }: Props) {
  const parametros = await searchParams;
  const imovelId = Array.isArray(parametros.imovel) ? parametros.imovel[0] : parametros.imovel;
  return <InvestigadorImoveisView key={imovelId || "manual"} imovelIdInicial={imovelId || null} />;
}
