import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import {
  PORTAIS_ANGARIACAO,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import {
  buscaElegivelParaCron,
  selecionarAnunciosNovosRadar,
  type BuscaRadar,
  type OrigemVerificacaoRadar,
} from "@/lib/calculo/radarAngariacao";
import { agoraISOString } from "@/lib/datas";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { classificarRelevanciaRadarOlx } from "@/lib/calculo/relevanciaRadarOlx";
import {
  avaliarPossivelImovelCarteira,
  buscaNoEscopoRepeticaoChaves,
  idsJaConhecidosNoMercado,
  paresPossivelMesmoImovel,
  type HistoricoMercadoAnuncio,
} from "@/lib/calculo/sinaisRepeticaoRadar";
import { urlsDosImoveis } from "@/lib/calculo/repeticaoCentralAngariacao";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import {
  buscarComFirecrawl,
  type CodigoErroFirecrawl,
  type DiagnosticoPaginaOlx,
  type OrigemConsultaFirecrawl,
} from "@/lib/servidor/firecrawlCentralAngariacao";
import { registrarEvento } from "@/lib/servidor/registro";

const LIMITE_BUSCAS_POR_RODADA = 8;
const CONCORRENCIA = 2;
/** Teto da amostra de IDs no shadow de quarto, para não inflar o log. */
export const LIMITE_IDS_PARECE_QUARTO = 10;
/** Teto de cada amostra do shadow de repetição do Chaves (R4.1a). */
export const LIMITE_AMOSTRA_REPETICAO = 10;
/** Histórico da busca comparado com os novos; a busca real tem dezenas. */
const LIMITE_HISTORICO_REPETICAO = 300;

interface DbBuscaRadar {
  id: string;
  user_id: string;
  nome: string;
  filtros: FiltrosCentralAngariacao;
  ativo: boolean;
  ultimo_check: string | null;
  ultimo_check_automatico: string | null;
  ultimo_check_origem: OrigemVerificacaoRadar | null;
  created_at: string;
}

interface ResultadoBuscaMonitorada {
  buscaId: string;
  nome: string;
  portal: string;
  novos: number;
  ok: boolean;
  erro?: string;
  codigo?: CodigoFalhaRadar;
  origem_html?: OrigemConsultaFirecrawl;
}

export interface ResumoMonitorRadar {
  candidatas: number;
  elegiveis: number;
  verificadas: number;
  novos: number;
  falhas: number;
  resultados: ResultadoBuscaMonitorada[];
}

type MotivoBuscaPulada =
  | "nao-vencida"
  | "filtros-invalidos"
  | "limite-rodada"
  | "portal-sem-cobertura";

type EtapaBuscaRadar = "montagem-url" | "coleta" | "normalizacao" | "persistencia";
type CodigoFalhaRadar = CodigoErroFirecrawl | "falha_interna";

const CODIGOS_FIRECRAWL = new Set<CodigoErroFirecrawl>([
  "firecrawl_timeout",
  "firecrawl_429",
  "firecrawl_indisponivel",
  "parser_falhou",
]);

function clienteServico(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Supabase do servidor não configurado.");
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function motivoParaPularBusca(row: DbBuscaRadar): MotivoBuscaPulada | null {
  if (!PORTAIS_ANGARIACAO.includes(row.filtros?.portal)) return "portal-sem-cobertura";
  if (!row.filtros?.cidade?.trim()) return "filtros-invalidos";
  if (!buscaElegivelParaCron({
    id: row.id,
    nome: row.nome,
    filtros: row.filtros,
    ativo: row.ativo,
    ultimoCheck: row.ultimo_check,
    ultimoCheckAutomatico: row.ultimo_check_automatico,
    ultimoCheckOrigem: row.ultimo_check_origem,
    criadoEm: row.created_at,
  } satisfies BuscaRadar)) return "nao-vencida";
  return null;
}

function registrarRadar(
  userId: string | null,
  nivel: "erro" | "aviso" | "info",
  evento: "radar-busca-pulada" | "radar-busca-falhou" | "radar-busca-vazia" | "radar-busca-ok",
  detalhe: Record<string, unknown>,
): void {
  try {
    registrarEvento({
      userId,
      categoria: "radar",
      nivel,
      evento,
      detalhe: JSON.stringify(detalhe),
    });
  } catch (erro) {
    console.error(
      "[radar-cron] falha ao agendar registro de observabilidade (ignorada)",
      sanitizarErroExterno(erro, "registrar"),
    );
  }
}

function codigoDaFalha(erro: unknown): CodigoFalhaRadar {
  if (erro && typeof erro === "object" && "codigo" in erro) {
    const codigo = (erro as { codigo?: unknown }).codigo;
    if (typeof codigo === "string" && CODIGOS_FIRECRAWL.has(codigo as CodigoErroFirecrawl)) {
      return codigo as CodigoErroFirecrawl;
    }
  }
  return "falha_interna";
}

function linhaAnuncio(row: DbBuscaRadar, anuncio: AnuncioCentralAngariacao) {
  return {
    user_id: row.user_id,
    busca_id: row.id,
    portal: anuncio.portal,
    id_externo: anuncio.idExterno,
    url: anuncio.url,
    dados: anuncio,
    visto: false,
  };
}

/**
 * R3.1: ordem e tamanho da página da OLX. `descartados_cidade` é a diferença
 * entre os candidatos do período e os aprovados pelo filtro de cidade/UF.
 * Semântica dos demais campos em `DiagnosticoPaginaOlx`.
 */
function detalhePaginaOlx(diagnostico: DiagnosticoPaginaOlx, aposFiltro: number) {
  return {
    cards_pagina: diagnostico.cardsPagina,
    no_periodo_antes_cidade: diagnostico.noPeriodoAntesCidade,
    descartados_cidade: diagnostico.noPeriodoAntesCidade - aposFiltro,
    ...(diagnostico.indiceUltimoNoPeriodo !== undefined
      ? { indice_ultimo_no_periodo: diagnostico.indiceUltimoNoPeriodo }
      : {}),
    ...(diagnostico.cardsAntigosAntesDeRecente !== undefined
      ? { cards_antigos_antes_de_recente: diagnostico.cardsAntigosAntesDeRecente }
      : {}),
  };
}

/**
 * R3.2a (shadow): classifica os anúncios que o Radar já vai considerar, sem
 * esconder nenhum. `sinal_quarto_preservado` conta os que tinham sinal de
 * quarto mas foram mantidos por um sinal de imóvel inteiro.
 */
function detalheShadowQuartoOlx(anuncios: AnuncioCentralAngariacao[]) {
  const pareceQuarto: string[] = [];
  let preservados = 0;
  for (const anuncio of anuncios) {
    const { classe, motivo } = classificarRelevanciaRadarOlx(anuncio.titulo);
    if (classe === "parece_quarto") pareceQuarto.push(anuncio.idExterno);
    else if (motivo === "imovel-inteiro-preservado") preservados += 1;
  }
  return {
    parece_quarto: pareceQuarto.length,
    parece_quarto_ids: pareceQuarto.slice(0, LIMITE_IDS_PARECE_QUARTO),
    sinal_quarto_preservado: preservados,
  };
}

/**
 * R4.1a (shadow): sinais de repetição do Chaves na Mão + Casa para os anúncios
 * novos desta rodada. Só lê: `comparaveis_mercado` pelo `id_externo` exato,
 * o histórico da própria busca e a carteira do dono da busca. Registra apenas
 * IDs, códigos de imóvel e enums; nunca endereço, título ou URL. Qualquer falha
 * omite o bloco inteiro e a rodada segue como antes.
 */
async function detalheShadowRepeticaoChaves(
  supabase: SupabaseClient,
  busca: DbBuscaRadar,
  novos: AnuncioCentralAngariacao[],
  inicioColeta: string,
): Promise<Record<string, unknown>> {
  try {
    if (!novos.length) {
      return {
        repeticao_chaves: {
          ja_conhecido_no_mercado: 0,
          possivel_mesmo_imovel: 0,
          possivel_imovel_carteira: 0,
        },
      };
    }
    const [mercado, historico, carteira] = await Promise.all([
      supabase
        .from("comparaveis_mercado")
        .select("id_externo,primeiro_visto_em")
        .eq("user_id", busca.user_id)
        .eq("portal", "chaves-na-mao")
        .in("id_externo", novos.map((anuncio) => anuncio.idExterno)),
      supabase
        .from("radar_anuncios")
        .select("id_externo,dados")
        .eq("busca_id", busca.id)
        .eq("user_id", busca.user_id)
        .order("encontrado_em", { ascending: false })
        .limit(LIMITE_HISTORICO_REPETICAO),
      supabase.from("imoveis").select("*").eq("user_id", busca.user_id),
    ]);
    if (mercado.error || historico.error || carteira.error) return {};

    const conhecidos = idsJaConhecidosNoMercado(
      novos,
      (mercado.data || []) as HistoricoMercadoAnuncio[],
      inicioColeta,
    );
    const anterioresDaBusca = ((historico.data || []) as Array<{ dados: AnuncioCentralAngariacao | null }>)
      .flatMap((linha) => (linha.dados?.idExterno ? [linha.dados] : []));
    const pares = paresPossivelMesmoImovel(novos, anterioresDaBusca);
    const idsNosPares = new Set(pares.flat());
    const imoveis = ((carteira.data || []) as DbImovelRow[]).map(fromDbImovel);
    const urlsNaCarteira = urlsDosImoveis(imoveis);
    const naCarteira = novos.flatMap((anuncio) => {
      const avaliacao = avaliarPossivelImovelCarteira(anuncio, imoveis, urlsNaCarteira);
      return avaliacao.classe === "possivel_imovel_carteira"
        ? [{
          id: anuncio.idExterno,
          origem: avaliacao.origem,
          codigos: avaliacao.candidatos.slice(0, 3).map((candidato) => candidato.codigo),
          evidencias: avaliacao.candidatos[0].evidencias,
        }]
        : [];
    });
    return {
      repeticao_chaves: {
        ja_conhecido_no_mercado: conhecidos.length,
        ja_conhecido_ids: conhecidos.slice(0, LIMITE_AMOSTRA_REPETICAO),
        possivel_mesmo_imovel: novos.filter((anuncio) => idsNosPares.has(anuncio.idExterno)).length,
        possivel_mesmo_imovel_pares: pares.slice(0, LIMITE_AMOSTRA_REPETICAO),
        possivel_imovel_carteira: naCarteira.length,
        possivel_imovel_carteira_itens: naCarteira.slice(0, LIMITE_AMOSTRA_REPETICAO),
      },
    };
  } catch {
    return {};
  }
}

/** Instrumentação é acessória: um erro nela nunca transforma sucesso em falha. */
function detalheOpcional(montar: () => Record<string, unknown>): Record<string, unknown> {
  try {
    return montar();
  } catch {
    return {};
  }
}

async function verificarBusca(
  supabase: SupabaseClient,
  busca: DbBuscaRadar,
): Promise<ResultadoBuscaMonitorada> {
  const agora = agoraISOString();
  const inicio = performance.now();
  const portal = busca.filtros.portal;
  let etapa: EtapaBuscaRadar = "montagem-url";
  let origemHtml: OrigemConsultaFirecrawl | undefined;
  let diagnosticoOlx: DiagnosticoPaginaOlx | undefined;
  try {
    const urlPesquisa = urlDaPesquisa(busca.filtros);
    etapa = "coleta";
    const coletados = await buscarComFirecrawl(
      busca.filtros,
      urlPesquisa,
      (origem) => { origemHtml = origem; },
      (diagnostico) => { diagnosticoOlx = diagnostico; },
    );
    etapa = "normalizacao";
    const finalizacao = await finalizarColetaCentralAngariacao(
      supabase,
      busca.user_id,
      coletados,
      busca.filtros,
    );
    if (finalizacao.erroComparaveis) {
      console.error("[radar-cron] falha ao atualizar a base de comparáveis", {
        buscaId: busca.id,
        portal: busca.filtros.portal,
        erro: sanitizarErroExterno(finalizacao.erroComparaveis, "persistirComparaveis"),
      });
    } else {
      console.info("[radar-cron] comparáveis atualizados", {
        buscaId: busca.id,
        portal: busca.filtros.portal,
        salvos: finalizacao.comparaveisSalvos,
      });
    }
    const anuncios = finalizacao.anuncios;
    etapa = "persistencia";
    const { data: existentes, error: erroExistentes } = await supabase
      .from("radar_anuncios")
      .select("portal,id_externo")
      .eq("busca_id", busca.id);
    if (erroExistentes) throw erroExistentes;

    const novos = selecionarAnunciosNovosRadar(anuncios, existentes || []);
    let quantidadeInserida = 0;
    if (novos.length) {
      const { data, error } = await supabase
        .from("radar_anuncios")
        .upsert(novos.map((anuncio) => linhaAnuncio(busca, anuncio)), {
          onConflict: "busca_id,portal,id_externo",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      quantidadeInserida = data?.length ?? 0;
    }

    const atualizado = await supabase.from("radar_buscas").update({
      ultimo_check: agora,
      ultimo_check_automatico: agora,
      ultimo_check_origem: "cron",
    }).eq("id", busca.id);
    if (atualizado.error) throw atualizado.error;
    const origem = origemHtml ?? "firecrawl";
    const detalheComum = {
      busca_id: busca.id,
      portal,
      coletados: coletados.length,
      apos_filtro: anuncios.length,
      novos: quantidadeInserida,
      origem_html: origem,
      duracao_ms: Math.round(performance.now() - inicio),
    };
    const repeticaoChaves = coletados.length && buscaNoEscopoRepeticaoChaves(busca.filtros)
      ? await detalheShadowRepeticaoChaves(supabase, busca, novos, agora)
      : {};
    if (coletados.length === 0) {
      registrarRadar(busca.user_id, "aviso", "radar-busca-vazia", {
        ...detalheComum,
        status_portal: "sem_cards",
      });
    } else {
      registrarRadar(busca.user_id, "info", "radar-busca-ok", {
        ...detalheComum,
        ...detalheOpcional(() => (portal === "olx" && diagnosticoOlx
          ? detalhePaginaOlx(diagnosticoOlx, anuncios.length)
          : {})),
        ...detalheOpcional(() => (portal === "olx" ? detalheShadowQuartoOlx(anuncios) : {})),
        ...repeticaoChaves,
      });
    }
    return {
      buscaId: busca.id,
      nome: busca.nome,
      portal,
      novos: quantidadeInserida,
      ok: true,
      origem_html: origem,
    };
  } catch (erro) {
    // Evita uma busca quebrada consumir créditos em repetidas tentativas. A
    // próxima janela agendada tenta de novo e as outras buscas seguem vivas.
    await supabase.from("radar_buscas").update({
      ultimo_check: agora,
      ultimo_check_automatico: agora,
      ultimo_check_origem: "cron",
    }).eq("id", busca.id);
    const codigo = codigoDaFalha(erro);
    registrarRadar(busca.user_id, "erro", "radar-busca-falhou", {
      busca_id: busca.id,
      portal,
      codigo,
      etapa,
      duracao_ms: Math.round(performance.now() - inicio),
      ...(origemHtml ? { origem_html: origemHtml } : {}),
    });
    return {
      buscaId: busca.id,
      nome: busca.nome,
      portal,
      novos: 0,
      ok: false,
      erro: erro instanceof Error ? erro.message : "Falha desconhecida",
      codigo,
      ...(origemHtml ? { origem_html: origemHtml } : {}),
    };
  }
}

async function emLotes<T, R>(itens: T[], tamanho: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = [];
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    resultados.push(...await Promise.all(itens.slice(inicio, inicio + tamanho).map(tarefa)));
  }
  return resultados;
}

/**
 * Executa somente buscas ainda não processadas automaticamente no dia civil
 * de São Paulo, no máximo oito por rodada e duas por vez.
 * O limite impede uma conta com muitas buscas antigas de produzir uma rajada
 * cara no Firecrawl; as restantes entram naturalmente na rodada seguinte.
 */
export async function executarMonitorRadar(): Promise<ResumoMonitorRadar> {
  if (!process.env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY não configurada.");
  const supabase = clienteServico();
  const { data, error } = await supabase
    .from("radar_buscas")
    .select("id,user_id,nome,filtros,ativo,ultimo_check,ultimo_check_automatico,ultimo_check_origem,created_at")
    .eq("ativo", true)
    .order("ultimo_check_automatico", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) throw error;

  const candidatas = (data || []) as DbBuscaRadar[];
  const elegiveis: DbBuscaRadar[] = [];
  for (const busca of candidatas) {
    const motivo = motivoParaPularBusca(busca);
    if (motivo) {
      registrarRadar(busca.user_id, "info", "radar-busca-pulada", {
        busca_id: busca.id,
        motivo,
      });
    } else {
      elegiveis.push(busca);
    }
  }

  const buscas = elegiveis.slice(0, LIMITE_BUSCAS_POR_RODADA);
  for (const busca of elegiveis.slice(LIMITE_BUSCAS_POR_RODADA)) {
    registrarRadar(busca.user_id, "info", "radar-busca-pulada", {
      busca_id: busca.id,
      motivo: "limite-rodada",
    });
  }
  const resultados = await emLotes(buscas, CONCORRENCIA, (busca) => verificarBusca(supabase, busca));
  return {
    candidatas: candidatas.length,
    elegiveis: elegiveis.length,
    verificadas: resultados.length,
    novos: resultados.reduce((total, item) => total + item.novos, 0),
    falhas: resultados.filter((item) => !item.ok).length,
    resultados,
  };
}
