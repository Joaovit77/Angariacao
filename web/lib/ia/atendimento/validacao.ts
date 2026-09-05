import {
  ESQUEMA_DECISAO_ATENDIMENTO, ESQUEMA_GERACAO_ATENDIMENTO, ESQUEMA_VALIDACAO_ATENDIMENTO,
  PROBLEMAS_VALIDACAO_ATENDIMENTO,
  type AfirmacaoAtendimento,
  type EvidenciaAtendimento,
  type FonteEvidenciaAtendimento,
  type GeracaoAtendimento,
  type LacunaAtendimento,
  type ProblemaValidacaoAtendimento,
  MAX_PROTOCOLOS_APLICAVEIS,
  MAX_TEXTO_RASCUNHO,
  type DecisaoAtendimento,
  type ProtocoloPrompt,
  type ValidacaoAtendimento,
} from "./contratos";
import { limiteRespostaPerfil, type PerfilComunicacao } from "@/lib/perfilComunicacao";

import { atendeSchemaAtendimento } from "./schema";

const MAX_CONTEXTO_ATENDIMENTO = 200;

export type MotivoBloqueioAtendimento =
  | ProblemaValidacaoAtendimento
  | "baixa-confianca"
  | "contexto-incompleto"
  | "decisao-bloqueada"
  | "geracao-reprovada"
  | "protocolo-inadequado"
  | "informacao-sem-fonte"
  | "desvio-de-assunto"
  | "resposta-longa"
  | "perfil-incompativel"
  | "acao-incompativel"
  | "apresentacao-repetida";

export function normalizarDecisaoAtendimento(
  valor: unknown,
  protocolos: readonly ProtocoloPrompt[],
  catalogoFontes: readonly FonteEvidenciaAtendimento[],
): DecisaoAtendimento | null {
  if (!atendeSchemaAtendimento(valor, ESQUEMA_DECISAO_ATENDIMENTO)) return null;
  const d = valor as Record<string, unknown>;
  if (!["alta", "media", "baixa"].includes(String(d.nivelConfianca))) return null;
  if (
    typeof d.precisaIntervencaoHumana !== "boolean" ||
    typeof d.podeResponderComSeguranca !== "boolean"
  )
    return null;
  const titulos = new Set(protocolos.map((p) => p.titulo));
  const fontesPorId = new Map(catalogoFontes.map((fonte) => [fonte.id, fonte]));
  const lista = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  const protocolosAplicaveis = lista(d.protocolosAplicaveis)
    .filter((t) => titulos.has(t))
    .slice(0, MAX_PROTOCOLOS_APLICAVEIS);
  if (protocolosAplicaveis.length !== lista(d.protocolosAplicaveis).length) return null;

  const temporalidadeComEventoValida = (temporalidade: string, evento: string) =>
    temporalidade === "antes-de-evento" || temporalidade === "depois-de-evento"
      ? evento.trim().length > 0
      : evento.trim().length === 0;
  const evidencias = d.evidencias as EvidenciaAtendimento[];
  if (evidencias.some((evidencia, indice) => {
    const fonte = fontesPorId.get(evidencia.fonteId);
    return evidencia.id !== `evidencia_${indice + 1}`
      || !fonte
      || !evidencia.fato.trim()
      || !temporalidadeComEventoValida(evidencia.temporalidade, evidencia.evento);
  })) return null;
  const informacoesFaltantes = d.informacoesFaltantes as LacunaAtendimento[];
  if (informacoesFaltantes.some((lacuna, indice) =>
    lacuna.id !== `lacuna_${indice + 1}`
    || !lacuna.descricao.trim()
    || !temporalidadeComEventoValida(lacuna.temporalidade, lacuna.evento)
  )) return null;

  return {
    intencao:
      typeof d.intencao === "string" && d.intencao.trim()
        ? d.intencao.trim().slice(0, MAX_CONTEXTO_ATENDIMENTO)
        : "outro assunto",
    objecao: typeof d.objecao === "string" ? d.objecao.trim().slice(0, MAX_CONTEXTO_ATENDIMENTO) : "",
    estadoConversacional: ["abertura", "entendimento", "avaliando-interesse", "negociacao", "aguardando", "encerramento", "outro"].includes(String(d.estadoConversacional))
      ? (String(d.estadoConversacional) as DecisaoAtendimento["estadoConversacional"])
      : "outro",
    contextoRelevante:
      typeof d.contextoRelevante === "string"
        ? d.contextoRelevante.trim().slice(0, MAX_TEXTO_RASCUNHO)
        : "",
    informacoesJaExplicadas: lista(d.informacoesJaExplicadas).slice(0, 8),
    acaoEsperada: ["responder", "perguntar", "aguardar", "encerrar"].includes(String(d.acaoEsperada))
      ? (String(d.acaoEsperada) as DecisaoAtendimento["acaoEsperada"])
      : "responder",
    proximoPassoPermitido:
      typeof d.proximoPassoPermitido === "string"
        ? d.proximoPassoPermitido.trim().slice(0, MAX_CONTEXTO_ATENDIMENTO)
        : "responder ao assunto atual",
    acoesProibidas: lista(d.acoesProibidas)
      .filter((acao): acao is DecisaoAtendimento["acoesProibidas"][number] =>
        ["apresentar-imobiliaria", "explicar-condicoes", "perguntar-exclusividade", "marcar-visita", "pedir-fotos", "pedir-autorizacao", "cadastrar-imovel", "insistir", "avancar-etapa"].includes(acao),
      )
      .slice(0, 9),
    protocolosAplicaveis,
    evidencias: evidencias.map((evidencia) => ({
      ...evidencia,
      fato: evidencia.fato.trim(),
      evento: evidencia.evento.trim(),
    })),
    informacoesFaltantes: informacoesFaltantes.map((lacuna) => ({
      ...lacuna,
      descricao: lacuna.descricao.trim(),
      evento: lacuna.evento.trim(),
    })),
    nivelConfianca: String(d.nivelConfianca) as DecisaoAtendimento["nivelConfianca"],
    precisaIntervencaoHumana: d.precisaIntervencaoHumana,
    podeResponderComSeguranca: d.podeResponderComSeguranca,
  };
}

