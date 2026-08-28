import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcaoAssistente, BlocoAssistente, ComandoUiAssistente, ContextoAssistente, MensagemAssistente, PedidoAssistente } from "@/lib/assistente/tipos";
import { normalizarResultadosHistorico } from "@/lib/assistente/historico";
import {
  compararEntidadeComResultadoAtual,
  continuidadeParaModelo,
  respostaNaturalDaContinuidade,
  type ContinuidadeEntidade,
} from "@/lib/assistente/continuidade";
import { registrarEvento, registrarUsoDaResponsesApi } from "@/lib/servidor/registro";
import { carregarConfiguracaoIa } from "@/lib/servidor/ia/configuracao";
import { metadadosExecucaoIa } from "@/lib/ia/observabilidade";
import { instrucoesDoAssistente } from "./conhecimento";
import { DEFINICOES_FERRAMENTAS, executarFerramenta } from "./ferramentas";
import {
  DEFINICAO_FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE,
  DEFINICAO_FERRAMENTA_AGENDAR_VISITA,
  DEFINICAO_FERRAMENTA_CRIAR_COMPROMISSO,
  DEFINICAO_FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA,
  DEFINICAO_FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA,
  executarPreparacaoCriacaoCompromisso,
  executarPreparacaoAgendamentoVisita,
  executarPreparacaoStatusSemResposta,
  FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE,
  FERRAMENTA_PREPARAR_CRIACAO_COMPROMISSO,
  FERRAMENTA_PREPARAR_AGENDAMENTO_VISITA,
  FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA,
  FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA,
  prepararRevisaoFollowUpLote,
  prepararRascunhoResposta,
} from "./acoes";
import {
  carregarCatalogoProtocolosAssistente,
  definicaoFerramentaProtocolosAssistente,
  FERRAMENTA_PROTOCOLOS_COMERCIAIS,
  protocolosSelecionadosParaAssistente,
} from "./protocolos";

export const MODELO_ASSISTENTE_PADRAO = "gpt-5.4-mini";
const MAX_HISTORICO = 12;
const MAX_TEXTO_HISTORICO = 2_000;
const MAX_MENSAGEM = 4_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ESTADOS_ACAO = new Set(["ready_for_confirmation", "succeeded", "cancelled", "expired", "failed"]);

