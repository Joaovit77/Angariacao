import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbAgenda, fromDbImovel, type DbAgendaRow, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import {
  dataAngariadoEfetiva,
  dataLocadoEfetiva,
  dataPublicadoEfetiva,
  diasSemMovimento,
  imoveisAngariadosNoPeriodo,
  isStale,
  marcoDoStatus,
} from "@/lib/calculo/motor";
import { selecionarFollowUp, textoMotivoExclusao } from "@/lib/calculo/followup";
import { kpisDashboard } from "@/lib/calculo/dashboard";
import { addDaysISO, agoraISOString, currentMonthKey, inicioDoDiaOperacionalISO, primeiroDiaDoMes, todayISO, ultimoDiaDoMes } from "@/lib/datas";
import { focoInteligenteDoDia } from "@/lib/calculo/focoDia";
import { conversasDosImoveis } from "@/lib/calculo/conversas";
import type { BlocoAssistente, ContextoAssistente, ItemConversaRespondidaAssistente, ItemHistoricoAssistente, ItemImovelAssistente } from "@/lib/assistente/tipos";
import { resolverReferenciaImovelHistorico, type ReferenciaImovelResolvida } from "@/lib/assistente/referencias";

export const DEFINICOES_FERRAMENTAS = [
  {
    type: "function" as const,
    name: "buscar_imoveis",
    description: "Busca imoveis do usuario por filtros. Use para perguntas sobre carteira, leads e pipeline.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        codigo: { type: ["string", "null"], description: "Codigo visivel do imovel, por exemplo LD-225. Nao e o id interno." },
        status: { type: ["string", "null"] },
        bairro: { type: ["string", "null"] },
        responsavel: { type: ["string", "null"] },
        termo_endereco: { type: ["string", "null"] },
        data_inicio: { type: ["string", "null"], description: "Data inicial de cadastro, ISO YYYY-MM-DD." },
        data_fim: { type: ["string", "null"], description: "Data final de cadastro, ISO YYYY-MM-DD." },
        ordenar_por: { type: ["string", "null"], enum: ["data_cadastro", "codigo", null], description: "Use data_cadastro para mais recentes ou mais antigos." },
        direcao: { type: ["string", "null"], enum: ["asc", "desc", null] },
        limite: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["codigo", "status", "bairro", "responsavel", "termo_endereco", "data_inicio", "data_fim", "ordenar_por", "direcao", "limite"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "contar_imoveis",
    description: "Conta imoveis por filtros sem retornar a carteira. Use sempre que a pergunta pedir quantos imoveis existem.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        codigo: { type: ["string", "null"] },
        status: { type: ["string", "null"] },
        bairro: { type: ["string", "null"] },
        responsavel: { type: ["string", "null"] },
        termo_endereco: { type: ["string", "null"] },
        data_inicio: { type: ["string", "null"], description: "Data inicial de cadastro, ISO YYYY-MM-DD." },
        data_fim: { type: ["string", "null"], description: "Data final de cadastro, ISO YYYY-MM-DD." },
      },
      required: ["codigo", "status", "bairro", "responsavel", "termo_endereco", "data_inicio", "data_fim"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "contar_angariacoes",
    description: "Conta angariacoes efetivamente conquistadas usando a mesma regra de metricas do sistema, sem devolver os imoveis ao modelo.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoje", "mes_atual", "intervalo"] },
        data_inicio: { type: ["string", "null"], description: "Obrigatoria somente para intervalo, ISO YYYY-MM-DD." },
        data_fim: { type: ["string", "null"], description: "Obrigatoria somente para intervalo, ISO YYYY-MM-DD." },
      },
      required: ["periodo", "data_inicio", "data_fim"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "buscar_marcos_imoveis",
    description: "Consulta fatos historicos permanentes, independentemente do status atual. Use para ultima angariacao, ultimo publicado, ultimo locado e contagens por data do acontecimento. Nao use para perguntas sobre quem esta em um status agora.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        marco: { type: "string", enum: ["angariado", "publicado", "locado"] },
        data_inicio: { type: ["string", "null"], description: "Data inicial inclusiva do marco, ISO YYYY-MM-DD." },
        data_fim: { type: ["string", "null"], description: "Data final inclusiva do marco, ISO YYYY-MM-DD." },
        somente_contagem: { type: "boolean", description: "true para perguntas quantitativas; nesse caso nao retorna cards." },
        limite: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["marco", "data_inicio", "data_fim", "somente_contagem", "limite"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "consultar_imovel",
    description: "Consulta detalhes e historico de um imovel por codigo visivel (ex. LD-225) ou id interno. Use codigo para referencias naturais do usuario.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        codigo: { type: ["string", "null"], description: "Codigo visivel exato, por exemplo LD-225." },
        id: { type: ["string", "null"], description: "Id interno somente quando ele veio de outra ferramenta." },
      },
      required: ["codigo", "id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "consultar_entidade_atual",
    description: "Consulta o imovel ou compromisso atualmente aberto no drawer/modal.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "buscar_agenda",
    description: "Busca compromissos da agenda por intervalo e estado de conclusao.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        data_inicio: { type: ["string", "null"], description: "Data ISO YYYY-MM-DD" },
        data_fim: { type: ["string", "null"], description: "Data ISO YYYY-MM-DD" },
        concluido: { type: ["boolean", "null"] },
        limite: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["data_inicio", "data_fim", "concluido", "limite"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "consultar_mensagens_agendadas",
    description: "Consulta somente mensagens programadas. Nao confundir com compromissos da agenda. Pendente significa status agendada; para a proxima, use agendada, somente_futuras=true, ordem=asc e limite=1.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        data_inicio: { type: ["string", "null"], description: "Primeiro dia no fuso operacional, ISO YYYY-MM-DD." },
        data_fim: { type: ["string", "null"], description: "Ultimo dia inclusivo no fuso operacional, ISO YYYY-MM-DD." },
        status: { type: ["string", "null"], enum: ["agendada", "processando", "enviada", "erro", "cancelada", null] },
        somente_futuras: { type: "boolean" },
        ordem: { type: "string", enum: ["asc", "desc"] },
        limite: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["data_inicio", "data_fim", "status", "somente_futuras", "ordem", "limite"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "buscar_followups",
    description: "Consulta follow-ups segundo as regras atuais. Use referencia para um codigo explicito ou imovel inequivocamente resolvido na conversa; entidade_atual para o imovel visual aberto; global somente para perguntas da carteira.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        escopo: { type: "string", enum: ["global", "entidade_atual", "referencia"] },
        limite: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["escopo", "limite"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "buscar_conversas_respondidas",
    description: "Identifica proprietarios que responderam e suas conversas em andamento. Use para saber quem respondeu, quem aguarda retorno do corretor e qual foi a ultima resposta recebida. Nao gera nem envia mensagem.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        somente_aguardando_corretor: { type: "boolean", description: "true quando o usuario pedir apenas conversas em que a ultima fala foi do proprietario." },
        limite: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["somente_aguardando_corretor", "limite"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "buscar_estagnados",
    description: "Lista imoveis estagnados segundo os limiares e status do sistema. Use limite=1 para perguntas globais superlativas como 'Qual imovel esta ha mais tempo sem contato?'; essa pergunta nao exige codigo nem referencia conversacional.",
    strict: true,
    parameters: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 20 } }, required: ["limite"], additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "consultar_foco_do_dia",
    description: "Retorna a fila oficial de prioridades do sistema, na ordem exata do painel Quem esta quente agora, com motivos calculados pelo motor.",
    strict: true,
    parameters: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 20 } }, required: ["limite"], additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "obter_metricas",
    description: "Calcula os principais indicadores atuais da carteira do usuario.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
] as const;

interface ResultadoFerramenta {
  dados: unknown;
  bloco?: BlocoAssistente;
}

type Args = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const limite = (v: unknown) => Math.max(1, Math.min(20, Number.isInteger(v) ? Number(v) : 10));
const padraoIlike = (v: string) => `%${v.replace(/[%_]/g, "")}%`;

export function resolverEscopoFollowUp(
  solicitado: unknown,
  contexto: ContextoAssistente,
  pergunta: string,
): "global" | "entidade_atual" {
  const temImovelAtivo = (contexto.superficie === "drawer" || contexto.superficie === "modal") && contexto.entidade?.tipo === "imovel";
  if (!temImovelAtivo) return "global";
  const textoPergunta = pergunta.trim().toLocaleLowerCase("pt-BR");
  const explicitamenteGlobal = /\b(carteira|global|globais|todos|todas)\b/.test(textoPergunta)
    || /\b(quais|liste|listar|mostre|mostrar)\b.*\bfollow[ -]?ups?\b/.test(textoPergunta)
    || /\bfollow[ -]?ups?\b.*\b(hoje|semana|mes|mês)\b/.test(textoPergunta);
  if (explicitamenteGlobal) return "global";
  if (pergunta.trim()) return "entidade_atual";
  return solicitado === "entidade_atual" ? "entidade_atual" : "global";
}

type AlvoFollowUp =
  | { tipo: "global" }
  | { tipo: "entidade_atual" }
  | { tipo: "referencia"; referencia: Extract<ReferenciaImovelResolvida, { estado: "resolvida" }> }
  | { tipo: "referencia_ambigua"; candidatos: Array<{ id: string; codigo: string }> };

function perguntaGlobalFollowUp(pergunta: string): boolean {
  const valor = pergunta.trim().toLocaleLowerCase("pt-BR");
  return /\b(carteira|global|globais|todos|todas|eleg[ií]ve(?:l|is))\b/.test(valor)
    || /\b(quais|liste|listar|mostre|mostrar|quantos?|total)\b.*\bfollow[ -]?ups?\b/.test(valor)
    || /\bfollow[ -]?ups?\b.*\b(hoje|semana|mes|mês)\b/.test(valor);
}

function perguntaReferenciaSingular(pergunta: string): boolean {
  return /\b(ele|ela|dele|dela|desse|dessa|este|esta|esse|essa|aquele|aquela|im[oó]vel|propriet[aá]ri[oa]|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa])\b/i.test(pergunta);
}

