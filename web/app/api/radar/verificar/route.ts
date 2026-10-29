import { CONTRATO_RETORNO_LEVE_RADAR } from "@/lib/calculo/retornoResumivelRadar";
import { agoraISOString } from "@/lib/datas";
import { autenticarRequisicao } from "@/lib/servidor/autenticacao";
import { clienteServicoRadar, filtrosGlobaisRadar, persistirColetaRadar } from "@/lib/servidor/ingestaoRadar";
import { buscarColetaPaginadaRadar } from "@/lib/servidor/paginacaoRadar";
import { RESERVA_PROCESSAMENTO_CENTRAL_MS } from "@/lib/servidor/fallbackHttpChaves";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { criarObservadorRadar, novoIdExecucao } from "@/lib/servidor/observabilidadeRadar";
import { filtrosRadarSaoLegados } from "@/lib/calculo/aquisicaoRadar";
import { urlUniversoRadar } from "@/lib/servidor/universoRadar";

export const runtime = "nodejs";
export const maxDuration = 120;
const responder = (corpo: object, status = 200) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const sessao = await autenticarRequisicao(request, "radar/verificar");
  if (!sessao.ok) return responder({ ok: false, erro: sessao.erro,
    aviso: sessao.status === 401 ? "Sua sessão expirou. Entre novamente." : "Não foi possível confirmar sua sessão agora." }, sessao.status);
  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo.buscaId !== "string" || !/^[0-9a-f-]{36}$/i.test(corpo.buscaId)
    || !["manual", "navegador"].includes(corpo.origem)) return responder({ ok: false, aviso: "Informe uma busca salva e a origem da verificação." }, 400);
  const retornoLeve = corpo.contratoRetorno === CONTRATO_RETORNO_LEVE_RADAR;
  if (corpo.contratoRetorno !== undefined && !retornoLeve) return responder({ ok: false, aviso: "Contrato de retorno não suportado." }, 400);
  // Filtros, identidade do dono e evidência nunca são aceitos do browser.
  const { data: busca, error } = await sessao.supabase.from("radar_buscas").select("id,user_id,filtros,ativo")
    .eq("id", corpo.buscaId).eq("user_id", sessao.userId).maybeSingle();
  if (error) return responder({ ok: false, aviso: "Não foi possível carregar sua busca agora." }, 503);
  if (!busca?.ativo) return responder({ ok: false, aviso: "Busca indisponível para esta conta." }, 404);
  if (filtrosRadarSaoLegados(busca.filtros)) return responder({ ok: false,
    aviso: "Esta busca antiga precisa ser salva com finalidade e tipo para comparar novidades. A base permanece não revisada." }, 422);
  if (!process.env.FIRECRAWL_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return responder({ ok: false,
    aviso: "Monitor do Radar indisponível neste ambiente. A base permanece não revisada." }, 503);
  let filtros;
  try { filtros = filtrosGlobaisRadar(busca.filtros); }
  catch { return responder({ ok: false, aviso: "Este recorte ainda não está disponível para o Radar." }, 422); }
  if (retornoLeve && (filtros.portal !== "chaves-na-mao" || !urlUniversoRadar(filtros))) return responder({ ok: false, aviso: "Contrato de retorno indisponível para esta aquisição." }, 400);
  const inicio = performance.now();
  const observador = criarObservadorRadar({ execucaoId: novoIdExecucao(),
    iniciador: corpo.origem === "navegador" ? "monitor_navegador" : "verificar_agora", portal: filtros.portal, buscaId: busca.id });
  try {
    const supabase = clienteServicoRadar();
    const restanteMs = () => maxDuration * 1000 - (performance.now() - inicio);
    if (retornoLeve) {
      const { executarAquisicaoResumivelRadar } = await import("@/lib/servidor/aquisicaoResumivelRadar");
      const resultado = await executarAquisicaoResumivelRadar(supabase, { id: busca.id, user_id: sessao.userId }, filtros,
        corpo.origem, { restanteMs, observar: observador.observar, incluirAnunciosColetados: false });
      observador.concluir(sessao.userId, "central-busca-ok", { novos: resultado.novos,
        paginacao: resultado.coleta, duracaoMs: performance.now() - inicio });
      return responder({ ok: true, ...resultado });
    }
    const coleta = await buscarColetaPaginadaRadar(filtros, { restanteMs, observar: observador.observar,
      politicaRetry: { restanteMs, reservaPosAquisicaoMs: RESERVA_PROCESSAMENTO_CENTRAL_MS } });
    const { anuncios: coletados, aquisicao } = coleta;
    const finalizacao = await finalizarColetaCentralAngariacao(supabase, sessao.userId, coletados, filtros);
    const resultado = await persistirColetaRadar(supabase, { id: busca.id, user_id: sessao.userId }, filtros,
      finalizacao.anuncios, aquisicao, corpo.origem);
    observador.concluir(sessao.userId, "central-busca-ok", { coletados: coletados.length,
      aposFiltro: finalizacao.anuncios.length, novos: resultado.novos, paginacao: coleta.resumo, duracaoMs: performance.now() - inicio });
    return responder({ ok: true, ...resultado, coleta: coleta.resumo, orcamento: coleta.orcamento });
  } catch {
    // Houve tentativa de coleta: conserva a janela de tentativas sem publicar novidade.
    await sessao.supabase.from("radar_buscas").update({ ultimo_check: agoraISOString(), ultimo_check_origem: corpo.origem })
      .eq("id", busca.id).eq("user_id", sessao.userId);
    observador.concluir(sessao.userId, "central-busca-falhou", { duracaoMs: performance.now() - inicio });
    return responder({ ok: false, aviso: "A verificação não pôde ser finalizada. Nenhuma novidade foi confirmada nesta resposta." }, 503);
  }
}
