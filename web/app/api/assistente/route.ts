import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { clienteDoChamador, podeUsarIa, tokenDaRequisicao } from "@/lib/servidor/iaAcesso";
import { normalizarPedidoAssistente, responderComAssistente } from "@/lib/servidor/assistente/orquestrador";
import {
  cancelarAcaoAssistente,
  confirmarAcaoAssistente,
  prepararAgendamentoVisita,
} from "@/lib/servidor/assistente/acoes";
import { acaoPendenteMaisRecente, classificarDecisaoTextual, textoResultadoConfirmacao } from "@/lib/assistente/confirmacao";
import { metadadosExecucaoIa } from "@/lib/ia/observabilidade";
import { registrarEvento } from "@/lib/servidor/registro";
import { admin, ambiente } from "@/app/api/google/_comum";
import { espelharCompromisso } from "@/app/api/google/_espelho";
import type { AcaoAssistente, MensagemAssistente, RespostaAssistente } from "@/lib/assistente/tipos";

export const runtime = "nodejs";

function falha(erro: string, status: number, codigo: string) {
  return NextResponse.json<RespostaAssistente>({ ok: false, erro, codigo }, { status });
}

function respostaAcao(texto: string, acao: AcaoAssistente) {
  const mensagem: MensagemAssistente = {
    id: randomUUID(),
    papel: "assistente",
    texto,
    acao,
  };
  return NextResponse.json<RespostaAssistente>({ ok: true, mensagem, modelo: "operacao-tipificada" });
}

function respostaOperacional(texto: string) {
  const mensagem: MensagemAssistente = { id: randomUUID(), papel: "assistente", texto };
  return NextResponse.json<RespostaAssistente>({ ok: true, mensagem, modelo: "operacao-tipificada" });
}

function registrarAcao(
  userId: string,
  evento: string,
  acao: AcaoAssistente,
  resultado: "sugerido" | "respondido" | "bloqueado" | "erro",
  motivo: string,
) {
  const idsImoveis = acao.tipo === "alterar_status_sem_resposta_em_lote"
    ? acao.entidade.imoveis.map((imovel) => imovel.id)
    : [acao.entidade.imovelId];
  const agendaId = acao.tipo === "alterar_status_sem_resposta_em_lote"
    ? null
    : acao.resultado?.agendaId;
  registrarEvento({
    userId,
    categoria: "ia",
    nivel: resultado === "erro" ? "erro" : "info",
    evento,
    detalhe: JSON.stringify(metadadosExecucaoIa({
      operacao: acao.tipo,
      entidadesUtilizadas: [acao.id, ...idsImoveis, agendaId],
      fontesDeDados: [
        "assistente_acoes",
        ...(acao.tipo === "alterar_status_sem_resposta_em_lote" ? ["imoveis", "status_history"] : ["agenda"]),
        ...(acao.tipo !== "alterar_status_sem_resposta_em_lote" && acao.entidade.imovelId ? ["imoveis"] : []),
      ],
      validacoesAplicadas: [
        "usuario-autenticado",
        "permissao-ia",
        "acao-user-scoped",
        "sessao-da-conversa",
        "payload-congelado",
        ...(acao.tipo === "alterar_status_sem_resposta_em_lote" ? ["elegibilidade-revalidada-na-confirmacao"] : []),
      ],
      resultado,
      motivo,
    })),
  });
}

