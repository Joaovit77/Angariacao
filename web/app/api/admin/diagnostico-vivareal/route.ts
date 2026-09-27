import { anuncioPertenceAoMercado, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { agoraISOString } from "@/lib/datas";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { buscarComFirecrawlAoVivo, FirecrawlIndisponivel } from "@/lib/servidor/firecrawlCentralAngariacao";
import { exigirAdmin } from "../_comum";

export const runtime = "nodejs";

const filtros: FiltrosCentralAngariacao = {
  portal: "viva-real",
  cidade: "Londrina",
  estado: "PR",
  tipo: "Apartamento",
};

const campos = ["titulo", "url", "idExterno", "preco", "endereco", "bairro", "cidade", "estado", "quartos", "tipo", "publicadoEm"] as const;

function cobertura(anuncios: AnuncioCentralAngariacao[]) {
  const resultado: Record<string, { preenchidos: number; total: number }> = {};
  for (const campo of campos) {
    resultado[campo] = {
      preenchidos: anuncios.filter((anuncio) => anuncio[campo] !== null && anuncio[campo] !== undefined && anuncio[campo] !== "").length,
      total: anuncios.length,
    };
  }
  resultado.autoria = {
    preenchidos: anuncios.filter((anuncio) => anuncio.anunciante !== "incerto").length,
    total: anuncios.length,
  };
  return resultado;
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ ok: false, falha: "ambiente_bloqueado" }, { status: 403 });
  }
  if (new URL(request.url).search || await request.text()) {
    return Response.json({ ok: false, falha: "parametros_bloqueados" }, { status: 400 });
  }
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  const url = urlDaPesquisa(filtros);
  const inicio = performance.now();
  try {
    const anuncios = await buscarComFirecrawlAoVivo(filtros, url);
    const filtrados = anuncios.filter((anuncio) => anuncioPertenceAoMercado(anuncio, filtros.cidade, filtros.estado));
    return Response.json({
      ok: true,
      horario: agoraISOString(),
      url,
      duracaoMs: Math.round(performance.now() - inicio),
      interpretados: anuncios.length,
      normalizados: anuncios.length,
      aposFiltros: filtrados.length,
      cobertura: cobertura(anuncios),
      classificacao: anuncios.length ? "E_ou_D" : "B_ou_C_inconclusivo",
      htmlBruto: "indisponivel_pelo_helper_atual",
      cardsCandidatos: "indisponivel_pelo_helper_atual",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    const codigo = erro instanceof FirecrawlIndisponivel ? erro.codigo : "falha_desconhecida";
    return Response.json({
      ok: false,
      horario: agoraISOString(),
      url,
      duracaoMs: Math.round(performance.now() - inicio),
      codigo,
      classificacao: codigo === "parser_falhou" ? "C" : "A",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
