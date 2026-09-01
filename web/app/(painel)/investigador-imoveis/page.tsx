import InvestigadorImoveisView from "@/components/investigador/InvestigadorImoveisView";
import type { ReferenciaContextoInvestigador } from "@/lib/calculo/contextoInvestigador";

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
  const referencias = [
    { origem: "imovel", id: valor(parametros.imovel) },
    { origem: "radar-anuncio", id: valor(parametros.radarAnuncio) },
    { origem: "comparavel", id: valor(parametros.comparavel) },
  ].filter((item): item is ReferenciaContextoInvestigador => Boolean(item.id?.trim()));
  const referenciaInicial = referencias.length === 1 ? referencias[0] : null;
  const imovelId = referenciaInicial?.origem === "imovel" ? referenciaInicial.id : undefined;

  return (
    <InvestigadorImoveisView
      key={referenciaInicial ? `${referenciaInicial.origem}:${referenciaInicial.id}` : "manual"}
      imovelIdInicial={imovelId || null}
      referenciaInicial={referenciaInicial?.origem === "imovel" ? null : referenciaInicial}
    />
  );
}
