/* ================================================================
   SINAIS DE REPETIÇÃO DO RADAR (R4.1a, somente shadow)

   A auditoria do R4.1 mostrou que os "repetidos" do Chaves na Mão não
   são duplicatas técnicas: são a mesma casa anunciada por várias
   imobiliárias, cada uma com seu id, e anúncios antigos que entram
   depois na primeira página. Este módulo só produz SINAIS para
   observação. Nada aqui esconde, agrupa ou muda um card, e nenhum
   sinal é identidade: "possível mesmo imóvel" nunca é "duplicata".

   Escopo comprovado: Chaves na Mão + Casa. Fora dele, as funções
   respondem "fora do escopo" em vez de generalizar.

   Núcleo puro: sem React/Next/Supabase.
   ================================================================ */
import { chaveEndereco } from "./duplicidade";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "./centralAngariacao";
import { situacaoRepeticaoCentral, tipoDoAnuncio, urlsDosImoveis } from "./repeticaoCentralAngariacao";
import { chaveNormalizada } from "../normalizacao";
import type { Imovel } from "../tipos";

/** "Já conhecido" exige o anúncio visto pelo sistema pelo menos um dia antes
    desta coleta. Visto horas antes (numa busca da Central, por exemplo) ainda
    pode ser novo no mercado. */
export const MARGEM_JA_CONHECIDO_MS = 24 * 60 * 60 * 1000;
/** Dois anúncios atuais do mesmo imóvel costumam ter o mesmo preço (Edu Chaves:
    6.000 em todos; Luiz Viotti: 3.470 a 3.500). Limiar provisório do shadow. */
export const TOLERANCIA_PRECO_MESMO_IMOVEL = 0.05;
/** O valor da carteira pode estar defasado em relação ao anúncio (LD-65:
    6.000 na carteira, 5.700 no Chaves). Limiar provisório do shadow. */
export const TOLERANCIA_PRECO_CARTEIRA = 0.15;

const TIPOS_LOGRADOURO = ["rua", "avenida", "alameda", "travessa", "praca", "rodovia", "estrada"];
const TIPOS_IMOVEL_NA_FOTO = [
  "casa", "sobrado", "apartamento", "kitnet", "studio", "cobertura", "flat", "loft", "terreno",
  "sala", "loja", "galpao", "barracao", "chacara", "sitio", "predio", "ponto", "imovel",
];
const FOTO_LOGRADOURO = new RegExp(
  `-(${TIPOS_LOGRADOURO.join("|")})-(.+?)-(?:${TIPOS_IMOVEL_NA_FOTO.join("|")})-`,
);

export type OrigemLogradouro = "card" | "foto" | "nenhum";

export interface LogradouroDoAnuncio {
  /** Logradouro normalizado sem o tipo ("rua", "avenida"...); nunca o número. */
  chave: string | null;
  origem: OrigemLogradouro;
}

/** Nome do logradouro sem tipo, acento, caixa ou pontuação. "Rua Edu Chaves" e
    "Edu Chaves" caem na mesma chave: o card do Chaves às vezes omite o tipo. */
export function chaveLogradouro(valor: string | null | undefined): string {
  const palavras = chaveEndereco(valor).split(" ").filter(Boolean);
  if (TIPOS_LOGRADOURO.includes(palavras[0])) palavras.shift();
  const chave = palavras.join(" ");
  return /[a-z]{3}/.test(chave) ? chave : "";
}

/** Primeiro trecho do endereço do card, antes da vírgula. Recusa o que não é
    rua: "Bairro Colinas, 1", o próprio bairro repetido e "Endereço indisponível". */
export function logradouroDoEndereco(
  endereco: string | null | undefined,
  bairro?: string | null,
): string {
  const trecho = (endereco || "").split(",")[0];
  if (/indispon[ií]vel/i.test(trecho)) return "";
  const chave = chaveLogradouro(trecho);
  if (!chave || chave.startsWith("bairro ")) return "";
  if (bairro && chave === chaveLogradouro(bairro)) return "";
  return chave;
}