export function normalizarPedidoAssistente(valor: unknown): PedidoAssistente | null {
  if (!valor || typeof valor !== "object") return null;
  const bruto = valor as Record<string, unknown>;
  const mensagem = typeof bruto.mensagem === "string" ? bruto.mensagem.trim().slice(0, MAX_MENSAGEM) : "";
  if (!mensagem) return null;
  const c = bruto.contexto && typeof bruto.contexto === "object" ? bruto.contexto as Record<string, unknown> : {};
  const rota = typeof c.rota === "string" && /^\/[a-z0-9\-/]{0,100}$/i.test(c.rota) ? c.rota : "/";
  const pagina = typeof c.pagina === "string" ? c.pagina.replace(/[^\p{L}\p{N} \-/]/gu, "").slice(0, 80) : "Angariacao";
  const superficie = c.superficie === "drawer" || c.superficie === "modal" ? c.superficie : "pagina";
  let entidade: ContextoAssistente["entidade"];
  if (c.entidade && typeof c.entidade === "object") {
    const e = c.entidade as Record<string, unknown>;
    if ((e.tipo === "imovel" || e.tipo === "agenda") && typeof e.id === "string" && /^[a-z0-9_-]{1,100}$/i.test(e.id)) entidade = { tipo: e.tipo, id: e.id };
  }
  if (superficie === "pagina") entidade = undefined;
  if (superficie === "drawer" && (rota !== "/pipeline" || entidade?.tipo !== "imovel")) entidade = undefined;
  const historicoBruto = Array.isArray(bruto.historico) ? bruto.historico.slice(-MAX_HISTORICO) : [];
  const historico: PedidoAssistente["historico"] = historicoBruto.flatMap((item): PedidoAssistente["historico"] => {
    if (!item || typeof item !== "object") return [];
    const m = item as Record<string, unknown>;
    if ((m.papel !== "usuario" && m.papel !== "assistente") || typeof m.texto !== "string") return [];
    const texto = m.texto.trim().slice(0, MAX_TEXTO_HISTORICO);
    const resultados = normalizarResultadosHistorico(m.resultados);
    const a = m.acao && typeof m.acao === "object" ? m.acao as Record<string, unknown> : null;
    const entidade = a?.entidade && typeof a.entidade === "object" ? a.entidade as Record<string, unknown> : null;
    const dados = a?.dados && typeof a.dados === "object" ? a.dados as Record<string, unknown> : null;
    const acaoVisita = a
      && a.tipo === "agendar_visita"
      && typeof a.estado === "string"
      && ESTADOS_ACAO.has(a.estado)
      && UUID.test(String(a.id || ""))
      && entidade
      && UUID.test(String(entidade.imovelId || ""))
      && dados
      && typeof dados.data === "string"
      && typeof dados.hora === "string"
      ? {
          id: String(a.id),
          tipo: "agendar_visita" as const,
          estado: a.estado as NonNullable<PedidoAssistente["historico"][number]["acao"]>["estado"],
          entidade: {
            imovelId: String(entidade.imovelId),
            codigo: String(entidade.codigo || ""),
            endereco: String(entidade.endereco || ""),
            responsavel: String(entidade.responsavel || ""),
          },
          dados: { data: dados.data, hora: dados.hora },
        }
      : undefined;
    const horaCompromisso = dados && typeof dados.hora === "string" ? dados.hora : null;
    const imovelIdCompromisso = entidade && typeof entidade.imovelId === "string" && UUID.test(entidade.imovelId)
      ? entidade.imovelId
      : null;
    const acaoCompromisso = a
      && a.tipo === "criar_compromisso"
      && typeof a.estado === "string"
      && ESTADOS_ACAO.has(a.estado)
      && UUID.test(String(a.id || ""))
      && entidade
      && dados
      && typeof dados.titulo === "string"
      && dados.titulo.trim() !== ""
      && typeof dados.tipo === "string"
      && dados.tipo.trim() !== ""
      && typeof dados.data === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(dados.data)
      && (horaCompromisso === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(horaCompromisso))
      ? {
          id: String(a.id),
          tipo: "criar_compromisso" as const,
          estado: a.estado as NonNullable<PedidoAssistente["historico"][number]["acao"]>["estado"],
          entidade: {
            imovelId: imovelIdCompromisso,
            codigo: typeof entidade.codigo === "string" ? entidade.codigo : null,
            endereco: typeof entidade.endereco === "string" ? entidade.endereco : null,
            responsavel: typeof entidade.responsavel === "string" ? entidade.responsavel : null,
          },
          dados: {
            titulo: dados.titulo.trim().slice(0, 160),
            tipo: dados.tipo.trim().slice(0, 80),
            data: dados.data,
            hora: horaCompromisso,
            observacao: typeof dados.observacao === "string" ? dados.observacao.slice(0, 2_000) : null,
          },
        }
      : undefined;
    const imoveisStatus = entidade && Array.isArray(entidade.imoveis)
      ? entidade.imoveis.slice(0, 100).flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const imovel = item as Record<string, unknown>;
          const id = String(imovel.id || "");
          const tentativas = Number(imovel.tentativas);
          if (!UUID.test(id) || imovel.statusPreparado !== "Novo contato" || !Number.isInteger(tentativas) || tentativas < 3) return [];
          return [{
            id,
            codigo: String(imovel.codigo || "Sem código").slice(0, 40),
            endereco: String(imovel.endereco || "Endereço não informado").slice(0, 240),
            statusPreparado: "Novo contato" as const,
            tentativas,
          }];
        })
      : [];
    const quantidadeStatus = Number(dados?.quantidade);
    const acaoStatusSemResposta = a
      && a.tipo === "alterar_status_sem_resposta_em_lote"
      && typeof a.estado === "string"
      && ESTADOS_ACAO.has(a.estado)
      && UUID.test(String(a.id || ""))
      && entidade
      && dados?.statusDestino === "Sem resposta"
      && Number.isInteger(quantidadeStatus)
      && quantidadeStatus >= imoveisStatus.length
      ? {
          id: String(a.id),
          tipo: "alterar_status_sem_resposta_em_lote" as const,
          estado: a.estado as NonNullable<PedidoAssistente["historico"][number]["acao"]>["estado"],
          entidade: { imoveis: imoveisStatus },
          dados: { statusDestino: "Sem resposta" as const, quantidade: quantidadeStatus },
        }
      : undefined;
    const acao = acaoVisita || acaoCompromisso || acaoStatusSemResposta;
    return texto ? [{ papel: m.papel, texto, ...(resultados.length ? { resultados } : {}), ...(acao ? { acao } : {}) }] : [];
  });
  const sessaoId = typeof bruto.sessaoId === "string" && UUID.test(bruto.sessaoId) ? bruto.sessaoId : undefined;
  return { mensagem, contexto: { rota, pagina, superficie, ...(entidade ? { entidade } : {}) }, historico, ...(sessaoId ? { sessaoId } : {}) };
}

