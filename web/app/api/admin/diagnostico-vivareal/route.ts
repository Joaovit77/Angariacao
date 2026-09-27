import { exigirAdmin } from "../_comum";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { buscarComFirecrawlAoVivo, FirecrawlIndisponivel } from "@/lib/servidor/firecrawlCentralAngariacao";
import { diagnosticarEstruturaVivaReal, resumirAnunciosVivaReal } from "@/lib/servidor/diagnosticoEstruturalVivaReal";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { agoraISOString } from "@/lib/datas";

export const runtime = "nodejs";
export const maxDuration = 120;

const FILTROS: FiltrosCentralAngariacao = {
  portal: "viva-real", cidade: "Londrina", estado: "PR", tipo: "Apartamento",
};
const URL_ESPERADA = "https://www.vivareal.com.br/aluguel/parana/londrina/apartamento_residencial/";
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ ok: false, falha: "ambiente_bloqueado" }, { status: 403, headers: SEM_CACHE });
  }
  if (new URL(request.url).search || request.body) {
    return Response.json({ ok: false, falha: "pedido_invalido" }, { status: 400, headers: SEM_CACHE });
  }
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  const url = urlDaPesquisa(FILTROS);
  if (url !== URL_ESPERADA) {
    return Response.json({ ok: false, falha: "url_inesperada" }, { status: 500, headers: SEM_CACHE });
  }

  const inicio = performance.now();
  const diagnostico: { estrutura: ReturnType<typeof diagnosticarEstruturaVivaReal> | null } = { estrutura: null };
  try {
    const anuncios = await buscarComFirecrawlAoVivo(FILTROS, url, {
      observarHtml: (html) => { diagnostico.estrutura = diagnosticarEstruturaVivaReal(html); },
    });
    if (!diagnostico.estrutura) throw new Error("Diagnóstico estrutural indisponível.");
    return Response.json({
      ok: true,
      horario: agoraISOString(),
      url,
      duracaoMs: Math.round(performance.now() - inicio),
      ...diagnostico.estrutura,
      parser: resumirAnunciosVivaReal(anuncios),
    }, { headers: SEM_CACHE });
  } catch (erro) {
    return Response.json({
      ok: false,
      falha: erro instanceof FirecrawlIndisponivel ? erro.codigo : "diagnostico_falhou",
      duracaoMs: Math.round(performance.now() - inicio),
    }, { status: 502, headers: SEM_CACHE });
  }
}
