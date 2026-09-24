import type { SupabaseClient } from "@supabase/supabase-js";
import type { AtributoParaContextoConfirmado } from "@/lib/calculo/contextoConfirmadoInvestigador";

export interface LeituraConfirmacoesInvestigador {
  linhas: AtributoParaContextoConfirmado[];
  falhou: boolean;
}

/** Usa a sessão autenticada da rota e exige ambos os filtros de posse. */
export async function lerConfirmacoesInvestigador(
  client: SupabaseClient,
  userId: string,
  imovelIdentificadoId: string,
): Promise<LeituraConfirmacoesInvestigador> {
  try {
    const { data, error, count } = await client
      .from("imoveis_identificados_atributos")
      .select("atributo,estado,valor_texto,valor_num", { count: "exact" })
      .eq("user_id", userId)
      .eq("imovel_identificado_id", imovelIdentificadoId)
      .eq("estado", "confirmada")
      .abortSignal(AbortSignal.timeout(2_000));
    if (error || (typeof count === "number" && count !== (data ?? []).length)) {
      return { linhas: [], falhou: true };
    }
    return {
      linhas: (data ?? []).map((linha) => ({
        atributo: linha.atributo,
        estado: linha.estado,
        valorTexto: linha.valor_texto,
        valorNum: linha.valor_num,
      })),
      falhou: false,
    };
  } catch {
    // Contexto de apresentação não pode apagar uma investigação concluída.
    return { linhas: [], falhou: true };
  }
}
