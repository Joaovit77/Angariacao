import { idExternoEhFallback, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao, type PortalAngariacao } from "./centralAngariacao";
import { normalizarUf, ufValida } from "./geografia";
import { chaveNormalizada } from "../normalizacao";
import { identidadeVendaRadar } from "./identidadeVendaRadar";

export type FinalidadeRadar = "locacao" | "venda";
export type TipoRecorteRadar = "casa" | "apartamento";
export type StatusCapacidadeRadar = "suportado" | "parcial" | "nao-suportado";

/** Evidência de aquisição R6.0c-A. Suporte refere-se à primeira página de
 * Londrina/PR; não atesta completude nem consolida baseline. */
export const MATRIZ_CAPACIDADE_RADAR = {
  olx: { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
  zap: { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "suportado", apartamento: "suportado" } },
  "viva-real": { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "suportado", apartamento: "suportado" } },
  "chaves-na-mao": { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "suportado", apartamento: "suportado" } },
  wimoveis: { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } },
} as const satisfies Record<PortalAngariacao, Record<FinalidadeRadar, Record<TipoRecorteRadar, StatusCapacidadeRadar>>>;

export interface RecorteAquisicaoRadar {
  portal: PortalAngariacao;
  finalidade: FinalidadeRadar;
  tipoRecorte: TipoRecorteRadar;
  cidade: string;
  estado: string;
  bairro?: string;
  somenteProprietario?: boolean;
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

/** Identidade individual comprovada; query de rastreamento não participa. */
export function identidadeVivaReal(valor: unknown): { id: string; url: string } | null {
  if (typeof valor !== "string") return null;
  try {
    const url = new URL(valor);
    const id = url.pathname.match(/^\/imovel\/[^/]+-id-(\d+)\/?$/)?.[1];
    if (!id || url.protocol !== "https:" || url.hostname !== "www.vivareal.com.br"
      || url.port || url.username || url.password) return null;
    return { id, url: `${url.origin}${url.pathname.replace(/\/?$/, "/")}` };
  } catch { return null; }
}

/** Identidade nativa OLX individual no mercado comprovado. */
export function identidadeOlx(valor: unknown): { id: string; url: string } | null {
  if (typeof valor !== "string") return null;
  try {
    const url = new URL(valor);
    const id = url.pathname.match(/^\/regiao-de-londrina\/imoveis\/[^/]+-(\d{6,})\/?$/)?.[1];
    if (!id || url.protocol !== "https:" || url.hostname !== "pr.olx.com.br" || url.port || url.username || url.password) return null;
    return { id, url: `${url.origin}${url.pathname.replace(/\/$/, "")}` };
  } catch { return null; }
}

/** Admissão dos recortes comprovados. O legado e os
 * recortes anteriores mantêm seus contratos; o filtro não fabrica evidência. */
export function anuncioAdmitidoRecorteRadar(
  anuncio: AnuncioCentralAngariacao,
  filtros: FiltrosCentralAngariacao,
): boolean {
  if (filtros.finalidade === "venda") {
    const identidade = identidadeVendaRadar(anuncio.portal, anuncio.url);
    return anuncio.portal === filtros.portal && anuncio.finalidade === "venda"
      && anuncio.finalidadeObservada === "venda"
      && tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte
      && !!identidade && identidade.id === anuncio.idExterno
      && typeof anuncio.preco === "number" && Number.isFinite(anuncio.preco) && anuncio.preco > 0;
  }
  if (filtros.portal === "olx" && filtros.finalidade === "locacao") {
    const identidade = identidadeOlx(anuncio.url), evidencia = anuncio.evidenciaLocacaoOlx;
    return anuncio.portal === "olx" && anuncio.finalidade === "locacao"
      && tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte
      && !!identidade && identidade.id === anuncio.idExterno
      && evidencia?.idExterno === identidade.id && evidencia.url === identidade.url
      && evidencia.finalidade === "locacao" && evidencia.tipoDeclarado === anuncio.tipoDeclarado
      && evidencia.preco === anuncio.preco;
  }
  if (filtros.portal === "viva-real" && filtros.finalidade === "locacao") {
    const identidade = identidadeVivaReal(anuncio.url);
    const evidencia = anuncio.evidenciaLocacaoVivaReal;
    return anuncio.portal === "viva-real" && anuncio.finalidade === "locacao"
      && tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte
      && !!identidade && identidade.id === anuncio.idExterno
      && evidencia?.idExterno === identidade.id && evidencia.url === identidade.url
      && evidencia.preco === anuncio.preco;
  }
  const novoRecorte = filtros.finalidade === "locacao" && (
    (filtros.portal === "chaves-na-mao" && filtros.tipoRecorte === "apartamento")
    || (filtros.portal === "wimoveis" && filtros.tipoRecorte === "casa")
  );
  if (!novoRecorte) return true;
  return anuncio.portal === filtros.portal
    && tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte
    && !!anuncio.idExterno?.trim()
    && !idExternoEhFallback(anuncio.portal, anuncio.idExterno);
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
  if (recorte.finalidade === "venda" && (!londrina || recorte.bairro?.trim())) {
    return resultado("nao-suportado", "Venda disponível somente na primeira página de Londrina/PR, sem bairro.");
  }
  if ((recorte.portal === "olx" || recorte.portal === "zap") && !londrina) {
    return resultado("nao-suportado", "Recorte geográfico disponível somente em Londrina/PR.");
  }
  if (recorte.portal === "viva-real" && estado !== "PR") {
    return resultado("nao-suportado", "Mapeamento estadual disponível somente no Paraná.");
  }
  if (recorte.portal === "zap" && recorte.bairro?.trim()) {
    return resultado("nao-suportado", "O ZAP Imóveis ainda não aceita busca por bairro.");
  }
  if (recorte.portal === "viva-real" && recorte.bairro?.trim()) {
    return resultado("nao-suportado", "O Viva Real ainda não possui aquisição comprovada por bairro.");
  }
  if (recorte.portal === "olx" && recorte.bairro?.trim()) {
    return resultado("nao-suportado", "A OLX ainda não possui aquisição comprovada por bairro.");
  }
  if (recorte.portal === "olx" && recorte.somenteProprietario) {
    return resultado("nao-suportado", "A OLX ainda não possui aquisição comprovada somente de proprietários neste recorte.");
  }
  if (!londrina) {
    return resultado("parcial", "Este mercado ainda requer comprovação da aquisição no portal.");
  }
  return resultado(status, status === "suportado"
    ? "Aquisição comprovada para este recorte; cobertura completa ainda não comprovada."
    : "Aquisição parcial: faltam evidências para executar este recorte.");
}

export function capacidadeContratoExplicitoRadar(
  filtros: Pick<FiltrosCentralAngariacao, "portal" | "finalidade" | "tipoRecorte" | "tipo" | "cidade" | "estado" | "bairro" | "somenteProprietario">,
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
