/* ================================================================
   PERSISTÊNCIA: AVALIAÇÕES RÁPIDAS

   A tabela é um histórico imutável. A UI só publica o resultado depois
   deste insert terminar, preservando a regra do projeto: banco primeiro,
   estado local depois. A política RLS ainda valida user_id e, quando há
   imovel_id, confirma que o imóvel também pertence à sessão.
   ================================================================ */
import type {
  EntradaAvaliacao,
  FinalidadeAvaliacao,
  NivelConfiancaAvaliacao,
  ResultadoAvaliacao,
} from "@/lib/calculo/avaliacao";
import { getSupabase } from "./supabase";

interface LinhaHistoricoAvaliacao {
  id: string;
  imovel_id: string | null;
  finalidade: FinalidadeAvaliacao;
  valor_proprietario: number | string | null;
  valor_minimo: number | string | null;
  valor_recomendado: number | string | null;
  valor_maximo: number | string | null;
  nivel_confianca: NivelConfiancaAvaliacao;
  score_confianca: number;
  quantidade_comparaveis: number;
  dados_entrada: EntradaAvaliacao;
  created_at: string;
}

interface LinhaAjusteValorAvaliacao {
  avaliacao_id: string;
  valor_final: number | string;
  justificativa: string | null;
  created_at: string;
}

export interface AjusteValorAvaliacao {
  valorFinal: number;
  justificativa: string | null;
  criadoEm: string;
}

export interface HistoricoAvaliacao {
  id: string;
  imovelId: string | null;
  finalidade: FinalidadeAvaliacao;
  valorProprietario: number | null;
  valorMinimo: number | null;
  valorRecomendado: number | null;
  valorMaximo: number | null;
  nivelConfianca: NivelConfiancaAvaliacao;
  scoreConfianca: number;
  quantidadeComparaveis: number;
  entrada: EntradaAvaliacao;
  valorFinalCorretor: number | null;
  justificativaValorFinal: string | null;
  valorFinalEm: string | null;
  criadoEm: string;
}

function numero(valor: number | string | null): number | null {
  return valor == null ? null : Number(valor);
}

function doBanco(linha: LinhaHistoricoAvaliacao): HistoricoAvaliacao {
  return {
    id: linha.id,
    imovelId: linha.imovel_id,
    finalidade: linha.finalidade,
    valorProprietario: numero(linha.valor_proprietario),
    valorMinimo: numero(linha.valor_minimo),
    valorRecomendado: numero(linha.valor_recomendado),
    valorMaximo: numero(linha.valor_maximo),
    nivelConfianca: linha.nivel_confianca,
    scoreConfianca: linha.score_confianca,
    quantidadeComparaveis: linha.quantidade_comparaveis,
    entrada: linha.dados_entrada,
    valorFinalCorretor: null,
    justificativaValorFinal: null,
    valorFinalEm: null,
    criadoEm: linha.created_at,
  };
}

function ajusteDoBanco(linha: LinhaAjusteValorAvaliacao): AjusteValorAvaliacao {
  return {
    valorFinal: Number(linha.valor_final),
    justificativa: linha.justificativa,
    criadoEm: linha.created_at,
  };
}

function tabelaAjustesAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "42P01" || erro?.code === "PGRST205";
}

export async function registrarAvaliacao(
  userId: string,
  entrada: EntradaAvaliacao,
  valorProprietario: number | null,
  resultado: ResultadoAvaliacao,
): Promise<{ id: string; criadoEm: string }> {
  const { data, error } = await getSupabase()
    .from("avaliacoes_imoveis")
    .insert({
      user_id: userId,
      imovel_id: entrada.imovelId || null,
      finalidade: entrada.finalidade,
      valor_proprietario: valorProprietario,
      valor_minimo: resultado.valorMinimo,
      valor_recomendado: resultado.valorRecomendado,
      valor_maximo: resultado.valorMaximo,
      nivel_confianca: resultado.nivelConfianca,
      score_confianca: resultado.scoreConfianca,
      quantidade_comparaveis: resultado.comparaveis.length,
      dados_entrada: entrada,
      metodologia: resultado.metodologia,
      comparaveis_snapshot: resultado.comparaveis,
    })
    .select("id, created_at")
    .single();
  if (error) throw error;
  return { id: String(data.id), criadoEm: String(data.created_at) };
}

export async function registrarValorFinalAvaliacao(
  userId: string,
  avaliacaoId: string,
  valorFinal: number,
  justificativa: string,
): Promise<AjusteValorAvaliacao> {
  const { data, error } = await getSupabase()
    .from("ajustes_valor_avaliacao")
    .insert({
      user_id: userId,
      avaliacao_id: avaliacaoId,
      valor_final: valorFinal,
      justificativa: justificativa.trim() || null,
    })
    .select("avaliacao_id, valor_final, justificativa, created_at")
    .single();
  if (error) throw error;
  return ajusteDoBanco(data as LinhaAjusteValorAvaliacao);
}

export async function carregarHistoricoAvaliacoes(
  userId: string,
  imovelId?: string | null,
): Promise<HistoricoAvaliacao[]> {
  let consulta = getSupabase()
    .from("avaliacoes_imoveis")
    .select("id, imovel_id, finalidade, valor_proprietario, valor_minimo, valor_recomendado, valor_maximo, nivel_confianca, score_confianca, quantidade_comparaveis, dados_entrada, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (imovelId) consulta = consulta.eq("imovel_id", imovelId);
  const { data, error } = await consulta;
  if (error) throw error;
  const avaliacoes = ((data || []) as LinhaHistoricoAvaliacao[]).map(doBanco);
  if (!avaliacoes.length) return avaliacoes;

  const { data: ajustes, error: erroAjustes } = await getSupabase()
    .from("ajustes_valor_avaliacao")
    .select("avaliacao_id, valor_final, justificativa, created_at")
    .eq("user_id", userId)
    .in("avaliacao_id", avaliacoes.map((item) => item.id))
    .order("created_at", { ascending: false });
  // Mantém a leitura do histórico compatível durante o intervalo entre o
  // deploy do frontend e a aplicação do novo trecho do schema.
  if (erroAjustes && !tabelaAjustesAusente(erroAjustes)) throw erroAjustes;
  if (erroAjustes) return avaliacoes;

  const ajusteMaisRecente = new Map<string, AjusteValorAvaliacao>();
  for (const linha of (ajustes || []) as LinhaAjusteValorAvaliacao[]) {
    if (!ajusteMaisRecente.has(linha.avaliacao_id)) {
      ajusteMaisRecente.set(linha.avaliacao_id, ajusteDoBanco(linha));
    }
  }
  return avaliacoes.map((avaliacao) => {
    const ajuste = ajusteMaisRecente.get(avaliacao.id);
    return ajuste ? {
      ...avaliacao,
      valorFinalCorretor: ajuste.valorFinal,
      justificativaValorFinal: ajuste.justificativa,
      valorFinalEm: ajuste.criadoEm,
    } : avaliacao;
  });
}
