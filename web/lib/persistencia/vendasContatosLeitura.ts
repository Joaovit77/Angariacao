import { getSupabase } from "./supabase";

/** Identificação mínima para escolha humana. Não resolve, funde ou cadastra pessoas. */
export interface ContatoCandidatoVenda {
  readonly id: string;
  readonly nome: string;
  readonly telefones: readonly string[];
  readonly arquivado: boolean;
}
export type ErroContatosVenda = "nao-autenticado" | "transporte-indisponivel" | "resposta-invalida" | "falha-interna";
export type ResultadoContatosVenda =
  | { readonly ok: true; readonly usuarioId: string; readonly dados: readonly ContatoCandidatoVenda[] }
  | { readonly ok: false; readonly erro: ErroContatosVenda };
interface Consulta extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(coluna: string, valor: string): Consulta;
  is(coluna: string, valor: null): Consulta;
  order(coluna: string, opcoes: { ascending: boolean }): Consulta;
  range(inicio: number, fim: number): Consulta;
}
export interface ClienteContatosVenda {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(tabela: string): { select(colunas: string): Consulta };
}
export const COLUNAS_CONTATOS_CANDIDATOS_VENDA = "id,user_id,nome,arquivado_em,fundido_em_contato_id,anonimizado_em";
export const COLUNAS_TELEFONES_CANDIDATOS_VENDA = "id,user_id,contato_id,telefone";
/** Impede reapresentar um pedido de uma conta após troca de sessão nesta aba. */
export async function confirmarContaCriacaoVenda(usuarioEsperado: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabase().auth.getUser();
    return !error && data.user?.id === usuarioEsperado;
  } catch { return false; }
}
const PAGINA = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class Falha extends Error { constructor(readonly codigo: ErroContatosVenda) { super(codigo); } }
const invalida = (): never => { throw new Falha("resposta-invalida"); };
function erro(entrada: unknown): ErroContatosVenda {
  const e = entrada as { code?: string; status?: number; name?: string } | null;
  if (e?.status === 401 || e?.status === 403 || e?.name === "AuthSessionMissingError" ||
      ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(e?.code ?? "")) return "nao-autenticado";
  return e?.code ? "falha-interna" : "transporte-indisponivel";
}
function linha(valor: unknown, colunas: string, usuarioId: string): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return invalida();
  const r = valor as Record<string, unknown>;
  const chaves = colunas.split(",");
  if (Object.keys(r).length !== chaves.length || chaves.some((c) => !Object.hasOwn(r, c)) ||
      typeof r.id !== "string" || !UUID.test(r.id) || r.user_id !== usuarioId) return invalida();
  return r;
}

/** RLS mais escopo do Auth em ambas as tabelas; paginação determinística, sem resultado parcial. */
export async function listarContatosCandidatosVenda(cliente?: ClienteContatosVenda): Promise<ResultadoContatosVenda> {
  try {
    const banco = cliente ?? (getSupabase() as unknown as ClienteContatosVenda);
    let sessao: Awaited<ReturnType<ClienteContatosVenda["auth"]["getUser"]>>;
    try { sessao = await banco.auth.getUser(); } catch { throw new Falha("transporte-indisponivel"); }
    if (sessao.error) throw new Falha(erro(sessao.error));
    const usuarioId = sessao.data.user?.id;
    if (!usuarioId) throw new Falha("nao-autenticado");
    if (!UUID.test(usuarioId)) return invalida();
    async function paginas(tabela: string, colunas: string): Promise<Record<string, unknown>[]> {
      const todas: Record<string, unknown>[] = [], ids = new Set<string>();
      for (let inicio = 0; ; inicio += PAGINA) {
        let q = banco.from(tabela).select(colunas).eq("user_id", usuarioId!);
        if (tabela === "contatos") q = q.is("fundido_em_contato_id", null).is("anonimizado_em", null);
        else q = q.is("desativado_em", null);
        let retorno: { data: unknown; error: unknown };
        try { retorno = await q.order("id", { ascending: true }).range(inicio, inicio + PAGINA - 1); }
        catch { throw new Falha("transporte-indisponivel"); }
        if (retorno.error) throw new Falha(erro(retorno.error));
        if (!Array.isArray(retorno.data) || retorno.data.length > PAGINA) return invalida();
        for (const valor of retorno.data) {
          const r = linha(valor, colunas, usuarioId!);
          if (ids.has(r.id as string)) return invalida();
          ids.add(r.id as string); todas.push(r);
        }
        if (retorno.data.length < PAGINA) return todas;
      }
    }
    const contatos = await paginas("contatos", COLUNAS_CONTATOS_CANDIDATOS_VENDA);
    const mapa = new Map<string, { id: string; nome: string; telefones: string[]; arquivado: boolean }>();
    for (const c of contatos) {
      if ((c.nome !== null && typeof c.nome !== "string") || c.fundido_em_contato_id !== null || c.anonimizado_em !== null ||
          (c.arquivado_em !== null && typeof c.arquivado_em !== "string")) return invalida();
      mapa.set(c.id as string, { id: c.id as string, nome: typeof c.nome === "string" && c.nome.trim() ? c.nome.trim() : "Contato sem nome", telefones: [], arquivado: c.arquivado_em !== null });
    }
    if (mapa.size > 0) {
      for (const t of await paginas("contatos_telefones", COLUNAS_TELEFONES_CANDIDATOS_VENDA)) {
        if (typeof t.contato_id !== "string" || !UUID.test(t.contato_id) || typeof t.telefone !== "string" || !t.telefone.trim()) return invalida();
        mapa.get(t.contato_id)?.telefones.push(t.telefone);
      }
    }
    return { ok: true, usuarioId, dados: [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id)) };
  } catch (e) { return { ok: false, erro: e instanceof Falha ? e.codigo : "falha-interna" }; }
}
