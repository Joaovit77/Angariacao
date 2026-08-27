import ConfiguracoesView from "@/components/configuracoes/ConfiguracoesView";

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string }>;
}) {
  const { secao } = await searchParams;
  return <ConfiguracoesView secaoInicial={secao} />;
}
