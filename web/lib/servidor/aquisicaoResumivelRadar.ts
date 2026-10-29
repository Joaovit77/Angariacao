import { CONTRATO_RETORNO_LEVE_RADAR } from "../calculo/retornoResumivelRadar";
import type { ReceiptJanelaRadar } from "../calculo/coberturaJanelaRadar";
import { CONTRATO_JANELA_CHAVES_RADAR } from "../calculo/coberturaJanelaRadar";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveNormalizada } from "@/lib/normalizacao";
import { chaveBairroRadar } from "@/lib/calculo/bairroUniversoRadar";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import type { ProgressoRadar } from "@/lib/calculo/progressoResumivelRadar";
import { agoraISOString } from "@/lib/datas";
import { anuncioParaBasePrivada, qualificarOfertaRadar, type ResultadoIngestaoRadar } from "./ingestaoRadar";
import { adapterCoberturaRadar, normalizarPaginaResumivelRadar } from "./adaptersCoberturaRadar";
import { buscarComFallbackHttpChaves, RESERVA_PROCESSAMENTO_CENTRAL_MS } from "./fallbackHttpChaves";
import { TIMEOUT_FIRECRAWL_FETCH_MS, type EventoConsultaFirecrawl } from "./firecrawlCentralAngariacao";
import { criarOrcamentoRadar, exigirTempoFaseRadar, LimiteOperacionalRadar, type OrcamentoRodadaRadar } from "./orcamentoRadar";
import { finalizarColetaCentralAngariacao } from "./finalizacaoCentralAngariacao";
import { urlUniversoRadar } from "./universoRadar";
import type { AquisicaoPortalRadar, MotivoTerminoRadar } from "./coberturaRadar";

interface Reserva {
  disponivel: boolean; varreduraId: string; chave: string; reserva: string;
  url: string; pagina: number; progresso: ProgressoRadar;
}
export interface ResultadoResumivelRadar extends ResultadoIngestaoRadar, Partial<ReceiptJanelaRadar> {
  progresso: ProgressoRadar; contratoRetorno?: typeof CONTRATO_RETORNO_LEVE_RADAR;
}
interface Opcoes {
  incluirAnunciosColetados?: boolean;
  restanteMs: () => number; orcamento?: OrcamentoRodadaRadar;
  observar?: (evento: EventoConsultaFirecrawl) => void;
  registrarLote?: (coletados: AnuncioCentralAngariacao[], finalizacao: Awaited<ReturnType<typeof finalizarColetaCentralAngariacao>>) => void;
}

