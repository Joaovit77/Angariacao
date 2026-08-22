/* ================================================================
   PERSISTÊNCIA: BASE DE COMPARÁVEIS DO MERCADO

   A coleta paga e a avaliação ficam separadas. Resultados observados nos
   portais são atualizados por usuário e depois reutilizados sem nova
   chamada ao coletor externo.
   ================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveNormalizada } from "@/lib/normalizacao";
import { agoraISOString } from "@/lib/datas";
import type { EntradaAvaliacao, ComparavelAvaliacao } from "@/lib/calculo/avaliacao";
import {
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { getSupabase } from "./supabase";

interface LinhaComparavelMercado {
  portal: string;
  id_externo: string;
  url: string;
  titulo: string;
  tipo: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  area_m2: number | string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  valor_anunciado: number | string;
  publicado_em: string | null;
  ultimo_visto_em: string;
}

function numero(valor: number | string | null): number | null {
  if (valor == null) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function tiposCompativeis(tipo: string): string[] {
  const chave = chaveNormalizada(tipo);
  if (chave === "apartamento" || chave === "kitnet/studio") {
    return ["Apartamento", "Kitnet/Studio"];
  }
  if (chave === "casa" || chave === "casa de condominio" || chave === "sobrado") {
    return ["Casa", "Casa de Condomínio", "Sobrado"];
  }
  if (chave === "sala comercial" || chave === "galpao") {
    return ["Sala Comercial", "Galpão"];
  }
  return [tipo.trim()];
}

export async function salvarComparaveisMercado(
  supabase: SupabaseClient,
  userId: string,
  anuncios: AnuncioCentralAngariacao[],
  filtros: FiltrosCentralAngariacao,
): Promise<number> {
  const vistosEm = agoraISOString();
  const linhas = anuncios.flatMap((original) => {
    const anuncio = comCaracteristicasDoAnuncio(original, filtros.tipo);
    const valor = numero(anuncio.preco ?? null);
    const cidadeChave = chaveNormalizada(anuncio.cidade);
    if (!valor || valor <= 0 || !cidadeChave || !anuncio.url || !anuncio.titulo) return [];
    return [{
      user_id: userId,
      portal: anuncio.portal,
      id_externo: anuncio.idExterno,
      url: anuncio.url,
      finalidade: "locacao",
      titulo: anuncio.titulo,
      tipo: anuncio.tipo || null,
      endereco: anuncio.endereco || null,
      bairro: anuncio.bairro || null,
      cidade: anuncio.cidade?.trim() || filtros.cidade,
      estado: filtros.estado,
      cidade_chave: cidadeChave,
      bairro_chave: chaveNormalizada(anuncio.bairro) || null,
      area_m2: anuncio.areaM2 ?? null,
      quartos: anuncio.quartos ?? null,
      banheiros: anuncio.banheiros ?? null,
      vagas: anuncio.vagas ?? null,
      valor_anunciado: valor,
      publicado_em: anuncio.publicadoEm || null,
      ultimo_visto_em: vistosEm,
      dados_originais: anuncio,
    }];
  });
  if (!linhas.length) return 0;

  const { error } = await supabase
    .from("comparaveis_mercado")
    .upsert(linhas, { onConflict: "user_id,portal,id_externo" });
  if (error) throw error;
  return linhas.length;
}

export async function carregarComparaveisMercado(
  userId: string,
  entrada: EntradaAvaliacao,
): Promise<ComparavelAvaliacao[]> {
  if (entrada.finalidade !== "locacao") return [];
  const cidadeChave = chaveNormalizada(entrada.cidade);
  if (!cidadeChave) return [];

  const { data, error } = await getSupabase()
    .from("comparaveis_mercado")
    .select("portal, id_externo, url, titulo, tipo, endereco, bairro, cidade, area_m2, quartos, banheiros, vagas, valor_anunciado, publicado_em, ultimo_visto_em")
    .eq("user_id", userId)
    .eq("finalidade", entrada.finalidade)
    .eq("cidade_chave", cidadeChave)
    // Replica no banco os cortes mínimos do motor. Buscar primeiro os 500
    // mais recentes da cidade escondia o imóvel certo quando a base crescia.
    .in("tipo", tiposCompativeis(entrada.tipo))
    .gte("area_m2", entrada.areaM2 * 0.45)
    .lte("area_m2", entrada.areaM2 * 1.55)
    .gte("quartos", Math.max(0, entrada.quartos - 1))
    .lte("quartos", entrada.quartos + 1)
    .order("ultimo_visto_em", { ascending: false })
    .limit(1_000);
  if (error) throw error;

  return ((data || []) as LinhaComparavelMercado[]).map((linha) => ({
    origem: "externo",
    id: `${linha.portal}:${linha.id_externo}`,
    codigo: linha.portal,
    endereco: linha.endereco || linha.titulo,
    bairro: linha.bairro,
    cidade: linha.cidade,
    edificio: null,
    tipo: linha.tipo || "Outro",
    areaM2: numero(linha.area_m2),
    quartos: linha.quartos,
    banheiros: linha.banheiros,
    vagas: linha.vagas,
    conservacao: null,
    latitude: null,
    longitude: null,
    valorAnunciado: numero(linha.valor_anunciado) || 0,
    dataInformacao: linha.publicado_em || linha.ultimo_visto_em,
    url: linha.url,
    status: "Anunciado",
  }));
}