function idSeguro(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

export function conteudoMensagemHistorico(mensagem: PedidoAssistente["historico"][number]): string {
  const partes = [mensagem.texto];
  if (mensagem.resultados?.length) {
    partes.push(`RESULTADOS ESTRUTURADOS DESTA RESPOSTA (referencias compactas, reconsulte antes de afirmar fatos atuais): ${JSON.stringify(mensagem.resultados)}`);
  }
  if (mensagem.acao) {
    partes.push(`ACAO ESTRUTURADA DESTA RESPOSTA (referencia compacta; qualquer mudanca exige novo preview): ${JSON.stringify(mensagem.acao)}`);
  }
  return partes.join("\n\n");
}

export function sanitizarTextoAssistente(texto: string): string {
  return texto
    .replace(/\n*\s*RESULTADOS ESTRUTURADOS DESTA RESPOSTA(?:\s*\([^)]*\))?\s*:\s*[\s\S]*$/i, "")
    .replace(/\n*\s*ACAO ESTRUTURADA DESTA RESPOSTA(?:\s*\([^)]*\))?\s*:\s*[\s\S]*$/i, "")
    .trim();
}

/** Enriquece somente a saída entregue ao modelo. O bloco/card permanece o
    resultado literal da ferramenta e a comparação só existe depois dela. */
export function prepararResultadoFerramentaParaModelo(
  dados: unknown,
  bloco: BlocoAssistente | undefined,
  pedido: PedidoAssistente,
): { output: string; continuidade: ContinuidadeEntidade | null } {
  const continuidade = compararEntidadeComResultadoAtual(
    pedido.contexto,
    pedido.historico,
    bloco,
  );
  if (!continuidade) return { output: JSON.stringify(dados), continuidade: null };
  const base = dados && typeof dados === "object" && !Array.isArray(dados)
    ? dados as Record<string, unknown>
    : { resultado: dados };
  return {
    output: JSON.stringify({
      ...base,
      continuidadeConversacional: continuidadeParaModelo(continuidade),
    }),
    continuidade,
  };
}

