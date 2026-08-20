/* ================================================================
   FILTROS DO PIPELINE (parte pura)
   Port literal de filteredImoveisEnhanced / matchesPipelineColFilters /
   pipelineColDistinct / pipelineUniqueSorted do app.js original.
   No app antigo essas funções liam os globals pipelineFilters,
   pipelineViewMode e pipelineColFilters; aqui recebem tudo por
   parâmetro (mesma lógica, forma pura).
   ================================================================ */
import type { Imovel } from "../tipos";
import { captacaoGanha } from "./motor";

export interface FiltrosPipeline {
  search: string;
  tipo: string;
  bairro: string;
  status: string;
  responsavel: string;
  cidade: string;
}

/** "retirados" é o terceiro modo: os imóveis que o proprietário tirou da
    carteira. Não é um filtro a mais — é a separação entre o que está em jogo
    e o que já saiu. Ver `filtrarImoveis`. */
export type PipelineViewMode = "kanban" | "lista" | "retirados";

/** Qual identificação ganha destaque nos cards e na primeira coluna da Lista. */
export type PipelineIdentificacao = "codigo" | "referenciaCrm";

/**
 * A referência do CRM só existe depois que o imóvel entrou na carteira da
 * imobiliária. O histórico é a fonte principal, mas status atuais posteriores
 * também provam a captação em dados importados que não trouxeram o histórico.
 * Uma referência preenchida por engano num lead inicial nunca aparece aqui.
 */
export function referenciaCrmDisponivelNoPipeline(imovel: Imovel): string {
  const etapaPermite =
    captacaoGanha(imovel) || imovel.status === "Angariado" || imovel.status === "Publicado";
  return etapaPermite ? (imovel.referenciaCrm || "").trim() : "";
}

/**
 * Identificação exibida conforme a escolha do corretor. O outro identificador
 * é fallback para a linha não ficar anônima — especialmente antes da captação,
 * quando ainda não existe referência do CRM.
 */
export function identificacaoExibidaNoPipeline(
  imovel: Imovel,
  identificacao: PipelineIdentificacao,
): string {
  const codigo = (imovel.codigo || "").trim();
  const referencia = referenciaCrmDisponivelNoPipeline(imovel);
  return identificacao === "referenciaCrm" ? referencia || codigo : codigo || referencia;
}

export type PipelineCol =
  | "bairro" | "tipo" | "origem" | "status" | "captador" | "telefone" | "unidade" | "bloco";

/**
 * Minúsculo e SEM ACENTO — a forma em que "José" e "Jose" finalmente são a
 * mesma coisa para a busca.
 *
 * Só o mecanismo de pesquisa passa por aqui: o cadastro continua guardando e
 * exibindo "Rua José Francisco Pereira". Normalizar o dado gravado seria
 * corromper o endereço para resolver um problema de digitação.
 *
 * A faixa dos diacríticos vai por escape (`̀-ͯ`) e não pelos
 * caracteres em si — eles são invisíveis no editor, e um arquivo salvo noutra
 * codificação os perderia sem ninguém ver, fazendo a busca voltar a
 * diferenciar acento em silêncio. Mesma razão do `normalizarCabecalho` da
 * importação.
 */
