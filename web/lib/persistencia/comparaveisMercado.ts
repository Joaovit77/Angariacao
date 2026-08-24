/* ================================================================
   PERSISTÊNCIA: BASE DE COMPARÁVEIS DO MERCADO

   A coleta paga e a avaliação ficam separadas. Resultados observados nos
   portais são atualizados por usuário e depois reutilizados sem nova
   chamada ao coletor externo.
   ================================================================ */
import { chaveNormalizada } from "@/lib/normalizacao";
import type { EntradaAvaliacao, ComparavelAvaliacao } from "@/lib/calculo/avaliacao";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

interface LinhaComparavelMercado {
  id?: string;
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
  latitude?: number | null;
  longitude?: number | null;
  status_anuncio?: string | null;
  similaridade_vetorial?: number | string | null;
}

function numero(valor: number | string | null | undefined): number | null {
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

function rotuloStatus(status: string | null | undefined): string {
  if (status === "ativo") return "Anunciado";
  if (status === "nao_encontrado") return "Não encontrado";
  if (status === "removido") return "Removido";
  if (status === "historico") return "Histórico";
  if (status === "possivel_negociado") return "Possível negociação";
  return status || "Anunciado";
}

export function mapearComparaveisMercado(
  linhas: LinhaComparavelMercado[],
): ComparavelAvaliacao[] {
  return linhas.map((linha) => ({
    origem: "externo",
    id: linha.id || `${linha.portal}:${linha.id_externo}`,
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
    latitude: linha.latitude ?? null,
    longitude: linha.longitude ?? null,
    valorAnunciado: numero(linha.valor_anunciado) || 0,
    dataInformacao: linha.publicado_em || linha.ultimo_visto_em,
    url: linha.url,
    status: rotuloStatus(linha.status_anuncio),
    similaridadeVetorial: numero(linha.similaridade_vetorial),
  }));
}

export async function carregarComparaveisMercadoComCliente(
  supabase: SupabaseClient,
  userId: string,
  entrada: EntradaAvaliacao,
): Promise<ComparavelAvaliacao[]> {
  if (entrada.finalidade !== "locacao") return [];
  const cidadeChave = chaveNormalizada(entrada.cidade);
  if (!cidadeChave) return [];

  const { data, error } = await supabase
    .from("comparaveis_mercado")
    .select("id, portal, id_externo, url, titulo, tipo, endereco, bairro, cidade, area_m2, quartos, banheiros, vagas, valor_anunciado, publicado_em, ultimo_visto_em")
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

  return mapearComparaveisMercado((data || []) as LinhaComparavelMercado[]);
}

export async function carregarComparaveisMercado(
  userId: string,
  entrada: EntradaAvaliacao,
): Promise<ComparavelAvaliacao[]> {
  return carregarComparaveisMercadoComCliente(getSupabase(), userId, entrada);
}

export async function buscarComparaveisMercado(
  userId: string,
  entrada: EntradaAvaliacao,
): Promise<ComparavelAvaliacao[]> {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return carregarComparaveisMercadoComCliente(supabase, userId, entrada);
  try {
    const resposta = await fetch("/api/avaliacao/comparaveis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(entrada),
    });
    if (resposta.ok) {
      const dados = await resposta.json() as { comparaveis?: ComparavelAvaliacao[] };
      if (Array.isArray(dados.comparaveis)) return dados.comparaveis;
    }
  } catch {
    // A busca estruturada abaixo preserva a V2 quando a rota/modelo falha.
  }
  return carregarComparaveisMercadoComCliente(supabase, userId, entrada);
}