export async function responderComAssistente(pedido: PedidoAssistente, supabase: SupabaseClient, userId: string): Promise<{ mensagem: MensagemAssistente; modelo: string }> {
  const [configuracaoIa, catalogoProtocolos] = await Promise.all([
    carregarConfiguracaoIa(),
    carregarCatalogoProtocolosAssistente(supabase, userId),
  ]);
  const modelo = configuracaoIa.assistente.modelo;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const entrada: ResponseInputItem[] = pedido.historico.map((m) => ({
    role: m.papel === "usuario" ? "user" : "assistant",
    content: conteudoMensagemHistorico(m),
  }));
  entrada.push({ role: "user", content: pedido.mensagem });
  const blocos: BlocoAssistente[] = [];
  let acaoPendente: AcaoAssistente | undefined;
  let comandoUi: ComandoUiAssistente | undefined;
  const ferramentasChamadas: string[] = [];
  const protocolosAplicados: string[] = [];
  let continuidadeResposta: ContinuidadeEntidade | null = null;
  const ferramentaProtocolos = definicaoFerramentaProtocolosAssistente(catalogoProtocolos.protocolos);
  const parametros = () => ({
    model: modelo,
    instructions: instrucoesDoAssistente(pedido.contexto, catalogoProtocolos.protocolos),
    input: entrada,
    tools: [
      ...DEFINICOES_FERRAMENTAS,
      DEFINICAO_FERRAMENTA_AGENDAR_VISITA,
      DEFINICAO_FERRAMENTA_CRIAR_COMPROMISSO,
      DEFINICAO_FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE,
      DEFINICAO_FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA,
      DEFINICAO_FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA,
      ...(ferramentaProtocolos ? [ferramentaProtocolos] : []),
    ],
    tool_choice: "auto" as const,
    parallel_tool_calls: false,
    max_output_tokens: 2500,
    reasoning: { effort: configuracaoIa.assistente.esforco },
    safety_identifier: idSeguro(userId),
    store: false,
  });
  let resposta = await openai.responses.create(parametros());
  registrarUsoDaResponsesApi(userId, "assistente-chat", modelo, resposta.usage);

  for (let rodada = 0; rodada < 4; rodada += 1) {
    const chamadas = resposta.output.filter((x) => x.type === "function_call");
    if (!chamadas.length) break;
    entrada.push(...toResponseInputItems(resposta.output));
    for (const chamada of chamadas) {
      ferramentasChamadas.push(chamada.name);
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(chamada.arguments) as Record<string, unknown>; } catch { /* validacao estrita ainda pode falhar */ }
      const resultado: { dados: unknown; bloco?: BlocoAssistente; acao?: AcaoAssistente; comandoUi?: ComandoUiAssistente } = chamada.name === FERRAMENTA_PROTOCOLOS_COMERCIAIS
        ? (() => {
            const selecionados = protocolosSelecionadosParaAssistente(args, catalogoProtocolos.protocolos);
            protocolosAplicados.push(...selecionados.map((protocolo) => protocolo.id));
            return { dados: { protocolos: selecionados }, bloco: undefined };
          })()
        : chamada.name === FERRAMENTA_PREPARAR_AGENDAMENTO_VISITA
          ? await executarPreparacaoAgendamentoVisita(
              args,
              supabase,
              userId,
              pedido.contexto,
              pedido.sessaoId,
            )
        : chamada.name === FERRAMENTA_PREPARAR_CRIACAO_COMPROMISSO
          ? await executarPreparacaoCriacaoCompromisso(
              args,
              supabase,
              userId,
              pedido.contexto,
              pedido.sessaoId,
            )
        : chamada.name === FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE
          ? await prepararRevisaoFollowUpLote(
              supabase,
              userId,
              pedido.contexto,
              pedido.mensagem,
              pedido.historico,
            )
        : chamada.name === FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA
          ? await prepararRascunhoResposta(
              args,
              supabase,
              userId,
              pedido.contexto,
            )
        : chamada.name === FERRAMENTA_PREPARAR_STATUS_SEM_RESPOSTA
          ? await executarPreparacaoStatusSemResposta(
              supabase,
              pedido.sessaoId,
            )
        : await executarFerramenta(chamada.name, args, supabase, userId, pedido.contexto, pedido.mensagem, pedido.historico);
      if (resultado.acao) acaoPendente = resultado.acao;
      if (resultado.comandoUi) comandoUi = resultado.comandoUi;
      if (resultado.bloco?.itens.length) blocos.push(resultado.bloco);
      const preparado = prepararResultadoFerramentaParaModelo(
        resultado.dados,
        resultado.bloco,
        pedido,
      );
      if (preparado.continuidade) continuidadeResposta = preparado.continuidade;
      entrada.push({ type: "function_call_output", call_id: chamada.call_id, output: preparado.output });
    }
    resposta = await openai.responses.create(parametros());
    registrarUsoDaResponsesApi(userId, "assistente-chat", modelo, resposta.usage);
  }

  const textoGerado = sanitizarTextoAssistente(resposta.output_text);
  const texto = acaoPendente
    ? acaoPendente.tipo === "alterar_status_sem_resposta_em_lote"
      ? `Encontrei ${acaoPendente.dados.quantidade === 1 ? "1 imóvel elegível" : `${acaoPendente.dados.quantidade} imóveis elegíveis`}. Nenhuma alteração foi feita ainda. Revise a lista e confirme para mudar o status para Sem resposta.`
      : acaoPendente.tipo === "agendar_visita"
      ? "Preparei a visita. Revise os dados abaixo e confirme somente se estiver tudo certo."
      : "Preparei o compromisso. Revise os dados abaixo e confirme somente se estiver tudo certo."
    : comandoUi?.tipo === "abrir_followup_lote"
    ? "Abri a revisão do lote de follow-ups. Confira os proprietários selecionados e as mensagens; o envio só começa quando você clicar em Enviar follow-ups."
    : comandoUi?.tipo === "rascunhar_resposta"
    ? `Identifiquei a conversa de ${comandoUi.proprietario} (${comandoUi.codigo}) e vou preparar um rascunho baseado no histórico para sua revisão.`
    : continuidadeResposta
    ? respostaNaturalDaContinuidade(continuidadeResposta)
    : textoGerado;
  registrarEvento({
    userId,
    categoria: "ia",
    nivel: "info",
    evento: "ia-assistente-respondido",
    detalhe: JSON.stringify(metadadosExecucaoIa({
      operacao: "assistente-chat",
      protocolosConsiderados: catalogoProtocolos.protocolos.map((protocolo) => protocolo.id),
      protocolosAplicados,
      ferramentasChamadas,
      entidadesUtilizadas: [
        pedido.contexto.entidade?.id,
        ...(acaoPendente?.tipo === "alterar_status_sem_resposta_em_lote"
          ? acaoPendente.entidade.imoveis.map((imovel) => imovel.id)
          : acaoPendente
            ? [acaoPendente.entidade.imovelId]
            : []),
        ...blocos.flatMap((bloco) =>
          bloco.tipo === "imoveis" || bloco.tipo === "agenda" || bloco.tipo === "mensagens_agendadas"
            ? bloco.itens.map((item) => item.id)
            : bloco.tipo === "conversas_respondidas"
              ? bloco.itens.map((item) => item.imovelId)
            : [],
        ),
      ],
      fontesDeDados: [
        ...(catalogoProtocolos.fonteDisponivel ? ["protocolos"] : []),
        ...ferramentasChamadas
          .filter((nome) => nome !== FERRAMENTA_PROTOCOLOS_COMERCIAIS)
          .map((nome) => `ferramenta:${nome}`),
      ],
      validacoesAplicadas: [
        "normalizacao-do-pedido",
        "limites-do-historico",
        "sanitizacao-da-saida",
        ...(catalogoProtocolos.fonteDisponivel ? ["catalogo-protocolos-user-scoped"] : []),
        ...(protocolosAplicados.length ? ["ids-protocolos-validados"] : []),
        ...(continuidadeResposta ? ["continuidade-estruturada"] : []),
        ...(acaoPendente ? ["acao-tipificada", "payload-congelado-no-backend", "confirmacao-explicita-obrigatoria"] : []),
        ...(comandoUi?.tipo === "abrir_followup_lote" ? ["fila-followup-user-scoped", "revisao-visual-obrigatoria", "envio-nao-executado-pelo-assistente"] : []),
        ...(comandoUi?.tipo === "rascunhar_resposta" ? ["conversa-user-scoped", "historico-relido-no-servidor", "rascunho-editavel", "envio-nao-executado-pelo-assistente"] : []),
      ],
      resultado: "respondido",
      motivo: texto ? "resposta-gerada" : "resposta-vazia-com-fallback",
    })),
  });
  return {
    modelo,
    mensagem: {
      id: randomUUID(),
      papel: "assistente",
      texto: texto || "Nao consegui formular uma resposta. Tente reformular a pergunta.",
      blocos: blocos.length ? blocos : undefined,
      acao: acaoPendente,
      comandoUi,
    },
  };
}
