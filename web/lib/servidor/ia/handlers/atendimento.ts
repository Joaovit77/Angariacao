import { createHash } from "node:crypto";
import {
  ESQUEMA_DECISAO_ATENDIMENTO,
  ESQUEMA_GERACAO_ATENDIMENTO,
  ESQUEMA_VALIDACAO_ATENDIMENTO,
  MAX_PROTOCOLOS,
  promptBaseAtendimento,
  conversaAtendimento,
  contextoAtendimentoDoImovel,
  motivoBloqueioDecisaoAtendimento,
  motivoBloqueioRascunhoDeterministico,
  motivoReprovacaoValidacaoAtendimento,
  normalizarDecisaoAtendimento,
  promptDecidirAtendimento,
  promptGerarAtendimento,
  promptRegenerarAtendimentoSeguro,
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
  type DbUserConfigRow,
} from "@/lib/persistencia/mapeadores";
import { normalizarPerfilComunicacao } from "@/lib/perfilComunicacao";
import { separarProtocolosAtivos } from "@/lib/protocolos";
import { registrarEvento } from "@/lib/servidor/registro";
import type { HandlerIa } from "../dispatcher";
import { classificarErroIa } from "../executor-openai";
import { respostaErroIa } from "../respostas";
import {
  idsProtocolosDeclaradosSemAmbiguidade,
  metadadosExecucaoIa,
} from "@/lib/ia/observabilidade";

type EtapaAtendimento = "contexto" | "decisao" | "geracao" | "validacao" | "sugestao";

interface DiagnosticoAtendimento {
  imovelId: string;
  selecao?: SelecaoMensagensAtendimento;
  protocolosDisponiveis?: number;
  protocolosSelecionados?: number;
  regrasCondutaDisponiveis?: number;
  abordagemCorretorDisponivel?: boolean;
  origemHistorico?: string;
  contextoFingerprint?: string;
  confianca?: "alta" | "media" | "baixa";
  informacoesFaltantes?: number;
  /** IDs comerciais presentes no catálogo da etapa de decisão. */
  protocolosConsiderados?: string[];
  /** IDs comerciais declarados pela geração e associados sem ambiguidade. */
  protocolosAplicados?: string[];
  fontesDeDados?: string[];
  validacoesAplicadas?: string[];
  motivoFallback?: string;
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
      mensagensEnviadas: base.selecao?.mensagensEnviadas ?? null,
      mensagensDisponiveis: base.selecao?.mensagensDisponiveis ?? null,
      mensagensRecebidasDisponiveis: base.selecao?.mensagensRecebidasDisponiveis ?? null,
      mensagensEnviadasDisponiveis: base.selecao?.mensagensEnviadasDisponiveis ?? null,
      mensagensSelecionadas: base.selecao?.mensagensSelecionadas ?? null,
      recebidasSelecionadas: base.selecao?.recebidasSelecionadas ?? null,
      enviadasSelecionadas: base.selecao?.enviadasSelecionadas ?? null,
      historicoBidirecional: base.selecao?.historicoBidirecional ?? null,
      classificacaoHistorico: base.selecao?.classificacaoHistorico ?? null,
      origemHistorico: base.origemHistorico ?? base.selecao?.origemHistorico ?? null,
      descartadasComoMidia: base.selecao?.mensagensDescartadasComoMidia ?? null,
      descartadasVazias: base.selecao?.mensagensDescartadasVazias ?? null,
      protocolosDisponiveis: base.protocolosDisponiveis ?? null,
      protocolosSelecionados: base.protocolosSelecionados ?? null,
      regrasCondutaDisponiveis: base.regrasCondutaDisponiveis ?? null,
      mensagensAntigasRelevantes: base.selecao?.antigasRelevantes.length ?? null,
      abordagemCorretorDisponivel: base.abordagemCorretorDisponivel ?? null,
      contextoFingerprint: base.contextoFingerprint ?? null,
      confianca: base.confianca ?? null,
      informacoesFaltantes: base.informacoesFaltantes ?? null,
      etapaFinal,
      resultado,
      motivo,
      motivoFallback: base.motivoFallback ?? null,
      execucao: metadadosExecucaoIa({
        operacao: "rascunhar-resposta",
        protocolosConsiderados: base.protocolosConsiderados,
        protocolosAplicados: base.protocolosAplicados,
        ferramentasChamadas: [],
        entidadesUtilizadas: [base.imovelId],
        fontesDeDados: base.fontesDeDados,
        validacoesAplicadas: base.validacoesAplicadas,
        resultado: resultado === "sugerido" ? "sugerido" : resultado,
        motivo,
      }),
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
    motivo === "desvio-de-assunto" ||
    motivo === "resposta-longa" ||
    motivo === "perfil-incompativel" ||
    motivo === "acao-incompativel" ||
    motivo === "apresentacao-repetida"
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
  configuracao,
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
  const diagnostico: DiagnosticoAtendimento = {
    imovelId,
    selecao,
    fontesDeDados: ["imoveis", "notas-whatsapp"],
    validacoesAplicadas: ["selecao-deterministica-de-contexto"],
  };
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

