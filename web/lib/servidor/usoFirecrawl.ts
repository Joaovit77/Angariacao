const URL_USO_FIRECRAWL = "https://api.firecrawl.dev/v2/team/credit-usage";
const TIMEOUT_USO_FIRECRAWL_MS = 10_000;

interface RespostaUsoFirecrawl {
  success?: boolean;
  error?: string;
  data?: {
    remainingCredits?: unknown;
    planCredits?: unknown;
    billingPeriodStart?: unknown;
    billingPeriodEnd?: unknown;
  };
}

export interface UsoFirecrawl {
  creditosDisponiveis: number;
  creditosDoPlano: number;
  creditosConsumidos: number;
  percentualConsumido: number;
  inicioCiclo: string | null;
  fimCiclo: string | null;
}

export class ConsultaUsoFirecrawlFalhou extends Error {}

function numeroNaoNegativo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;
}

function dataIsoOuNull(valor: unknown): string | null {
  if (typeof valor !== "string" || !Number.isFinite(Date.parse(valor))) return null;
  return valor;
}

/**
 * Consulta o saldo oficial da equipe. A API key nunca sai do servidor e esta
 * chamada de conta não consome os créditos usados pelas raspagens.
 */
export async function consultarUsoFirecrawl(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<UsoFirecrawl> {
  const resposta = await fetcher(URL_USO_FIRECRAWL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_USO_FIRECRAWL_MS),
  });
  const corpo = (await resposta.json().catch(() => null)) as RespostaUsoFirecrawl | null;
  const disponiveis = numeroNaoNegativo(corpo?.data?.remainingCredits);
  const plano = numeroNaoNegativo(corpo?.data?.planCredits);

  if (!resposta.ok || corpo?.success !== true || disponiveis == null || plano == null) {
    throw new ConsultaUsoFirecrawlFalhou(
      `Firecrawl respondeu ${resposta.status}: ${corpo?.error || "saldo indisponível"}`,
    );
  }

  const consumidos = Math.max(0, plano - disponiveis);
  return {
    creditosDisponiveis: disponiveis,
    creditosDoPlano: plano,
    creditosConsumidos: consumidos,
    percentualConsumido: plano > 0 ? Math.min(100, (consumidos / plano) * 100) : 0,
    inicioCiclo: dataIsoOuNull(corpo.data?.billingPeriodStart),
    fimCiclo: dataIsoOuNull(corpo.data?.billingPeriodEnd),
  };
}
