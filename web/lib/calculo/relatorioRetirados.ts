/* Relatório de imóveis atualmente retirados. Fotografia do estado carregado,
   sem reconstruir eventos pelas notas ou alterar as métricas históricas. */
import { MOTIVOS_RETIRADA, ROTULO_MOTIVO_RETIRADA_DESCONHECIDO, type MotivoRetirada } from "../constantes";
import type { Imovel } from "../tipos";
import { formatarDataRetirada, rotuloMotivoRetirada } from "./retiradaCarteira";

export type FiltroMotivoRetirados = "todos" | "nao-informado" | MotivoRetirada;
export type FiltroPeriodoRetirados = "todos" | "intervalo" | "nao-informada";

export interface FiltrosRelatorioRetirados {
  motivo: FiltroMotivoRetirados;
  periodo: FiltroPeriodoRetirados;
  inicio: string;
  fim: string;
}

export function filtrosRelatorioRetiradosVazios(): FiltrosRelatorioRetirados {
  return { motivo: "todos", periodo: "todos", inicio: "", fim: "" };
}

export interface LinhaRelatorioRetirados {
  id: string;
  codigo: string;
  referenciaCrm: string;
  endereco: string;
  tipo: string;
  status: string;
  dataRetirada: string;
  motivo: string;
  observacao: string;
}

export interface RelatorioRetirados {
  linhas: LinhaRelatorioRetirados[];
  total: number;
  semData: number;
  porMotivo: { rotulo: string; quantidade: number }[];
  filtrosAplicados: { motivo: string; periodo: string };
  erroFiltro: string | null;
}

export const CABECALHO_CSV_RETIRADOS = [
  "Código", "Referência CRM", "Endereço", "Tipo", "Status", "Data da retirada", "Motivo", "Observação",
];

const comparador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function textoInformado(valor: string | null | undefined): string {
  return valor?.trim() ? valor : ROTULO_MOTIVO_RETIRADA_DESCONHECIDO;
}

function motivoInformado(imovel: Imovel): MotivoRetirada | null {
  return MOTIVOS_RETIRADA.find((motivo) => motivo.id === imovel.retiradoMotivo)?.id ?? null;
}

/** Só a coluna da retirada pode fornecer sua data. Datas ausentes ou inválidas
    continuam desconhecidas; cadastro, status e notas nunca são consultados. */
function dataInformada(imovel: Imovel): string | null {
  return formatarDataRetirada(imovel.retiradoEm) ? imovel.retiradoEm! : null;
}

function erroDoIntervalo(filtros: FiltrosRelatorioRetirados): string | null {
  if (filtros.periodo !== "intervalo") return null;
  if (!filtros.inicio || !filtros.fim) return "Informe a data inicial e a data final da retirada.";
  if (!formatarDataRetirada(filtros.inicio) || !formatarDataRetirada(filtros.fim)) {
    return "Informe datas válidas para o intervalo de retirada.";
  }
  return filtros.inicio > filtros.fim ? "A data inicial deve ser anterior ou igual à data final." : null;
}

export function relatorioRetirados(
  imoveis: Imovel[],
  filtros: FiltrosRelatorioRetirados = filtrosRelatorioRetiradosVazios(),
): RelatorioRetirados {
  const erroFiltro = erroDoIntervalo(filtros);
  const filtrosAplicados = {
    motivo: filtros.motivo === "todos" ? "Todos" : rotuloMotivoRetirada(filtros.motivo),
    periodo: filtros.periodo === "todos" ? "Todos os períodos"
      : filtros.periodo === "nao-informada" ? "Data não informada"
      : erroFiltro ? "Intervalo incompleto ou inválido"
      : `${formatarDataRetirada(filtros.inicio)} a ${formatarDataRetirada(filtros.fim)} (inclusive)`,
  };
  const selecionados = erroFiltro ? [] : imoveis.filter((imovel) => {
    if (imovel.retirado !== true) return false;
    const motivo = motivoInformado(imovel);
    if (filtros.motivo === "nao-informado" && motivo !== null) return false;
    if (filtros.motivo !== "todos" && filtros.motivo !== "nao-informado" && motivo !== filtros.motivo) return false;
    const data = dataInformada(imovel);
    if (filtros.periodo === "nao-informada") return data === null;
    if (filtros.periodo === "intervalo") return data !== null && data >= filtros.inicio && data <= filtros.fim;
    return true;
  });

  // Datas mais recentes primeiro, desconhecidas no fim. Empates usam a
  // identificação natural (LD-2 antes de LD-10) e o id como último critério.
  selecionados.sort((a, b) => {
    const dataA = dataInformada(a);
    const dataB = dataInformada(b);
    if (dataA !== dataB) {
      if (dataA === null) return 1;
      if (dataB === null) return -1;
      return dataB.localeCompare(dataA);
    }
    return comparador.compare(a.codigo || a.referenciaCrm || a.endereco, b.codigo || b.referenciaCrm || b.endereco)
      || a.id.localeCompare(b.id);
  });

  const porMotivo = new Map<string, number>();
  let semData = 0;
  const linhas = selecionados.map((imovel): LinhaRelatorioRetirados => {
    const motivo = rotuloMotivoRetirada(motivoInformado(imovel));
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
    if (dataInformada(imovel) === null) semData++;
    return {
      id: imovel.id,
      codigo: textoInformado(imovel.codigo),
      referenciaCrm: textoInformado(imovel.referenciaCrm),
      endereco: textoInformado(imovel.endereco),
      tipo: textoInformado(imovel.tipo),
      status: textoInformado(imovel.status),
      dataRetirada: formatarDataRetirada(imovel.retiradoEm) ?? ROTULO_MOTIVO_RETIRADA_DESCONHECIDO,
      motivo,
      observacao: textoInformado(imovel.retiradoObservacao),
    };
  });
  return {
    linhas,
    total: linhas.length,
    semData,
    porMotivo: [...porMotivo].map(([rotulo, quantidade]) => ({ rotulo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || comparador.compare(a.rotulo, b.rotulo)),
    filtrosAplicados,
    erroFiltro,
  };
}

/** As mesmas linhas e a mesma ordem do documento, sem novos filtros. */
export function linhasCsvRetirados(relatorio: RelatorioRetirados): string[][] {
  return relatorio.linhas.map((linha) => [
    linha.codigo, linha.referenciaCrm, linha.endereco, linha.tipo, linha.status,
    linha.dataRetirada, linha.motivo, linha.observacao,
  ]);
}