export function resolverAlvoFollowUp(
  solicitado: unknown,
  contexto: ContextoAssistente,
  pergunta: string,
  referencia: ReferenciaImovelResolvida,
): AlvoFollowUp {
  if (referencia.estado === "resolvida" && referencia.origem === "explicita") {
    return { tipo: "referencia", referencia };
  }
  if (perguntaGlobalFollowUp(pergunta)) return { tipo: "global" };

  const temImovelAtivo = (contexto.superficie === "drawer" || contexto.superficie === "modal") && contexto.entidade?.tipo === "imovel";
  if (temImovelAtivo && (solicitado === "entidade_atual" || perguntaReferenciaSingular(pergunta))) {
    return { tipo: "entidade_atual" };
  }
  if (referencia.estado === "resolvida") return { tipo: "referencia", referencia };
  if (referencia.estado === "ambigua") return { tipo: "referencia_ambigua", candidatos: referencia.candidatos };
  if (solicitado === "referencia" || perguntaReferenciaSingular(pergunta)) return { tipo: "referencia_ambigua", candidatos: [] };
  return { tipo: "global" };
}

export function intencaoGlobalFollowUp(pergunta: string): "quantidade_hoje" | "fila_hoje" | "elegiveis" {
  const valor = pergunta.trim().toLocaleLowerCase("pt-BR");
  if (/\b(quantos?|quantidade|total)\b/.test(valor)) return "quantidade_hoje";
  if (/\beleg[ií]ve(?:l|is)\b/.test(valor)) return "elegiveis";
  return "fila_hoje";
}

