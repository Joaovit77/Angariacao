import AvaliacaoRapidaView from "@/components/avaliacao/AvaliacaoRapidaView";
import type { ReferenciaContextoAvaliacao } from "@/lib/calculo/contextoAvaliacao";

interface Props {
  searchParams: Promise<{
    imovel?: string | string[];
    radarAnuncio?: string | string[];
    comparavel?: string | string[];
  }>;
}

export default async function Pagina({ searchParams }: Props) {
  const parametros = await searchParams;
  const valor = (item: string | string[] | undefined) => Array.isArray(item) ? item[0] : item;
  const imovelId = valor(parametros.imovel);
  const referencias = [
    { origem: "radar-anuncio", id: valor(parametros.radarAnuncio) },
    { origem: "comparavel", id: valor(parametros.comparavel) },
  ].filter((item): item is ReferenciaContextoAvaliacao => Boolean(item.id?.trim()));
  const parametrosAmbiguos = referencias.length > 1 || Boolean(imovelId && referencias.length);
  const referenciaInicial = !parametrosAmbiguos && referencias.length === 1 ? referencias[0] : null;
  const imovelIdInicial = !parametrosAmbiguos && !referenciaInicial ? imovelId || null : null;

  return (
    <AvaliacaoRapidaView
      key={referenciaInicial ? `${referenciaInicial.origem}:${referenciaInicial.id}` : imovelIdInicial || "manual"}
      imovelIdInicial={imovelIdInicial}
      referenciaInicial={referenciaInicial}
    />
  );
}
