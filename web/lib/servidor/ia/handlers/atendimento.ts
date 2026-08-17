import { createHash } from "node:crypto";
import {
  ESQUEMA_DECISAO_ATENDIMENTO,
  ESQUEMA_GERACAO_ATENDIMENTO,
  ESQUEMA_VALIDACAO_ATENDIMENTO,
  PROMPT_BASE_ATENDIMENTO,
  conversaAtendimento,
  contextoAtendimentoDoImovel,
  motivoBloqueioDecisaoAtendimento,
  motivoReprovacaoValidacaoAtendimento,
  normalizarDecisaoAtendimento,
  promptDecidirAtendimento,
  promptGerarAtendimento,
  promptValidarAtendimento,
  selecionarMensagensAtendimento,
  type MotivoBloqueioAtendimento,
  type SelecaoMensagensAtendimento,
} from "@/lib/ia/atendimento";
import type { FalhaIa } from "@/lib/calculo/ia";
import {
  fromDbAbordagem,
  fromDbImovel,
  fromDbProtocolo,
  type DbAbordagemRow,
  type DbImovelRow,
  type DbProtocoloRow,
} from "@/lib/persistencia/mapeadores";
import { registrarEvento } from "@/lib/servidor/registro";
import type { HandlerIa } from "../dispatcher";
import { classificarErroIa } from "../executor-openai";
import { respostaErroIa } from "../respostas";

type EtapaAtendimento = "contexto" | "decisao" | "geracao" | "validacao" | "sugestao";

interface DiagnosticoAtendimento {
  imovelId: string;
  selecao?: SelecaoMensagensAtendimento;
  protocolosDisponiveis?: number;
  protocolosSelecionados?: number;
  abordagemCorretorDisponivel?: boolean;
  contextoFingerprint?: string;
  confianca?: "alta" | "media" | "baixa";
  informacoesFaltantes?: number;
}

/** Metadados operacionais apenas: nunca inclui mensagem, prompt ou chain-of-thought. */
function registrarDiagnosticoAtendimento(
  userId: string,
  base: DiagnosticoAtendimento,
  etapaFinal: EtapaAtendimento,
  resultado: "bloqueado" | "erro" | "sugerido",
  motivo: string,
): void {
  registrarEvento({
    userId,
    categoria: "ia",
    nivel: resultado === "sugerido" ? "info" : resultado === "erro" ? "erro" : "aviso",
    evento: resultado === "sugerido" ? "ia-atendimento-sugerido" : "ia-atendimento-bloqueado",
    detalhe: JSON.stringify({
      tarefa: "rascunhar-resposta",
      imovelId: base.imovelId,
      mensagensRecebidas: base.selecao?.mensagensRecebidas ?? null,
      mensagensDisponiveis: base.selecao?.mensagensDisponiveis ?? null,
      mensagensSelecionadas: base.selecao?.mensagensSelecionadas ?? null,
      descartadasComoMidia: base.selecao?.mensagensDescartadasComoMidia ?? null,
      descartadasVazias: base.selecao?.mensagensDescartadasVazias ?? null,
      protocolosDisponiveis: base.protocolosDisponiveis ?? null,
      protocolosSelecionados: base.protocolosSelecionados ?? null,
      abordagemCorretorDisponivel: base.abordagemCorretorDisponivel ?? null,
      contextoFingerprint: base.contextoFingerprint ?? null,
      confianca: base.confianca ?? null,
      informacoesFaltantes: base.informacoesFaltantes ?? null,
      etapaFinal,
      resultado,
      motivo,
    }),
  });
}

function falhaDoBloqueio(motivo: MotivoBloqueioAtendimento): FalhaIa {
  if (motivo === "baixa-confianca") return "baixa-confianca";
  if (motivo === "contexto-incompleto") return "contexto-incompleto";
  if (motivo === "protocolo-inadequado") return "protocolo-inadequado";
  if (
    motivo === "geracao-reprovada" ||
    motivo === "informacao-sem-fonte" ||
    motivo === "desvio-de-assunto"
  )
    return "geracao-reprovada";
  return "intervencao-humana";
}