export function limiteConformeIntencao(
  pergunta: string,
  solicitado: unknown,
  tipo: "imoveis" | "marcos" | "agenda" | "mensagens" | "estagnados" | "foco",
): number {
  const informado = pergunta.match(/\b([1-9]|1\d|20)\b/)?.[1];
  if (informado) return Math.min(limite(solicitado), Number(informado));
  const valor = pergunta.toLocaleLowerCase("pt-BR");
  const singular = tipo === "agenda"
    ? /\b(pr[oó]ximo|primeiro)\b.*\b(compromisso|agenda)\b|\bqual\b.*\bcompromisso\b/.test(valor)
      : tipo === "marcos"
        ? /\b([uú]ltim[ao]|mais recent[ei])\b/.test(valor)
      : tipo === "mensagens"
      ? /\b(pr[oó]xim[ao]|primeir[ao])\b.*\bmensagem\b|\bqual\b.*\bmensagem\b/.test(valor)
      : tipo === "estagnados"
        ? /\bqual\b.*\bim[oó]vel\b|\bmais tempo sem (contato|movimento)\b/.test(valor)
        : tipo === "foco"
          ? /\b(primeir[oa]|agora)\b/.test(valor) && /\b(quem|qual)\b/.test(valor)
          : /\bqual\b.*\b(mais recente|mais antigo)\b/.test(valor);
  return singular ? 1 : limite(solicitado);
}

function limiteDeMarcoComContexto(
  pergunta: string,
  solicitado: unknown,
  historico: ItemHistoricoAssistente[],
): number {
  const direto = limiteConformeIntencao(pergunta, solicitado, "marcos");
  if (direto === 1) return 1;
  const elipse = /^\s*e\b/i.test(pergunta);
  const perguntaAnterior = [...historico].reverse().find((item) => item.papel === "usuario")?.texto || "";
  return elipse && /\b([uú]ltim[ao]|mais recent[ei])\b/i.test(perguntaAnterior) ? 1 : direto;
}