const PADROES_ACAO: Partial<Record<DecisaoAtendimento["acoesProibidas"][number], RegExp>> = {
  "apresentar-imobiliaria": /\b(?:meu nome e|falo da|sou da|somos da)\b/i,
  // Explicar condições depende do contexto: mencionar uma taxa para confirmar sua
  // existência não é explicá-la. A auditoria semântica obrigatória verifica essa ação.
  "perguntar-exclusividade": /\bexclusiv\w*\b[^?]{0,50}\?/i,
  "marcar-visita": /\b(?:marcar|agendar|combinar)\b.{0,35}\bvisita\b/i,
  "pedir-fotos": /\b(?:manda|envia|pode mandar|pode enviar)\b.{0,25}\bfotos?\b/i,
  "pedir-autorizacao": /\b(?:autoriza|autorizacao|podemos anunciar|posso anunciar)\b/i,
  "cadastrar-imovel": /\b(?:cadastrar|cadastro)\b.{0,30}\bimovel\b/i,
  insistir: /\b(?:vale a pena|pense melhor|posso insistir|oportunidade|beneficios?)\b/i,
  "avancar-etapa": /\b(?:ja podemos|vamos entao|proximo passo e)\b/i,
};

/** Valida somente a cadeia tipada afirmação -> evidência/lacuna -> fonte. */
export function motivoBloqueioAfirmacoesDeterministico(
  protocolosUsados: readonly string[],
  afirmacoes: readonly AfirmacaoAtendimento[],
  decisao: DecisaoAtendimento,
  catalogoFontes: readonly FonteEvidenciaAtendimento[],
): "informacao-sem-fonte" | "protocolo-inadequado" | null {
  const evidenciasPorId = new Map(decisao.evidencias.map((evidencia) => [evidencia.id, evidencia]));
  const lacunasPorId = new Map(decisao.informacoesFaltantes.map((lacuna) => [lacuna.id, lacuna]));
  const fontesPorId = new Map(catalogoFontes.map((fonte) => [fonte.id, fonte]));
  const protocolosReferenciados = new Set<string>();
  const mesmoEscopo = (
    origem: { temporalidade: string; evento: string },
    destino: { temporalidade: string; evento: string },
  ) => origem.temporalidade === "atemporal"
    || (origem.temporalidade === destino.temporalidade
      && origem.evento === destino.evento);

  for (const afirmacao of afirmacoes) {
    const evidencias = afirmacao.evidencias.map((id) => evidenciasPorId.get(id));
    const lacunas = afirmacao.lacunas.map((id) => lacunasPorId.get(id));
    if (evidencias.some((evidencia) => !evidencia) || lacunas.some((lacuna) => !lacuna)) {
      return "informacao-sem-fonte";
    }
    if (afirmacao.tipo === "fato") {
      if (evidencias.length === 0 || lacunas.length > 0
        || !evidencias.some((evidencia) => evidencia && mesmoEscopo(evidencia, afirmacao))) {
        return "informacao-sem-fonte";
      }
    } else if (lacunas.length === 0
      || !lacunas.some((lacuna) => lacuna && mesmoEscopo(lacuna, afirmacao))) {
      return "informacao-sem-fonte";
    }
    for (const evidencia of evidencias) {
      if (!evidencia) continue;
      const fonte = fontesPorId.get(evidencia.fonteId);
      if (!fonte) return "informacao-sem-fonte";
      if (fonte.origem === "protocolo") {
        protocolosReferenciados.add(fonte.referencia);
        if (!protocolosUsados.includes(fonte.referencia)) return "protocolo-inadequado";
      }
    }
  }
  if (protocolosUsados.some((titulo) => !protocolosReferenciados.has(titulo))) {
    return "protocolo-inadequado";
  }
  return null;
}

