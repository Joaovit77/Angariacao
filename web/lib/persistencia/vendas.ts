import { getSupabase } from "./supabase";
import { PORTAS_VENDAS, type ComandosVenda, type PortaVenda, type ResultadoOperacaoVenda } from "./vendasComandos";
import { codificarNumericVenda, decodificarErroVenda, decodificarRespostaVenda } from "./vendasDecodificacao";

export interface ClienteRpcVendas {
  rpc(nome: string, argumentos: {p_comando: Record<string, unknown>}): PromiseLike<{data: unknown; error: unknown}>;
}

/** POST com a sessão existente. Nenhuma escrita direta, service role ou retry que troque a chave. */
export async function executarComandoVenda<P extends PortaVenda>(
  porta: P, comando: ComandosVenda[P], cliente: ClienteRpcVendas = getSupabase(),
): Promise<ResultadoOperacaoVenda> {
  const wire: Record<string, unknown> = {...comando};
  try {
    for (const campo of ["valorNegocioPrevisto","receitaPrevista","valorNegocioFechado"]) {
      if (!Object.hasOwn(wire,campo)) continue;
      const valor = wire[campo];
      if (valor === undefined && (porta === "criar" || porta === "ganhar")) { delete wire[campo]; continue; }
      if (valor !== null && typeof valor !== "number") throw new Error("Valor inválido.");
      wire[campo] = codificarNumericVenda(valor);
    }
  } catch { return {ok:false,erro:{codigo:"valor-invalido",motivo:null}}; }
  let retorno: {data: unknown; error: unknown};
  try { retorno = await cliente.rpc(PORTAS_VENDAS[porta],{p_comando:wire}); }
  catch { return {ok:false,erro:{codigo:"transporte-indisponivel",motivo:null}}; }
  if (retorno.error) return {ok:false,erro:decodificarErroVenda(retorno.error)};
  try { return decodificarRespostaVenda(retorno.data); }
  catch { return {ok:false,erro:{codigo:"resposta-invalida",motivo:null}}; }
}
