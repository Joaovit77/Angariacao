import { MOTIVO_PERDA_LOCADO_FORA } from "../constantes";
import { daysBetween } from "../datas";
import type { Imovel } from "../tipos";
import {
  currentStatusSince,
  dataAngariadoEfetiva,
  foiAngariado,
  motivoPerdaPelaFase,
} from "./motor";

export interface FaixaTempoAnunciado {
  rotulo: string;
  quantidade: number;
}

export interface EstatisticasPerdaPosCaptacao {
  total: number;
  comTempoCalculavel: number;
  tempoMedioDias: number | null;
  tempoMedianoDias: number | null;
  taxaPerdaCarteira: number | null;
  faixas: FaixaTempoAnunciado[];
  imoveis: ImovelPerdidoPosCaptacao[];
}

export interface ImovelPerdidoPosCaptacao {
  id: string;
  referenciaCrm: string;
  endereco: string;
  anunciadoDesde: string | null;
  encerradoEm: string | null;
  diasAnunciado: number | null;
}

/**
 * Imóveis captados que terminaram alugados fora da imobiliária.
 *
 * O motivo é normalizado pela fase para também reconhecer registros antigos
 * gravados como "já alugado por conta própria" ou "optou por outra
 * imobiliária" depois de o imóvel já ter passado por Angariado.
 */
export function imoveisLocadosFora(imoveis: Imovel[]): Imovel[] {
  return imoveis.filter((imovel) => {
    if (imovel.status !== "Perdido" && imovel.status !== "Cancelado") return false;
    if (!foiAngariado(imovel)) return false;
    return motivoPerdaPelaFase(imovel.statusHistory, imovel.motivoPerda || "") === MOTIVO_PERDA_LOCADO_FORA;
  });
}

export function estatisticasPerdaPosCaptacao(imoveis: Imovel[]): EstatisticasPerdaPosCaptacao {
  const perdidosFora = imoveisLocadosFora(imoveis);
  const detalhes = perdidosFora
    .map((imovel): ImovelPerdidoPosCaptacao => {
      const anunciadoDesde = dataAngariadoEfetiva(imovel);
      const encerradoEm = currentStatusSince(imovel);
      return {
        id: imovel.id,
        referenciaCrm: imovel.referenciaCrm || "",
        endereco: imovel.endereco,
        anunciadoDesde,
        encerradoEm,
        diasAnunciado: daysBetween(anunciadoDesde, encerradoEm),
      };
    })
    .sort((a, b) => (b.encerradoEm || "").localeCompare(a.encerradoEm || ""));

  const tempos = detalhes
    .map((imovel) => imovel.diasAnunciado)
    .filter((dias): dias is number => dias != null && dias >= 0)
    .sort((a, b) => a - b);

  const meio = Math.floor(tempos.length / 2);
  const mediana = tempos.length === 0
    ? null
    : tempos.length % 2
      ? tempos[meio]
      : (tempos[meio - 1] + tempos[meio]) / 2;

  const locadosAqui = imoveis.filter((imovel) => imovel.status === "Locado").length;
  const desfechosDaCarteira = locadosAqui + perdidosFora.length;

  return {
    total: perdidosFora.length,
    comTempoCalculavel: tempos.length,
    tempoMedioDias: tempos.length ? tempos.reduce((soma, dias) => soma + dias, 0) / tempos.length : null,
    tempoMedianoDias: mediana,
    taxaPerdaCarteira: desfechosDaCarteira ? (perdidosFora.length / desfechosDaCarteira) * 100 : null,
    faixas: [
      { rotulo: "Até 7 dias", quantidade: tempos.filter((dias) => dias <= 7).length },
      { rotulo: "8 a 30 dias", quantidade: tempos.filter((dias) => dias >= 8 && dias <= 30).length },
      { rotulo: "31 a 60 dias", quantidade: tempos.filter((dias) => dias >= 31 && dias <= 60).length },
      { rotulo: "Mais de 60 dias", quantidade: tempos.filter((dias) => dias >= 61).length },
    ],
    imoveis: detalhes,
  };
}

/** Perdas pós-angariação encerradas no mês informado. */
export function perdasPosCaptacaoNoMes(imoveis: Imovel[], key: string): ImovelPerdidoPosCaptacao[] {
  return estatisticasPerdaPosCaptacao(imoveis).imoveis.filter(
    (imovel) => imovel.encerradoEm?.slice(0, 7) === key,
  );
}