  const ultimaTentativa =
    selecao.mensagensEnviadasDisponiveis === 0
      ? [...(imovel.tentativas || [])]
          .sort((a, b) => (a.data || "").localeCompare(b.data || ""))
          .at(-1)
      : undefined;
  let enviada: { rotulo?: string | null; texto?: string | null } | null = null;
  if (ultimaTentativa?.abordagemId) {
    const { data: abRow, error: abErro } = await supabase
      .from("abordagens")
      .select("*")
      .eq("id", ultimaTentativa.abordagemId)
      .maybeSingle();
    if (abErro) {
      console.error("IA: falha ao ler a abordagem para rascunho:", abErro.message);
      // É somente fallback de legado. Uma indisponibilidade parcial do
      // catálogo não deve derrubar o histórico real já carregado.
    } else if (abRow) {
      const abordagem = fromDbAbordagem(abRow as DbAbordagemRow);
      enviada = { rotulo: abordagem.nome, texto: abordagem.roteiro };
    }
  } else if (ultimaTentativa?.modeloNome) {
    enviada = { rotulo: ultimaTentativa.modeloNome, texto: null };
  }
  diagnostico.abordagemCorretorDisponivel = !!enviada;
  diagnostico.origemHistorico =
    selecao.mensagensEnviadasDisponiveis === 0 && enviada
      ? `${selecao.origemHistorico}+ultima-abordagem-legada`
      : selecao.origemHistorico;

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
  const protocolos = ((ptData || []) as DbProtocoloRow[]).map(fromDbProtocolo);
  const { informacoesComerciais, regrasConduta } = separarProtocolosAtivos(protocolos);
  const informacoesComerciaisConsideradas = informacoesComerciais.slice(0, MAX_PROTOCOLOS);
  (diagnostico.fontesDeDados ??= []).push("protocolos");
  diagnostico.protocolosConsiderados = informacoesComerciaisConsideradas
    .map((protocolo) => protocolo.id)
    .filter((id): id is string => typeof id === "string" && id !== "");
  const informacoesComerciaisPrompt = informacoesComerciaisConsideradas.map((protocolo) => ({
    titulo: protocolo.titulo,
    conteudo: protocolo.conteudo,
  }));
  const regrasCondutaPrompt = regrasConduta.map((protocolo) => ({
    titulo: protocolo.titulo,
    conteudo: protocolo.conteudo,
  }));

  const { data: cfData, error: cfErro } = await supabase
    .from("user_config")
    .select("perfil_comunicacao")
    .maybeSingle();
  if (cfErro) {
    // Compatibilidade durante a aplicação do schema: o perfil seguro mantém o
    // rascunho disponível, sem importar configuração de outra conta.
    console.error("IA: falha ao ler o perfil de comunicação; usando padrão seguro:", cfErro.message);
  }
  const perfil = normalizarPerfilComunicacao((cfData as Pick<DbUserConfigRow, "perfil_comunicacao"> | null)?.perfil_comunicacao);
  if (!cfErro) (diagnostico.fontesDeDados ??= []).push("user_config");

