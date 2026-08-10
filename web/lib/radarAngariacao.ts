"use client";

import { buscarNaCentral } from "./centralAngariacao";
import { anuncioPertenceACidade, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "./calculo/centralAngariacao";
import { selecionarAnunciosNovosRadar, type AnuncioRadar, type BuscaRadar, type EstadoRadar } from "./calculo/radarAngariacao";
import { getSupabase } from "./persistencia/supabase";
import { agoraISOString } from "./datas";

interface DbBuscaRadar {
  id: string;
  nome: string;
  filtros: FiltrosCentralAngariacao;
  ativo: boolean;
  ultimo_check: string | null;
  created_at: string;
}

interface DbAnuncioRadar {
  id: string;
  busca_id: string;
  dados: AnuncioCentralAngariacao;
  visto: boolean;
  encontrado_em: string;
}

function fromDbBusca(row: DbBuscaRadar): BuscaRadar {
  return {
    id: row.id,
    nome: row.nome,
    filtros: row.filtros,
    ativo: row.ativo,
    ultimoCheck: row.ultimo_check,
    criadoEm: row.created_at,
  };
}

function fromDbAnuncio(row: DbAnuncioRadar): AnuncioRadar {
  return {
    id: row.id,
    buscaId: row.busca_id,
    anuncio: row.dados,
    visto: row.visto,
    encontradoEm: row.encontrado_em,
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

export async function carregarRadar(): Promise<EstadoRadar> {
  const supabase = getSupabase();
  const [buscas, anuncios] = await Promise.all([
    supabase.from("radar_buscas").select("id,nome,filtros,ativo,ultimo_check,created_at").order("created_at", { ascending: false }),
    supabase.from("radar_anuncios").select("id,busca_id,dados,visto,encontrado_em").order("encontrado_em", { ascending: false }).limit(120),
  ]);
  if (buscas.error) throw buscas.error;
  if (anuncios.error) throw anuncios.error;
  const buscasMapeadas = (buscas.data as DbBuscaRadar[]).map(fromDbBusca);
  const cidadePorBusca = new Map(buscasMapeadas.map((busca) => [busca.id, busca.filtros.cidade]));
  const anunciosMapeados = (anuncios.data as DbAnuncioRadar[])
    .map(fromDbAnuncio)
    .filter((item) => anuncioPertenceACidade(item.anuncio, cidadePorBusca.get(item.buscaId) || ""));
  return { buscas: buscasMapeadas, anuncios: anunciosMapeados };
}

export async function contarNovosRadar(): Promise<number> {
  const { count, error } = await getSupabase()
    .from("radar_anuncios")
    .select("id", { count: "exact", head: true })
    .eq("visto", false);
  if (error) throw error;
  return count ?? 0;
}

export async function salvarBuscaRadar(
  userId: string,
  nome: string,
  filtros: FiltrosCentralAngariacao,
  baseline: AnuncioCentralAngariacao[],
): Promise<BuscaRadar> {
  const supabase = getSupabase();
  const agora = agoraISOString();
  const { data, error } = await supabase
    .from("radar_buscas")
    .insert({ user_id: userId, nome: nome.trim(), filtros, ultimo_check: agora })
    .select("id,nome,filtros,ativo,ultimo_check,created_at")
    .single();
  if (error) throw error;
  const busca = fromDbBusca(data as DbBuscaRadar);
  if (baseline.length) {
    const salvo = await supabase
      .from("radar_anuncios")
      .upsert(baseline.map((anuncio) => linhaAnuncio(userId, busca.id, anuncio, true)), {
        onConflict: "busca_id,portal,id_externo",
        ignoreDuplicates: true,
      });
    if (salvo.error) throw salvo.error;
  }
  return busca;
}

export async function verificarBuscaRadar(userId: string, busca: BuscaRadar) {
  const resultado = await buscarNaCentral(busca.filtros);
  const supabase = getSupabase();
  const agora = agoraISOString();

  if (!resultado.ok) {
    await supabase.from("radar_buscas").update({ ultimo_check: agora }).eq("id", busca.id);
    throw new Error(resultado.aviso || "Não foi possível consultar o portal.");
  }

  const { data: existentes, error: erroExistentes } = await supabase
    .from("radar_anuncios")
    .select("portal,id_externo")
    .eq("busca_id", busca.id);
  if (erroExistentes) throw erroExistentes;
  const novos = selecionarAnunciosNovosRadar(resultado.anuncios, existentes || []);

  let inseridos: DbAnuncioRadar[] = [];
  if (novos.length) {
    const { data, error } = await supabase
      .from("radar_anuncios")
      .upsert(novos.map((anuncio) => linhaAnuncio(userId, busca.id, anuncio, false)), {
        onConflict: "busca_id,portal,id_externo",
        ignoreDuplicates: true,
      })
      .select("id,busca_id,dados,visto,encontrado_em");
    if (error) throw error;
    inseridos = (data || []) as DbAnuncioRadar[];
  }

  const atualizado = await supabase.from("radar_buscas").update({ ultimo_check: agora }).eq("id", busca.id);
  if (atualizado.error) throw atualizado.error;
  return inseridos.map(fromDbAnuncio);
}

export async function definirBuscaRadarAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await getSupabase().from("radar_buscas").update({ ativo }).eq("id", id);
  if (error) throw error;
}

export async function excluirBuscaRadar(id: string): Promise<void> {
  const { error } = await getSupabase().from("radar_buscas").delete().eq("id", id);
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