export function semAcento(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Os dois estados da coluna Telefone. São rótulo de exibição E valor de
    filtro ao mesmo tempo — a coluna reusa o menu de filtro das outras, e o
    que aparece no cabeçalho tem que ser o que casa na linha. */
export const TELEFONE_COM = "Cadastrado";
export const TELEFONE_SEM = "Sem número";

/** Arrays vazios = coluna sem filtro; valores marcados combinam em OR
    dentro da coluna, e colunas diferentes combinam em AND. */
export type PipelineColFilters = Record<PipelineCol, string[]>;

export function filtrosPipelineVazios(): FiltrosPipeline {
  return { search: "", tipo: "", bairro: "", status: "", responsavel: "", cidade: "" };
}

export function pipelineColFiltersVazios(): PipelineColFilters {
  return { bairro: [], tipo: [], origem: [], status: [], captador: [], telefone: [], unidade: [], bloco: [] };
}

/** Tem número para contatar? É a pergunta que decide se o imóvel dá para
    trabalhar hoje: sem telefone não há WhatsApp, não há follow-up e não há
    lote de disponibilidade — o imóvel ocupa linha e não pode ser tocado. */
export function temTelefone(i: Imovel): boolean {
  return !!(i.proprietarioTelefone || "").trim();
}

// Cada coluna filtrável -> campo no imóvel e rótulo do cabeçalho.
export const PIPELINE_COL_ACCESSOR: Record<PipelineCol, (i: Imovel) => string | null | undefined> = {
  bairro: (i) => i.bairro,
  tipo: (i) => i.tipo,
  origem: (i) => i.origemImovel,
  status: (i) => i.status,
  captador: (i) => i.responsavel,
  // Sempre devolve um dos dois rótulos, nunca vazio: "sem número" é um
  // estado que se filtra, não a ausência de dado que vira "(vazio)".
  telefone: (i) => (temTelefone(i) ? TELEFONE_COM : TELEFONE_SEM),
  /* Apartamento e bloco reusam os campos que já existem no cadastro
     (`unidade`/`bloco`) — não há campo novo aqui. Eles são a identidade do
     imóvel num prédio: sem eles a Lista mostra dezenas de linhas iguais de
     "Rua André Gallo, 101", que é a carteira de quem trabalha com
     apartamento. Vazio cai em `PIPELINE_COL_EMPTY`, e é assim que se filtra
     "o que ainda não tem unidade informada". */
  unidade: (i) => i.unidade,
  bloco: (i) => i.bloco,
};
export const PIPELINE_COL_LABEL: Record<PipelineCol, string> = { bairro: "Bairro", tipo: "Tipo", origem: "Origem", status: "Status", captador: "Captador", telefone: "Telefone", unidade: "Ap.", bloco: "Bloco" };
export const PIPELINE_COL_EMPTY = "(vazio)"; // rótulo exibido para valores em branco (mapeado ao "" real)

export function filtrarImoveis(
  imoveis: Imovel[],
  filters: FiltrosPipeline,
  viewMode: PipelineViewMode,
  colFilters: PipelineColFilters,
): Imovel[] {
  // Os DOIS lados passam por `semAcento`: normalizar só o que o usuário
  // digita não resolve nada — "Jose" continuaria não achando "José".
  const s = semAcento(filters.search || "").trim();
  return imoveis.filter((i) => {
    /* Retirado sai do Pipeline ATIVO e só aparece na própria aba.
       Deixá-lo nas outras duas transformaria a aba num filtro decorativo: a
       carteira continuaria anunciando como em jogo um imóvel que o
       proprietário já tirou — na conta da supervisora, 189 de 640. O
       corte é aqui, e não na tela, para o contador "X de Y", o Kanban e a
       Lista concordarem sem cada um ter que lembrar da regra. */
    if (viewMode === "retirados" ? !i.retirado : !!i.retirado) return false;
    if (filters.tipo && i.tipo !== filters.tipo) return false;
    if (filters.bairro && i.bairro !== filters.bairro) return false;
    if (filters.status && i.status !== filters.status) return false;
    if (filters.responsavel && i.responsavel !== filters.responsavel) return false;
    if (filters.cidade && i.cidade !== filters.cidade) return false;
    // Filtros de coluna (estilo Explorer) só atuam na Lista — no Kanban são
    // ignorados, para não alterar o comportamento existente do quadro.
    if (viewMode !== "kanban" && !matchesPipelineColFilters(i, colFilters)) return false;
    const haystack = semAcento([
      i.codigo, i.proprietarioNome, i.endereco, i.bairro, i.cidade,
      i.proprietarioTelefone, i.tipo, i.unidade, i.bloco, i.edificio,
      referenciaCrmDisponivelNoPipeline(i),
    ].join(" "));
    if (s && !haystack.includes(s)) return false;
    return true;
  });
}

// AND entre colunas, OR dentro de cada coluna. Coluna sem valores marcados não
// filtra nada.
export function matchesPipelineColFilters(i: Imovel, colFilters: PipelineColFilters): boolean {
  for (const col of Object.keys(colFilters) as PipelineCol[]) {
    const selecionados = colFilters[col];
    if (!selecionados.length) continue;
    const valor = (PIPELINE_COL_ACCESSOR[col](i) || "").trim();
    if (!selecionados.includes(valor)) return false;
  }
  return true;
}

// Valores distintos de uma coluna (ordem estável pt-BR). Vazio vira "" — a
// checklist o exibe como "(vazio)".
export function pipelineColDistinct(imoveis: Imovel[], col: PipelineCol): string[] {
  const accessor = PIPELINE_COL_ACCESSOR[col];
  const valores = imoveis.map((i) => (accessor(i) || "").trim());
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Colunas ordenáveis: as filtráveis + as duas identificações (não são filtros
// de coluna; a escolha fica no topo e só muda qual identificação é destacada).
export type PipelineSortKey = PipelineCol | PipelineIdentificacao;

export const PIPELINE_SORT_ACCESSOR: Record<PipelineSortKey, (i: Imovel) => string | null | undefined> = {
  ...PIPELINE_COL_ACCESSOR,
  codigo: (i) => i.codigo,
  referenciaCrm: (i) => identificacaoExibidaNoPipeline(i, "referenciaCrm"),
};

export interface PipelineColSort {
  key: PipelineSortKey | null;
  dir: "asc" | "desc" | null;
}

// Comparação "natural": trata os trechos de dígitos como número, então
// LD-100 vem DEPOIS de LD-99 (na ordem alfabética pura viria logo após
// LD-10, como se o código fosse "10"). Vale para qualquer coluna — códigos,
// bairros e nomes numerados sofrem do mesmo problema.
function compararNatural(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

// Ordena a Lista: por coluna quando há sort ativo; senão, o padrão (mais
// recentes primeiro por data de cadastro). Port de sortPipelineLista().
export function ordenarPipelineLista(imoveis: Imovel[], colSort: PipelineColSort): Imovel[] {
  const arr = imoveis.slice();
  if (colSort.key && PIPELINE_SORT_ACCESSOR[colSort.key]) {
    const accessor = PIPELINE_SORT_ACCESSOR[colSort.key];
    const fator = colSort.dir === "desc" ? -1 : 1;
    return arr.sort((a, b) => fator * compararNatural(accessor(a) || "", accessor(b) || ""));
  }
  return arr.sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
}

export function pipelineUniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
