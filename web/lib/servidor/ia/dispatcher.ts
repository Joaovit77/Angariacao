import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutorOpenAI } from "./executor-openai";
import type { VersaoConfiguracaoIa } from "@/lib/ia/configuracao";

export const TIPOS_PEDIDO_IA = [
  "sugerir-roteiros",
  "analisar-abordagens",
  "analisar-dashboard",
  "analisar-mapa",
  "resumo-dia",
  "explicar-foco",
  "extrair-anuncio",
  "rascunhar-resposta",
  "gerar-anuncio",
  "abordagem-anuncio",
  /** Garimpo em Campo (C8). Servido SÓ por /api/prospeccao/classificar: a
      rota /api/ia recusa este tipo — ele não recebe contexto do browser,
      relê a observação do banco e passa pelo claim do avistamento. Entra
      aqui para o vocabulário de `ia_uso` continuar único. */
  "classificar-imovel-identificado",
] as const;

export type TipoPedidoIa = (typeof TIPOS_PEDIDO_IA)[number];

export interface CorpoPedidoIa {
  tipo?: unknown;
  contexto?: unknown;
  texto?: unknown;
  imovelId?: unknown;
  caracteristicas?: unknown;
  filtros?: unknown;
  origem?: unknown;
}

export interface ContextoHandlerIa<T extends TipoPedidoIa = TipoPedidoIa> {
  tipo: T;
  corpo: CorpoPedidoIa;
  supabase: SupabaseClient;
  userId: string;
  executor: ExecutorOpenAI;
  /** Opcional para adaptadores e testes antigos; produção sempre injeta a versão ativa. */
  configuracao?: VersaoConfiguracaoIa;
}

export type HandlerIa<T extends TipoPedidoIa = TipoPedidoIa> = (
  contexto: ContextoHandlerIa<T>,
) => Promise<Response>;

export type RegistroHandlersIa = Partial<{
  [T in TipoPedidoIa]: HandlerIa<T>;
}>;

export function ehTipoPedidoIa(valor: unknown): valor is TipoPedidoIa {
  return (
    typeof valor === "string" &&
    (TIPOS_PEDIDO_IA as readonly string[]).includes(valor)
  );
}

/** Retorna null quando o domínio ainda permanece no fluxo legado da rota. */
export async function despacharPedidoIa<T extends TipoPedidoIa>(
  tipo: T,
  base: Omit<ContextoHandlerIa<T>, "tipo">,
  handlers: RegistroHandlersIa,
): Promise<Response | null> {
  const handler = handlers[tipo] as HandlerIa<T> | undefined;
  return handler ? handler({ ...base, tipo }) : null;
}