/** Só o servidor lê o cursor. Cada página é persistida antes de adquirir a próxima. */
export async function executarAquisicaoResumivelRadar(supabase: SupabaseClient,
  busca: { id: string; user_id: string }, filtros: FiltrosCentralAngariacao,
  origem: "manual" | "navegador" | "cron", opcoes: Opcoes) {
  if (adapterCoberturaRadar(filtros.portal) !== "chaves_itemlist_publicado_v1") throw new Error("Adapter aguardando evidência real de paginação.");
  const base = urlUniversoRadar(filtros);
  if (!base) throw new Error("Universo sem rota comprovada.");
  const bairro = chaveBairroRadar(filtros.bairro);
  const contexto = { portal: filtros.portal, finalidade: filtros.finalidade, uf: filtros.estado.toUpperCase(),
    cidade: chaveNormalizada(filtros.cidade), tipo_recorte: filtros.tipoRecorte, versao_semantica: 3, contrato_cobertura: CONTRATO_JANELA_CHAVES_RADAR, ...(bairro ? { bairro } : {}) };
  const inicio = await supabase.rpc("iniciar_varredura_resumivel_radar", {
    p_user_id: busca.user_id, p_busca_id: busca.id, p_contexto: contexto, p_origem: origem,
  });
  if (inicio.error) throw inicio.error;
  const reserva = inicio.data as Reserva;
  const orcamento = opcoes.orcamento ?? criarOrcamentoRadar();
  const incluirAnunciosColetados = opcoes.incluirAnunciosColetados ?? true;
  const contratoRetorno = incluirAnunciosColetados ? {} : { contratoRetorno: CONTRATO_RETORNO_LEVE_RADAR };
  let resultado: ResultadoResumivelRadar = { novos: 0, anuncios: [], cobertura: "parcial", baselineFormada: false,
    varreduraId: reserva.progresso.varreduraId, progresso: reserva.progresso, ...contratoRetorno };
  let url: string | null = reserva.disponivel ? reserva.url : null;
  let lidas = 0, coletados = 0;
  let motivo: MotivoTerminoRadar = "limite_tempo";
  const tempo = { restanteMs: opcoes.restanteMs, reservaFinalizacaoMs: RESERVA_PROCESSAMENTO_CENTRAL_MS };
  const registrar = async (pagina: ReturnType<typeof normalizarPaginaResumivelRadar> | null,
    anuncios: AnuncioCentralAngariacao[] = [], basePrivada: AnuncioCentralAngariacao[] = [], parada: string | null = null) => {
    const r = await supabase.rpc("avancar_varredura_resumivel_radar", { p_user_id: busca.user_id, p_busca_id: busca.id,
      p_varredura_id: reserva.varreduraId, p_reserva: reserva.reserva, p_pagina: pagina,
      p_anuncios: anuncios, p_anuncios_base: basePrivada, p_origem: origem, p_motivo: parada,
      ...(!incluirAnunciosColetados ? { p_incluir_anuncios_coletados: false } : {}) });
    if (r.error) throw r.error;
    resultado = r.data as ResultadoResumivelRadar;
  };
  while (url) {
    let fonte: AquisicaoPortalRadar | undefined;
    let anuncios: AnuncioCentralAngariacao[];
    try {
      exigirTempoFaseRadar(tempo, TIMEOUT_FIRECRAWL_FETCH_MS);
      orcamento.reservarPagina(`${filtros.portal}:${url}`);
      anuncios = await buscarComFallbackHttpChaves(filtros, url, undefined, undefined, opcoes.observar,
        opcoes.restanteMs, { restanteMs: opcoes.restanteMs, reservaPosAquisicaoMs: RESERVA_PROCESSAMENTO_CENTRAL_MS,
          exigirNova: true }, (valor) => { fonte = valor; }, orcamento, tempo);
    } catch (erro) {
      motivo = erro instanceof LimiteOperacionalRadar ? erro.motivo : "falha_pagina";
      await registrar(null, [], [], motivo === "falha_pagina" ? "falha_aquisicao" : motivo);
      break;
    }
    lidas++; coletados += anuncios.length;
    const pagina = normalizarPaginaResumivelRadar({ ...(fonte ?? { id: "", em: agoraISOString(), origem: "firecrawl",
      html: "", confiavel: false }), url }, base, filtros, CONTRATO_JANELA_CHAVES_RADAR);
    // Os fatos do parser não recebem tipo/localidade dos filtros para fechar lacunas.
    const finalizacao = await finalizarColetaCentralAngariacao(supabase, busca.user_id, anuncios, filtros);
    const admitidos = finalizacao.anuncios.flatMap((a) => {
      const q = qualificarOfertaRadar(a, filtros);
      return q && pagina.ids_qualificados.includes(q.idExterno) ? [q] : [];
    });
    const privados = anuncios.flatMap((a) => {
      if (!qualificarOfertaRadar(a, filtros)) return [];
      const p = anuncioParaBasePrivada(a, filtros); return p ? [p] : [];
    });
    // Falha de persistência não é tratada como falha de aquisição: o cursor só muda no COMMIT SQL.
    await registrar(pagina, admitidos, privados);
    // Telemetria não interfere no commit da página nem no cursor confirmado.
    try { opcoes.registrarLote?.(anuncios, finalizacao); } catch { /* Registro acessório. */ }
    if (resultado.progresso.estado !== "in_progress") {
      motivo = resultado.progresso.estado === "complete" ? "fim_comprovado" : "evidencia_inconsistente";
      break;
    }
    url = pagina.proxima_url;
  }
  return { ...resultado, coleta: { coverage_scope: "traversable_window" as const,
    traversable_window_complete: resultado.progresso.traversable_window_complete === true,
    portal_universe_complete: null, terminality_scope: "fim_janela_navegavel_publicada" as const, paginasLidas: lidas, resultadosColetados: coletados,
    totalDeclarado: resultado.progresso.totalDeclarado, motivoTermino: motivo }, orcamento: orcamento.resumo() };
}
