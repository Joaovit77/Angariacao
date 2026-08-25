import {
  MAX_PROTOCOLOS_APLICAVEIS,
  MAX_TEXTO_RASCUNHO,
  type DecisaoAtendimento,
  type ProtocoloPrompt,
  type ValidacaoAtendimento,
} from "./contratos";
import { limiteRespostaPerfil, type PerfilComunicacao } from "@/lib/perfilComunicacao";

const MAX_CONTEXTO_ATENDIMENTO = 200;

export type MotivoBloqueioAtendimento =
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
  idsMensagens: readonly string[] = [],
): DecisaoAtendimento | null {
  if (!valor || typeof valor !== "object") return null;
  const d = valor as Record<string, unknown>;
  if (!["alta", "media", "baixa"].includes(String(d.nivelConfianca))) return null;
  if (
    typeof d.precisaIntervencaoHumana !== "boolean" ||
    typeof d.podeResponderComSeguranca !== "boolean"
  )
    return null;
  const titulos = new Set(protocolos.map((p) => p.titulo));
  const evidenciasPermitidas = new Set(idsMensagens.filter(Boolean));
  const lista = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
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
    protocolosAplicaveis: lista(d.protocolosAplicaveis)
      .filter((t) => titulos.has(t))
      .slice(0, MAX_PROTOCOLOS_APLICAVEIS),
    mensagensEvidencia: lista(d.mensagensEvidencia)
      .filter((id) => evidenciasPermitidas.has(id))
      .slice(0, 8),
    informacoesFaltantes: lista(d.informacoesFaltantes).slice(0, 8),
    nivelConfianca: String(d.nivelConfianca) as DecisaoAtendimento["nivelConfianca"],
    precisaIntervencaoHumana: d.precisaIntervencaoHumana,
    podeResponderComSeguranca: d.podeResponderComSeguranca,
  };
}

const PADROES_ACAO: Record<DecisaoAtendimento["acoesProibidas"][number], RegExp> = {
  "apresentar-imobiliaria": /\b(?:meu nome e|falo da|sou da|somos da)\b/i,
  "explicar-condicoes": /\b(?:taxa|comissao|primeiro aluguel|garantia|exclusividade|condicoes de trabalho)\b/i,
  "perguntar-exclusividade": /\bexclusiv\w*\b[^?]{0,50}\?/i,
  "marcar-visita": /\b(?:marcar|agendar|combinar)\b.{0,35}\bvisita\b/i,
  "pedir-fotos": /\b(?:manda|envia|pode mandar|pode enviar)\b.{0,25}\bfotos?\b/i,
  "pedir-autorizacao": /\b(?:autoriza|autorizacao|podemos anunciar|posso anunciar)\b/i,
  "cadastrar-imovel": /\b(?:cadastrar|cadastro)\b.{0,30}\bimovel\b/i,
  insistir: /\b(?:vale a pena|pense melhor|posso insistir|oportunidade|beneficios?)\b/i,
  "avancar-etapa": /\b(?:ja podemos|vamos entao|proximo passo e)\b/i,
};

/** Barreiras locais aplicadas ao texto inteiro antes da terceira chamada. */
export function motivoBloqueioRascunhoDeterministico(
  rascunho: string,
  protocolosUsados: readonly string[],
  decisao: DecisaoAtendimento,
  perfil: PerfilComunicacao,
): MotivoBloqueioAtendimento | null {
  const texto = rascunho.trim();
  const textoNormalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!texto) return "geracao-reprovada";
  if (texto.length > limiteRespostaPerfil(perfil)) return "resposta-longa";
  if (perfil.emojis === "nenhum" && /\p{Extended_Pictographic}/u.test(texto)) return "perfil-incompativel";
  if (
    /\b(?:taxa|comissao|primeiro aluguel|garantia|vistoria|exclusividade|responsabilidade|procedimento)\b/i.test(textoNormalizado) &&
    /(?:R\$|%|\b\d+[,.]?\d*\b|\b(?:e|sao|cobramos|inclui|exigimos|aceitamos|corresponde)\b)/i.test(textoNormalizado) &&
    !/\b(?:vou|posso|preciso) confirmar\b|\bnao (?:quero|vou) te passar\b/i.test(textoNormalizado) &&
    protocolosUsados.length === 0
  )
    return "informacao-sem-fonte";
  if (decisao.acoesProibidas.some((acao) => PADROES_ACAO[acao].test(textoNormalizado))) return "acao-incompativel";
  if (
    decisao.acaoEsperada === "encerrar" &&
    /\b(?:beneficio|oportunidade|agendar|visita|fotos?|divulgacao|autoriza|taxa|vantagem)\b/i.test(textoNormalizado)
  )
    return "acao-incompativel";
  if (!/\b(?:quem e voce|quem fala|identific)\b/i.test(decisao.intencao.normalize("NFD").replace(/[\u0300-\u036f]/g, "")) && PADROES_ACAO["apresentar-imobiliaria"].test(textoNormalizado))
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
  if (!valor || typeof valor !== "object") return undefined;
  const v = valor as Record<keyof ValidacaoAtendimento, unknown>;
  const campos = [
    "aprovada",
    "respondeAMensagem",
    "coerenteComHistorico",
    "semProtocoloDesnecessario",
    "somenteFatosComFonte",
    "semDesvioDeAssunto",
    "informacaoSuficienteParaEstaResposta",
    "seguraParaSugerir",
  ] as const;
  if (campos.some((campo) => typeof v[campo] !== "boolean")) return undefined;
  if (campos.every((campo) => v[campo] === true)) return null;
  if (v.semProtocoloDesnecessario === false) return "protocolo-inadequado";
  if (v.somenteFatosComFonte === false) return "informacao-sem-fonte";
  if (v.semDesvioDeAssunto === false) return "desvio-de-assunto";
  if (v.informacaoSuficienteParaEstaResposta === false) return "contexto-incompleto";
  if (v.seguraParaSugerir === false) return "baixa-confianca";
  return "geracao-reprovada";
}
