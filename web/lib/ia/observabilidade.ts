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
  | "validacoesAplicadas";

type EntradaMetadadosExecucaoIa = Omit<MetadadosExecucaoIa, CamposListaMetadados> & {
  [Campo in CamposListaMetadados]?: readonly (string | null | undefined)[];
};

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
