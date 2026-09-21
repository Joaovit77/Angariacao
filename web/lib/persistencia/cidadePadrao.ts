import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolverCidadePadrao,
  resolverCidadePadraoDaConta,
  type ResolucaoCidadePadrao,
} from "../configuracaoUsuario";
import { getSupabase } from "./supabase";

interface LinhaConfigCidadePadrao {
  user_id: string;
  cidade_padrao: string | null;
  uf_padrao: string | null;
}

interface LinhaImovelCidade {
  user_id: string;
  cidade: string | null;
  estado: string | null;
}

/**
 * Coleta somente os campos necessários ao C1. O filtro explícito por user_id
 * permanece obrigatório mesmo quando a RLS já está ativa, porque o mesmo
 * código continua seguro caso receba futuramente um cliente privilegiado.
 */
export async function carregarCidadePadraoDaConta(
  userId: string,
  client: SupabaseClient = getSupabase(),
): Promise<ResolucaoCidadePadrao> {
  const [configuracao, imoveis] = await Promise.all([
    client
      .from("user_config")
      .select("user_id,cidade_padrao,uf_padrao")
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("imoveis")
      .select("user_id,cidade,estado")
      .eq("user_id", userId),
  ]);

  if (configuracao.error) throw configuracao.error;
  if (imoveis.error) throw imoveis.error;

  const linhaConfig = configuracao.data as LinhaConfigCidadePadrao | null;
  const linhasImoveis = (imoveis.data || []) as LinhaImovelCidade[];
  return resolverCidadePadraoDaConta(
    userId,
    linhaConfig
      ? [{
          userId: linhaConfig.user_id,
          cidadePadrao: linhaConfig.cidade_padrao,
          ufPadrao: linhaConfig.uf_padrao,
        }]
      : [],
    linhasImoveis.map((imovel) => ({
      userId: imovel.user_id,
      cidade: imovel.cidade,
      estado: imovel.estado,
    })),
  );
}

/** Persiste somente uma escolha explícita; `null/null` remove a preferência. */
export async function salvarCidadePadraoDaConta(
  userId: string,
  cidade: string | null,
  uf: string | null,
  client: SupabaseClient = getSupabase(),
): Promise<ResolucaoCidadePadrao> {
  if (!userId) throw new Error("Usuário é obrigatório para salvar a cidade padrão.");

  const limpando = !cidade?.trim() && !uf?.trim();
  const resolucao = limpando
    ? ({ cidade: null, uf: null, origem: "nenhuma" } as const)
    : resolverCidadePadrao({ cidadePadrao: cidade, ufPadrao: uf }, []);

  if (!limpando && resolucao.origem !== "configurada") {
    throw new Error("Informe uma cidade e uma UF brasileira válidas.");
  }

  const { error } = await client.from("user_config").upsert({
    user_id: userId,
    cidade_padrao: resolucao.cidade,
    uf_padrao: resolucao.uf,
  }, { onConflict: "user_id" });
  if (error) throw error;
  return resolucao;
}