function espelharCompromissoDepois(userId: string, agendaId: string): void {
  const env = ambiente();
  if (!env) return;
  after(async () => {
    const resultado = await espelharCompromisso(env, admin(env), userId, agendaId);
    if (!resultado.ok && resultado.falha !== "sem-conexao-google" && resultado.falha !== "nao-configurado") {
      console.warn("Assistente: não foi possível espelhar o compromisso no Google Agenda —", resultado.falha);
    }
  });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return falha("Assistente indisponível neste ambiente.", 503, "indisponivel");
  const token = tokenDaRequisicao(request);
  if (!token) return falha("Sessao nao encontrada.", 401, "nao_autenticado");
  const supabase = clienteDoChamador(supabaseUrl, anonKey, token);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return falha("Sessao invalida ou expirada.", 401, "nao_autenticado");
  if (!(await podeUsarIa(supabase, auth.user.id))) return falha("Sua conta nao tem acesso ao assistente.", 403, "sem_permissao");
  let corpo: unknown;
  try { corpo = await request.json(); } catch { return falha("Requisição inválida.", 400, "pedido_invalido"); }
  const bruto = corpo && typeof corpo === "object" ? corpo as Record<string, unknown> : {};

  if (bruto.tipo === "preparar_acao") {
    const parametros = bruto.parametros && typeof bruto.parametros === "object"
      ? bruto.parametros as Record<string, unknown>
      : {};
    if (bruto.acao !== "agendar_visita") return falha("Ação não disponível.", 400, "acao_indisponivel");
    const resultado = await prepararAgendamentoVisita(supabase, {
      imovelId: typeof parametros.imovelId === "string" ? parametros.imovelId : "",
      data: typeof parametros.data === "string" ? parametros.data : "",
      hora: typeof parametros.hora === "string" ? parametros.hora : "",
      sessaoId: typeof bruto.sessaoId === "string" ? bruto.sessaoId : "",
    });
    if (!resultado.ok) return falha(resultado.erro, 400, resultado.codigo);
    registrarAcao(auth.user.id, "ia-assistente-acao-preparada", resultado.acao, "sugerido", "aguardando-confirmacao");
    return respostaAcao("Preparei a visita. Revise os dados abaixo e confirme somente se estiver tudo certo.", resultado.acao);
  }

  if (bruto.tipo === "confirmar_acao") {
    const resultado = await confirmarAcaoAssistente(
      supabase,
      typeof bruto.acaoId === "string" ? bruto.acaoId : "",
      typeof bruto.sessaoId === "string" ? bruto.sessaoId : "",
    );
    if (!resultado.ok) return falha(resultado.erro, 400, resultado.codigo);
    const sucesso = resultado.acao.estado === "succeeded";
    registrarAcao(
      auth.user.id,
      sucesso ? "ia-assistente-acao-executada" : "ia-assistente-acao-bloqueada",
      resultado.acao,
      sucesso ? "respondido" : resultado.acao.estado === "failed" ? "erro" : "bloqueado",
      resultado.repetida ? "execucao-ja-concluida" : resultado.acao.estado,
    );
    if (sucesso && resultado.acao.tipo !== "alterar_status_sem_resposta_em_lote" && resultado.acao.resultado?.agendaId && !resultado.repetida) {
      espelharCompromissoDepois(auth.user.id, resultado.acao.resultado.agendaId);
    }
    return respostaAcao(textoResultadoConfirmacao(resultado.acao), resultado.acao);
  }

  if (bruto.tipo === "cancelar_acao") {
    const resultado = await cancelarAcaoAssistente(
      supabase,
      typeof bruto.acaoId === "string" ? bruto.acaoId : "",
      typeof bruto.sessaoId === "string" ? bruto.sessaoId : "",
    );
    if (!resultado.ok) return falha(resultado.erro, 400, resultado.codigo);
    registrarAcao(auth.user.id, "ia-assistente-acao-cancelada", resultado.acao, "bloqueado", resultado.acao.estado);
    return respostaAcao(textoResultadoConfirmacao(resultado.acao), resultado.acao);
  }

  const pedido = normalizarPedidoAssistente(corpo);
  if (!pedido) return falha("Escreva uma pergunta valida.", 400, "pedido_invalido");
  const decisao = classificarDecisaoTextual(pedido.mensagem);
  if (decisao) {
    const acao = acaoPendenteMaisRecente(pedido.historico);
    if (!acao || !pedido.sessaoId) return respostaOperacional("Não há uma ação aguardando confirmação nesta conversa.");
    const resultado = decisao === "confirmar"
      ? await confirmarAcaoAssistente(supabase, acao.id, pedido.sessaoId)
      : await cancelarAcaoAssistente(supabase, acao.id, pedido.sessaoId);
    if (!resultado.ok) return falha(resultado.erro, 400, resultado.codigo);
    const sucesso = resultado.acao.estado === "succeeded";
    registrarAcao(
      auth.user.id,
      decisao === "cancelar"
        ? "ia-assistente-acao-cancelada"
        : sucesso ? "ia-assistente-acao-executada" : "ia-assistente-acao-bloqueada",
      resultado.acao,
      sucesso ? "respondido" : resultado.acao.estado === "failed" ? "erro" : "bloqueado",
      resultado.repetida ? "execucao-ja-concluida" : resultado.acao.estado,
    );
    if (sucesso && resultado.acao.tipo !== "alterar_status_sem_resposta_em_lote" && resultado.acao.resultado?.agendaId && !resultado.repetida) {
      espelharCompromissoDepois(auth.user.id, resultado.acao.resultado.agendaId);
    }
    return respostaAcao(textoResultadoConfirmacao(resultado.acao), resultado.acao);
  }
  if (!process.env.OPENAI_API_KEY) return falha("Assistente indisponível neste ambiente.", 503, "indisponivel");
  try {
    const resposta = await responderComAssistente(pedido, supabase, auth.user.id);
    if (resposta.mensagem.acao?.estado === "ready_for_confirmation") {
      registrarAcao(auth.user.id, "ia-assistente-acao-preparada", resposta.mensagem.acao, "sugerido", "aguardando-confirmacao");
    }
    return NextResponse.json<RespostaAssistente>({ ok: true, ...resposta });
  } catch (error) {
    console.error("Assistente: falha ao responder:", error);
    return falha("Nao foi possivel consultar o assistente agora.", 502, "falha_ia");
  }
}
