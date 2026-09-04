/* ================================================================
   PERSISTÊNCIA: BASE DE COMPARÁVEIS DO MERCADO

   A coleta paga e a avaliação ficam separadas. Resultados observados nos
   portais são atualizados por usuário e depois reutilizados sem nova
   chamada ao coletor externo.
   ================================================================ */
import { chaveNormalizada } from "@/lib/normalizacao";
import {
  comparavelEhOProprioAnuncio,
  type EntradaAvaliacao,
  type ComparavelAvaliacao,
} from "@/lib/calculo/avaliacao";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { normalizarUf, ufValida } from "@/lib/calculo/geografia";
import {
  derivarFatosHistoricosComparavel,
  type ObservacaoPositivaComparavel,
  type SnapshotObservacaoComparavel,
  type TipoEventoHistoricoComparavel,
} from "@/lib/calculo/historicoComparaveisMercado";

interface LinhaObservacaoComparavelMercado {
  observado_em: string | null;
  tipo_evento: TipoEventoHistoricoComparavel;
  valor_anunciado: number | string | null;
  status_anuncio: string | null;
  dados_snapshot: SnapshotObservacaoComparavel | null;
}

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
  estado: string | null;
  regiao?: string | null;
  area_m2: number | string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  valor_anunciado: number | string;
  publicado_em: string | null;
  primeiro_visto_em?: string | null;
  ultimo_visto_em: string;
  url_canonica?: string | null;
  fingerprint_forte?: boolean | null;
  cidade_chave?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status_anuncio?: string | null;
  similaridade_vetorial?: number | string | null;
  observacoes_comparaveis_mercado?: LinhaObservacaoComparavelMercado[] | null;
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor == null) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function somenteDataIso(valor: string | null | undefined): string | null {
  const data = valor?.slice(0, 10) || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
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

export function mapearFatosHistoricosComparavelMercado(linha: LinhaComparavelMercado) {
  const observacoes: ObservacaoPositivaComparavel[] = (
    linha.observacoes_comparaveis_mercado || []
  ).map((observacao) => ({
    observadoEm: observacao.observado_em,
    tipoEvento: observacao.tipo_evento,
    valorAnunciado: observacao.valor_anunciado,
    statusAnuncio: observacao.status_anuncio,
    dadosSnapshot: observacao.dados_snapshot,
    // O schema atual não registra a procedência explícita do status.
    statusExplicitamenteObservado: false,
  }));

  return derivarFatosHistoricosComparavel({
    primeiroVistoEm: linha.primeiro_visto_em ?? null,
    ultimoVistoEm: linha.ultimo_visto_em ?? null,
    portal: linha.portal,
    idExterno: linha.id_externo,
    urlCanonica: linha.url_canonica || linha.url,
    fingerprintForte: linha.fingerprint_forte === true,
    estado: linha.estado,
    cidadeChave: linha.cidade_chave ?? linha.cidade,
  }, observacoes);
}

export function mapearComparaveisMercado(
  linhas: LinhaComparavelMercado[],
): ComparavelAvaliacao[] {
  const identidades = new Set<string>();
  const unicas = linhas.filter((linha) => {
    const identidade = `${linha.portal}:${linha.id_externo}`;
    if (identidades.has(identidade)) return false;
    identidades.add(identidade);
    return true;
  });
  return unicas.map((linha) => ({
    origem: "externo",
    id: linha.id || `${linha.portal}:${linha.id_externo}`,
    idExterno: linha.id_externo,
    codigo: linha.portal,
    endereco: linha.endereco || linha.titulo,
    bairro: linha.bairro,
    cidade: linha.cidade,
    estado: linha.estado,
    regiao: linha.regiao,
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
    dataInformacao: somenteDataIso(linha.publicado_em || linha.ultimo_visto_em),
    url: linha.url,
    status: rotuloStatus(linha.status_anuncio),
    similaridadeVetorial: numero(linha.similaridade_vetorial),
    historico: mapearFatosHistoricosComparavelMercado(linha),
  }));
}

export async function carregarComparaveisMercadoComCliente(
  supabase: SupabaseClient,
  _userId: string,
  entrada: EntradaAvaliacao,
): Promise<ComparavelAvaliacao[]> {
  if (entrada.finalidade !== "locacao") return [];
  const cidadeChave = chaveNormalizada(entrada.cidade);
  const estado = normalizarUf(entrada.estado);
  if (!cidadeChave || !ufValida(estado)) return [];

  const { data, error } = await supabase
    .from("comparaveis_mercado")
    .select("id, portal, id_externo, url, url_canonica, fingerprint_forte, titulo, tipo, endereco, bairro, cidade, estado, cidade_chave, regiao, area_m2, quartos, banheiros, vagas, valor_anunciado, publicado_em, primeiro_visto_em, ultimo_visto_em, status_anuncio, observacoes_comparaveis_mercado(observado_em, tipo_evento, valor_anunciado, status_anuncio, dados_snapshot)")
    .eq("finalidade", entrada.finalidade)
    .eq("estado", estado)
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

  const comparaveis = mapearComparaveisMercado((data || []) as LinhaComparavelMercado[]);
  return comparaveis.filter((item) => !comparavelEhOProprioAnuncio(entrada, item));
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
      if (Array.isArray(dados.comparaveis)) {
        return dados.comparaveis.filter((item) => !comparavelEhOProprioAnuncio(entrada, item));
      }
    }
  } catch {
    // A busca estruturada abaixo preserva a V2 quando a rota/modelo falha.
  }
  return carregarComparaveisMercadoComCliente(supabase, userId, entrada);
}