/** Codigo humano curto, nao uma expressao livre do PostgREST. */
export function normalizarCodigoImovel(v: unknown): string | null {
  const valor = texto(v)?.toUpperCase();
  return valor && /^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(valor) ? valor : null;
}

function itemImovel(row: DbImovelRow): ItemImovelAssistente {
  const imovel = fromDbImovel(row);
  return {
    id: imovel.id,
    codigo: imovel.codigo || "Sem codigo",
    endereco: imovel.endereco,
    bairro: imovel.bairro || "",
    status: imovel.status,
    responsavel: imovel.responsavel || "",
    diasSemMovimento: diasSemMovimento(imovel),
  };
}

type MarcoImovel = "angariado" | "publicado" | "locado";

const STATUS_DO_MARCO: Record<MarcoImovel, string> = {
  angariado: "Angariado",
  publicado: "Publicado",
  locado: "Locado",
};

function marcoValido(valor: unknown): MarcoImovel | null {
  return valor === "angariado" || valor === "publicado" || valor === "locado" ? valor : null;
}

function dadosDoMarco(row: DbImovelRow, marco: MarcoImovel) {
  const imovel = fromDbImovel(row);
  const status = STATUS_DO_MARCO[marco];
  const entrada = marcoDoStatus(imovel, status);
  const data = marco === "angariado"
    ? dataAngariadoEfetiva(imovel)
    : marco === "publicado"
      ? dataPublicadoEfetiva(imovel)
      : dataLocadoEfetiva(imovel);
  return {
    data,
    userId: entrada?.userId || null,
    authorName: entrada?.authorName || null,
    source: entrada?.source || null,
  };
}

async function todosImoveis(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.from("imoveis").select("*").eq("user_id", userId);
  if (error) throw new Error(`Falha ao consultar imoveis: ${error.message}`);
  return (data || []) as DbImovelRow[];
}

async function detalharImovel(row: DbImovelRow, supabase: SupabaseClient, userId: string): Promise<ResultadoFerramenta> {
  const imovel = fromDbImovel(row);
  const itensHistorico = [
    ...(imovel.statusHistory || []).map((x) => ({ data: x.date, tipo: "Status", texto: x.status })),
    ...(imovel.notas || []).map((x) => ({ data: x.data, tipo: "Nota", texto: x.texto })),
    ...(imovel.tentativas || []).map((x) => ({ data: x.data, tipo: "Tentativa", texto: [x.canal, x.resultado, x.observacao].filter(Boolean).join(" - ") })),
  ].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12);
  const contatos = [
    ...(imovel.notas || []).map((x) => x.data),
    ...(imovel.tentativas || []).map((x) => x.data),
  ].filter(Boolean).sort((a, b) => b.localeCompare(a));
  const carteira = (await todosImoveis(supabase, userId)).map(fromDbImovel);
  const followups = selecionarFollowUp(carteira, todayISO());
  return {
    dados: {
      ...itemImovel(row),
      proprietario: imovel.proprietarioNome || null,
      ultimoContato: contatos[0] || null,
      followUpPendente: followups.elegiveis.some((item) => item.id === imovel.id),
      historico: itensHistorico,
    },
    bloco: { tipo: "historico", titulo: `Historico de ${imovel.codigo || imovel.endereco}`, itens: itensHistorico },
  };
}

