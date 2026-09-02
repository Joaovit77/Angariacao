import type { PostgrestError } from "@supabase/supabase-js";
import { agoraISOString } from "@/lib/datas";
import {
  normalizarEntradaMercadoMonitorado,
  type EntradaMercadoMonitorado,
  type MercadoMonitorado,
} from "@/lib/calculo/mercadosMonitorados";
import { getSupabase } from "./supabase";

interface LinhaMercadoMonitorado {
  id: string;
  cidade: string;
  estado: string;
  cidade_chave: string;
  finalidade: MercadoMonitorado["finalidade"];
  segmento: MercadoMonitorado["segmento"];
  ativo: boolean;
  frequencia_dias: number;
  proxima_execucao_em: string | null;
  ultima_tentativa_em: string | null;
  ultimo_sucesso_em: string | null;
  falhas_consecutivas: number;
  ultimo_erro_codigo: string | null;
  created_at: string;
  updated_at: string;
}

const COLUNAS = [
  "id", "cidade", "estado", "cidade_chave", "finalidade", "segmento", "ativo",
  "frequencia_dias", "proxima_execucao_em", "ultima_tentativa_em", "ultimo_sucesso_em",
  "falhas_consecutivas", "ultimo_erro_codigo", "created_at", "updated_at",
].join(",");

function mapear(linha: LinhaMercadoMonitorado): MercadoMonitorado {
  return {
    id: linha.id,
    cidade: linha.cidade,
    estado: linha.estado,
    cidadeChave: linha.cidade_chave,
    finalidade: linha.finalidade,
    segmento: linha.segmento,
    ativo: linha.ativo,
    frequenciaDias: linha.frequencia_dias,
    proximaExecucaoEm: linha.proxima_execucao_em,
    ultimaTentativaEm: linha.ultima_tentativa_em,
    ultimoSucessoEm: linha.ultimo_sucesso_em,
    falhasConsecutivas: linha.falhas_consecutivas,
    ultimoErroCodigo: linha.ultimo_erro_codigo,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

function erroAmigavel(erro: PostgrestError): Error {
  if (erro.code === "23505") return new Error("Esse mercado já está configurado.");
  if (erro.code === "23514") return new Error("Os dados do mercado não atendem às regras de validação.");
  return new Error(erro.message || "Não foi possível salvar o mercado.");
}

async function usuarioAtualId(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão inválida.");
  return data.user.id;
}

export async function carregarMercadosMonitorados(): Promise<MercadoMonitorado[]> {
  const { data, error } = await getSupabase()
    .from("mercados_monitorados")
    .select(COLUNAS)
    .order("created_at", { ascending: false });
  if (error) throw erroAmigavel(error);
  return ((data || []) as unknown as LinhaMercadoMonitorado[]).map(mapear);
}

export async function criarMercadoMonitorado(
  entrada: EntradaMercadoMonitorado,
): Promise<MercadoMonitorado> {
  const normalizado = normalizarEntradaMercadoMonitorado(entrada);
  const userId = await usuarioAtualId();
  const { data, error } = await getSupabase()
    .from("mercados_monitorados")
    .insert({
      user_id: userId,
      cidade: normalizado.cidade,
      estado: normalizado.estado,
      finalidade: normalizado.finalidade,
      segmento: normalizado.segmento,
      frequencia_dias: normalizado.frequenciaDias,
      proxima_execucao_em: null,
    })
    .select(COLUNAS)
    .single();
  if (error) throw erroAmigavel(error);
  return mapear(data as unknown as LinhaMercadoMonitorado);
}

export async function definirMercadoMonitoradoAtivo(
  id: string,
  ativo: boolean,
): Promise<void> {
  const { error } = await getSupabase()
    .from("mercados_monitorados")
    .update({ ativo, updated_at: agoraISOString() })
    .eq("id", id);
  if (error) throw erroAmigavel(error);
}

export async function excluirMercadoMonitorado(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("mercados_monitorados")
    .delete()
    .eq("id", id);
  if (error) throw erroAmigavel(error);
}
