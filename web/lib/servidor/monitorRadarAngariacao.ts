import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import {
  PORTAIS_ANGARIACAO,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import {
  buscaRadarEstaVencida,
  selecionarAnunciosNovosRadar,
  type BuscaRadar,
} from "@/lib/calculo/radarAngariacao";
import { agoraISOString } from "@/lib/datas";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { buscarComFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";

const LIMITE_BUSCAS_POR_RODADA = 8;
const CONCORRENCIA = 2;

interface DbBuscaRadar {
  id: string;
  user_id: string;
  nome: string;
  filtros: FiltrosCentralAngariacao;
  ativo: boolean;
  ultimo_check: string | null;
  created_at: string;
}

interface ResultadoBuscaMonitorada {
  buscaId: string;
  nome: string;
  novos: number;
  ok: boolean;
  erro?: string;
}

export interface ResumoMonitorRadar {
  verificadas: number;
  novos: number;
  falhas: number;
  resultados: ResultadoBuscaMonitorada[];
}

function clienteServico(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Supabase do servidor não configurado.");
  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function buscaValida(row: DbBuscaRadar): boolean {
  return !!row.filtros?.cidade?.trim()
    && PORTAIS_ANGARIACAO.includes(row.filtros.portal)
    && buscaRadarEstaVencida({
      id: row.id,
      nome: row.nome,
      filtros: row.filtros,
      ativo: row.ativo,
      ultimoCheck: row.ultimo_check,
      criadoEm: row.created_at,
    } satisfies BuscaRadar);
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
  try {
    const urlPesquisa = urlDaPesquisa(busca.filtros);
    const coletados = await buscarComFirecrawl(busca.filtros, urlPesquisa);
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

    const atualizado = await supabase.from("radar_buscas").update({ ultimo_check: agora }).eq("id", busca.id);
    if (atualizado.error) throw atualizado.error;
    return { buscaId: busca.id, nome: busca.nome, novos: quantidadeInserida, ok: true };
  } catch (erro) {
    // Evita uma busca quebrada consumir créditos em repetidas tentativas. A
    // próxima janela agendada tenta de novo e as outras buscas seguem vivas.
    await supabase.from("radar_buscas").update({ ultimo_check: agora }).eq("id", busca.id);
    return {
      buscaId: busca.id,
      nome: busca.nome,
      novos: 0,
      ok: false,
      erro: erro instanceof Error ? erro.message : "Falha desconhecida",
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
 * Executa somente buscas vencidas, no máximo oito por dia e duas por vez.
 * O limite impede uma conta com muitas buscas antigas de produzir uma rajada
 * cara no Firecrawl; as restantes entram naturalmente na rodada seguinte.
 */
export async function executarMonitorRadar(): Promise<ResumoMonitorRadar> {
  if (!process.env.FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY não configurada.");
  const supabase = clienteServico();
  const { data, error } = await supabase
    .from("radar_buscas")
    .select("id,user_id,nome,filtros,ativo,ultimo_check,created_at")
    .eq("ativo", true)
    .order("ultimo_check", { ascending: true, nullsFirst: true })
    .limit(40);
  if (error) throw error;

  const buscas = ((data || []) as DbBuscaRadar[]).filter(buscaValida).slice(0, LIMITE_BUSCAS_POR_RODADA);
  const resultados = await emLotes(buscas, CONCORRENCIA, (busca) => verificarBusca(supabase, busca));
  return {
    verificadas: resultados.length,
    novos: resultados.reduce((total, item) => total + item.novos, 0),
    falhas: resultados.filter((item) => !item.ok).length,
    resultados,
  };
}