export const atenderProprietario: HandlerIa<"rascunhar-resposta"> = async ({
  corpo,
  supabase,
  userId,
  executor,
  tipo,
}) => {
  const imovelId = typeof corpo.imovelId === "string" ? corpo.imovelId : "";
  if (!imovelId) return respostaErroIa("requisicao-invalida", 400);

  const { data: imRow, error: imErr } = await supabase
    .from("imoveis")
    .select("*")
    .eq("id", imovelId)
    .maybeSingle();
  if (imErr) {
    console.error("IA: falha ao ler o imóvel para rascunho:", imErr.message);
    registrarDiagnosticoAtendimento(
      userId,
      { imovelId },
      "contexto",
      "erro",
      "falha-carregamento-imovel",
    );
    return respostaErroIa("falha-carregamento-contexto", 500);
  }
  if (!imRow) {
    registrarDiagnosticoAtendimento(
      userId,
      { imovelId },
      "contexto",
      "bloqueado",
      "imovel-nao-encontrado",
    );
    return respostaErroIa("historico-insuficiente", 422);
  }
  const imovel = fromDbImovel(imRow as DbImovelRow);

  const selecao = selecionarMensagensAtendimento(imovel);
  const diagnostico: DiagnosticoAtendimento = { imovelId, selecao };
  const mensagemProp = selecao.mensagemAtual;
  if (!mensagemProp) {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "contexto",
      "bloqueado",
      "historico-sem-mensagem-textual",
    );
    return respostaErroIa("historico-insuficiente", 422);
  }

  const ultimaTentativa = [...(imovel.tentativas || [])]
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
    .at(-1);
  let enviada: { rotulo?: string | null; texto?: string | null } | null = null;
  if (ultimaTentativa?.abordagemId) {
    const { data: abRow, error: abErro } = await supabase
      .from("abordagens")
      .select("*")
      .eq("id", ultimaTentativa.abordagemId)
      .maybeSingle();
    if (abErro) {
      console.error("IA: falha ao ler a abordagem para rascunho:", abErro.message);
      registrarDiagnosticoAtendimento(
        userId,
        diagnostico,
        "contexto",
        "erro",
        "falha-carregamento-abordagem",
      );
      return respostaErroIa("falha-carregamento-contexto", 502);
    }
    if (abRow) {
      const abordagem = fromDbAbordagem(abRow as DbAbordagemRow);
      enviada = { rotulo: abordagem.nome, texto: abordagem.roteiro };
    }
  } else if (ultimaTentativa?.modeloNome) {
    enviada = { rotulo: ultimaTentativa.modeloNome, texto: null };
  }
  diagnostico.abordagemCorretorDisponivel = !!enviada;

  const { data: ptData, error: ptErro } = await supabase
    .from("protocolos")
    .select("*")
    .order("created_at", { ascending: true });
  if (ptErro) {
    console.error("IA: falha ao ler os protocolos:", ptErro.message);
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "contexto",
      "erro",
      "falha-carregamento-protocolos",
    );
    return respostaErroIa("falha-carregamento-contexto", 502);
  }
  const protocolos = ((ptData || []) as DbProtocoloRow[])
    .map(fromDbProtocolo)
    .filter((p) => !p.arquivado)
    .map((p) => ({ titulo: p.titulo, conteudo: p.conteudo }));

  diagnostico.protocolosDisponiveis = protocolos.length;
  const conversa = conversaAtendimento(selecao, enviada);
  const contexto = contextoAtendimentoDoImovel(imovel);
  diagnostico.contextoFingerprint = createHash("sha256")
    .update(JSON.stringify({ mensagemProp, contexto, conversa, protocolos }))
    .digest("hex")
    .slice(0, 16);

  let textoDecisao: string;
  try {
    ({ texto: textoDecisao } = await executor.executar({
      tipo: `${tipo}-decisao`,
      reasoningEffort: "low",
      formato: {
        nome: "decisao_atendimento",
        esquema: ESQUEMA_DECISAO_ATENDIMENTO,
      },
      mensagens: [
        { role: "system", content: PROMPT_BASE_ATENDIMENTO },
        {
          role: "user",
          content: promptDecidirAtendimento(mensagemProp, contexto, conversa, protocolos),
        },
      ],
    }));
  } catch (e) {
    console.error("IA: falha ao decidir o atendimento:", e);
    const falha = classificarErroIa(e);
    registrarDiagnosticoAtendimento(userId, diagnostico, "decisao", "erro", falha);
    return respostaErroIa(falha, 502);
  }

  let decisao;
  try {
    decisao = normalizarDecisaoAtendimento(JSON.parse(textoDecisao), protocolos);
  } catch {
    decisao = null;
  }
  if (!decisao) {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "decisao",
      "erro",
      "resposta-estrutural-invalida",
    );
    return respostaErroIa("falha-modelo", 502);
  }
  diagnostico.confianca = decisao.nivelConfianca;
  diagnostico.informacoesFaltantes = decisao.informacoesFaltantes.length;
  const motivoDecisao = motivoBloqueioDecisaoAtendimento(decisao);
  if (motivoDecisao) {
    diagnostico.protocolosSelecionados = decisao.protocolosAplicaveis.length;
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "decisao",
      "bloqueado",
      motivoDecisao,
    );
    return respostaErroIa(falhaDoBloqueio(motivoDecisao), 422);
  }

  const titulosSelecionados = new Set(decisao.protocolosAplicaveis);
  const protocolosSelecionados = protocolos.filter((p) => titulosSelecionados.has(p.titulo));
  diagnostico.protocolosSelecionados = protocolosSelecionados.length;

  let textoGeracao: string;
  try {
    ({ texto: textoGeracao } = await executor.executar({
      tipo: `${tipo}-geracao`,
      reasoningEffort: "low",
      formato: {
        nome: "resposta_atendimento",
        esquema: ESQUEMA_GERACAO_ATENDIMENTO,
      },
      mensagens: [
        { role: "system", content: PROMPT_BASE_ATENDIMENTO },
        {
          role: "user",
          content: promptGerarAtendimento(
            mensagemProp,
            contexto,
            conversa,
            decisao,
            protocolosSelecionados,
          ),
        },
      ],
    }));
  } catch (e) {
    console.error("IA: falha ao gerar a resposta de atendimento:", e);
    const falha = classificarErroIa(e);
    registrarDiagnosticoAtendimento(userId, diagnostico, "geracao", "erro", falha);
    return respostaErroIa(falha, 502);
  }

  let dadosGeracao: { mensagem?: unknown; protocolosUsados?: unknown };
  try {
    dadosGeracao = JSON.parse(textoGeracao) as typeof dadosGeracao;
  } catch {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "geracao",
      "erro",
      "resposta-estrutural-invalida",
    );
    return respostaErroIa("falha-modelo", 502);
  }
  const rascunho =
    typeof dadosGeracao.mensagem === "string" ? dadosGeracao.mensagem.trim() : "";
  const usadosBrutos = Array.isArray(dadosGeracao.protocolosUsados)
    ? dadosGeracao.protocolosUsados.filter((t): t is string => typeof t === "string")
    : [];
  const titulosPermitidos = new Set(protocolosSelecionados.map((p) => p.titulo));
  if (!rascunho) {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "geracao",
      "bloqueado",
      "geracao-reprovada",
    );
    return respostaErroIa("geracao-reprovada", 422);
  }
  if (usadosBrutos.some((t) => !titulosPermitidos.has(t))) {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "geracao",
      "bloqueado",
      "protocolo-inadequado",
    );
    return respostaErroIa("protocolo-inadequado", 422);
  }
  const protocolosUsados = [...new Set(usadosBrutos)];

  let textoValidacao: string;
  try {
    ({ texto: textoValidacao } = await executor.executar({
      tipo: `${tipo}-validacao`,
      reasoningEffort: "low",
      formato: {
        nome: "validacao_atendimento",
        esquema: ESQUEMA_VALIDACAO_ATENDIMENTO,
      },
      mensagens: [
        { role: "system", content: PROMPT_BASE_ATENDIMENTO },
        {
          role: "user",
          content: promptValidarAtendimento(
            mensagemProp,
            contexto,
            conversa,
            protocolosSelecionados,
            rascunho,
          ),
        },
      ],
    }));
  } catch (e) {
    console.error("IA: falha ao validar a resposta de atendimento:", e);
    const falha = classificarErroIa(e);
    registrarDiagnosticoAtendimento(userId, diagnostico, "validacao", "erro", falha);
    return respostaErroIa(falha, 502);
  }

  let validacao: unknown;
  try {
    validacao = JSON.parse(textoValidacao);
  } catch {
    validacao = null;
  }
  const motivoValidacao = motivoReprovacaoValidacaoAtendimento(validacao);
  if (motivoValidacao === undefined) {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "validacao",
      "erro",
      "resposta-estrutural-invalida",
    );
    return respostaErroIa("falha-modelo", 502);
  }
  if (motivoValidacao) {
    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      "validacao",
      "bloqueado",
      motivoValidacao,
    );
    return respostaErroIa(falhaDoBloqueio(motivoValidacao), 422);
  }

  registrarDiagnosticoAtendimento(userId, diagnostico, "sugestao", "sugerido", "aprovada");
  return Response.json({ ok: true, rascunho, protocolosUsados });
};
