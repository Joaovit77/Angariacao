export type ResultadoExecucaoIa = "sugerido" | "respondido" | "bloqueado" | "erro";

/**
 * Fatos seguros e estruturados sobre uma execução. Não comporta conteúdo de
 * conversa, prompts, respostas completas nem raciocínio interno do modelo.
 */
export interface MetadadosExecucaoIa {
  operacao: string;
  protocolosConsiderados: string[];
  /** IDs associados de forma inequívoca aos protocolos declarados na saída
   *  estruturada e aceitos pelas validações disponíveis. Não representa
   *  inferência sobre o raciocínio interno do modelo. */
  protocolosAplicados: string[];
  ferramentasChamadas: string[];
  entidadesUtilizadas: string[];
  fontesDeDados: string[];
  validacoesAplicadas: string[];
  blocosContexto: string[];
  fontesContexto: string[];
  consultasExecutadas: number | null;
  duracaoContextoMs: number | null;
  caracteresContexto: number | null;
  tokensContextoAproximados: number | null;
  consultasReutilizadas: number | null;
  resultado: ResultadoExecucaoIa;
  motivo: string;
}

const unicos = (valores: readonly (string | null | undefined)[]) => [
  ...new Set(valores.filter((valor): valor is string => typeof valor === "string" && valor.trim() !== "")),
];

type CamposListaMetadados =
  | "protocolosConsiderados"
  | "protocolosAplicados"
  | "ferramentasChamadas"
  | "entidadesUtilizadas"
  | "fontesDeDados"
  | "validacoesAplicadas"
  | "blocosContexto"
  | "fontesContexto";

type EntradaMetadadosExecucaoIa = Omit<MetadadosExecucaoIa, CamposListaMetadados | "consultasExecutadas" | "duracaoContextoMs" | "caracteresContexto" | "tokensContextoAproximados" | "consultasReutilizadas"> & {
  [Campo in CamposListaMetadados]?: readonly (string | null | undefined)[];
} & Pick<Partial<MetadadosExecucaoIa>, "consultasExecutadas" | "duracaoContextoMs" | "caracteresContexto" | "tokensContextoAproximados" | "consultasReutilizadas">;

export function metadadosExecucaoIa(
  entrada: EntradaMetadadosExecucaoIa,
): MetadadosExecucaoIa {
  return {
    ...entrada,
    protocolosConsiderados: unicos(entrada.protocolosConsiderados || []),
    protocolosAplicados: unicos(entrada.protocolosAplicados || []),
    ferramentasChamadas: unicos(entrada.ferramentasChamadas || []),
    entidadesUtilizadas: unicos(entrada.entidadesUtilizadas || []),
    fontesDeDados: unicos(entrada.fontesDeDados || []),
    validacoesAplicadas: unicos(entrada.validacoesAplicadas || []),
    blocosContexto: unicos(entrada.blocosContexto || []),
    fontesContexto: unicos(entrada.fontesContexto || []),
    consultasExecutadas: entrada.consultasExecutadas ?? null,
    duracaoContextoMs: entrada.duracaoContextoMs ?? null,
    caracteresContexto: entrada.caracteresContexto ?? null,
    tokensContextoAproximados: entrada.tokensContextoAproximados ?? null,
    consultasReutilizadas: entrada.consultasReutilizadas ?? null,
  };
}

export interface DiagnosticoContextoAssistente {
  operacao: "assistente_contexto";
  blocos: string[];
  fontes: string[];
  consultas: number;
  consultas_reutilizadas: number;
  duracao_ms: number;
  tamanho_aproximado: number;
  tokens_aproximados: number;
}

const BLOCOS_CONTEXTO_SEGUROS = new Set([
  "imovel", "agenda", "pipeline", "conversa", "mensagens", "protocolos", "avaliacao", "mercado",
]);
const FONTES_CONTEXTO_SEGURAS = new Set([
  "imoveis", "agenda", "protocolos", "imoveis.status+status_history+notas+tentativas",
]);

function inteiroNaoNegativo(valor: number): number {
  return Number.isFinite(valor) ? Math.max(0, Math.round(valor)) : 0;
}

/** Projeção independente do histórico persistido, própria para logs de servidor.
 * Aceita somente nomes estruturais em allowlist e contagens; não comporta
 * pergunta, contexto serializado, IDs, prompt, resposta ou dados pessoais. */
export function diagnosticoContextoAssistente(entrada: {
  blocos: readonly string[];
  fontes: readonly string[];
  consultas: number;
  consultasReutilizadas: number;
  duracaoMs: number;
  caracteresContexto: number;
  tokensContextoAproximados: number;
}): DiagnosticoContextoAssistente {
  return {
    operacao: "assistente_contexto",
    blocos: unicos(entrada.blocos).filter((bloco) => BLOCOS_CONTEXTO_SEGUROS.has(bloco)),
    fontes: unicos(entrada.fontes).filter((fonte) => FONTES_CONTEXTO_SEGURAS.has(fonte)),
    consultas: inteiroNaoNegativo(entrada.consultas),
    consultas_reutilizadas: inteiroNaoNegativo(entrada.consultasReutilizadas),
    duracao_ms: inteiroNaoNegativo(entrada.duracaoMs),
    tamanho_aproximado: inteiroNaoNegativo(entrada.caracteresContexto),
    tokens_aproximados: inteiroNaoNegativo(entrada.tokensContextoAproximados),
  };
}

/**
 * Converte títulos declarados pelo modelo em IDs somente quando a associação
 * é inequívoca. Títulos duplicados não permitem atribuir causalidade a uma
 * linha específica e, portanto, não viram rastreabilidade inventada.
 */
export function idsProtocolosDeclaradosSemAmbiguidade(
  protocolos: readonly { id?: unknown; titulo?: unknown }[],
  titulosDeclarados: readonly string[],
): string[] {
  const protocolosPorTitulo = new Map<string, Array<{ id?: unknown }>>();
  for (const protocolo of protocolos) {
    if (typeof protocolo.titulo !== "string") continue;
    const existentes = protocolosPorTitulo.get(protocolo.titulo) || [];
    existentes.push(protocolo);
    protocolosPorTitulo.set(protocolo.titulo, existentes);
  }

  return unicos(
    titulosDeclarados.flatMap((titulo) => {
      const correspondencias = protocolosPorTitulo.get(titulo) || [];
      if (correspondencias.length !== 1) return [];
      const id = correspondencias[0].id;
      return typeof id === "string" && id !== "" ? [id] : [];
    }),
  );
}
