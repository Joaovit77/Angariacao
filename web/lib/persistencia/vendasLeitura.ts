/* Leitura de Vendas para a interface (B3.4a). Só SELECT com a sessão do navegador: quem decide o
   que a conta enxerga é a RLS (`auth.uid() = user_id`) das quatro tabelas, nunca um id recebido
   do chamador. Nenhuma RPC, service role, SQL ou rota de servidor; as linhas passam pelos mesmos
   decodificadores estritos do B2 e qualquer desvio vira erro, nunca dado aceito pela metade. */
import { getSupabase } from "./supabase";
import type { EventoPersistidoVenda, OportunidadePersistidaVenda } from "./vendasComandos";
import { decodificarLinhaEventoVenda, decodificarLinhaOportunidadeVenda } from "./vendasDecodificacao";

export interface ConsultaLeituraVenda extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(coluna: string, valor: string): ConsultaLeituraVenda;
  in(coluna: string, valores: readonly string[]): ConsultaLeituraVenda;
  order(coluna: string, opcoes: { ascending: boolean }): ConsultaLeituraVenda;
}
/** O mínimo do cliente Supabase que a leitura usa: `from(tabela).select(colunas)` e filtros. */
export interface ClienteLeituraVenda {
  from(tabela: string): { select(colunas: string): ConsultaLeituraVenda };
}

/* Colunas exatas que os decodificadores do B2 exigem (objeto fechado). A oportunidade guarda só
   `contato_id`; do contato sai apenas o nome. Telefone, observações e metadados não são lidos.
   `numeric` e `bigint` vêm como texto (`::text`, mesma chave): o PostgREST os entregaria como
   número JSON, e o decodificador só aceita o decimal exato, sem arredondamento no caminho. */
export const COLUNAS_OPORTUNIDADE_VENDA = "id,user_id,contato_id,estado,versao::text,imovel_modo,imovel_referencia_id,manual_endereco,manual_referencia,manual_unidade,manual_bloco,manual_descricao_curta,origem_tipo,origem_descricao,valor_negocio_previsto::text,valor_negocio_fechado::text,receita_prevista::text,criado_por,responsavel_usuario_id,encerramento_tipo,data_fato,confirmacao_explicita,registro_formalizacao,motivo_perda,justificativa_perda,encerrado_em,created_at,updated_at,arquivado_em";
export const COLUNAS_REFERENCIA_VENDA = "id,user_id,imovel_id,imovel_id_original,codigo,referencia,endereco,unidade,bloco,capturado_em";
export const COLUNAS_EVENTO_VENDA = "id,user_id,oportunidade_id,tipo,ator_usuario_id,registrado_em,data_fato,versao::text,payload,chave_idempotencia";
export const COLUNAS_CONTATO_VENDA = "id,nome";
/** Ids por requisição em `in(...)`: mantém a URL do PostgREST curta. */
const LOTE_IDS = 100;

export type CodigoErroLeituraVenda = "transporte-indisponivel" | "nao-autenticado" | "resposta-invalida" | "falha-interna";
export type ResultadoLeituraVenda<T> = { readonly ok: true; readonly dados: T } | { readonly ok: false; readonly erro: CodigoErroLeituraVenda };

/** Como o imóvel aparece: o retrato gravado na referência (não o imóvel vivo) ou o texto manual. */
export type ImovelExibicaoVenda =
  | { readonly tipo: "nenhum" }
  | {
      readonly tipo: "referencia";
      readonly codigo: string | null; readonly referencia: string | null; readonly endereco: string | null;
      readonly unidade: string | null; readonly bloco: string | null;
      /** false quando o imóvel saiu da carteira depois (a referência fica, com `imovel_id` nulo). */
      readonly naCarteira: boolean;
    }
  | {
      readonly tipo: "manual";
      readonly endereco: string | null; readonly referencia: string | null; readonly unidade: string | null;
      readonly bloco: string | null; readonly descricaoCurta: string | null;
    };

export interface OportunidadeListadaVenda {
  readonly oportunidade: OportunidadePersistidaVenda;
  /** null quando o contato não tem nome ou não pôde ser lido pela sessão (a tela mostra o fallback). */
  readonly interessadoNome: string | null;
  readonly imovel: ImovelExibicaoVenda;
}

class FalhaLeituraVenda extends Error {
  constructor(readonly codigo: CodigoErroLeituraVenda) { super(codigo); }
}

function clientePadrao(): ClienteLeituraVenda {
  // O SupabaseClient tipado é mais largo que esta interface; a forma usada é a mesma.
  return getSupabase() as unknown as ClienteLeituraVenda;
}

function erroDoBanco(erro: unknown): CodigoErroLeituraVenda {
  const codigo = typeof erro === "object" && erro !== null ? (erro as { code?: unknown }).code : undefined;
  if (codigo === "42501" || codigo === "PGRST301" || codigo === "PGRST303") return "nao-autenticado";
  if (codigo === "" || codigo === undefined) return "transporte-indisponivel";
  return "falha-interna";
}

