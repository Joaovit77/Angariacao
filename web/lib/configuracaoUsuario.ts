/* ================================================================
   CONFIGURAÇÃO POR USUÁRIO

   Separa três fontes que não devem ser confundidas:
   - padrão seguro do produto (conta nova);
   - preferência explícita, persistida em user_config;
   - catálogo aprendido dos dados que o próprio usuário já gravou.

   O catálogo aprendido é calculado em memória. Assim uma origem ou tipo de
   compromisso já usado não desaparece dos seletores, mas também não vira uma
   preferência permanente só porque apareceu numa importação antiga.
   ================================================================ */
import { AGENDA_TYPES, ORIGENS_IMOVEL } from "./constantes";
import { chaveNormalizada, distintosCanonizados } from "./normalizacao";
import type { AgendaItem, Imovel, UserConfig } from "./tipos";

export const COMISSAO_PERCENT_PADRAO = 100;

/** Uma instância nova evita compartilhar arrays mutáveis entre resets. */
export function configuracaoPadrao(): UserConfig {
  return {
    comissaoPercent: COMISSAO_PERCENT_PADRAO,
    agendaTipos: [],
    whatsappModelos: [],
    empresa: "",
    origensExtras: [],
    dadosPagamento: "",
  };
}

function combinarSemDuplicar(...grupos: (readonly string[])[]): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];

  for (const grupo of grupos) {
    for (const valor of grupo) {
      const limpo = valor.replace(/\s+/g, " ").trim();
      const chave = chaveNormalizada(limpo);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      resultado.push(limpo);
    }
  }
  return resultado;
}

function somenteNovos(base: readonly string[], observados: (string | null | undefined)[]): string[] {
  const chavesBase = new Set(base.map(chaveNormalizada));
  return distintosCanonizados(observados).filter((valor) => !chavesBase.has(chaveNormalizada(valor)));
}

/** Origens encontradas na carteira, mas ausentes dos padrões e da config. */
export function origensAprendidas(
  imoveis: Pick<Imovel, "origemImovel">[],
  configuradas: readonly string[] = [],
): string[] {
  return somenteNovos(
    combinarSemDuplicar(ORIGENS_IMOVEL, configuradas),
    imoveis.map((imovel) => imovel.origemImovel),
  );
}

/** Lista completa dos portais reconhecidos para esta carteira. */
export function origensDoUsuario(
  configuradas: readonly string[] | null | undefined,
  imoveis: Pick<Imovel, "origemImovel">[],
): string[] {
  const preferencias = configuradas ?? [];
  return combinarSemDuplicar(ORIGENS_IMOVEL, preferencias, origensAprendidas(imoveis, preferencias));
}

/** Tipos encontrados na agenda, mas ausentes dos padrões e da config. */
export function tiposAgendaAprendidos(
  agenda: Pick<AgendaItem, "type">[],
  configurados: readonly string[] = [],
): string[] {
  return somenteNovos(
    combinarSemDuplicar(AGENDA_TYPES, configurados),
    agenda.map((item) => item.type),
  );
}

/** Lista completa dos tipos de compromisso reconhecidos para esta agenda. */
export function tiposAgendaDoUsuario(
  configurados: readonly string[] | null | undefined,
  agenda: Pick<AgendaItem, "type">[],
): string[] {
  const preferencias = configurados ?? [];
  return combinarSemDuplicar(AGENDA_TYPES, preferencias, tiposAgendaAprendidos(agenda, preferencias));
}
