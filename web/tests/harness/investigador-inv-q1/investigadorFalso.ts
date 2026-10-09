import type {
  CorrespondenciaInvestigacao,
  EventoInvestigacao,
  FaixaConfiancaInvestigacao,
} from "@/lib/calculo/investigadorImoveis";

/* Substitui `@/lib/investigadorImoveis` só no harness: devolve fixtures
   sintéticas pelo mesmo formato de eventos da rota. Sem rede. */

export type CenarioInvestigador = "0-10" | "1-9" | "3-0" | "vazio";

const CONSULTA = "Rua Exemplo, Jardim Sintético, Londrina, PR, Casa, 3 quartos, 2 vagas";

function card(indice: number, confianca: FaixaConfiancaInvestigacao): CorrespondenciaInvestigacao {
  const forte = confianca === "forte" || confianca === "muito-forte";
  return {
    titulo: forte
      ? `Casa à venda na Rua Exemplo, 12${indice}, Jardim Sintético, Londrina`
      : `Casa para alugar em Londrina com 3 quartos, anúncio sintético ${indice}`,
    url: `https://portal${indice}.exemplo.test/imovel/${1000 + indice}`,
    dominio: `portal${indice}.exemplo.test`,
    descricao: "Texto sintético de anúncio para o harness local, com quintal, área de serviço e garagem coberta.",
    consultas: [`${CONSULTA} imóvel`],
    preco: indice % 2 ? 2400 + indice * 50 : null,
    endereco: forte ? `Rua Exemplo, 12${indice}` : null,
    referencia: null,
    condominio: null,
    quartos: indice % 3 ? 3 : 2,
    vagas: indice % 4 ? 2 : null,
    area: indice % 2 ? 90 + indice : null,
    confianca,
    evidencias: forte
      ? [`Endereço idêntico: Rua Exemplo, 12${indice}`, "Mesma quantidade de quartos: 3"]
      : indice % 3 ? ["Mesma quantidade de quartos: 3", "Termos principais encontrados: exemplo, londrina"] : [],
    contradicoes: !forte && indice % 3 === 0 ? ["Quantidade de quartos diferente: 2"] : [],
  };
}

function naoConfirmados(quantidade: number, inicio = 1): CorrespondenciaInvestigacao[] {
  return Array.from({ length: quantidade }, (_, i) => card(inicio + i, (inicio + i) % 3 === 0 ? "indicio" : "possivel"));
}

const RESULTADOS: Record<CenarioInvestigador, CorrespondenciaInvestigacao[]> = {
  "0-10": naoConfirmados(10),
  "1-9": [card(1, "forte"), ...naoConfirmados(9, 2)],
  "3-0": [card(1, "muito-forte"), card(2, "forte"), card(3, "forte")],
  vazio: [],
};

export function definirCenario(cenario: CenarioInvestigador) {
  (globalThis as { __cenarioInvestigador?: CenarioInvestigador }).__cenarioInvestigador = cenario;
}

function cenarioAtual(): CenarioInvestigador {
  return (globalThis as { __cenarioInvestigador?: CenarioInvestigador }).__cenarioInvestigador ?? "0-10";
}

export async function carregarContextoInvestigador() {
  return { consulta: CONSULTA, origem: "pipeline" as const };
}

export async function investigarImovel(consulta: string, aoEvento: (evento: EventoInvestigacao) => void): Promise<void> {
  const resultados = RESULTADOS[cenarioAtual()];
  aoEvento({ tipo: "etapa", etapa: "gerando-buscas" });
  aoEvento({ tipo: "etapa", etapa: "pesquisando-web" });
  await new Promise((resolver) => setTimeout(resolver, 150));
  aoEvento({ tipo: "consultas", consultas: [`${consulta} imóvel`] });
  aoEvento({
    tipo: "resultado",
    dados: {
      ok: true,
      consultaOriginal: consulta,
      consultas: [`${consulta} imóvel`],
      resultados,
      pesquisasEvitadas: 0,
      encerramentoAntecipado: false,
      limiteAtingido: false,
      ...(resultados.length ? {} : { aviso: "Nenhuma possível correspondência apareceu nessas buscas." }),
    },
  });
}
