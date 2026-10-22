"use client";

import { fetchAutenticado } from "./auth/recuperacaoSessao";
import { anuncioPertenceAoMercado, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "./calculo/centralAngariacao";
import {
  resumirPendenciasRadar,
  type AnuncioRadar,
  type BuscaRadar,
  type CandidatoPendenteRadar,
  type EstadoRadar,
  type OrigemVerificacaoRadar,
  type PendenciasRadar,
} from "./calculo/radarAngariacao";
import { getSupabase } from "./persistencia/supabase";
import { useAppStore } from "./store";
import { agoraISOString } from "./datas";
import { capacidadeContratoExplicitoRadar } from "./calculo/aquisicaoRadar";

interface DbBuscaRadar {
  id: string;
  nome: string;
  filtros: FiltrosCentralAngariacao;
  ativo: boolean;
  ultimo_check: string | null;
  ultimo_check_automatico: string | null;
  ultimo_check_origem: OrigemVerificacaoRadar | null;
  created_at: string;
  comparacao_desde_em?: string | null;
}

interface DbAnuncioRadar {
  id: string;
  busca_id: string;
  dados: AnuncioCentralAngariacao;
  visto: boolean;
  encontrado_em: string;
  novidade_varredura_id?: string | null;
  anuncio_global_id?: string | null;
  cobertura_coleta?: AnuncioRadar["coberturaColeta"];
}

function fromDbBusca(row: DbBuscaRadar): BuscaRadar {
  return {
    id: row.id,
    nome: row.nome,
    filtros: row.filtros,
    ativo: row.ativo,
    ultimoCheck: row.ultimo_check,
    ultimoCheckAutomatico: row.ultimo_check_automatico,
    ultimoCheckOrigem: row.ultimo_check_origem,
    criadoEm: row.created_at,
    comparacaoDesde: row.comparacao_desde_em ?? null,
  };
}

function fromDbAnuncio(row: DbAnuncioRadar): AnuncioRadar {
  return {
    id: row.id,
    buscaId: row.busca_id,
    anuncio: row.dados,
    visto: row.visto,
    encontradoEm: row.encontrado_em,
    novidade: !!row.novidade_varredura_id,
    anuncioGlobalId: row.anuncio_global_id ?? null,
    coberturaColeta: row.cobertura_coleta ?? null,
  };
}

function linhaAnuncio(
  userId: string,
  buscaId: string,
  anuncio: AnuncioCentralAngariacao,
  visto: boolean,
) {
  return {
    user_id: userId,
    busca_id: buscaId,
    portal: anuncio.portal,
    id_externo: anuncio.idExterno,
    url: anuncio.url,
    dados: anuncio,
    visto,
  };
}

export async function carregarRadar(inicio = 0): Promise<EstadoRadar> {
  if (!Number.isInteger(inicio) || inicio < 0) throw new Error("Página do Radar inválida.");
  const supabase = getSupabase();
  const [buscas, anuncios] = await Promise.all([
    supabase.from("radar_buscas").select("id,nome,filtros,ativo,ultimo_check,ultimo_check_automatico,ultimo_check_origem,created_at,comparacao_desde_em").order("created_at", { ascending: false }),
    supabase.from("radar_anuncios").select("id,busca_id,dados,visto,encontrado_em,novidade_varredura_id,anuncio_global_id,cobertura_coleta").order("encontrado_em", { ascending: false }).order("id", { ascending: false }).range(inicio, inicio + 120),
  ]);
  if (buscas.error) throw buscas.error;
  if (anuncios.error) throw anuncios.error;
  const buscasMapeadas = (buscas.data as DbBuscaRadar[]).map(fromDbBusca);
  const mercadoPorBusca = new Map(buscasMapeadas.map((busca) => [busca.id, busca.filtros]));
  const linhas = (anuncios.data || []) as DbAnuncioRadar[];
  const anunciosMapeados = linhas.slice(0,120)
    .map(fromDbAnuncio)
    .filter((item) => {
      const filtros = mercadoPorBusca.get(item.buscaId);
      return !!filtros && anuncioPertenceAoMercado(item.anuncio, filtros.cidade, filtros.estado);
    });
  return { buscas: buscasMapeadas, anuncios: anunciosMapeados, proximaPagina: linhas.length > 120 ? inicio + 120 : null };
}

interface DbCandidatoPendenteRadar {
  id: string;
  busca_id: string;
  portal: CandidatoPendenteRadar["anuncio"]["portal"];
  id_externo: string;
  url: string;
  titulo: string | null;
  descricao: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
}

/** Candidatos do banco inteiro, independentemente da página carregada na lista. */
export async function carregarCandidatosPendentesRadar(): Promise<CandidatoPendenteRadar[]> {
  const { data, error } = await getSupabase().rpc("candidatos_pendentes_radar");
  if (error) throw error;
  return ((data || []) as DbCandidatoPendenteRadar[]).map((row) => ({
    id: row.id,
    buscaId: row.busca_id,
    anuncio: {
      portal: row.portal,
      idExterno: row.id_externo,
      url: row.url,
      titulo: row.titulo || "",
      descricao: row.descricao,
      endereco: row.endereco,
      cidade: row.cidade,
      estado: row.estado,
    },
  }));
}

export const EVENTO_PENDENCIAS_RADAR = "radar:pendencias";

// Última fonte lida do banco. Tela e monitor recalculam a partir dela, então
// uma mudança de imóveis nunca recompõe o contador com dados mais velhos que
// os da última leitura de qualquer um dos dois.
let fontePendencias: {
  candidatos: CandidatoPendenteRadar[];
  buscas: Array<Pick<BuscaRadar, "id" | "filtros">>;
} | null = null;

/**
 * Único ponto que escreve o contador do Radar. Reaplica a regra sobre a última
 * leitura com os imóveis atuais da store; não consulta o banco.
 */
export function recalcularPendenciasRadar(): PendenciasRadar | null {
  if (!fontePendencias) return null;
  const pendencias = resumirPendenciasRadar(
    fontePendencias.candidatos,
    fontePendencias.buscas,
    useAppStore.getState().imoveis,
  );
  useAppStore.getState().setRadarNovos(pendencias.total);
  window.dispatchEvent(new CustomEvent<PendenciasRadar>(EVENTO_PENDENCIAS_RADAR, { detail: pendencias }));
  return pendencias;
}

/** Relê candidatos e buscas do banco e atualiza o contador. */
export async function atualizarPendenciasRadar(): Promise<PendenciasRadar> {
  const supabase = getSupabase();
  const [candidatos, buscas] = await Promise.all([
    carregarCandidatosPendentesRadar(),
    supabase.from("radar_buscas").select("id,filtros"),
  ]);
  if (buscas.error) throw buscas.error;
  fontePendencias = {
    candidatos,
    buscas: (buscas.data || []) as Array<Pick<BuscaRadar, "id" | "filtros">>,
  };
  return recalcularPendenciasRadar()!;
}

export async function salvarBuscaRadar(
  userId: string,
  nome: string,
  filtros: FiltrosCentralAngariacao,
  baseline: AnuncioCentralAngariacao[],
): Promise<BuscaRadar> {
  const capacidade = capacidadeContratoExplicitoRadar(filtros);
  if (!capacidade.suportado) throw new Error(capacidade.motivo);
  const supabase = getSupabase();
  const agora = agoraISOString();
  const { data, error } = await supabase
    .from("radar_buscas")
    .insert({
      user_id: userId,
      nome: nome.trim(),
      filtros,
      ultimo_check: agora,
      ultimo_check_origem: "manual",
    })
    .select("id,nome,filtros,ativo,ultimo_check,ultimo_check_automatico,ultimo_check_origem,created_at,comparacao_desde_em")
    .single();
  if (error) throw error;
  const busca = fromDbBusca(data as DbBuscaRadar);
  if (baseline.length) {
    const salvo = await supabase
      .from("radar_anuncios")
      .upsert(Array.from(new Map(baseline.map((anuncio) => [`${anuncio.portal}:${anuncio.idExterno}`, anuncio])).values()).map((anuncio) => linhaAnuncio(userId, busca.id, anuncio, false)), {
        onConflict: "busca_id,portal,id_externo",
        ignoreDuplicates: true,
      });
    if (salvo.error) throw salvo.error;
  }
  return busca;
}

export async function verificarBuscaRadar(
  userId: string,
  busca: BuscaRadar,
  origem: Exclude<OrigemVerificacaoRadar, "cron">,
  registrarCobertura?: (cobertura: string | undefined) => void,
) {
  // O servidor descobre o dono pela sessão e lê os filtros da busca salva.
  void userId;
  const resposta = await fetchAutenticado("/api/radar/verificar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buscaId: busca.id, origem }),
  }, { repetivel: false });
  if (!resposta) throw new Error("Sua sessão expirou. Entre novamente.");
  const resultado = await resposta.json() as { ok: boolean; aviso?: string; anuncios?: DbAnuncioRadar[]; cobertura?: string };
  if (!resposta.ok || !resultado.ok) throw new Error(resultado.aviso || "Não foi possível verificar o Radar agora.");
  registrarCobertura?.(resultado.cobertura);
  return (resultado.anuncios || []).map(fromDbAnuncio);
}

export async function definirBuscaRadarAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await getSupabase().from("radar_buscas").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function excluirBuscaRadar(id: string): Promise<void> {
  const { error } = await getSupabase().from("radar_buscas").delete().eq("id", id);
  if (error) throw error;
}

/** A RLS limita a ação ao dono; a identidade global inclui portal e finalidade. */
export async function marcarOfertaRadarComoVista(anuncioGlobalId: string): Promise<void> {
  const { error } = await getSupabase().from("radar_anuncios").update({ visto: true }).eq("anuncio_global_id", anuncioGlobalId);
  if (error) throw error;
}

export async function marcarRadarComoVisto(): Promise<void> {
  const { error } = await getSupabase().from("radar_anuncios").update({ visto: true }).eq("visto", false);
  if (error) throw error;
}

export const EVENTO_RADAR_ATUALIZADO = "radar:atualizado";

export function publicarAtualizacaoRadar() {
  window.dispatchEvent(new CustomEvent(EVENTO_RADAR_ATUALIZADO));
}
