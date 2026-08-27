import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlocoAssistente, ContextoAssistente, MensagemAssistente, PedidoAssistente } from "@/lib/assistente/tipos";
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
  carregarCatalogoProtocolosAssistente,
  definicaoFerramentaProtocolosAssistente,
  FERRAMENTA_PROTOCOLOS_COMERCIAIS,
  protocolosSelecionadosParaAssistente,
} from "./protocolos";

export const MODELO_ASSISTENTE_PADRAO = "gpt-5.4-mini";
const MAX_HISTORICO = 12;
const MAX_TEXTO_HISTORICO = 2_000;
const MAX_MENSAGEM = 4_000;

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
    return texto ? [{ papel: m.papel, texto, ...(resultados.length ? { resultados } : {}) }] : [];
  });
  return { mensagem, contexto: { rota, pagina, superficie, ...(entidade ? { entidade } : {}) }, historico };
}

function idSeguro(userId: string) {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}

export function conteudoMensagemHistorico(mensagem: PedidoAssistente["historico"][number]): string {
  return mensagem.resultados?.length
    ? `${mensagem.texto}\n\nRESULTADOS ESTRUTURADOS DESTA RESPOSTA (referencias compactas, reconsulte antes de afirmar fatos atuais): ${JSON.stringify(mensagem.resultados)}`
    : mensagem.texto;
}

export function sanitizarTextoAssistente(texto: string): string {
  return texto
    .replace(/\n*\s*RESULTADOS ESTRUTURADOS DESTA RESPOSTA(?:\s*\([^)]*\))?\s*:\s*[\s\S]*$/i, "")
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
  const ferramentasChamadas: string[] = [];
  const protocolosAplicados: string[] = [];
  let continuidadeResposta: ContinuidadeEntidade | null = null;
  const ferramentaProtocolos = definicaoFerramentaProtocolosAssistente(catalogoProtocolos.protocolos);
  const parametros = () => ({
    model: modelo,
    instructions: instrucoesDoAssistente(pedido.contexto, catalogoProtocolos.protocolos),
    input: entrada,
    tools: [...DEFINICOES_FERRAMENTAS, ...(ferramentaProtocolos ? [ferramentaProtocolos] : [])],
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
      const resultado = chamada.name === FERRAMENTA_PROTOCOLOS_COMERCIAIS
        ? (() => {
            const selecionados = protocolosSelecionadosParaAssistente(args, catalogoProtocolos.protocolos);
            protocolosAplicados.push(...selecionados.map((protocolo) => protocolo.id));
            return { dados: { protocolos: selecionados }, bloco: undefined };
          })()
        : await executarFerramenta(chamada.name, args, supabase, userId, pedido.contexto, pedido.mensagem, pedido.historico);
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
  const texto = continuidadeResposta
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
        ...blocos.flatMap((bloco) =>
          bloco.tipo === "imoveis" || bloco.tipo === "agenda" || bloco.tipo === "mensagens_agendadas"
            ? bloco.itens.map((item) => item.id)
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
      ],
      resultado: "respondido",
      motivo: texto ? "resposta-gerada" : "resposta-vazia-com-fallback",
    })),
  });
  return { modelo, mensagem: { id: randomUUID(), papel: "assistente", texto: texto || "Nao consegui formular uma resposta. Tente reformular a pergunta.", blocos: blocos.length ? blocos : undefined } };
}
