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
import { buscarComFallbackHttpChaves, HttpChavesIndisponivel } from "@/lib/servidor/fallbackHttpChaves";
import { buscarComNavegador, NavegadorIndisponivel } from "@/lib/servidor/scraperCentralAngariacao";
import { criarObservadorRadar, novoIdExecucao, type IniciadorColeta } from "@/lib/servidor/observabilidadeRadar";

export const runtime = "nodejs";
export const maxDuration = 120;

function resposta(corpo: ResultadoBuscaCentral, status = 200, execucaoId?: string) {
  return Response.json({ ...corpo, execucaoId }, { status, headers: { "Cache-Control": "no-store" } });
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
  observador: ReturnType<typeof criarObservadorRadar>,
  inicio: number,
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
  observador.concluir(userId, "central-busca-ok", {
    coletados: coletados.length,
    aposFiltro: finalizacao.anuncios.length,
    comparaveisSalvos: finalizacao.comparaveisSalvos,
    duracaoMs: performance.now() - inicio,
  });
  return resultado;
}

async function finalizarComProtecao(
  supabase: SupabaseClient,
  userId: string,
  coletados: ResultadoBuscaCentral["anuncios"],
  seguros: FiltrosCentralAngariacao,
  urlPesquisa: string,
  observador: ReturnType<typeof criarObservadorRadar>,
  inicio: number,
): Promise<ResultadoBuscaCentral> {
  try {
    return await finalizarRespostaColeta(supabase, userId, coletados, seguros, urlPesquisa, observador, inicio);
  } catch {
    console.error("[central-angariacao] falha ao finalizar coleta", { codigo: "falha_interna" });
    observador.observar({ fase: "falha", codigo: "falha_interna" });
    observador.concluir(userId, "central-busca-falhou", { duracaoMs: performance.now() - inicio });
    return {
      ok: false,
      anuncios: [],
      urlPesquisa,
      aviso: "A consulta foi recebida, mas não pôde ser finalizada agora.",
    };
  }
}
interface SessaoAutenticada {
  supabase: SupabaseClient;
  userId: string;
}

