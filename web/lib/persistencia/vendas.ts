import { getSupabase } from "./supabase";
import { PORTAS_VENDAS, PORTA_RESOLVER_INTERESSADO_VENDA, type ComandosVenda, type PortaVenda,
  type ResultadoOperacaoVenda, type ResultadoResolucaoInteressadoVenda } from "./vendasComandos";
import { codificarNumericVenda, decodificarErroVenda, decodificarResolucaoInteressadoVenda, decodificarRespostaVenda } from "./vendasDecodificacao";
import { classificarIdentificacaoCriarVenda, normalizarTelefoneInteressadoVenda } from "./vendasInteressado";

export interface ClienteRpcVendas {
  rpc(nome: string, argumentos: {p_comando: Record<string, unknown>} | {p_consulta: Record<string, unknown>}): PromiseLike<{data: unknown; error: unknown}>;
}

/** A pessoa só é identificada no criar, e por exatamente uma forma. O legado `contatoId` segue
    sem validação local (o B2 continua decidindo no banco); o `interessado` passa pelo contrato
    B3.1 antes de sair. Nas outras seis portas o contato é imutável: nenhuma das duas chaves entra. */
function identificacaoLocal(porta: PortaVenda, wire: Record<string, unknown>): ResultadoOperacaoVenda | null {
  const presente = (chave: string) => Object.hasOwn(wire,chave) && wire[chave] !== undefined;
  const legado = presente("contatoId"), interessado = presente("interessado");
  if (porta !== "criar") return legado || interessado ? {ok:false,erro:{codigo:"estrutura-invalida",motivo:null}} : null;
  if (legado === interessado) return {ok:false,erro:{codigo:"estrutura-invalida",motivo:null}};
  if (legado) return null;
  const r = classificarIdentificacaoCriarVenda({interessado:wire.interessado});
  return r.ok ? null : {ok:false,erro:{codigo:r.codigo,motivo:null}};
}

/** POST com a sessão existente. Nenhuma escrita direta, service role ou retry que troque a chave.
    A chave de idempotência é sempre a do chamador; o `interessado` vai como foi recebido. */
export async function executarComandoVenda<P extends PortaVenda>(
  porta: P, comando: ComandosVenda[P], cliente: ClienteRpcVendas = getSupabase(),
): Promise<ResultadoOperacaoVenda> {
  const wire: Record<string, unknown> = {...comando};
  const recusa = identificacaoLocal(porta, wire);
  if (recusa) return recusa;
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

/** Resolve o telefone digitado na conta da sessão (RLS + filtro do banco). Só leitura:
    `encontrado` é um candidato, nunca uma escolha; quem chama decide o modo do criar. */
export async function consultarInteressadoVenda(
  telefone: string, cliente: ClienteRpcVendas = getSupabase(),
): Promise<ResultadoResolucaoInteressadoVenda> {
  if (typeof telefone !== "string") return {ok:false,erro:{codigo:"estrutura-invalida",motivo:null}};
  // Mesma regra do banco (paridade provada no B3.1): telefone inválido nem sai do navegador.
  if (!normalizarTelefoneInteressadoVenda(telefone).ok) return {ok:true,resolucao:{status:"telefone-invalido"}};
  let retorno: {data: unknown; error: unknown};
  try { retorno = await cliente.rpc(PORTA_RESOLVER_INTERESSADO_VENDA,{p_consulta:{telefone}}); }
  catch { return {ok:false,erro:{codigo:"transporte-indisponivel",motivo:null}}; }
  if (retorno.error) return {ok:false,erro:decodificarErroVenda(retorno.error)};
  try { return {ok:true,resolucao:decodificarResolucaoInteressadoVenda(retorno.data)}; }
  catch { return {ok:false,erro:{codigo:"resposta-invalida",motivo:null}}; }
}