async function linhas(consulta: ConsultaLeituraVenda): Promise<unknown[]> {
  let retorno: { data: unknown; error: unknown };
  try { retorno = await consulta; } catch { throw new FalhaLeituraVenda("transporte-indisponivel"); }
  if (retorno.error) throw new FalhaLeituraVenda(erroDoBanco(retorno.error));
  if (!Array.isArray(retorno.data)) throw new FalhaLeituraVenda("resposta-invalida");
  return retorno.data;
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

async function porIds(cliente: ClienteLeituraVenda, tabela: string, colunas: string, ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const mapa = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    for (const linha of await linhas(cliente.from(tabela).select(colunas).in("id", ids.slice(i, i + LOTE_IDS)))) {
      if (!objeto(linha) || typeof linha.id !== "string" || mapa.has(linha.id)) throw new FalhaLeituraVenda("resposta-invalida");
      mapa.set(linha.id, linha);
    }
  }
  return mapa;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function imovelExibicao(oportunidade: OportunidadePersistidaVenda, referencia: Record<string, unknown> | undefined): ImovelExibicaoVenda {
  const tratado = oportunidade.imovelTratado;
  if (tratado === null) return { tipo: "nenhum" };
  if (tratado.modo === "manual") {
    return { tipo: "manual", endereco: textoOuNulo(tratado.endereco), referencia: textoOuNulo(tratado.referencia),
      unidade: textoOuNulo(tratado.unidade), bloco: textoOuNulo(tratado.bloco), descricaoCurta: textoOuNulo(tratado.descricaoCurta) };
  }
  // O decodificador já exigiu a referência e conferiu id, conta e imóvel original.
  if (!referencia) throw new FalhaLeituraVenda("resposta-invalida");
  return { tipo: "referencia", codigo: textoOuNulo(referencia.codigo), referencia: textoOuNulo(referencia.referencia),
    endereco: textoOuNulo(referencia.endereco), unidade: textoOuNulo(referencia.unidade), bloco: textoOuNulo(referencia.bloco),
    naCarteira: referencia.imovel_id !== null };
}

/** Todas as oportunidades da sessão, da mais recentemente atualizada para a mais antiga. */
export async function listarOportunidadesVenda(cliente: ClienteLeituraVenda = clientePadrao()): Promise<ResultadoLeituraVenda<OportunidadeListadaVenda[]>> {
  try {
    const brutas = await linhas(cliente.from("vendas_oportunidades").select(COLUNAS_OPORTUNIDADE_VENDA)
      .order("updated_at", { ascending: false }).order("id", { ascending: false }));
    if (brutas.length === 0) return { ok: true, dados: [] };
    if (!brutas.every(objeto)) throw new FalhaLeituraVenda("resposta-invalida");
    const unicos = (campo: string) => [...new Set(brutas.map((linha) => linha[campo]).filter((v): v is string => typeof v === "string"))];
    const referencias = await porIds(cliente, "vendas_imoveis_referencias", COLUNAS_REFERENCIA_VENDA, unicos("imovel_referencia_id"));
    const contatos = await porIds(cliente, "contatos", COLUNAS_CONTATO_VENDA, unicos("contato_id"));
    const dados = brutas.map((linha): OportunidadeListadaVenda => {
      const referencia = typeof linha.imovel_referencia_id === "string" ? referencias.get(linha.imovel_referencia_id) : undefined;
      let oportunidade: OportunidadePersistidaVenda;
      try { oportunidade = decodificarLinhaOportunidadeVenda(linha, referencia ?? null); }
      catch { throw new FalhaLeituraVenda("resposta-invalida"); }
      // Contato que a sessão não lê (ou sem nome) não é erro: vira o mesmo fallback, sem distinguir o motivo.
      const contato = contatos.get(oportunidade.contatoId);
      return { oportunidade, interessadoNome: textoOuNulo(contato?.nome), imovel: imovelExibicao(oportunidade, referencia) };
    });
    return { ok: true, dados };
  } catch (falha) {
    return { ok: false, erro: falha instanceof FalhaLeituraVenda ? falha.codigo : "falha-interna" };
  }
}

/** Eventos de uma oportunidade da sessão, na ordem em que aconteceram (versão crescente). */
export async function listarEventosVenda(oportunidadeId: string, cliente: ClienteLeituraVenda = clientePadrao()): Promise<ResultadoLeituraVenda<EventoPersistidoVenda[]>> {
  try {
    const brutas = await linhas(cliente.from("vendas_oportunidades_eventos").select(COLUNAS_EVENTO_VENDA)
      .eq("oportunidade_id", oportunidadeId).order("versao", { ascending: true }));
    const eventos = brutas.map((linha) => {
      try { return decodificarLinhaEventoVenda(linha); } catch { throw new FalhaLeituraVenda("resposta-invalida"); }
    });
    for (let i = 0; i < eventos.length; i++) {
      if (eventos[i].oportunidadeId !== oportunidadeId || (i > 0 && eventos[i].versao <= eventos[i - 1].versao)) throw new FalhaLeituraVenda("resposta-invalida");
    }
    return { ok: true, dados: eventos };
  } catch (falha) {
    return { ok: false, erro: falha instanceof FalhaLeituraVenda ? falha.codigo : "falha-interna" };
  }
}
