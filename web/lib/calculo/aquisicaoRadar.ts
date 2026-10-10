import type { FiltrosCentralAngariacao, PortalAngariacao } from "./centralAngariacao";
import { normalizarUf, ufValida } from "./geografia";
import { chaveNormalizada } from "../normalizacao";

export type FinalidadeRadar = "locacao" | "venda";
export type TipoRecorteRadar = "casa" | "apartamento";
export type StatusCapacidadeRadar = "suportado" | "parcial" | "nao-suportado";

/** Evidência de aquisição R6.0c-A. Suporte refere-se à primeira página de
 * Londrina/PR; não atesta completude nem consolida baseline. */
export const MATRIZ_CAPACIDADE_RADAR = {
  olx: { locacao: { casa: "parcial", apartamento: "parcial" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
  zap: { locacao: { casa: "nao-suportado", apartamento: "suportado" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
  "viva-real": { locacao: { casa: "parcial", apartamento: "parcial" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
  "chaves-na-mao": { locacao: { casa: "suportado", apartamento: "parcial" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
  wimoveis: { locacao: { casa: "parcial", apartamento: "suportado" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
} as const satisfies Record<PortalAngariacao, Record<FinalidadeRadar, Record<TipoRecorteRadar, StatusCapacidadeRadar>>>;

export interface RecorteAquisicaoRadar {
  portal: PortalAngariacao;
  finalidade: FinalidadeRadar;
  tipoRecorte: TipoRecorteRadar;
  cidade: string;
  estado: string;
  bairro?: string;
}

export interface CapacidadeAquisicaoRadar {
  status: StatusCapacidadeRadar;
  suportado: boolean;
  motivo: string;
}

export function ehFinalidadeRadar(valor: unknown): valor is FinalidadeRadar {
  return valor === "locacao" || valor === "venda";
}

/** Compatibilidade exclusiva de filtros antigos, sem nenhuma das dimensões
 * novas. A fronteira HTTP confirma a busca persistida antes de aceitá-los. */
export function filtrosRadarSaoLegados(filtros: Pick<FiltrosCentralAngariacao, "finalidade" | "tipoRecorte">): boolean {
  return filtros.finalidade === undefined && filtros.tipoRecorte === undefined;
}

export function finalidadeContextoRadar(filtros: Pick<FiltrosCentralAngariacao, "finalidade" | "tipoRecorte">): FinalidadeRadar {
  if (filtrosRadarSaoLegados(filtros)) return "locacao";
  if (!ehFinalidadeRadar(filtros.finalidade)) throw new Error("Informe a finalidade explícita da aquisição.");
  return filtros.finalidade;
}

/** Apenas os dois tipos mínimos. Famílias de comparáveis não participam
 * deste contrato: sobrado, condomínio e kitnet/studio não são promovidos. */
export function tipoRecorteRadar(valor: string | null | undefined): TipoRecorteRadar | null {
  const chave = chaveNormalizada(valor);
  if (chave === "casa" || chave === "casas") return "casa";
  if (chave === "apartamento" || chave === "apartamentos") return "apartamento";
  return null;
}

/** Somente o campo observacional decide. O tipo legado pode ter vindo da
 * busca e não é alternativa quando tipoDeclarado falta ou diverge. */
export function tipoRecorteObservadoRadar(anuncio: { tipoDeclarado?: string | null }): TipoRecorteRadar | null {
  return tipoRecorteRadar(anuncio.tipoDeclarado);
}

export function capacidadeAquisicaoRadar(recorte: RecorteAquisicaoRadar): CapacidadeAquisicaoRadar {
  const resultado = (status: StatusCapacidadeRadar, motivo: string): CapacidadeAquisicaoRadar => ({
    status, suportado: status === "suportado", motivo,
  });
  if (!ehFinalidadeRadar(recorte.finalidade)) {
    return resultado("nao-suportado", "Finalidade de aquisição inválida.");
  }
  const status = MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.[recorte.finalidade]?.[recorte.tipoRecorte];
  if (!status || status === "nao-suportado") {
    return resultado("nao-suportado", "Combinação de portal, finalidade e tipo ainda não suportada.");
  }
  const cidade = chaveNormalizada(recorte.cidade);
  const estado = normalizarUf(recorte.estado);
  if (!cidade || !ufValida(estado)) {
    return resultado("nao-suportado", "Informe cidade e uma UF brasileira válida.");
  }
  const londrina = cidade === "londrina" && estado === "PR";
  if ((recorte.portal === "olx" || recorte.portal === "zap") && !londrina) {
    return resultado("nao-suportado", "Recorte geográfico disponível somente em Londrina/PR.");
  }
  if (recorte.portal === "viva-real" && estado !== "PR") {
    return resultado("nao-suportado", "Mapeamento estadual disponível somente no Paraná.");
  }
  if (recorte.portal === "zap" && recorte.bairro?.trim()) {
    return resultado("nao-suportado", "O ZAP Imóveis ainda não aceita busca por bairro.");
  }
  if (!londrina) {
    return resultado("parcial", "Este mercado ainda requer comprovação da aquisição no portal.");
  }
  return resultado(status, status === "suportado"
    ? "Aquisição comprovada para este recorte; cobertura completa ainda não comprovada."
    : "Aquisição parcial: faltam evidências para executar este recorte.");
}

export function capacidadeContratoExplicitoRadar(
  filtros: Pick<FiltrosCentralAngariacao, "portal" | "finalidade" | "tipoRecorte" | "tipo" | "cidade" | "estado" | "bairro">,
): CapacidadeAquisicaoRadar {
  if (!ehFinalidadeRadar(filtros.finalidade)
    || (filtros.tipoRecorte !== "casa" && filtros.tipoRecorte !== "apartamento")) {
    return { status: "nao-suportado", suportado: false, motivo: "Informe finalidade e tipo explícitos para a aquisição." };
  }
  const capacidade = capacidadeAquisicaoRadar({
    ...filtros, finalidade: filtros.finalidade, tipoRecorte: filtros.tipoRecorte,
  });
  if (filtros.tipo && tipoRecorteRadar(filtros.tipo) !== filtros.tipoRecorte) {
    return { status: "nao-suportado", suportado: false, motivo: "Tipo legado e recorte solicitado são incompatíveis." };
  }
  return capacidade;
}
