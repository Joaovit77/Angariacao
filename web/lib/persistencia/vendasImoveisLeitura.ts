/** Catálogo factual B3.4b-A. Não decide elegibilidade nem consulta snapshots de oportunidades.
 * Usa a sessão do navegador e a RLS existente, com escopo adicional obtido do Auth.
 * Não recebe user_id do chamador e nunca grava dados. */
import { FINALIDADES_IMOVEL, type FinalidadeImovel } from "../constantes";
import { getSupabase } from "./supabase";

export interface ImovelCandidatoVenda {
  readonly id: string;
  readonly codigo: string | null;
  readonly referenciaCrm: string | null;
  readonly endereco: string;
  readonly bairro: string | null;
  readonly cidade: string | null;
  readonly estado: string | null;
  readonly unidade: string | null;
  readonly bloco: string | null;
  readonly finalidade: FinalidadeImovel | null;
  readonly status: string;
  readonly retirado: boolean;
  readonly valorVenda: number | null;
}

export type ErroLeituraImoveisVenda = "nao-autenticado" | "transporte-indisponivel" | "resposta-invalida" | "falha-interna";
export type ResultadoImoveisVenda =
  | { readonly ok: true; readonly dados: readonly ImovelCandidatoVenda[] }
  | { readonly ok: false; readonly erro: ErroLeituraImoveisVenda };

export interface ConsultaImoveisVenda extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(coluna: string, valor: string): ConsultaImoveisVenda;
  order(coluna: string, opcoes: { ascending: boolean }): ConsultaImoveisVenda;
  range(inicio: number, fim: number): ConsultaImoveisVenda;
}
/** Contrato mínimo: Auth e SELECT. Nenhum método de escrita disponível. */
export interface ClienteImoveisVenda {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(tabela: string): { select(colunas: string): ConsultaImoveisVenda };
}

export const COLUNAS_IMOVEIS_CANDIDATOS_VENDA = "id,codigo,referencia_crm,endereco,bairro,cidade,estado,unidade,bloco,finalidade,status,retirado,valor_venda";
const TAMANHO_PAGINA = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class FalhaLeitura extends Error {
  constructor(readonly codigo: ErroLeituraImoveisVenda) { super(codigo); }
}
function invalida(): never { throw new FalhaLeitura("resposta-invalida"); }
function texto(valor: unknown): string | null {
  if (valor === null) return null;
  if (typeof valor !== "string") return invalida();
  return valor;
}
function erroBanco(erro: unknown): ErroLeituraImoveisVenda {
  const detalhe = typeof erro === "object" && erro !== null ? erro as { code?: unknown; name?: unknown; status?: unknown } : {};
  const codigo = detalhe.code;
  if (detalhe.name === "AuthSessionMissingError" || detalhe.status === 401 || detalhe.status === 403) return "nao-autenticado";
  if (codigo === "42501" || codigo === "PGRST301" || codigo === "PGRST302" || codigo === "PGRST303") return "nao-autenticado";
  return codigo === undefined || codigo === "" ? "transporte-indisponivel" : "falha-interna";
}
function decodificar(linha: unknown): ImovelCandidatoVenda {
  if (!linha || typeof linha !== "object" || Array.isArray(linha)) return invalida();
  const r = linha as Record<string, unknown>;
  const campos = COLUNAS_IMOVEIS_CANDIDATOS_VENDA.split(",");
  if (Object.keys(r).some((chave) => !campos.includes(chave))) return invalida();
  if (typeof r.id !== "string" || !UUID.test(r.id) || typeof r.endereco !== "string" ||
      typeof r.status !== "string" || !r.status.trim() || typeof r.retirado !== "boolean") return invalida();
  // Ausência legada de finalidade também representa desconhecido; nunca vira Locação.
  const finalidade = r.finalidade ?? null;
  if (finalidade !== null && !FINALIDADES_IMOVEL.some((f) => f === finalidade)) return invalida();
  if (r.valor_venda !== null && (typeof r.valor_venda !== "number" || !Number.isFinite(r.valor_venda) || r.valor_venda < 0)) return invalida();
  return {
    id: r.id, codigo: texto(r.codigo), referenciaCrm: texto(r.referencia_crm), endereco: r.endereco,
    bairro: texto(r.bairro), cidade: texto(r.cidade), estado: texto(r.estado), unidade: texto(r.unidade), bloco: texto(r.bloco),
    finalidade: finalidade as FinalidadeImovel | null, status: r.status, retirado: r.retirado, valorVenda: r.valor_venda as number | null,
  };
}

/** Todas as situações da própria carteira, inclusive NULL, Locado, Perdido e Retirado.
 * Paginação evita o corte padrão do PostgREST; qualquer falha recusa a leitura inteira. */
export async function listarImoveisCandidatosVenda(cliente?: ClienteImoveisVenda): Promise<ResultadoImoveisVenda> {
  try {
    const banco = cliente ?? (getSupabase() as unknown as ClienteImoveisVenda);
    let sessao: Awaited<ReturnType<ClienteImoveisVenda["auth"]["getUser"]>>;
    try { sessao = await banco.auth.getUser(); } catch { throw new FalhaLeitura("transporte-indisponivel"); }
    if (sessao.error) throw new FalhaLeitura(erroBanco(sessao.error));
    if (!sessao.data.user) throw new FalhaLeitura("nao-autenticado");
    const usuarioId = sessao.data.user.id;
    if (!UUID.test(usuarioId)) return invalida();
    const dados: ImovelCandidatoVenda[] = [];
    const ids = new Set<string>();
    for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
      let retorno: { data: unknown; error: unknown };
      try {
        retorno = await banco.from("imoveis").select(COLUNAS_IMOVEIS_CANDIDATOS_VENDA)
          .eq("user_id", usuarioId).order("id", { ascending: true }).range(inicio, inicio + TAMANHO_PAGINA - 1);
      } catch { throw new FalhaLeitura("transporte-indisponivel"); }
      if (retorno.error) throw new FalhaLeitura(erroBanco(retorno.error));
      if (!Array.isArray(retorno.data) || retorno.data.length > TAMANHO_PAGINA) return invalida();
      for (const bruta of retorno.data) {
        const imovel = decodificar(bruta);
        if (ids.has(imovel.id)) return invalida();
        ids.add(imovel.id);
        dados.push(imovel);
      }
      if (retorno.data.length < TAMANHO_PAGINA) return { ok: true, dados };
    }
  } catch (falha) {
    return { ok: false, erro: falha instanceof FalhaLeitura ? falha.codigo : "falha-interna" };
  }
}