/**
 * Remove somente a acusação que contradiz a cadeia estruturada completa.
 * Sem afirmações auditadas não há prova suficiente para contrariar o auditor.
 */
export function reconciliarValidacaoAtendimentoComEvidencias(
  validacao: ValidacaoAtendimento,
  protocolosUsados: readonly string[],
  decisao: DecisaoAtendimento,
  catalogoFontes: readonly FonteEvidenciaAtendimento[],
): ValidacaoAtendimento {
  if (!validacao.problemas.includes("informacao-sem-fonte")
    || validacao.afirmacoesAuditadas.length === 0
    || motivoBloqueioAfirmacoesDeterministico(
      protocolosUsados,
      validacao.afirmacoesAuditadas,
      decisao,
      catalogoFontes,
    ) !== null) {
    return validacao;
  }
  return {
    ...validacao,
    problemas: validacao.problemas.filter((problema) => problema !== "informacao-sem-fonte"),
  };
}

/** Barreiras locais aplicadas ao texto inteiro antes da terceira chamada. */
export function motivoBloqueioRascunhoDeterministico(
  rascunho: string,
  protocolosUsados: readonly string[],
  afirmacoes: readonly AfirmacaoAtendimento[],
  decisao: DecisaoAtendimento,
  perfil: PerfilComunicacao,
  catalogoFontes: readonly FonteEvidenciaAtendimento[],
): MotivoBloqueioAtendimento | null {
  const texto = rascunho.trim();
  const textoNormalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!texto) return "geracao-reprovada";
  if (texto.length > limiteRespostaPerfil(perfil)) return "resposta-longa";
  if (perfil.emojis === "nenhum" && /\p{Extended_Pictographic}/u.test(texto)) return "perfil-incompativel";
  const motivoAfirmacoes = motivoBloqueioAfirmacoesDeterministico(
    protocolosUsados,
    afirmacoes,
    decisao,
    catalogoFontes,
  );
  if (motivoAfirmacoes) return motivoAfirmacoes;
  const frases = textoNormalizado.split(/(?<=[.!?])\s+|\n+/);
  if (protocolosUsados.length === 0 && frases.some((frase) =>
    /\b(?:taxa|comissao|multa|isencao|primeiro aluguel|garantia|vistoria|exclusividade|responsabilidade|procedimento)\b/i.test(frase)
    && /(?:R\$|%|\b\d+[,.]?\d*\b|\b(?:e|sao|cobramos|inclui|exigimos|aceitamos|corresponde)\b)/i.test(frase)
    && !/^\s*(?:(?:eu )?(?:vou|posso|preciso) confirmar\b|nao (?:quero|vou) te passar\b)/i.test(frase)
  )) return "informacao-sem-fonte";
  if (decisao.acoesProibidas.some((acao) => PADROES_ACAO[acao]?.test(textoNormalizado))) return "acao-incompativel";
  if (
    decisao.acaoEsperada === "encerrar" &&
    /\b(?:beneficio|oportunidade|agendar|visita|fotos?|divulgacao|autoriza|taxa|vantagem)\b/i.test(textoNormalizado)
  )
    return "acao-incompativel";
  if (!/\b(?:quem e voce|quem fala|identific)\b/i.test(decisao.intencao.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) && PADROES_ACAO["apresentar-imobiliaria"]?.test(textoNormalizado))
    return "apresentacao-repetida";
  return null;
}

