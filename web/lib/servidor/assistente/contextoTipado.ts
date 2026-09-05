import type { SupabaseClient } from "@supabase/supabase-js";
import { agoraISOComHora, addDaysISO, todayISO } from "@/lib/datas";
import type { NotaImovel, StatusHistoryEntry, Tentativa } from "@/lib/tipos";
import type { DbAgendaRow, DbImovelRow } from "@/lib/persistencia/mapeadores";
import {
  selecionarContextoAssistente,
  type BlocoContextoAssistente,
  type ContextoTipadoAssistente,
  type DadosContextoAgendaAssistente,
  type DadosContextoImovelAssistente,
  type DadosContextoPipelineAssistente,
  type DadosContextoProtocolosAssistente,
  type MovimentacaoContextoAssistente,
  type TipoBlocoContextoAssistente,
} from "@/lib/assistente/contextoTipado";
import type { PedidoAssistente } from "@/lib/assistente/tipos";
import {
  carregarCatalogoProtocolosAssistente,
  type CatalogoProtocolosAssistente,
} from "./protocolos";

const COLUNAS_IMOVEL_CONTEXTO = [
  "id", "user_id", "codigo", "referencia_crm", "endereco", "bairro", "cidade", "estado",
  "unidade", "bloco", "edificio", "tipo", "proprietario_nome", "forma_abordagem",
  "origem_imovel", "data_angariacao", "responsavel", "status", "status_history", "notas",
  "tentativas", "pausado_ate", "importado", "retirado", "updated_at",
].join(",");

const COLUNAS_AGENDA_CONTEXTO = "id,user_id,title,type,date,hora,done,imovel_id,origin,updated_at";

export interface ContextoTipadoCarregadoAssistente {
  contexto: ContextoTipadoAssistente;
  catalogoProtocolos: CatalogoProtocolosAssistente;
  duracaoMs: number;
  consultasExecutadas: number;
  consultasReutilizadas: number;
}

interface ContadorConsultasContexto {
  executadas: number;
  reutilizadas: number;
}