function iniciadorDaRequisicao(request: Request): IniciadorColeta {
  const informado = request.headers.get("x-angario-iniciador");
  return informado === "monitor_navegador" || informado === "verificar_agora" || informado === "pesquisar"
    ? informado : "desconhecido";
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
  const execucaoId = novoIdExecucao();
  const inicio = performance.now();
  const sessao = await autenticado(request);
  if (!sessao) {
    return resposta({ ok: false, anuncios: [], urlPesquisa: "", aviso: "Sessão inválida." }, 401, execucaoId);
  }

  const filtros = (await request.json().catch(() => null)) as FiltrosCentralAngariacao | null;
  if (!filtros || !PORTAIS_ANGARIACAO.includes(filtros.portal)
    || !filtros.cidade?.trim() || !ufValida(filtros.estado)) {
    return resposta({ ok: false, anuncios: [], urlPesquisa: "", aviso: "Informe portal, cidade e uma UF válida." }, 400, execucaoId);
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
  const observador = criarObservadorRadar({
    execucaoId, iniciador: iniciadorDaRequisicao(request), portal: seguros.portal,
  });
  const restanteMs = () => maxDuration * 1000 - (performance.now() - inicio);
  let urlPesquisa: string;
  try {
    urlPesquisa = urlDaPesquisa(seguros);
  } catch (erro) {
    if (erro instanceof PortalSemCoberturaGeografica) {
      return resposta({ ok: false, anuncios: [], urlPesquisa: "", aviso: erro.message }, 422, execucaoId);
    }
    throw erro;
  }

  let firecrawlFalhou = false;
  let coletadosFirecrawl: ResultadoBuscaCentral["anuncios"] | null = null;
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      coletadosFirecrawl = await buscarComFallbackHttpChaves(
        seguros, urlPesquisa, undefined, undefined, observador.observar, restanteMs,
      );
    } catch (erro) {
      firecrawlFalhou = true;
      const orcamentoInsuficiente = erro instanceof HttpChavesIndisponivel
        && erro.codigo === "http_orcamento_insuficiente";
      if (orcamentoInsuficiente) {
        observador.observar({ fase: "falha", codigo: erro.codigo });
      } else {
        console.warn("Central de Angariação: Firecrawl não concluiu a consulta:",
          sanitizarErroExterno(erro, "firecrawl"));
      }
      if (process.env.VERCEL || orcamentoInsuficiente) {
        observador.concluir(sessao.userId, "central-busca-falhou", { duracaoMs: performance.now() - inicio });
        return resposta({
          ok: false,
          anuncios: [],
          urlPesquisa,
          aviso: "O serviço de consulta não respondeu agora. A pesquisa pronta ainda pode ser aberta.",
        }, 200, execucaoId);
      }
      observador.observar({ fase: "fallback", aquisicao: "playwright" });
    }
  }
  if (coletadosFirecrawl !== null) {
    return resposta(await finalizarComProtecao(
      sessao.supabase, sessao.userId, coletadosFirecrawl, seguros, urlPesquisa, observador, inicio,
    ), 200, execucaoId);
  }

  let coletadosNavegador: ResultadoBuscaCentral["anuncios"] | null = null;
  try {
    observador.observar({ fase: "caminho_escolhido", aquisicao: "playwright" });
    coletadosNavegador = await buscarComNavegador(seguros, urlPesquisa, (fase, statusHttp) => {
      observador.observar({ fase, aquisicao: "playwright", ...(statusHttp != null ? { statusHttp } : {}) });
    });
    observador.observar({ fase: "resultado_interpretado", aquisicao: "playwright" });
  } catch (erro) {
    observador.observar({ fase: "falha", aquisicao: "playwright", codigo: "navegador_falhou" });
    // Sem Chrome no host, conserva o link de pesquisa pronto.
    if (!(erro instanceof NavegadorIndisponivel)) {
      console.warn("Central de Angariação: navegador não concluiu a consulta:", sanitizarErroExterno(erro, "navegador"));
    }
  }
  if (coletadosNavegador !== null) {
    if (firecrawlFalhou && coletadosNavegador.length === 0) {
      observador.observar({ fase: "falha", aquisicao: "playwright", codigo: "fallback_vazio" });
      observador.concluir(sessao.userId, "central-busca-falhou", { duracaoMs: performance.now() - inicio });
      return resposta({
        ok: false, anuncios: [], urlPesquisa,
        aviso: "A consulta alternativa não confirmou resultados. A pesquisa pronta ainda pode ser aberta.",
      }, 200, execucaoId);
    }
    return resposta(await finalizarComProtecao(
      sessao.supabase, sessao.userId, coletadosNavegador, seguros, urlPesquisa, observador, inicio,
    ), 200, execucaoId);
  }
  // O fallback HTTP do Chaves já foi tentado na aquisição; os outros portais falham fechados.
  if (firecrawlFalhou) {
    observador.concluir(sessao.userId, "central-busca-falhou", { duracaoMs: performance.now() - inicio });
    return resposta({
      ok: false, anuncios: [], urlPesquisa,
      aviso: "A consulta não pôde ser recuperada agora. A pesquisa pronta ainda pode ser aberta.",
    }, 200, execucaoId);
  }
  try {
    observador.observar({ fase: "fallback", aquisicao: "http_direto" });
    observador.observar({ fase: "caminho_escolhido", aquisicao: "http_direto" });
    observador.observar({ fase: "fetch_iniciado", aquisicao: "http_direto" });
    const r = await fetch(urlPesquisa, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CentralAngariacao/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    observador.observar({ fase: "resposta_recebida", aquisicao: "http_direto", statusHttp: r.status });
    if (!r.ok) throw new Error(`portal respondeu ${r.status}`);
    const html = await r.text();
    const anuncios = extrairJsonLd(html, seguros.portal, urlPesquisa).filter((a) => {
      if (!anuncioPertenceAoMercado(a, seguros.cidade, seguros.estado)) return false;
      if (seguros.diasPublicacao && !dentroDoPeriodo(a.publicadoEm, seguros.diasPublicacao)) return false;
      if (!seguros.somenteProprietario) return true;
      return a.anunciante !== "imobiliaria";
    });
    observador.observar({ fase: "resultado_interpretado", aquisicao: "http_direto" });
    const resultado = await finalizarRespostaColeta(
      sessao.supabase,
      sessao.userId,
      anuncios,
      seguros,
      urlPesquisa,
      observador,
      inicio,
    );
    if (!anuncios.length) {
      resultado.aviso = "O portal não disponibilizou resultados para leitura. Abra a pesquisa pronta para continuar.";
    }
    return resposta(resultado, 200, execucaoId);
  } catch (erro) {
    observador.observar({ fase: "falha", aquisicao: "http_direto", codigo: "portal_falhou" });
    observador.concluir(sessao.userId, "central-busca-falhou", { duracaoMs: performance.now() - inicio });
    console.warn("Central de Angariação: consulta indisponível:", sanitizarErroExterno(erro, "portal"));
    return resposta({
      ok: false,
      anuncios: [],
      urlPesquisa,
      aviso: "O portal bloqueou ou não respondeu à consulta. A pesquisa pronta ainda pode ser aberta.",
    }, 200, execucaoId);
  }
}
