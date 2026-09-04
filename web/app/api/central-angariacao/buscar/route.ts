import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import {
  anuncioPertenceAoMercado,
  PERIODOS_PUBLICACAO,
  PORTAIS_ANGARIACAO,
  rotuloPortal,
  type FiltrosCentralAngariacao,
  type ResultadoBuscaCentral,
} from "@/lib/calculo/centralAngariacao";
import { dentroDoPeriodo } from "@/lib/datas";
import {
  extrairJsonLd,
  PortalSemCoberturaGeografica,
  urlDaPesquisa,
} from "@/lib/servidor/centralAngariacao";
import { normalizarUf, ufValida } from "@/lib/calculo/geografia";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { buscarComFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { buscarComNavegador, NavegadorIndisponivel } from "@/lib/servidor/scraperCentralAngariacao";

export const runtime = "nodejs";
export const maxDuration = 60;

function resposta(corpo: ResultadoBuscaCentral, status = 200) {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function resultadoColeta(
  anuncios: ResultadoBuscaCentral["anuncios"],
  seguros: FiltrosCentralAngariacao,
  urlPesquisa: string,
): ResultadoBuscaCentral {
  const filtroSemConfirmacao = (seguros.portal === "olx" || seguros.portal === "wimoveis")
    && seguros.somenteProprietario
    && anuncios.some((anuncio) => anuncio.anunciante !== "proprietario");
  return {
    ok: true,
    anuncios,
    urlPesquisa,
    aviso: anuncios.length
      ? (filtroSemConfirmacao ? `O ${rotuloPortal(seguros.portal)} não confirmou o filtro de proprietário; revise os anúncios antes de importar.` : undefined)
      : "O portal não apresentou resultados para estes filtros.",
  };
}

async function finalizarRespostaColeta(
  supabase: SupabaseClient,
  userId: string,
  coletados: ResultadoBuscaCentral["anuncios"],
  seguros: FiltrosCentralAngariacao,
  urlPesquisa: string,
): Promise<ResultadoBuscaCentral> {
  const finalizacao = await finalizarColetaCentralAngariacao(
    supabase,
    userId,
    coletados,
    seguros,
  );
  const resultado = resultadoColeta(finalizacao.anuncios, seguros, urlPesquisa);
  if (finalizacao.erroComparaveis) {
    console.error(
      "[central-angariacao] falha ao atualizar a base de comparáveis",
      sanitizarErroExterno(finalizacao.erroComparaveis, "persistirComparaveis"),
    );
    resultado.aviso = [
      resultado.aviso,
      "Os resultados apareceram, mas não foi possível atualizar a base histórica agora.",
    ].filter(Boolean).join(" ");
  } else {
    console.info("[central-angariacao] comparáveis atualizados", {
      portal: seguros.portal,
      salvos: finalizacao.comparaveisSalvos,
    });
  }
  return resultado;
}

interface SessaoAutenticada {
  supabase: SupabaseClient;
  userId: string;
}

async function autenticado(request: Request): Promise<SessaoAutenticada | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !key || !token) return null;
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user ? { supabase, userId: data.user.id } : null;
}

export async function POST(request: Request) {
  const sessao = await autenticado(request);
  if (!sessao) {
    return resposta({ ok: false, anuncios: [], urlPesquisa: "", aviso: "Sessão inválida." }, 401);
  }

  const filtros = (await request.json().catch(() => null)) as FiltrosCentralAngariacao | null;
  if (!filtros || !PORTAIS_ANGARIACAO.includes(filtros.portal)
    || !filtros.cidade?.trim() || !ufValida(filtros.estado)) {
    return resposta({ ok: false, anuncios: [], urlPesquisa: "", aviso: "Informe portal, cidade e uma UF válida." }, 400);
  }
  const seguros: FiltrosCentralAngariacao = {
    ...filtros,
    cidade: filtros.cidade.trim().slice(0, 80),
    estado: normalizarUf(filtros.estado),
    bairro: filtros.bairro?.trim().slice(0, 80),
    diasPublicacao: filtros.portal === "olx" && PERIODOS_PUBLICACAO.includes(filtros.diasPublicacao as 1 | 7 | 30)
      ? filtros.diasPublicacao
      : null,
  };
  let urlPesquisa: string;
  try {
    urlPesquisa = urlDaPesquisa(seguros);
  } catch (erro) {
    if (erro instanceof PortalSemCoberturaGeografica) {
      return resposta({ ok: false, anuncios: [], urlPesquisa: "", aviso: erro.message }, 422);
    }
    throw erro;
  }

  if (process.env.FIRECRAWL_API_KEY) {
    try {
      const coletados = await buscarComFirecrawl(seguros, urlPesquisa);
      return resposta(await finalizarRespostaColeta(
        sessao.supabase,
        sessao.userId,
        coletados,
        seguros,
        urlPesquisa,
      ));
    } catch (erro) {
      console.warn("Central de Angariação: Firecrawl não concluiu a consulta:",
        sanitizarErroExterno(erro, "firecrawl"));
      if (process.env.VERCEL) {
        return resposta({
          ok: false,
          anuncios: [],
          urlPesquisa,
          aviso: "O serviço de consulta não respondeu agora. A pesquisa pronta ainda pode ser aberta.",
        });
      }
    }
  }

  try {
    const coletados = await buscarComNavegador(seguros, urlPesquisa);
    return resposta(await finalizarRespostaColeta(
      sessao.supabase,
      sessao.userId,
      coletados,
      seguros,
      urlPesquisa,
    ));
  } catch (erro) {
    // Sem Chrome no host (ex.: deploy ainda sem runtime de navegador), conserva
    // o fallback HTTP e o link pronto. No local e em hosts configurados, o
    // Playwright é sempre o caminho principal.
    if (!(erro instanceof NavegadorIndisponivel)) {
      console.warn("Central de Angariação: navegador não concluiu a consulta:", sanitizarErroExterno(erro, "navegador"));
    }
  }

  try {
    const r = await fetch(urlPesquisa, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CentralAngariacao/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`portal respondeu ${r.status}`);
    const html = await r.text();
    const anuncios = extrairJsonLd(html, seguros.portal, urlPesquisa).filter((a) => {
      if (!anuncioPertenceAoMercado(a, seguros.cidade, seguros.estado)) return false;
      if (seguros.diasPublicacao && !dentroDoPeriodo(a.publicadoEm, seguros.diasPublicacao)) return false;
      if (!seguros.somenteProprietario) return true;
      return a.anunciante !== "imobiliaria";
    });
    const resultado = await finalizarRespostaColeta(
      sessao.supabase,
      sessao.userId,
      anuncios,
      seguros,
      urlPesquisa,
    );
    if (!anuncios.length) {
      resultado.aviso = "O portal não disponibilizou resultados para leitura. Abra a pesquisa pronta para continuar.";
    }
    return resposta(resultado);
  } catch (erro) {
    console.warn("Central de Angariação: consulta indisponível:", sanitizarErroExterno(erro, "portal"));
    return resposta({
      ok: false,
      anuncios: [],
      urlPesquisa,
      aviso: "O portal bloqueou ou não respondeu à consulta. A pesquisa pronta ainda pode ser aberta.",
    });
  }
}