export function validacaoAprovaAtendimento(valor: unknown): valor is ValidacaoAtendimento {
  return motivoReprovacaoValidacaoAtendimento(valor) === null;
}

export function motivoBloqueioDecisaoAtendimento(
  decisao: DecisaoAtendimento,
): MotivoBloqueioAtendimento | null {
  if (!decisao.precisaIntervencaoHumana && decisao.podeResponderComSeguranca) return null;
  if (decisao.nivelConfianca === "baixa") return "baixa-confianca";
  if (decisao.informacoesFaltantes.length > 0) return "contexto-incompleto";
  return "decisao-bloqueada";
}

/**
 * Traduz os campos objetivos do validador no motivo interno da reprova.
 * `undefined` significa resposta estruturalmente invalida do modelo; `null`,
 * aprovacao. Nenhum texto da conversa ou raciocinio do modelo e retornado.
 */
export function motivoReprovacaoValidacaoAtendimento(
  valor: unknown,
): MotivoBloqueioAtendimento | null | undefined {
  const validacao = normalizarValidacaoAtendimento(valor);
  if (!validacao) return undefined;
  const { problemas } = validacao;
  // Uma falha terminal nunca pode ser escondida pela ordem escolhida pelo modelo.
  if (problemas.includes("intervencao-humana")) return "intervencao-humana";
  return problemas[0] ?? null;
}

function normalizarAfirmacoesAtendimento(
  afirmacoes: readonly AfirmacaoAtendimento[],
): AfirmacaoAtendimento[] | null {
  const temporalidadeComEventoValida = (afirmacao: AfirmacaoAtendimento) =>
    afirmacao.temporalidade === "antes-de-evento" || afirmacao.temporalidade === "depois-de-evento"
      ? afirmacao.evento.trim().length > 0
      : afirmacao.evento.trim().length === 0;
  if (afirmacoes.some((afirmacao) =>
    !afirmacao.descricao.trim()
    || !temporalidadeComEventoValida(afirmacao)
  )) return null;
  return afirmacoes.map((afirmacao) => ({
    ...afirmacao,
    descricao: afirmacao.descricao.trim(),
    evento: afirmacao.evento.trim(),
  }));
}

export function normalizarValidacaoAtendimento(valor: unknown): ValidacaoAtendimento | null {
  if (!atendeSchemaAtendimento(valor, ESQUEMA_VALIDACAO_ATENDIMENTO)) return null;
  const validacao = valor as ValidacaoAtendimento;
  const afirmacoesAuditadas = normalizarAfirmacoesAtendimento(validacao.afirmacoesAuditadas);
  if (!afirmacoesAuditadas) return null;
  return { problemas: [...validacao.problemas], afirmacoesAuditadas };
}

export function normalizarGeracaoAtendimento(valor: unknown): GeracaoAtendimento | null {
  if (!atendeSchemaAtendimento(valor, ESQUEMA_GERACAO_ATENDIMENTO)) return null;
  const geracao = valor as GeracaoAtendimento;
  const afirmacoes = normalizarAfirmacoesAtendimento(geracao.afirmacoes);
  if (!afirmacoes) return null;
  return {
    mensagem: geracao.mensagem.trim(),
    protocolosUsados: [...new Set(geracao.protocolosUsados)],
    afirmacoes,
  };
}

/** Só falhas corrigíveis por reescrita recebem nova geração. */
export function podeRegenerarAtendimento(motivo: MotivoBloqueioAtendimento): boolean {
  return motivo === "geracao-reprovada" || (
    motivo !== "intervencao-humana"
    && (PROBLEMAS_VALIDACAO_ATENDIMENTO as readonly string[]).includes(motivo)
  );
}
