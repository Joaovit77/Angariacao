import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunctionTool } from "openai/resources/responses/responses";
import { MAX_PROTOCOLOS, MAX_PROTOCOLOS_APLICAVEIS } from "@/lib/ia/atendimento/contratos";
import { fromDbProtocolo, type DbProtocoloRow } from "@/lib/persistencia/mapeadores";

export const FERRAMENTA_PROTOCOLOS_COMERCIAIS = "consultar_protocolos_comerciais";

export interface ProtocoloComercialAssistente {
  id: string;
  titulo: string;
  conteudo: string;
}

export interface CatalogoProtocolosAssistente {
  protocolos: ProtocoloComercialAssistente[];
  fonteDisponivel: boolean;
}

/**
 * Relê o catálogo com o cliente autenticado do chamador. O filtro explícito por
 * usuário preserva o isolamento mesmo se esta função for reutilizada no futuro
 * com um cliente privilegiado; a RLS permanece como segunda barreira.
 */
export async function carregarCatalogoProtocolosAssistente(
  supabase: SupabaseClient,
  userId: string,
): Promise<CatalogoProtocolosAssistente> {
  try {
    const { data, error } = await supabase
      .from("protocolos")
      .select("id,user_id,tipo,titulo,conteudo,arquivado,created_at")
      .eq("user_id", userId)
      .eq("tipo", "informacao_comercial")
      .or("arquivado.eq.false,arquivado.is.null")
      .order("created_at", { ascending: true })
      .limit(MAX_PROTOCOLOS);

    if (error) {
      console.error("Assistente: falha ao ler protocolos comerciais:", error.message);
      return { protocolos: [], fonteDisponivel: false };
    }

    const protocolos = ((data || []) as DbProtocoloRow[])
      .map(fromDbProtocolo)
      .filter((protocolo) =>
        protocolo.tipo === "informacao_comercial" &&
        !protocolo.arquivado &&
        protocolo.id.trim() !== "" &&
        protocolo.titulo.trim() !== "" &&
        protocolo.conteudo.trim() !== ""
      )
      .slice(0, MAX_PROTOCOLOS)
      .map(({ id, titulo, conteudo }) => ({ id, titulo, conteudo }));

    return { protocolos, fonteDisponivel: true };
  } catch (error) {
    console.error("Assistente: catálogo de protocolos indisponível:", error);
    return { protocolos: [], fonteDisponivel: false };
  }
}

export function definicaoFerramentaProtocolosAssistente(
  protocolos: readonly ProtocoloComercialAssistente[],
): FunctionTool | null {
  if (!protocolos.length) return null;
  return {
    type: "function",
    name: FERRAMENTA_PROTOCOLOS_COMERCIAIS,
    description: "Carrega o conteúdo dos protocolos comerciais selecionados do catálogo autorizado desta execução. Use somente para fatos comerciais diretamente cobertos por um ou mais títulos candidatos.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        protocolos_ids: {
          type: "array",
          items: { type: "string", enum: protocolos.map((protocolo) => protocolo.id) },
          minItems: 1,
          maxItems: MAX_PROTOCOLOS_APLICAVEIS,
        },
      },
      required: ["protocolos_ids"],
      additionalProperties: false,
    },
  };
}

/** Valida novamente os IDs produzidos pelo modelo antes de liberar conteúdo. */
export function protocolosSelecionadosParaAssistente(
  argumentos: Record<string, unknown>,
  candidatos: readonly ProtocoloComercialAssistente[],
): ProtocoloComercialAssistente[] {
  const ids = Array.isArray(argumentos.protocolos_ids)
    ? argumentos.protocolos_ids.filter((id): id is string => typeof id === "string")
    : [];
  const unicos = [...new Set(ids)].slice(0, MAX_PROTOCOLOS_APLICAVEIS);
  const porId = new Map(candidatos.map((protocolo) => [protocolo.id, protocolo]));
  return unicos.flatMap((id) => {
    const protocolo = porId.get(id);
    return protocolo ? [protocolo] : [];
  });
}
