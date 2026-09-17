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
import {
  buscarComFirecrawl,
  type CodigoErroFirecrawl,
  type OrigemConsultaFirecrawl,
} from "@/lib/servidor/firecrawlCentralAngariacao";
import { registrarEvento } from "@/lib/servidor/registro";

const LIMITE_BUSCAS_POR_RODADA = 8;
const CONCORRENCIA = 2;

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

async function verificarBusca(
  supabase: SupabaseClient,
  busca: DbBuscaRadar,
): Promise<ResultadoBuscaMonitorada> {
  const agora = agoraISOString();
  const inicio = performance.now();
  const portal = busca.filtros.portal;
  let etapa: EtapaBuscaRadar = "montagem-url";
  let origemHtml: OrigemConsultaFirecrawl | undefined;
  try {
    const urlPesquisa = urlDaPesquisa(busca.filtros);
    etapa = "coleta";
    const coletados = await buscarComFirecrawl(
      busca.filtros,
      urlPesquisa,
      (origem) => { origemHtml = origem; },
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
    if (coletados.length === 0) {
      registrarRadar(busca.user_id, "aviso", "radar-busca-vazia", {
        ...detalheComum,
        status_portal: "sem_cards",
      });
    } else {
      registrarRadar(busca.user_id, "info", "radar-busca-ok", detalheComum);
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
