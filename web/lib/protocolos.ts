import type { Protocolo } from "./tipos";

export const TIPOS_PROTOCOLO = ["informacao_comercial", "regra_conduta"] as const;

export type TipoProtocolo = (typeof TIPOS_PROTOCOLO)[number];

export const TIPO_PROTOCOLO_PADRAO: TipoProtocolo = "informacao_comercial";

export function ehTipoProtocolo(valor: unknown): valor is TipoProtocolo {
  return typeof valor === "string" && TIPOS_PROTOCOLO.includes(valor as TipoProtocolo);
}

/**
 * Linhas anteriores à coluna `tipo` mantêm a semântica histórica: eram fontes
 * que a IA podia usar como informação oficial. A migração classifica os
 * títulos de conduta conhecidos; este fallback protege o intervalo de deploy.
 */
export function tipoProtocoloOuPadrao(valor: unknown): TipoProtocolo {
  return ehTipoProtocolo(valor) ? valor : TIPO_PROTOCOLO_PADRAO;
}

export function separarProtocolosAtivos(protocolos: readonly Protocolo[]): {
  informacoesComerciais: Protocolo[];
  regrasConduta: Protocolo[];
} {
  const ativos = protocolos.filter((protocolo) => !protocolo.arquivado);
  return {
    informacoesComerciais: ativos.filter((protocolo) => protocolo.tipo === "informacao_comercial"),
    regrasConduta: ativos.filter((protocolo) => protocolo.tipo === "regra_conduta"),
  };
}
