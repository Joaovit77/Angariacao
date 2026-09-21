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
import { normalizarUf, ufValida } from "./calculo/geografia";
import { chaveNormalizada, distintosCanonizados, nomeProprio } from "./normalizacao";
import type { AgendaItem, Imovel, UserConfig } from "./tipos";
import { normalizarPerfilComunicacao } from "./perfilComunicacao";

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
    perfilComunicacao: normalizarPerfilComunicacao(null),
  };
}

export type ResolucaoCidadePadrao =
  | { cidade: string; uf: string; origem: "configurada" | "inferida" }
  | { cidade: null; uf: null; origem: "nenhuma" };

export function aplicarCidadePadraoInicial<T extends { cidade: string; estado: string }>(
  atual: T,
  resolucao: ResolucaoCidadePadrao,
  protegido = false,
): T {
  if (
    protegido
    || atual.cidade.trim()
    || atual.estado.trim()
    || resolucao.origem === "nenhuma"
  ) {
    return atual;
  }

  return {
    ...atual,
    cidade: resolucao.cidade,
    estado: resolucao.uf,
  };
}

export interface ConfiguracaoCidadePadraoConta {
  userId: string;
  cidadePadrao?: string | null;
  ufPadrao?: string | null;
}

export type ConfiguracaoCidadePadrao = Omit<ConfiguracaoCidadePadraoConta, "userId">;

export interface ImovelCidadeConta {
  userId: string;
  cidade?: string | null;
  estado?: string | null;
}

type ImovelCidade = Pick<Imovel, "cidade" | "estado">;

function limparCidade(valor: string | null | undefined): string {
  return (valor || "").replace(/\s+/g, " ").trim();
}

function localValido(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): { cidade: string; uf: string; chave: string } | null {
  const cidadeLimpa = limparCidade(cidade);
  const ufNormalizada = normalizarUf(uf);
  const cidadeChave = chaveNormalizada(cidadeLimpa);
  if (!cidadeChave || !ufValida(ufNormalizada)) return null;
  return {
    cidade: cidadeLimpa,
    uf: ufNormalizada,
    chave: `${ufNormalizada}:${cidadeChave}`,
  };
}

function grafiaInferidaDeterministica(grafias: ReadonlyMap<string, number>): string {
  return [...grafias.entries()]
    .sort(([grafiaA, totalA], [grafiaB, totalB]) =>
      totalB - totalA || grafiaA.localeCompare(grafiaB, "pt-BR", { sensitivity: "variant" }),
    )[0]?.[0] || "";
}

/**
 * Resolve a sugestão geográfica sem efeitos e sem persistir inferências.
 *
 * A inferência só existe quando todos os imóveis com cidade E UF válidas
 * representam a mesma combinação normalizada. Registros incompletos são
 * ignorados; uma segunda combinação válida, mesmo minoritária, torna o
 * resultado ambíguo e devolve `nenhuma`.
 */
export function resolverCidadePadrao(
  configuracao: ConfiguracaoCidadePadrao | null | undefined,
  imoveis: readonly ImovelCidade[],
): ResolucaoCidadePadrao {
  const configurada = localValido(configuracao?.cidadePadrao, configuracao?.ufPadrao);
  if (configurada) {
    return { cidade: configurada.cidade, uf: configurada.uf, origem: "configurada" };
  }

  const locais = new Map<string, { uf: string; grafias: Map<string, number> }>();
  for (const imovel of imoveis) {
    const local = localValido(imovel.cidade, imovel.estado);
    if (!local) continue;
    const grupo = locais.get(local.chave) ?? { uf: local.uf, grafias: new Map<string, number>() };
    const grafia = nomeProprio(local.cidade);
    grupo.grafias.set(grafia, (grupo.grafias.get(grafia) || 0) + 1);
    locais.set(local.chave, grupo);
    if (locais.size > 1) return { cidade: null, uf: null, origem: "nenhuma" };
  }

  const inferida = locais.values().next().value;
  return inferida
    ? { cidade: grafiaInferidaDeterministica(inferida.grafias), uf: inferida.uf, origem: "inferida" }
    : { cidade: null, uf: null, origem: "nenhuma" };
}

/**
 * Coleta somente linhas da conta pedida antes de chamar o resolver puro.
 * É uma defesa adicional para fronteiras privilegiadas que recebem linhas
 * de várias contas; no carregamento comum, a RLS já entrega dados escopados.
 */
export function resolverCidadePadraoDaConta(
  userId: string,
  configuracoes: readonly ConfiguracaoCidadePadraoConta[],
  imoveis: readonly ImovelCidadeConta[],
): ResolucaoCidadePadrao {
  const configuracao = configuracoes.find((item) => item.userId === userId);
  return resolverCidadePadrao(
    configuracao,
    imoveis.filter((imovel) => imovel.userId === userId),
  );
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