  diagnostico.protocolosDisponiveis = informacoesComerciais.length;
  diagnostico.regrasCondutaDisponiveis = regrasCondutaPrompt.length;
  const promptSistema = promptBaseAtendimento(
    configuracao?.instrucaoAtendimento,
    regrasCondutaPrompt,
  );
  const conversa = conversaAtendimento(selecao, enviada);
  const contexto = contextoAtendimentoDoImovel(imovel);
  diagnostico.contextoFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        mensagemProp,
        contexto,
        conversa,
        informacoesComerciais: informacoesComerciaisPrompt,
        regrasConduta: regrasCondutaPrompt,
        perfil,
      }),
    )
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
        { role: "system", content: promptSistema },
        {
          role: "user",
          content: promptDecidirAtendimento(
            mensagemProp,
            contexto,
            conversa,
            informacoesComerciaisPrompt,
            selecao.mensagemAtualId,
          ),
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
    const idsMensagens = [
      selecao.mensagemAtualId,
      ...selecao.anteriores.map((m) => m.id),
      ...selecao.antigasRelevantes.map((m) => m.id),
    ].filter((id): id is string => !!id);
    decisao = normalizarDecisaoAtendimento(
      JSON.parse(textoDecisao),
      informacoesComerciaisPrompt,
      idsMensagens,
    );
  } catch {
    decisao = null;
  }
  (diagnostico.validacoesAplicadas ??= []).push("normalizacao-estrita-da-decisao");
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
  (diagnostico.validacoesAplicadas ??= []).push("bloqueio-de-seguranca-da-decisao");
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
  const protocolosSelecionados = informacoesComerciaisPrompt.filter((protocolo) =>
    titulosSelecionados.has(protocolo.titulo),
  );
  diagnostico.protocolosSelecionados = protocolosSelecionados.length;

  const titulosPermitidos = new Set(protocolosSelecionados.map((p) => p.titulo));
  let motivoAnterior: MotivoBloqueioAtendimento | null = null;

  // Uma reprovação de conteúdo ganha uma segunda geração do zero. Erros de
  // transporte ou structured output inválido continuam falhando claramente:
  // o fallback não pode esconder problema estrutural do modelo/integração.
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const usandoFallback = tentativa === 1;
    let textoGeracao: string;
    try {
      ({ texto: textoGeracao } = await executor.executar({
        tipo: `${tipo}-geracao${usandoFallback ? "-fallback" : ""}`,
        reasoningEffort: "low",
        formato: {
          nome: "resposta_atendimento",
          esquema: ESQUEMA_GERACAO_ATENDIMENTO,
        },
        mensagens: [
          { role: "system", content: promptSistema },
          {
            role: "user",
            content: usandoFallback
              ? promptRegenerarAtendimentoSeguro(
                  mensagemProp,
                  contexto,
                  conversa,
                  decisao,
                  protocolosSelecionados,
                  perfil,
                  selecao.mensagemAtualId,
                  motivoAnterior || "geracao-reprovada",
                )
              : promptGerarAtendimento(
                  mensagemProp,
                  contexto,
                  conversa,
                  decisao,
                  protocolosSelecionados,
                  perfil,
                  selecao.mensagemAtualId,
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
    const protocolosUsados = [...new Set(usadosBrutos)];
    let motivo: MotivoBloqueioAtendimento | null = !rascunho
      ? "geracao-reprovada"
      : usadosBrutos.some((titulo) => !titulosPermitidos.has(titulo))
        ? "protocolo-inadequado"
        : null;
    let etapaBloqueio: EtapaAtendimento = "geracao";

    (diagnostico.validacoesAplicadas ??= []).push(
      usandoFallback
        ? "protocolos-declarados-contra-catalogo-fallback"
        : "protocolos-declarados-contra-catalogo",
    );
    diagnostico.protocolosAplicados = idsProtocolosDeclaradosSemAmbiguidade(
      informacoesComerciaisConsideradas,
      protocolosUsados,
    );

    if (!motivo) {
      (diagnostico.validacoesAplicadas ??= []).push(
        usandoFallback
          ? "bloqueios-deterministicos-do-rascunho-fallback"
          : "bloqueios-deterministicos-do-rascunho",
      );
      motivo = motivoBloqueioRascunhoDeterministico(
        rascunho,
        protocolosUsados,
        decisao,
        perfil,
      );
    }

    if (!motivo) {
      let textoValidacao: string;
      try {
        ({ texto: textoValidacao } = await executor.executar({
          tipo: `${tipo}-validacao${usandoFallback ? "-fallback" : ""}`,
          reasoningEffort: "low",
          formato: {
            nome: "validacao_atendimento",
            esquema: ESQUEMA_VALIDACAO_ATENDIMENTO,
          },
          mensagens: [
            { role: "system", content: promptSistema },
            {
              role: "user",
              content: promptValidarAtendimento(
                mensagemProp,
                contexto,
                conversa,
                protocolosSelecionados,
                rascunho,
                decisao,
                protocolosUsados,
                perfil,
                selecao.mensagemAtualId,
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
      (diagnostico.validacoesAplicadas ??= []).push(
        usandoFallback
          ? "validacao-independente-da-resposta-fallback"
          : "validacao-independente-da-resposta",
      );
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
      motivo = motivoValidacao;
      etapaBloqueio = "validacao";
    }

    if (!motivo) {
      registrarDiagnosticoAtendimento(
        userId,
        diagnostico,
        "sugestao",
        "sugerido",
        usandoFallback ? "aprovada-apos-fallback" : "aprovada",
      );
      return Response.json({ ok: true, rascunho, protocolosUsados, fallbackAplicado: usandoFallback });
    }

    if (!usandoFallback) {
      motivoAnterior = motivo;
      diagnostico.motivoFallback = motivo;
      (diagnostico.validacoesAplicadas ??= []).push("regeneracao-segura-pos-reprovacao");
      continue;
    }

    registrarDiagnosticoAtendimento(
      userId,
      diagnostico,
      etapaBloqueio,
      "bloqueado",
      motivo,
    );
    return respostaErroIa(falhaDoBloqueio(motivo), 422);
  }

  return respostaErroIa("geracao-reprovada", 422);
};