function slugCidade(valor: string): string {
  return chaveNormalizada(valor).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Logradouro no nome do arquivo da foto do Chaves, no formato
 * `uf-cidade-bairro-rua-nome-tipo-para-alugar-...`. Validado em Production
 * (327 de 330 iguais ao endereço do card). O nome nunca traz número, e a foto
 * só vale quando é do host do Chaves e da mesma cidade do anúncio.
 */
export function logradouroDaFoto(
  anuncio: Pick<AnuncioCentralAngariacao, "portal" | "imagem" | "cidade" | "estado">,
): string {
  if (anuncio.portal !== "chaves-na-mao" || !anuncio.imagem || !anuncio.cidade?.trim()) return "";
  let caminho: string;
  try {
    const url = new URL(anuncio.imagem);
    if (url.hostname !== "chavesnamao.com.br" && !url.hostname.endsWith(".chavesnamao.com.br")) return "";
    caminho = url.pathname;
  } catch {
    return "";
  }
  const arquivo = decodeURIComponent(caminho.split("/").pop() || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const uf = chaveNormalizada(anuncio.estado || "");
  const prefixo = uf ? `${uf}-${slugCidade(anuncio.cidade)}-` : null;
  if (prefixo ? !arquivo.startsWith(prefixo) : !arquivo.includes(`-${slugCidade(anuncio.cidade)}-`)) return "";
  const achado = arquivo.match(FOTO_LOGRADOURO);
  if (!achado) return "";
  return chaveLogradouro(`${achado[1]} ${achado[2].replace(/-/g, " ")}`);
}

/** Precedência: endereço do card, depois nome da foto, senão desconhecido. */
export function logradouroDoAnuncio(anuncio: AnuncioCentralAngariacao): LogradouroDoAnuncio {
  const doCard = logradouroDoEndereco(anuncio.endereco, anuncio.bairro);
  if (doCard) return { chave: doCard, origem: "card" };
  const daFoto = logradouroDaFoto(anuncio);
  if (daFoto) return { chave: daFoto, origem: "foto" };
  return { chave: null, origem: "nenhum" };
}

/** Número depois da última vírgula. "--", "0", "00" e "1" são os placeholders
    vistos no Chaves ("Rua Luiz Viotti, 1", "Bairro Colinas, 1") e não contam. */
export function numeroConfiavel(endereco: string | null | undefined): string | null {
  const partes = (endereco || "").split(",");
  if (partes.length < 2) return null;
  const achado = partes[partes.length - 1].trim().match(/^(\d+)\s*[a-z]?$/i);
  if (!achado) return null;
  const numero = Number(achado[1]);
  return numero > 1 ? String(numero) : null;
}

function diferencaPreco(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!a || !b || a <= 0 || b <= 0) return null;
  return Math.abs(a - b) / Math.max(a, b);
}

function percentual(valor: number): number {
  return Math.round(valor * 1000) / 10;
}

/** Busca do Radar onde o shadow vale: Chaves na Mão restrito a Casa. */
export function buscaNoEscopoRepeticaoChaves(filtros: Pick<FiltrosCentralAngariacao, "portal" | "tipo">): boolean {
  return filtros.portal === "chaves-na-mao" && chaveNormalizada(filtros.tipo) === "casa";
}

function anuncioNoEscopo(anuncio: AnuncioCentralAngariacao): boolean {
  return anuncio.portal === "chaves-na-mao"
    && chaveNormalizada(anuncio.tipo) === "casa"
    && tipoDoAnuncio(anuncio) !== "apartamento";
}

/* --- Já conhecido no mercado ------------------------------------------- */

export interface HistoricoMercadoAnuncio {
  id_externo: string;
  primeiro_visto_em: string | null;
}

/**
 * IDs novos para a busca que o sistema já via no mercado há mais de um dia.
 * O histórico precisa vir filtrado por usuário + portal; aqui só se compara o
 * `id_externo` exato. URL e fingerprint não entram: a URL do Chaves muda com o
 * preço e o fingerprint forte já uniu unidades diferentes do mesmo prédio.
 */
export function idsJaConhecidosNoMercado(
  novos: Array<Pick<AnuncioCentralAngariacao, "idExterno">>,
  historico: HistoricoMercadoAnuncio[],
  inicioColeta: string,
  margemMs = MARGEM_JA_CONHECIDO_MS,
): string[] {
  const limite = Date.parse(inicioColeta) - margemMs;
  if (!Number.isFinite(limite)) return [];
  const antigos = new Set(historico.flatMap((linha) => {
    const visto = linha.primeiro_visto_em ? Date.parse(linha.primeiro_visto_em) : Number.NaN;
    return Number.isFinite(visto) && visto <= limite ? [linha.id_externo] : [];
  }));
  return [...new Set(novos.map((anuncio) => anuncio.idExterno))].filter((id) => antigos.has(id));
}

/* --- Possível mesmo imóvel --------------------------------------------- */

export type ClasseMesmoImovel = "possivel_mesmo_imovel" | "dados_insuficientes" | "sinais_divergentes" | "fora_do_escopo";

export type MotivoMesmoImovel =
  | "fora-do-escopo"
  | "mesmo-anuncio"
  | "logradouro-desconhecido"
  | "preco-desconhecido"
  | "logradouro-diferente"
  | "quartos-divergentes"
  | "numero-divergente"
  | "preco-divergente";

export interface EvidenciasMesmoImovel {
  origens: [OrigemLogradouro, OrigemLogradouro];
  quartos: "iguais" | "nao-comparavel";
  numero: "igual" | "nao-comparavel";
  precoDiferencaPct: number;
}

export interface AvaliacaoMesmoImovel {
  classe: ClasseMesmoImovel;
  motivo: MotivoMesmoImovel | null;
  evidencias: EvidenciasMesmoImovel | null;
}

const semSinal = (classe: ClasseMesmoImovel, motivo: MotivoMesmoImovel): AvaliacaoMesmoImovel =>
  ({ classe, motivo, evidencias: null });

/**
 * Dois anúncios de casa no mesmo logradouro, com quartos compatíveis e preço
 * próximo, são CANDIDATOS a mesmo imóvel. Bairro e área não entram: a mesma
 * casa da Rua Edu Chaves aparece com quatro bairros e áreas de 127 a 210 m².
 * Número diferente e confiável separa casas vizinhas; número ausente não une.
 */
export function avaliarPossivelMesmoImovel(
  a: AnuncioCentralAngariacao,
  b: AnuncioCentralAngariacao,
): AvaliacaoMesmoImovel {
  if (a.portal !== b.portal || !anuncioNoEscopo(a) || !anuncioNoEscopo(b)) {
    return semSinal("fora_do_escopo", "fora-do-escopo");
  }
  if (a.idExterno === b.idExterno) return semSinal("fora_do_escopo", "mesmo-anuncio");
  const logA = logradouroDoAnuncio(a);
  const logB = logradouroDoAnuncio(b);
  if (!logA.chave || !logB.chave) return semSinal("dados_insuficientes", "logradouro-desconhecido");
  if (logA.chave !== logB.chave) return semSinal("sinais_divergentes", "logradouro-diferente");
  const quartosComparaveis = a.quartos != null && b.quartos != null;
  if (quartosComparaveis && a.quartos !== b.quartos) return semSinal("sinais_divergentes", "quartos-divergentes");
  const numeroA = numeroConfiavel(a.endereco);
  const numeroB = numeroConfiavel(b.endereco);
  if (numeroA && numeroB && numeroA !== numeroB) return semSinal("sinais_divergentes", "numero-divergente");
  const preco = diferencaPreco(a.preco, b.preco);
  if (preco == null) return semSinal("dados_insuficientes", "preco-desconhecido");
  if (preco > TOLERANCIA_PRECO_MESMO_IMOVEL) return semSinal("sinais_divergentes", "preco-divergente");
  return {
    classe: "possivel_mesmo_imovel",
    motivo: null,
    evidencias: {
      origens: [logA.origem, logB.origem],
      quartos: quartosComparaveis ? "iguais" : "nao-comparavel",
      numero: numeroA && numeroB ? "igual" : "nao-comparavel",
      precoDiferencaPct: percentual(preco),
    },
  };
}

/** Pares (novo × histórico da busca, e novo × novo) com sinal de mesmo imóvel.
    Cada par aparece uma vez, com os ids em ordem crescente. */
export function paresPossivelMesmoImovel(
  novos: AnuncioCentralAngariacao[],
  historico: AnuncioCentralAngariacao[],
): Array<[string, string]> {
  const vistos = new Set<string>();
  const pares: Array<[string, string]> = [];
  const todos = [...historico, ...novos];
  for (const novo of novos) {
    for (const outro of todos) {
      if (outro.idExterno === novo.idExterno) continue;
      const par = [novo.idExterno, outro.idExterno].sort() as [string, string];
      const chave = par.join("|");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      if (avaliarPossivelMesmoImovel(novo, outro).classe === "possivel_mesmo_imovel") pares.push(par);
    }
  }
  return pares;
}

/* --- Possível imóvel da carteira --------------------------------------- */

export type ClasseCarteira =
  | "ja_reconhecido_regra_atual"
  | "possivel_imovel_carteira"
  | "sem_correspondencia"
  | "fora_do_escopo";

export type EvidenciaCarteira = "logradouro" | "quartos" | "preco" | "numero";

export interface CandidatoCarteira {
  codigo: string;
  evidencias: EvidenciaCarteira[];
  precoDiferencaPct: number | null;
}

export interface AvaliacaoCarteira {
  classe: ClasseCarteira;
  origem: OrigemLogradouro;
  candidatos: CandidatoCarteira[];
}

function imovelEhCasaSemUnidade(imovel: Imovel): boolean {
  const tipo = chaveNormalizada(imovel.tipo);
  return (tipo.includes("casa") || tipo.includes("sobrado"))
    && !imovel.unidade?.trim() && !imovel.bloco?.trim() && !imovel.edificio?.trim();
}

/**
 * Anúncio de casa que PODE ser um imóvel da carteira, quando a regra atual
 * (`situacaoRepeticaoCentral`) ainda não tem evidência para esconder. Mesmo
 * logradouro não é mesmo imóvel: sem número confiável dos dois lados, o
 * resultado nunca passa de "possível".
 */
export function avaliarPossivelImovelCarteira(
  anuncio: AnuncioCentralAngariacao,
  imoveis: Imovel[],
  urlsNaCarteira: Set<string> = urlsDosImoveis(imoveis),
): AvaliacaoCarteira {
  if (!anuncioNoEscopo(anuncio)) return { classe: "fora_do_escopo", origem: "nenhum", candidatos: [] };
  if (situacaoRepeticaoCentral(anuncio, imoveis, urlsNaCarteira).ocultar) {
    return { classe: "ja_reconhecido_regra_atual", origem: "nenhum", candidatos: [] };
  }
  const logradouro = logradouroDoAnuncio(anuncio);
  if (!logradouro.chave) return { classe: "sem_correspondencia", origem: "nenhum", candidatos: [] };
  const cidade = chaveNormalizada(anuncio.cidade);
  const numero = numeroConfiavel(anuncio.endereco);
  const candidatos: CandidatoCarteira[] = [];
  for (const imovel of imoveis) {
    if (!imovelEhCasaSemUnidade(imovel)) continue;
    if (!cidade || chaveNormalizada(imovel.cidade) !== cidade) continue;
    if (logradouroDoEndereco(imovel.endereco, imovel.bairro) !== logradouro.chave) continue;
    const quartosComparaveis = anuncio.quartos != null && imovel.quartos != null;
    if (quartosComparaveis && anuncio.quartos !== imovel.quartos) continue;
    const numeroImovel = numeroConfiavel(imovel.endereco);
    if (numero && numeroImovel && numero !== numeroImovel) continue;
    const preco = diferencaPreco(anuncio.preco, imovel.valorAluguel);
    if (preco != null && preco > TOLERANCIA_PRECO_CARTEIRA) continue;
    const evidencias: EvidenciaCarteira[] = ["logradouro"];
    if (quartosComparaveis) evidencias.push("quartos");
    if (preco != null) evidencias.push("preco");
    if (numero && numeroImovel) evidencias.push("numero");
    candidatos.push({
      codigo: imovel.codigo || imovel.id,
      evidencias,
      precoDiferencaPct: preco == null ? null : percentual(preco),
    });
  }
  candidatos.sort((x, y) => x.codigo.localeCompare(y.codigo));
  return candidatos.length
    ? { classe: "possivel_imovel_carteira", origem: logradouro.origem, candidatos }
    : { classe: "sem_correspondencia", origem: logradouro.origem, candidatos: [] };
}
