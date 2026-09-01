import { chaveNormalizada } from "@/lib/normalizacao";
import { normalizarUf, ufValida } from "./geografia";

export type FinalidadeMercadoMonitorado = "locacao" | "venda";
export type SegmentoMercadoMonitorado = "residencial" | "comercial";

export interface MercadoMonitorado {
  id: string;
  cidade: string;
  estado: string;
  cidadeChave: string;
  finalidade: FinalidadeMercadoMonitorado;
  segmento: SegmentoMercadoMonitorado;
  ativo: boolean;
  frequenciaDias: number;
  proximaExecucaoEm: string | null;
  ultimaTentativaEm: string | null;
  ultimoSucessoEm: string | null;
  falhasConsecutivas: number;
  ultimoErroCodigo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntradaMercadoMonitorado {
  cidade: string;
  estado: string;
  finalidade: FinalidadeMercadoMonitorado;
  segmento: SegmentoMercadoMonitorado;
  frequenciaDias?: number;
}

export interface MercadoMonitoradoNormalizado extends EntradaMercadoMonitorado {
  cidadeChave: string;
  frequenciaDias: number;
}

const FINALIDADES = new Set<FinalidadeMercadoMonitorado>(["locacao", "venda"]);
const SEGMENTOS = new Set<SegmentoMercadoMonitorado>(["residencial", "comercial"]);

export function normalizarEntradaMercadoMonitorado(
  entrada: EntradaMercadoMonitorado,
): MercadoMonitoradoNormalizado {
  const cidade = entrada.cidade.normalize("NFC").replace(/\s+/g, " ").trim();
  const cidadeChave = chaveNormalizada(cidade);
  const estado = normalizarUf(entrada.estado);
  const frequenciaDias = entrada.frequenciaDias ?? 30;

  if (!cidadeChave) throw new Error("Informe a cidade do mercado.");
  if (!ufValida(estado)) throw new Error("Informe uma UF brasileira válida.");
  if (!FINALIDADES.has(entrada.finalidade)) throw new Error("Finalidade de mercado inválida.");
  if (!SEGMENTOS.has(entrada.segmento)) throw new Error("Segmento de mercado inválido.");
  if (!Number.isInteger(frequenciaDias) || frequenciaDias < 1 || frequenciaDias > 365) {
    throw new Error("A frequência deve ficar entre 1 e 365 dias.");
  }

  return {
    cidade,
    estado,
    cidadeChave,
    finalidade: entrada.finalidade,
    segmento: entrada.segmento,
    frequenciaDias,
  };
}

export function identidadeMercadoMonitorado(
  entrada: Pick<MercadoMonitoradoNormalizado, "estado" | "cidadeChave" | "finalidade" | "segmento">,
): string {
  return [entrada.estado, entrada.cidadeChave, entrada.finalidade, entrada.segmento].join(":");
}