function textoOuNull(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function codigoExplicito(mensagem: string): string | null {
  const encontrado = mensagem.match(/\b[A-Z]{1,6}-\d{1,10}\b/i)?.[0];
  return encontrado ? encontrado.toUpperCase() : null;
}

function maiorMovimentacao(row: Partial<DbImovelRow>): MovimentacaoContextoAssistente | null {
  const status = Array.isArray(row.status_history) ? row.status_history as StatusHistoryEntry[] : [];
  const notas = Array.isArray(row.notas) ? row.notas as NotaImovel[] : [];
  const tentativas = Array.isArray(row.tentativas) ? row.tentativas as Tentativa[] : [];
  const movimentos: MovimentacaoContextoAssistente[] = [
    ...status.flatMap((item) => item.date ? [{
      em: item.date,
      categoria: "status" as const,
      fonte: `status_history:${item.source || "legado"}`,
    }] : []),
    ...notas.flatMap((item) => item.data ? [{
      em: item.data,
      categoria: "nota" as const,
      fonte: `notas:${item.origem || "legado"}`,
    }] : []),
    ...tentativas.flatMap((item) => item.data ? [{
      em: item.data,
      categoria: "tentativa" as const,
      fonte: `tentativas:${item.origem || "legado"}`,
    }] : []),
  ];
  return movimentos.sort((a, b) => b.em.localeCompare(a.em))[0] || null;
}

function blocoAusente<Tipo extends TipoBlocoContextoAssistente, Dados>(
  tipo: Tipo,
  fonte: string,
  autoridade: BlocoContextoAssistente<Tipo, Dados>["autoridade"],
  temporalidade: BlocoContextoAssistente<Tipo, Dados>["temporalidade"],
  motivoAusencia: string,
): BlocoContextoAssistente<Tipo, Dados> {
  return {
    tipo,
    estado: "ausente",
    fonte,
    autoridade,
    temporalidade,
    observadoEm: null,
    dados: null,
    motivoAusencia,
  };
}

async function carregarImovel(
  supabase: SupabaseClient,
  userId: string,
  pedido: PedidoAssistente,
  contador: ContadorConsultasContexto,
): Promise<BlocoContextoAssistente<"imovel", DadosContextoImovelAssistente>> {
  const idVisual = pedido.contexto.entidade?.tipo === "imovel"
    && (pedido.contexto.superficie === "drawer" || pedido.contexto.superficie === "modal")
    ? pedido.contexto.entidade.id
    : null;
  const codigo = codigoExplicito(pedido.mensagem);
  if (!idVisual && !codigo) {
    return blocoAusente("imovel", "imoveis", "dado_estruturado_atual", "atual", "imovel_nao_identificado");
  }

  let consulta = supabase
    .from("imoveis")
    .select(COLUNAS_IMOVEL_CONTEXTO)
    .eq("user_id", userId);
  consulta = idVisual ? consulta.eq("id", idVisual) : consulta.ilike("codigo", codigo!);
  contador.executadas += 1;
  const { data, error } = await consulta.maybeSingle();
  if (error) throw new Error(`Falha ao carregar contexto do imóvel: ${error.message}`);
  if (!data) {
    return blocoAusente("imovel", "imoveis", "dado_estruturado_atual", "atual", "imovel_ausente_no_escopo_do_usuario");
  }

  const row = data as unknown as Partial<DbImovelRow> & Pick<DbImovelRow, "id" | "endereco" | "status">;
  const ultimaMovimentacao = maiorMovimentacao(row);
  return {
    tipo: "imovel",
    estado: "disponivel",
    fonte: "imoveis",
    autoridade: "dado_estruturado_atual",
    temporalidade: "atual",
    observadoEm: textoOuNull(row.updated_at) || ultimaMovimentacao?.em || null,
    dados: {
      idInterno: row.id,
      codigo: textoOuNull(row.codigo),
      referenciaCrm: textoOuNull(row.referencia_crm),
      endereco: row.endereco,
      bairro: textoOuNull(row.bairro),
      cidade: textoOuNull(row.cidade),
      estado: textoOuNull(row.estado),
      unidade: textoOuNull(row.unidade),
      bloco: textoOuNull(row.bloco),
      edificio: textoOuNull(row.edificio),
      tipoImovel: textoOuNull(row.tipo),
      statusAtual: row.status,
      proprietarioNome: textoOuNull(row.proprietario_nome),
      responsavel: textoOuNull(row.responsavel),
      origemImovel: textoOuNull(row.origem_imovel),
      dataCadastro: textoOuNull(row.data_angariacao),
      ultimaMovimentacao,
    },
  };
}

function periodoAgenda(mensagem: string): { inicio: string; fim: string | null } {
  const normalizada = mensagem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const hoje = todayISO();
  if (/\bamanha\b/.test(normalizada)) {
    const amanha = addDaysISO(hoje, 1) || hoje;
    return { inicio: amanha, fim: amanha };
  }
  if (/\bhoje\b/.test(normalizada)) return { inicio: hoje, fim: hoje };
  return { inicio: hoje, fim: null };
}

async function carregarAgenda(
  supabase: SupabaseClient,
  userId: string,
  pedido: PedidoAssistente,
  contador: ContadorConsultasContexto,
  imovel?: BlocoContextoAssistente<"imovel", DadosContextoImovelAssistente>,
): Promise<BlocoContextoAssistente<"agenda", DadosContextoAgendaAssistente>> {
  const entidadeAgenda = pedido.contexto.entidade?.tipo === "agenda"
    && pedido.contexto.superficie !== "pagina"
    ? pedido.contexto.entidade.id
    : null;
  const imovelEspecifico = imovel?.dados?.idInterno || null;
  const pedeImovel = /\b(im[oó]vel|dele|dela|desse|dessa|este|esta)\b/i.test(pedido.mensagem)
    || codigoExplicito(pedido.mensagem) !== null;
  if (pedeImovel && !imovelEspecifico && !entidadeAgenda) {
    return blocoAusente("agenda", "agenda", "dado_estruturado_atual", "agendado", "imovel_de_referencia_ausente");
  }

  let consulta = supabase
    .from("agenda")
    .select(COLUNAS_AGENDA_CONTEXTO)
    .eq("user_id", userId);
  let escopo: DadosContextoAgendaAssistente["escopo"] = "periodo";
  if (entidadeAgenda) {
    consulta = consulta.eq("id", entidadeAgenda);
    escopo = "entidade_atual";
  } else {
    if (imovelEspecifico) {
      consulta = consulta.eq("imovel_id", imovelEspecifico);
      escopo = "imovel";
    }
    const periodo = periodoAgenda(pedido.mensagem);
    consulta = consulta.gte("date", periodo.inicio).eq("done", false);
    if (periodo.fim) consulta = consulta.lte("date", periodo.fim);
  }
  contador.executadas += 1;
  const { data, error } = await consulta
    .order("date", { ascending: true })
    .order("hora", { ascending: true, nullsFirst: false })
    .limit(10);
  if (error) throw new Error(`Falha ao carregar contexto da Agenda: ${error.message}`);
  const rows = (data || []) as unknown as Array<Partial<DbAgendaRow> & Pick<DbAgendaRow, "id" | "title" | "type" | "date">>;
  if (!rows.length) {
    return blocoAusente("agenda", "agenda", "dado_estruturado_atual", "agendado", "nenhum_compromisso_relevante");
  }
  return {
    tipo: "agenda",
    estado: "disponivel",
    fonte: "agenda",
    autoridade: "dado_estruturado_atual",
    temporalidade: "agendado",
    observadoEm: rows.map((row) => textoOuNull(row.updated_at)).filter((valor): valor is string => valor !== null).sort().at(-1) || null,
    dados: {
      escopo,
      itens: rows.map((row) => ({
        idInterno: row.id,
        titulo: row.title,
        tipoCompromisso: row.type,
        data: row.date,
        hora: textoOuNull(row.hora),
        concluido: row.done === true,
        imovelIdInterno: textoOuNull(row.imovel_id),
        origem: textoOuNull(row.origin),
      })),
    },
  };
}

function contextoPipeline(
  imovel?: BlocoContextoAssistente<"imovel", DadosContextoImovelAssistente>,
): BlocoContextoAssistente<"pipeline", DadosContextoPipelineAssistente> {
  if (!imovel?.dados) {
    return blocoAusente("pipeline", "imoveis", "dado_estruturado_atual", "atual", "imovel_nao_identificado_para_pipeline");
  }
  return {
    tipo: "pipeline",
    estado: "disponivel",
    fonte: "imoveis.status+status_history+notas+tentativas",
    autoridade: "dado_estruturado_atual",
    temporalidade: "atual",
    observadoEm: imovel.observadoEm,
    dados: {
      statusAtual: imovel.dados.statusAtual,
      responsavel: imovel.dados.responsavel,
      ultimaMovimentacao: imovel.dados.ultimaMovimentacao,
    },
  };
}

function contextoProtocolos(
  catalogo: CatalogoProtocolosAssistente,
): BlocoContextoAssistente<"protocolos", DadosContextoProtocolosAssistente> {
  if (!catalogo.fonteDisponivel) {
    return {
      ...blocoAusente("protocolos", "protocolos", "protocolo", "atual", "fonte_indisponivel"),
      estado: "indisponivel",
    };
  }
  if (!catalogo.protocolos.length) {
    return blocoAusente("protocolos", "protocolos", "protocolo", "atual", "nenhum_protocolo_comercial_ativo");
  }
  return {
    tipo: "protocolos",
    estado: "disponivel",
    fonte: "protocolos",
    autoridade: "protocolo",
    temporalidade: "atual",
    observadoEm: null,
    dados: { catalogo: catalogo.protocolos.map(({ id, titulo }) => ({ id, titulo })) },
  };
}

export async function carregarContextoTipadoAssistente(
  pedido: PedidoAssistente,
  supabase: SupabaseClient,
  userId: string,
): Promise<ContextoTipadoCarregadoAssistente> {
  const inicio = performance.now();
  const contador: ContadorConsultasContexto = { executadas: 0, reutilizadas: 0 };
  const selecao = selecionarContextoAssistente(pedido.mensagem, pedido.contexto);
  const selecionados = new Set(selecao.blocos);
  const precisaImovel = selecionados.has("imovel") || selecionados.has("pipeline")
    || (selecionados.has("agenda") && /\b(im[oó]vel|dele|dela|desse|dessa|este|esta)\b/i.test(pedido.mensagem));
  const imovel = precisaImovel ? await carregarImovel(supabase, userId, pedido, contador) : undefined;
  const [agenda, catalogoProtocolos] = await Promise.all([
    selecionados.has("agenda") ? carregarAgenda(supabase, userId, pedido, contador, imovel) : Promise.resolve(undefined),
    selecionados.has("protocolos")
      ? (() => {
          contador.executadas += 1;
          return carregarCatalogoProtocolosAssistente(supabase, userId);
        })()
      : Promise.resolve({ protocolos: [], fonteDisponivel: false }),
  ]);
  const carregaveis = new Set<TipoBlocoContextoAssistente>(["imovel", "agenda", "pipeline", "protocolos"]);
  const contexto: ContextoTipadoAssistente = {
    base: {
      userIdInterno: userId,
      papel: "usuario_autenticado",
      capacidadesSelecionadas: selecao.capacidades,
      blocosSelecionados: selecao.blocos,
      blocosSobDemanda: selecao.blocos.filter((bloco) => !carregaveis.has(bloco)),
      dataHoraOperacional: agoraISOComHora(),
      fuso: "America/Sao_Paulo",
      contextoVisual: {
        rota: pedido.contexto.rota,
        pagina: pedido.contexto.pagina,
        superficie: pedido.contexto.superficie || "pagina",
        entidade: pedido.contexto.entidade?.tipo || null,
      },
    },
    ...(imovel ? { imovel } : {}),
    ...(agenda ? { agenda } : {}),
    ...(selecionados.has("pipeline") ? { pipeline: contextoPipeline(imovel) } : {}),
    ...(selecionados.has("protocolos") ? { protocolos: contextoProtocolos(catalogoProtocolos) } : {}),
  };
  return {
    contexto,
    catalogoProtocolos,
    duracaoMs: Math.round(performance.now() - inicio),
    consultasExecutadas: contador.executadas,
    consultasReutilizadas: contador.reutilizadas,
  };
}

/** Serializa uma vez, na borda do modelo, removendo IDs internos e PII desnecessária. */
export function serializarContextoTipadoAssistente(contexto: ContextoTipadoAssistente): string {
  const imovel = contexto.imovel && {
    ...contexto.imovel,
    dados: contexto.imovel.dados ? {
      codigo: contexto.imovel.dados.codigo,
      referenciaCrm: contexto.imovel.dados.referenciaCrm,
      endereco: contexto.imovel.dados.endereco,
      bairro: contexto.imovel.dados.bairro,
      cidade: contexto.imovel.dados.cidade,
      estado: contexto.imovel.dados.estado,
      unidade: contexto.imovel.dados.unidade,
      bloco: contexto.imovel.dados.bloco,
      edificio: contexto.imovel.dados.edificio,
      tipoImovel: contexto.imovel.dados.tipoImovel,
      statusAtual: contexto.imovel.dados.statusAtual,
      proprietarioNome: contexto.imovel.dados.proprietarioNome,
      responsavel: contexto.imovel.dados.responsavel,
      origemImovel: contexto.imovel.dados.origemImovel,
      dataCadastro: contexto.imovel.dados.dataCadastro,
      ultimaMovimentacao: contexto.imovel.dados.ultimaMovimentacao,
    } : null,
  };
  const agenda = contexto.agenda && {
    ...contexto.agenda,
    dados: contexto.agenda.dados ? {
      escopo: contexto.agenda.dados.escopo,
      itens: contexto.agenda.dados.itens.map((item) => ({
        titulo: item.titulo,
        tipoCompromisso: item.tipoCompromisso,
        data: item.data,
        hora: item.hora,
        concluido: item.concluido,
        origem: item.origem,
      })),
    } : null,
  };
  return JSON.stringify({
    categoria: "contexto_dinamico_tipado",
    regraAutoridade: "Dados estruturados atuais prevalecem sobre memória conversacional antiga.",
    base: {
      papel: contexto.base.papel,
      capacidadesSelecionadas: contexto.base.capacidadesSelecionadas,
      blocosSelecionados: contexto.base.blocosSelecionados,
      blocosSobDemanda: contexto.base.blocosSobDemanda,
      dataHoraOperacional: contexto.base.dataHoraOperacional,
      fuso: contexto.base.fuso,
      contextoVisual: contexto.base.contextoVisual,
    },
    blocos: {
      ...(imovel ? { imovel } : {}),
      ...(agenda ? { agenda } : {}),
      ...(contexto.pipeline ? { pipeline: contexto.pipeline } : {}),
      ...(contexto.protocolos ? { protocolos: contexto.protocolos } : {}),
    },
  });
}

export function fontesContextoTipado(contexto: ContextoTipadoAssistente): string[] {
  return [...new Set([contexto.imovel, contexto.agenda, contexto.pipeline, contexto.protocolos]
    .flatMap((bloco) => bloco?.estado === "disponivel" ? [bloco.fonte] : []))];
}