export async function executarFerramenta(
  nome: string,
  args: Args,
  supabase: SupabaseClient,
  userId: string,
  contexto: ContextoAssistente,
  perguntaUsuario = "",
  historico: ItemHistoricoAssistente[] = [],
): Promise<ResultadoFerramenta> {
  if (nome === "buscar_imoveis") {
    let q = supabase.from("imoveis").select("*", { count: "exact" }).eq("user_id", userId);
    const codigo = normalizarCodigoImovel(args.codigo);
    const status = texto(args.status);
    const bairro = texto(args.bairro);
    const responsavel = texto(args.responsavel);
    const termo = texto(args.termo_endereco);
    const dataInicio = texto(args.data_inicio);
    const dataFim = texto(args.data_fim);
    if (codigo) q = q.ilike("codigo", codigo);
    if (status) q = q.eq("status", status);
    if (bairro) q = q.ilike("bairro", padraoIlike(bairro));
    if (responsavel) q = q.ilike("responsavel", padraoIlike(responsavel));
    if (termo) q = q.ilike("endereco", padraoIlike(termo));
    if (dataInicio) q = q.gte("data_angariacao", dataInicio);
    if (dataFim) q = q.lte("data_angariacao", dataFim);
    const colunaOrdenacao = args.ordenar_por === "codigo" ? "codigo" : "data_angariacao";
    q = q.order(colunaOrdenacao, { ascending: args.direcao === "asc", nullsFirst: false });
    const { data, error, count } = await q.limit(limiteConformeIntencao(perguntaUsuario, args.limite, "imoveis"));
    if (error) throw new Error(`Falha ao buscar imoveis: ${error.message}`);
    const itens = ((data || []) as DbImovelRow[]).map(itemImovel);
    return {
      dados: { totalEncontrado: count ?? itens.length, itensRetornados: itens.length, itens },
      bloco: { tipo: "imoveis", titulo: "Imoveis encontrados", itens },
    };
  }

  if (nome === "contar_imoveis") {
    let q = supabase.from("imoveis").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const codigo = normalizarCodigoImovel(args.codigo);
    const status = texto(args.status);
    const bairro = texto(args.bairro);
    const responsavel = texto(args.responsavel);
    const termo = texto(args.termo_endereco);
    const dataInicio = texto(args.data_inicio);
    const dataFim = texto(args.data_fim);
    if (codigo) q = q.ilike("codigo", codigo);
    if (status) q = q.eq("status", status);
    if (bairro) q = q.ilike("bairro", padraoIlike(bairro));
    if (responsavel) q = q.ilike("responsavel", padraoIlike(responsavel));
    if (termo) q = q.ilike("endereco", padraoIlike(termo));
    if (dataInicio) q = q.gte("data_angariacao", dataInicio);
    if (dataFim) q = q.lte("data_angariacao", dataFim);
    const { error, count } = await q;
    if (error) throw new Error(`Falha ao contar imoveis: ${error.message}`);
    return { dados: { totalEncontrado: count ?? 0, itensRetornados: 0 } };
  }

  if (nome === "contar_angariacoes") {
    const hoje = todayISO();
    const mesAtual = currentMonthKey();
    const inicioInformado = texto(args.data_inicio);
    const fimInformado = texto(args.data_fim);
    const inicio = args.periodo === "hoje" ? hoje : args.periodo === "mes_atual" ? primeiroDiaDoMes(mesAtual) : inicioInformado;
    const fim = args.periodo === "hoje" ? hoje : args.periodo === "mes_atual" ? ultimoDiaDoMes(mesAtual) : fimInformado;
    if (!inicio || !fim) return { dados: { totalEncontrado: 0, itensRetornados: 0, erro: "Intervalo de datas invalido." } };
    const totalEncontrado = imoveisAngariadosNoPeriodo((await todosImoveis(supabase, userId)).map(fromDbImovel), inicio, fim).length;
    return { dados: { totalEncontrado, itensRetornados: 0, dataInicio: inicio, dataFim: fim } };
  }

  if (nome === "buscar_marcos_imoveis") {
    const marco = marcoValido(args.marco);
    if (!marco) {
      return { dados: { totalEncontrado: 0, itensRetornados: 0, itens: [], erro: "Marco historico invalido." } };
    }
    const inicio = texto(args.data_inicio);
    const fim = texto(args.data_fim);
    const encontrados = (await todosImoveis(supabase, userId))
      .map((row) => ({ row, marco: dadosDoMarco(row, marco) }))
      .filter((item) => item.marco.data != null)
      .filter((item) => !inicio || item.marco.data! >= inicio)
      .filter((item) => !fim || item.marco.data! <= fim)
      .sort((a, b) => {
        const porData = b.marco.data!.localeCompare(a.marco.data!);
        return porData || String(a.row.codigo || a.row.id).localeCompare(String(b.row.codigo || b.row.id));
      });
    const perguntaQuantitativa = /\b(quantos?|quantidade|total)\b/i.test(perguntaUsuario);
    const semCards = args.somente_contagem === true || perguntaQuantitativa;
    const selecionados = semCards
      ? []
      : encontrados.slice(0, limiteDeMarcoComContexto(perguntaUsuario, args.limite, historico));
    const itens = selecionados.map(({ row, marco: fato }) => ({
      ...itemImovel(row),
      marco,
      marcoEm: fato.data,
      marcoPorUserId: fato.userId,
      marcoPorNome: fato.authorName,
      fonteMarco: fato.source,
    }));
    return {
      dados: {
        marco,
        totalEncontrado: encontrados.length,
        itensRetornados: itens.length,
        dataInicio: inicio,
        dataFim: fim,
        itens,
      },
      bloco: itens.length ? {
        tipo: "imoveis",
        titulo: marco === "angariado" ? "Angariacoes" : marco === "publicado" ? "Publicacoes" : "Locacoes",
        itens,
      } : undefined,
    };
  }

  if (nome === "consultar_imovel") {
    const codigo = normalizarCodigoImovel(args.codigo);
    const id = texto(args.id);
    if (!codigo && !id) return { dados: { encontrado: false, motivo: "Informe um codigo ou id valido." } };
    let q = supabase.from("imoveis").select("*").eq("user_id", userId);
    if (codigo) q = q.ilike("codigo", codigo);
    if (id) q = q.eq("id", id);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(`Falha ao consultar imovel: ${error.message}`);
    if (!data) return { dados: { encontrado: false } };
    return detalharImovel(data as DbImovelRow, supabase, userId);
  }

  if (nome === "consultar_entidade_atual") {
    if (!contexto.entidade) return { dados: { encontrado: false, motivo: "Nenhuma entidade esta aberta." } };
    if (contexto.entidade.tipo === "agenda") {
      const { data, error } = await supabase.from("agenda").select("id,title,type,date,hora,done,imovel_id").eq("user_id", userId).eq("id", contexto.entidade.id).maybeSingle();
      if (error) throw new Error(`Falha ao consultar agenda: ${error.message}`);
      const itens = data ? [{ id: data.id, titulo: data.title, tipo: data.type, data: data.date, hora: data.hora || "", concluido: !!data.done, imovelId: data.imovel_id }] : [];
      return { dados: itens[0] || null, bloco: { tipo: "agenda", titulo: "Compromisso aberto", itens } };
    }
    const { data, error } = await supabase.from("imoveis").select("*").eq("user_id", userId).eq("id", contexto.entidade.id).maybeSingle();
    if (error) throw new Error(`Falha ao consultar imovel: ${error.message}`);
    if (!data) return { dados: null };
    return detalharImovel(data as DbImovelRow, supabase, userId);
  }

  if (nome === "buscar_agenda") {
    let q = supabase.from("agenda").select("id,title,type,date,hora,done,imovel_id").eq("user_id", userId).order("date", { ascending: true });
    const inicio = texto(args.data_inicio);
    const fim = texto(args.data_fim);
    if (inicio) q = q.gte("date", inicio);
    if (fim) q = q.lte("date", fim);
    if (typeof args.concluido === "boolean") q = q.eq("done", args.concluido);
    const { data, error } = await q.limit(limiteConformeIntencao(perguntaUsuario, args.limite, "agenda"));
    if (error) throw new Error(`Falha ao buscar agenda: ${error.message}`);
    const itens = (data || []).map((x) => ({ id: x.id, titulo: x.title, tipo: x.type, data: x.date, hora: x.hora || "", concluido: !!x.done, imovelId: x.imovel_id }));
    return { dados: itens, bloco: { tipo: "agenda", titulo: "Agenda", itens } };
  }

  if (nome === "consultar_mensagens_agendadas") {
    let q = supabase
      .from("mensagens_agendadas")
      .select("id,imovel_id,nome_proprietario,mensagem,data_envio,status", { count: "exact" })
      .eq("user_id", userId);
    const dataInicio = texto(args.data_inicio);
    const dataFim = texto(args.data_fim);
    const inicio = dataInicio ? inicioDoDiaOperacionalISO(dataInicio) : null;
    const diaDepoisDoFim = dataFim ? addDaysISO(dataFim, 1) : null;
    const fimExclusivo = diaDepoisDoFim ? inicioDoDiaOperacionalISO(diaDepoisDoFim) : null;
    const status = texto(args.status);
    if ((dataInicio && !inicio) || (dataFim && !fimExclusivo)) {
      return { dados: { totalEncontrado: 0, itensRetornados: 0, itens: [], erro: "Intervalo de datas invalido." } };
    }
    if (status && !["agendada", "processando", "enviada", "erro", "cancelada"].includes(status)) {
      return { dados: { totalEncontrado: 0, itensRetornados: 0, itens: [], erro: "Status de mensagem invalido." } };
    }
    if (inicio) q = q.gte("data_envio", inicio);
    if (fimExclusivo) q = q.lt("data_envio", fimExclusivo);
    if (status) q = q.eq("status", status);
    if (args.somente_futuras === true) q = q.gte("data_envio", agoraISOString());
    q = q.order("data_envio", { ascending: args.ordem !== "desc" });
    const { data, error, count } = await q.limit(limiteConformeIntencao(perguntaUsuario, args.limite, "mensagens"));
    if (error) throw new Error(`Falha ao consultar mensagens agendadas: ${error.message}`);
    const itens = (data || []).map((item) => ({
      id: item.id,
      imovelId: item.imovel_id,
      nomeProprietario: item.nome_proprietario || "Proprietario nao informado",
      resumoMensagem: String(item.mensagem || "").trim().slice(0, 160),
      dataEnvio: item.data_envio,
      status: item.status,
    }));
    return {
      dados: { totalEncontrado: count ?? itens.length, itensRetornados: itens.length, itens },
      bloco: itens.length ? { tipo: "mensagens_agendadas", titulo: "Mensagens agendadas", itens } : undefined,
    };
  }

  if (nome === "buscar_followups") {
    const referencia = resolverReferenciaImovelHistorico(perguntaUsuario, historico);
    const alvo = resolverAlvoFollowUp(args.escopo, contexto, perguntaUsuario, referencia);
    if (alvo.tipo === "referencia_ambigua") {
      return {
        dados: {
          escopo: "referencia",
          encontrado: false,
          referenciaAmbigua: true,
          candidatos: alvo.candidatos.map((item) => item.codigo),
          motivo: "Nao foi possivel determinar com seguranca qual imovel foi referido. Peca o codigo ao usuario.",
        },
      };
    }
    if (alvo.tipo === "entidade_atual" || alvo.tipo === "referencia") {
      const escopo = alvo.tipo === "entidade_atual" ? "entidade_atual" : "referencia";
      if (contexto.superficie !== "drawer" && contexto.superficie !== "modal") {
        if (alvo.tipo === "entidade_atual") {
          return { dados: { escopo, encontrado: false, motivo: "Nenhum imovel esta aberto." } };
        }
      }
      if (alvo.tipo === "entidade_atual" && contexto.entidade?.tipo !== "imovel") {
        return { dados: { escopo, encontrado: false, motivo: "A entidade aberta nao e um imovel." } };
      }
      let consulta = supabase.from("imoveis").select("*").eq("user_id", userId);
      if (alvo.tipo === "entidade_atual") consulta = consulta.eq("id", contexto.entidade!.id);
      else if (alvo.referencia.id) consulta = consulta.eq("id", alvo.referencia.id);
      else consulta = consulta.ilike("codigo", alvo.referencia.codigo);
      const { data, error } = await consulta.maybeSingle();
      if (error) throw new Error(`Falha ao consultar follow-up do imovel: ${error.message}`);
      if (!data) return { dados: { escopo, encontrado: false } };
      const rows = await todosImoveis(supabase, userId);
      const selecao = selecionarFollowUp(rows.map(fromDbImovel), todayISO());
      const imovel = fromDbImovel(data as DbImovelRow);
      const elegivel = selecao.elegiveis.some((item) => item.id === imovel.id);
      const exclusao = selecao.excluidos.find((item) => item.imovel.id === imovel.id);
      return {
        dados: {
          escopo,
          encontrado: true,
          followUpPendente: elegivel,
          item: itemImovel(data as DbImovelRow),
          motivo: elegivel ? selecao.sinais[imovel.id] || "Imovel elegivel conforme a cadencia de follow-up." : exclusao ? textoMotivoExclusao(exclusao.motivo) : "O status atual nao entra na fila de follow-up.",
          detalhe: exclusao?.detalhe || null,
        },
      };
    }
    const rows = await todosImoveis(supabase, userId);
    const selecao = selecionarFollowUp(rows.map(fromDbImovel), todayISO());
    const rowsPorId = new Map(rows.map((row) => [row.id, row]));
    const intencao = intencaoGlobalFollowUp(perguntaUsuario);
    const totalElegiveis = selecao.elegiveis.length;
    const totalFilaHoje = Math.min(totalElegiveis, selecao.limite);
    const limiteExibicao = intencao === "quantidade_hoje"
      ? 0
      : intencao === "fila_hoje"
        ? Math.min(totalFilaHoje, limite(args.limite))
        : limite(args.limite);
    const itens = selecao.elegiveis.slice(0, limiteExibicao).flatMap((imovel) => {
      const row = rowsPorId.get(imovel.id);
      return row ? [itemImovel(row)] : [];
    });
    return {
      dados: {
        escopo: "global",
        intencao,
        totalElegiveis,
        totalEncontrado: totalElegiveis,
        limiteHoje: selecao.limite,
        totalFilaHoje,
        itensRetornados: itens.length,
        itens,
      },
      bloco: itens.length ? {
        tipo: "imoveis",
        titulo: intencao === "elegiveis" ? "Imoveis elegiveis para follow-up" : "Fila de follow-up de hoje",
        itens,
      } : undefined,
    };
  }

  if (nome === "buscar_conversas_respondidas") {
    const conversas = conversasDosImoveis(
      (await todosImoveis(supabase, userId)).map(fromDbImovel),
      todayISO(),
    ).filter((conversa) => conversa.emAndamento);
    const aguardando = args.somente_aguardando_corretor === true;
    const candidatas = aguardando
      ? conversas.filter((conversa) => conversa.ultima.direcao === "recebida")
      : conversas;
    const itens: ItemConversaRespondidaAssistente[] = candidatas
      .slice(0, limite(args.limite))
      .flatMap((conversa) => {
        const ultimaResposta = [...conversa.mensagens]
          .reverse()
          .find((mensagem) => mensagem.direcao === "recebida");
        if (!ultimaResposta) return [];
        return [{
          imovelId: conversa.imovel.id,
          codigo: conversa.imovel.codigo || "Sem código",
          proprietario: conversa.imovel.proprietarioNome || "Proprietário não informado",
          status: conversa.imovel.status,
          ultimaResposta: ultimaResposta.texto.trim().slice(0, 200) || "Conteúdo sem texto",
          ultimaRespostaEm: ultimaResposta.data,
          aguardandoCorretor: conversa.ultima.direcao === "recebida",
          naoLidas: conversa.naoLidas,
          rascunhoDisponivel: !ultimaResposta.soMidia && !!ultimaResposta.texto.trim(),
        }];
      });
    return {
      dados: {
        totalEncontrado: candidatas.length,
        itensRetornados: itens.length,
        somenteAguardandoCorretor: aguardando,
        itens,
      },
      bloco: itens.length ? {
        tipo: "conversas_respondidas",
        titulo: aguardando ? "Proprietários aguardando sua resposta" : "Proprietários que responderam",
        itens,
      } : undefined,
    };
  }

  if (nome === "buscar_estagnados") {
    const itens = (await todosImoveis(supabase, userId)).filter((x) => isStale(fromDbImovel(x))).map(itemImovel).sort((a, b) => (b.diasSemMovimento || 0) - (a.diasSemMovimento || 0)).slice(0, limiteConformeIntencao(perguntaUsuario, args.limite, "estagnados"));
    return { dados: itens, bloco: { tipo: "imoveis", titulo: "Imoveis estagnados", itens } };
  }

  if (nome === "consultar_foco_do_dia") {
    const [rows, agendaResultado, configResultado] = await Promise.all([
      todosImoveis(supabase, userId),
      supabase.from("agenda").select("*").eq("user_id", userId),
      supabase.from("user_config").select("origens_extras").eq("user_id", userId).maybeSingle(),
    ]);
    if (agendaResultado.error) throw new Error(`Falha ao consultar agenda para o foco: ${agendaResultado.error.message}`);
    if (configResultado.error) throw new Error(`Falha ao consultar configuracao para o foco: ${configResultado.error.message}`);
    const origensExtras = Array.isArray(configResultado.data?.origens_extras)
      ? configResultado.data.origens_extras.filter((origem): origem is string => typeof origem === "string" && origem.trim() !== "")
      : [];
    const foco = focoInteligenteDoDia(
      rows.map(fromDbImovel),
      ((agendaResultado.data || []) as DbAgendaRow[]).map(fromDbAgenda),
      origensExtras,
      todayISO(),
    );
    const acoes = foco.acoes.slice(0, limiteConformeIntencao(perguntaUsuario, args.limite, "foco"));
    return {
      dados: {
        totalEncontrado: foco.totalAcoes,
        itensRetornados: acoes.length,
        respostasPendentes: foco.respostasPendentes,
        compromissosVencidos: foco.compromissosVencidos,
        compromissosHoje: foco.compromissosHoje,
        imoveisParados: foco.imoveisParados,
        acoes,
      },
    };
  }

  if (nome === "obter_metricas") {
    const rows = await todosImoveis(supabase, userId);
    const { data: config, error } = await supabase.from("user_config").select("comissao_percent").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`Falha ao consultar configuracao: ${error.message}`);
    const kpis = kpisDashboard(rows.map(fromDbImovel), Number(config?.comissao_percent) || 0);
    const itens = [
      { rotulo: "Contatos no mes", valor: String(kpis.contatosThisMonth) },
      { rotulo: "Angariacoes no mes", valor: String(kpis.angariacoesThisMonth) },
      { rotulo: "Locados no mes", valor: String(kpis.locadosThisMonth) },
      { rotulo: "Em andamento", valor: String(kpis.emAndamento) },
    ];
    return { dados: { ...kpis, overall: undefined }, bloco: { tipo: "metricas", titulo: "Indicadores da carteira", itens } };
  }

  throw new Error(`Ferramenta desconhecida: ${nome}`);
}
