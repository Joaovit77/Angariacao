/* ================================================================
   AVALIAÇÃO RÁPIDA DE IMÓVEL

   O preço nasce somente de comparáveis observados. A pretensão do
   proprietário não entra nesta unidade: ela é comparada depois, pela UI.
   Pesos, cortes e limites ficam centralizados para que um ajuste futuro
   não deixe tela, histórico e explicação usando metodologias diferentes.

   Núcleo puro: sem React, Next, Supabase ou store.
   ================================================================ */
import { daysBetween } from "../datas";
import { chaveEndereco } from "./duplicidade";
import { chaveNormalizada } from "../normalizacao";
import type { Imovel } from "../tipos";
import {
  normalizarRegiaoLondrina,
  regiaoDeBairroLondrina,
  regiaoPorCoordenadasLondrina,
  type RegiaoLondrina,
} from "./regioesLondrina";

export type FinalidadeAvaliacao = "locacao" | "venda";
export type ConservacaoAvaliacao = "Regular" | "Bom" | "Excelente";
import { extrairAreaM2Declarada } from "./caracteristicasImovel";
export type NivelConfiancaAvaliacao = "Baixa" | "Moderada" | "Boa" | "Alta";
export type OrigemComparavelAvaliacao = "interno" | "externo";

export const DIFERENCIAIS_AVALIACAO = [
  { id: "moveis-planejados", rotulo: "Móveis planejados" },
  { id: "box-banheiros", rotulo: "Box nos banheiros" },
  { id: "ar-condicionado", rotulo: "Ar-condicionado" },
  { id: "cozinha-equipada", rotulo: "Cozinha equipada" },
  { id: "sacada", rotulo: "Sacada" },
  { id: "area-lazer", rotulo: "Área de lazer" },
] as const;

export type DiferencialAvaliacao = typeof DIFERENCIAIS_AVALIACAO[number]["id"];

export interface EntradaAvaliacao {
  imovelId?: string | null;
  finalidade: FinalidadeAvaliacao;
  endereco: string;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  edificio?: string | null;
  tipo: string;
  areaM2: number;
  quartos: number;
  banheiros?: number | null;
  vagas: number;
  conservacao: ConservacaoAvaliacao;
  diferenciais?: DiferencialAvaliacao[];
  descricaoSemantica?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  regiao?: string | null;
  origemExterna?: OrigemExternaAvaliacao | null;
}

export interface OrigemExternaAvaliacao {
  tipo: "comparavel" | "radar-anuncio";
  referenciaId: string;
  comparavelId: string | null;
  portal: string;
  idExterno: string;
}

export interface ComparavelAvaliacao {
  origem: OrigemComparavelAvaliacao;
  id: string;
  idExterno?: string | null;
  codigo?: string | null;
  endereco: string;
  bairro?: string | null;
  cidade?: string | null;
  regiao?: string | null;
  edificio?: string | null;
  tipo: string;
  areaM2?: number | null;
  quartos?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  conservacao?: ConservacaoAvaliacao | null;
  latitude?: number | null;
  longitude?: number | null;
  valorAnunciado: number;
  dataInformacao?: string | null;
  url?: string | null;
  status?: string | null;
  similaridadeVetorial?: number | null;
}

export function comparavelEhOProprioAnuncio(
  entrada: EntradaAvaliacao,
  comparavel: ComparavelAvaliacao,
): boolean {
  const origem = entrada.origemExterna;
  if (!origem || comparavel.origem !== "externo") return false;
  if (origem.comparavelId && comparavel.id === origem.comparavelId) return true;
  return comparavel.codigo === origem.portal && comparavel.idExterno === origem.idExterno;
}

export interface ComponentesSimilaridade {
  localizacao: number;
  tipo: number;
  area: number;
  quartos: number;
  banheiros: number;
  vagas: number;
  conservacao: number;
  recencia: number;
}

export interface ComparavelAvaliado extends ComparavelAvaliacao {
  distanciaKm: number | null;
  valorM2: number | null;
  valorAjustado: number;
  similaridadeEstrutural: number;
  comparabilidadeFinal: number;
  similaridade: number;
  componentes: ComponentesSimilaridade;
  pesoCalculo: number;
}

export interface EstrategiaPrecoAvaliacao {
  id: "rapida" | "mercado" | "maximizar";
  titulo: string;
  valor: number;
  descricao: string;
}

export interface MetodologiaAvaliacao {
  versao: string;
  scoreMinimo: number;
  comparaveisCandidatos: number;
  comparaveisAprovados: number;
  comparaveisLocaisAprovados: number;
  comparaveisComEmbedding: number;
  modoAmostra: "local" | "regional" | "sem-amostra";
  regiaoReferencia: RegiaoLondrina | null;
  outliersRemovidos: number;
  medianaPonderada: number | null;
  medianaValorM2: number | null;
  dispersao: number | null;
  pesos: typeof CONFIGURACAO_AVALIACAO.pesos;
  pesosComparabilidade: typeof CONFIGURACAO_AVALIACAO.pesosComparabilidade;
}

export interface ResultadoAvaliacao {
  situacao: "calculada" | "preliminar" | "insuficiente";
  valorMinimo: number | null;
  valorRecomendado: number | null;
  valorMaximo: number | null;
  nivelConfianca: NivelConfiancaAvaliacao;
  scoreConfianca: number;
  comparaveis: ComparavelAvaliado[];
  explicacao: string[];
  estrategias: EstrategiaPrecoAvaliacao[];
  metodologia: MetodologiaAvaliacao;
}

export interface ComparaveisProvider<Contexto = unknown> {
  id: string;
  buscar: (entrada: EntradaAvaliacao, contexto: Contexto) => ComparavelAvaliacao[] | Promise<ComparavelAvaliacao[]>;
}

export const CONFIGURACAO_AVALIACAO = {
  versao: "avaliacao-rapida-v5-regional-siglon",
  scoreMinimo: 55,
  minimoComparaveis: 3,
  maximoComparaveis: 12,
  maximoDistanciaKm: 5,
  pesos: {
    localizacao: 32,
    tipo: 18,
    area: 18,
    quartos: 9,
    banheiros: 5,
    vagas: 7,
    conservacao: 5,
    recencia: 6,
  },
  // O bloco objetivo continua dominante. O vetor apenas reordena candidatos
  // que já passaram pelos filtros e pelo score estrutural explicável.
  pesosComparabilidade: {
    estrutural: 80,
    vetorial: 20,
  },
} as const;

const ORDEM_CONSERVACAO: ConservacaoAvaliacao[] = ["Regular", "Bom", "Excelente"];
const TIPOS_APARTAMENTO = new Set(["apartamento", "kitnet/studio"]);
const TIPOS_CASA = new Set(["casa", "casa de condominio", "sobrado"]);
const TIPOS_COMERCIAL = new Set(["sala comercial", "galpao"]);

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

function arredondar(valor: number, passo = 50): number {
  return Math.max(passo, Math.round(valor / passo) * passo);
}

function media(valores: number[]): number {
  return valores.length ? valores.reduce((total, valor) => total + valor, 0) / valores.length : 0;
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function quantilPonderado(
  itens: { valor: number; peso: number }[],
  quantil: number,
): number {
  if (!itens.length) return 0;
  const ordenados = [...itens].sort((a, b) => a.valor - b.valor);
  const pesoTotal = ordenados.reduce((total, item) => total + item.peso, 0);
  const alvo = pesoTotal * quantil;
  let acumulado = 0;
  for (const item of ordenados) {
    acumulado += item.peso;
    if (acumulado >= alvo) return item.valor;
  }
  return ordenados[ordenados.length - 1].valor;
}

function distanciaEmKm(
  latA: number | null | undefined,
  lonA: number | null | undefined,
  latB: number | null | undefined,
  lonB: number | null | undefined,
): number | null {
  if (latA == null || lonA == null || latB == null || lonB == null) return null;
  const rad = (graus: number) => (graus * Math.PI) / 180;
  const dLat = rad(latB - latA);
  const dLon = rad(lonB - lonA);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mesmaLocalizacao(a: string | null | undefined, b: string | null | undefined): boolean {
  const chaveA = chaveNormalizada(a);
  return !!chaveA && chaveA === chaveNormalizada(b);
}

function chaveLogradouro(valor: string | null | undefined): string {
  const chave = chaveEndereco(valor)
    .replace(/\b(?:numero|n)\s*\d+[a-z]?\b/g, " ")
    .replace(/\b\d+[a-z]?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return chave.split(" ").length >= 2 ? chave : "";
}

function mesmoLogradouro(a: string | null | undefined, b: string | null | undefined): boolean {
  const chaveA = chaveLogradouro(a);
  return !!chaveA && chaveA === chaveLogradouro(b);
}

function scoreLocalizacao(
  entrada: EntradaAvaliacao,
  comparavel: ComparavelAvaliacao,
  distanciaKm: number | null,
): number {
  if (mesmaLocalizacao(entrada.edificio, comparavel.edificio)) return 100;
  if (chaveEndereco(entrada.endereco) && chaveEndereco(entrada.endereco) === chaveEndereco(comparavel.endereco)) {
    return 96;
  }
  if (mesmoLogradouro(entrada.endereco, comparavel.endereco)) return 92;
  let scoreDistancia = 0;
  if (distanciaKm != null) {
    if (distanciaKm <= 0.5) scoreDistancia = 94;
    else if (distanciaKm <= 1) scoreDistancia = 88;
    else if (distanciaKm <= 3) scoreDistancia = 72;
    else if (distanciaKm <= 5) scoreDistancia = 58;
    else if (distanciaKm <= CONFIGURACAO_AVALIACAO.maximoDistanciaKm) scoreDistancia = 35;
  }
  if (mesmaLocalizacao(entrada.bairro, comparavel.bairro)) return Math.max(82, scoreDistancia);
  if (mesmaLocalizacao(entrada.cidade, comparavel.cidade)) return Math.max(42, scoreDistancia);
  return scoreDistancia;
}

function familiaTipo(tipo: string | null | undefined): string {
  const chave = chaveNormalizada(tipo);
  if (TIPOS_APARTAMENTO.has(chave)) return "apartamento";
  if (TIPOS_CASA.has(chave)) return "casa";
  if (TIPOS_COMERCIAL.has(chave)) return "comercial";
  return chave;
}
function comparavelAtendeCriteriosMinimos(
  entrada: EntradaAvaliacao,
  comparavel: ComparavelAvaliacao,
): boolean {
  if (!familiaTipo(entrada.tipo) || familiaTipo(entrada.tipo) !== familiaTipo(comparavel.tipo)) {
    return false;
  }
  if (!mesmaLocalizacao(entrada.cidade, comparavel.cidade)) return false;
  if (!(comparavel.areaM2 && comparavel.areaM2 > 0)) return false;
  if (Math.abs(entrada.areaM2 - comparavel.areaM2) / entrada.areaM2 > 0.55) return false;
  if (comparavel.quartos == null || Math.abs(entrada.quartos - comparavel.quartos) > 1) return false;

  return true;
}

function comparavelEhLocal(
  entrada: EntradaAvaliacao,
  comparavel: ComparavelAvaliacao,
): boolean {
  const mesmoEdificio = mesmaLocalizacao(entrada.edificio, comparavel.edificio);
  const enderecoEntrada = chaveEndereco(entrada.endereco);
  const mesmoEndereco = !!enderecoEntrada && enderecoEntrada === chaveEndereco(comparavel.endereco);
  const mesmaRua = mesmoLogradouro(entrada.endereco, comparavel.endereco);
  const mesmoBairro = mesmaLocalizacao(entrada.bairro, comparavel.bairro);
  const distanciaKm = distanciaEmKm(
    entrada.latitude,
    entrada.longitude,
    comparavel.latitude,
    comparavel.longitude,
  );
  return mesmoEdificio
    || mesmoEndereco
    || mesmaRua
    || mesmoBairro
    || (distanciaKm != null && distanciaKm <= CONFIGURACAO_AVALIACAO.maximoDistanciaKm);
}

function regiaoDaEntrada(entrada: EntradaAvaliacao): RegiaoLondrina | null {
  return normalizarRegiaoLondrina(entrada.regiao)
    || regiaoPorCoordenadasLondrina(entrada.latitude, entrada.longitude)
    || regiaoDeBairroLondrina(entrada.bairro);
}

function regiaoDoComparavel(comparavel: ComparavelAvaliacao): RegiaoLondrina | null {
  return normalizarRegiaoLondrina(comparavel.regiao)
    || regiaoPorCoordenadasLondrina(comparavel.latitude, comparavel.longitude)
    || regiaoDeBairroLondrina(comparavel.bairro);
}

function comparavelAtendeRegiao(
  entrada: EntradaAvaliacao,
  comparavel: ComparavelAvaliacao,
  regiaoReferencia: RegiaoLondrina | null,
): boolean {
  if (!regiaoReferencia) return comparavelEhLocal(entrada, comparavel);
  const regiaoComparavel = regiaoDoComparavel(comparavel);
  if (regiaoComparavel) return regiaoComparavel === regiaoReferencia;
  // Um rótulo comercial desconhecido só entra quando há evidência espacial
  // ou textual local. "Mesma cidade" não é evidência de mesma região.
  return comparavelEhLocal(entrada, comparavel);
}


function scoreTipo(a: string, b: string): number {
  if (chaveNormalizada(a) === chaveNormalizada(b)) return 100;
  return familiaTipo(a) && familiaTipo(a) === familiaTipo(b) ? 68 : 10;
}

function scoreProporcao(a: number, b: number | null | undefined): number {
  if (!(b && b > 0)) return 45;
  const diferenca = Math.abs(a - b) / Math.max(a, 1);
  return limitar(100 - diferenca * 125, 0, 100);
}

function scoreQuantidade(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null) return 50;
  const diferenca = Math.abs(a - b);
  if (diferenca === 0) return 100;
  if (diferenca === 1) return 68;
  if (diferenca === 2) return 30;
  return 0;
}

function scoreConservacao(
  a: ConservacaoAvaliacao,
  b: ConservacaoAvaliacao | null | undefined,
): number {
  if (!b) return 50;
  const diferenca = Math.abs(ORDEM_CONSERVACAO.indexOf(a) - ORDEM_CONSERVACAO.indexOf(b));
  return diferenca === 0 ? 100 : diferenca === 1 ? 65 : 25;
}

function scoreRecencia(data: string | null | undefined, hoje: string): number {
  const dias = daysBetween(data, hoje);
  if (dias == null) return 35;
  if (dias <= 90) return 100;
  if (dias <= 180) return 90;
  if (dias <= 365) return 78;
  if (dias <= 730) return 52;
  return 25;
}

function fatorStatus(status: string | null | undefined): number {
  if (status === "Locado") return 1;
  if (status === "Publicado") return 0.96;
  if (status === "Autorização assinada" || status === "Angariado") return 0.9;
  if (status === "Anunciado") return 1;
  if (status === "Possível negociação") return 0.7;
  if (status === "Não encontrado") return 0.58;
  if (status === "Removido" || status === "Histórico") return 0.45;
  return 0.78;
}

function fatorOrigem(origem: OrigemComparavelAvaliacao): number {
  return origem === "externo" ? 0.82 : 1;
}

export function calcularSimilaridade(
  entrada: EntradaAvaliacao,
  comparavel: ComparavelAvaliacao,
  hoje: string,
): ComparavelAvaliado {
  const distanciaKm = distanciaEmKm(
    entrada.latitude,
    entrada.longitude,
    comparavel.latitude,
    comparavel.longitude,
  );
  const componentes: ComponentesSimilaridade = {
    localizacao: scoreLocalizacao(entrada, comparavel, distanciaKm),
    tipo: scoreTipo(entrada.tipo, comparavel.tipo),
    area: scoreProporcao(entrada.areaM2, comparavel.areaM2),
    quartos: scoreQuantidade(entrada.quartos, comparavel.quartos),
    banheiros: scoreQuantidade(entrada.banheiros, comparavel.banheiros),
    vagas: scoreQuantidade(entrada.vagas, comparavel.vagas),
    conservacao: scoreConservacao(entrada.conservacao, comparavel.conservacao),
    recencia: scoreRecencia(comparavel.dataInformacao, hoje),
  };
  const pesos = CONFIGURACAO_AVALIACAO.pesos;
  const similaridadeEstrutural = Math.round(
    Object.entries(pesos).reduce(
      (total, [chave, peso]) => total + componentes[chave as keyof ComponentesSimilaridade] * peso,
      0,
    ) / 100,
  );
  const similaridadeVetorial = comparavel.similaridadeVetorial == null
    ? null
    : Math.round(limitar(comparavel.similaridadeVetorial, 0, 1) * 100);
  const pesosComparabilidade = CONFIGURACAO_AVALIACAO.pesosComparabilidade;
  const comparabilidadeFinal = similaridadeVetorial == null
    ? similaridadeEstrutural
    : Math.round(
      (similaridadeEstrutural * pesosComparabilidade.estrutural
        + similaridadeVetorial * pesosComparabilidade.vetorial) / 100,
    );
  const areaComparavel = comparavel.areaM2 && comparavel.areaM2 > 0 ? comparavel.areaM2 : null;
  const valorM2 = areaComparavel ? comparavel.valorAnunciado / areaComparavel : null;
  const proporcaoArea = areaComparavel
    ? limitar(entrada.areaM2 / areaComparavel, 0.65, 1.5)
    : 1;
  // Ajuste parcial: preço/m² corrige porte, mas 35% do valor bruto preserva
  // economias de escala (um imóvel duas vezes maior raramente custa 2x).
  const valorAjustado = comparavel.valorAnunciado * (0.35 + 0.65 * proporcaoArea);
  // O vetor não entra no preço. O peso estatístico usa somente a qualidade
  // estrutural, a recência, o estágio observado e a origem do dado.
  const pesoCalculo = Math.max(0.01, (similaridadeEstrutural / 100) ** 2)
    * (0.65 + componentes.recencia / 100 * 0.35)
    * fatorStatus(comparavel.status)
    * fatorOrigem(comparavel.origem);
  return {
    ...comparavel,
    distanciaKm: distanciaKm == null ? null : Math.round(distanciaKm * 10) / 10,
    valorM2: valorM2 == null ? null : Math.round(valorM2),
    valorAjustado,
    similaridadeEstrutural,
    similaridadeVetorial: similaridadeVetorial == null ? null : similaridadeVetorial / 100,
    comparabilidadeFinal,
    similaridade: comparabilidadeFinal,
    componentes,
    pesoCalculo,
  };
}

function semOutliers(comparaveis: ComparavelAvaliado[]): ComparavelAvaliado[] {
  if (comparaveis.length < 4) return comparaveis;
  const centro = mediana(comparaveis.map((item) => item.valorAjustado));
  const desvioAbsoluto = mediana(comparaveis.map((item) => Math.abs(item.valorAjustado - centro)));
  if (desvioAbsoluto === 0) {
    return comparaveis.filter((item) => item.valorAjustado >= centro * 0.65 && item.valorAjustado <= centro * 1.5);
  }
  const limite = desvioAbsoluto * 3.5;
  return comparaveis.filter((item) => Math.abs(item.valorAjustado - centro) <= limite);
}

function nivelConfianca(score: number): NivelConfiancaAvaliacao {
  if (score >= 80) return "Alta";
  if (score >= 63) return "Boa";
  if (score >= 45) return "Moderada";
  return "Baixa";
}

function scoreConfianca(
  entrada: EntradaAvaliacao,
  comparaveis: ComparavelAvaliado[],
  dispersao: number,
): number {
  const quantidade = limitar(comparaveis.length / 10 * 100, 0, 100);
  const similaridade = media(comparaveis.map((item) => item.similaridade));
  const recencia = media(comparaveis.map((item) => item.componentes.recencia));
  const proximidade = media(comparaveis.map((item) => item.componentes.localizacao));
  const completudeEntrada = [
    !!entrada.endereco.trim(),
    !!entrada.bairro?.trim(),
    !!entrada.cidade?.trim(),
    !!entrada.tipo.trim(),
    entrada.areaM2 > 0,
    entrada.quartos >= 0,
    entrada.vagas >= 0,
    !!entrada.conservacao,
    entrada.latitude != null && entrada.longitude != null,
  ].filter(Boolean).length / 9 * 100;
  const completudeComparaveis = media(comparaveis.map((item) => [
    !!item.endereco.trim(),
    !!item.bairro?.trim(),
    !!item.cidade?.trim(),
    !!item.tipo.trim(),
    !!item.areaM2,
    item.quartos != null,
    !!item.dataInformacao,
  ].filter(Boolean).length / 7 * 100));
  const qualidadeFonte = media(comparaveis.map((item) => {
    if (item.origem === "externo") return 65;
    if (item.status === "Locado") return 100;
    if (item.status === "Publicado") return 85;
    return 75;
  }));
  const consistencia = limitar(100 - dispersao * 300, 0, 100);
  const calculado = Math.round(
    quantidade * 0.18
    + similaridade * 0.2
    + recencia * 0.1
    + proximidade * 0.12
    + completudeEntrada * 0.08
    + completudeComparaveis * 0.12
    + qualidadeFonte * 0.08
    + consistencia * 0.12,
  );
  return comparaveis.every((item) => item.origem === "externo")
    ? Math.min(74, calculado)
    : calculado;
}

function explicacaoResultado(
  entrada: EntradaAvaliacao,
  comparaveis: ComparavelAvaliado[],
  recomendado: number,
  preliminar: boolean,
  quantidadeLocais: number,
  amostraRegional: boolean,
): string[] {
  const maisProximos = comparaveis.slice(0, Math.min(7, comparaveis.length));
  const menor = Math.min(...maisProximos.map((item) => item.valorAjustado));
  const maior = Math.max(...maisProximos.map((item) => item.valorAjustado));
  const areaMedia = media(comparaveis.map((item) => item.areaM2 || 0).filter((area) => area > 0));
  const vagasMedia = media(comparaveis.map((item) => item.vagas ?? 0));
  const linhas = [
    `${comparaveis.length} imóveis semelhantes passaram pelos critérios objetivos de tipo, cidade, área e quartos.`,
    `Os ${maisProximos.length} comparáveis mais fortes apontam valores ajustados entre ${arredondar(menor)} e ${arredondar(maior)} reais.`,
    `A mediana ponderada por similaridade e recência ficou em ${recomendado} reais.`,
  ];
  if (preliminar) {
    linhas.unshift(
      amostraRegional
        ? quantidadeLocais > 0
          ? `A amostra possui apenas ${quantidadeLocais} ${quantidadeLocais === 1 ? "comparável local forte" : "comparáveis locais fortes"}; a complementação ficou restrita à mesma região e a confiança permanece baixa.`
          : "Não havia comparáveis fortes no entorno; a amostra foi ampliada somente dentro da mesma região e a faixa permanece preliminar."
        : `A amostra possui apenas ${quantidadeLocais} ${quantidadeLocais === 1 ? "comparável local forte" : "comparáveis locais fortes"}; por isso a faixa permanece preliminar.`,
    );
  }
  if (areaMedia > 0) {
    const diferenca = (entrada.areaM2 - areaMedia) / areaMedia;
    if (Math.abs(diferenca) >= 0.08) {
      linhas.push(
        diferenca > 0
          ? "A área informada é maior que a média dos comparáveis e elevou parcialmente a referência."
          : "A área informada é menor que a média dos comparáveis e reduziu parcialmente a referência.",
      );
    }
  }
  if (Math.abs(entrada.vagas - vagasMedia) >= 0.75) {
    linhas.push(
      entrada.vagas > vagasMedia
        ? "O imóvel possui mais vagas que a média dos comparáveis usados."
        : "O imóvel possui menos vagas que a média dos comparáveis usados.",
    );
  }
  return linhas;
}

export function avaliarImovel(
  entrada: EntradaAvaliacao,
  candidatos: ComparavelAvaliacao[],
  hoje: string,
): ResultadoAvaliacao {
  const candidatosSemAlvo = candidatos.filter((item) => !comparavelEhOProprioAnuncio(entrada, item));
  const regiaoReferencia = regiaoDaEntrada(entrada);
  const avaliadosEstruturais = candidatosSemAlvo
    .filter((item) => item.id !== entrada.imovelId && item.valorAnunciado > 0)
    .filter((item) => comparavelAtendeCriteriosMinimos(entrada, item))
    .filter((item) => comparavelAtendeRegiao(entrada, item, regiaoReferencia))
    .map((item) => calcularSimilaridade(entrada, item, hoje))
    .filter((item) => item.similaridade >= CONFIGURACAO_AVALIACAO.scoreMinimo);
  const avaliadosLocais = avaliadosEstruturais.filter((item) => comparavelEhLocal(entrada, item));
  const mesmaRua = avaliadosLocais.filter((item) =>
    mesmoLogradouro(entrada.endereco, item.endereco)
  );
  const locaisSelecionados = (mesmaRua.length >= CONFIGURACAO_AVALIACAO.minimoComparaveis
    ? mesmaRua
    : avaliadosLocais);
  const amostraRegional = !!regiaoReferencia
    && locaisSelecionados.length < CONFIGURACAO_AVALIACAO.minimoComparaveis;
  const avaliados = (amostraRegional ? avaliadosEstruturais : locaisSelecionados)
    .sort((a, b) => b.similaridade - a.similaridade || b.pesoCalculo - a.pesoCalculo)
    .slice(0, CONFIGURACAO_AVALIACAO.maximoComparaveis);
  const filtrados = semOutliers(avaliados);
  const quantidadeLocais = filtrados.filter((item) => comparavelEhLocal(entrada, item)).length;
  const resultadoPreliminar = amostraRegional
    || filtrados.length < CONFIGURACAO_AVALIACAO.minimoComparaveis;
  const metodologiaBase = {
    versao: CONFIGURACAO_AVALIACAO.versao,
    scoreMinimo: CONFIGURACAO_AVALIACAO.scoreMinimo,
    comparaveisCandidatos: candidatosSemAlvo.length,
    comparaveisAprovados: filtrados.length,
    comparaveisLocaisAprovados: quantidadeLocais,
    comparaveisComEmbedding: filtrados.filter((item) => item.similaridadeVetorial != null).length,
    modoAmostra: filtrados.length === 0
      ? "sem-amostra" as const
      : amostraRegional ? "regional" as const : "local" as const,
    regiaoReferencia,
    outliersRemovidos: avaliados.length - filtrados.length,
    pesos: CONFIGURACAO_AVALIACAO.pesos,
    pesosComparabilidade: CONFIGURACAO_AVALIACAO.pesosComparabilidade,
  };

  if (filtrados.length === 0) {
    return {
      situacao: "insuficiente",
      valorMinimo: null,
      valorRecomendado: null,
      valorMaximo: null,
      nivelConfianca: "Baixa",
      scoreConfianca: 0,
      comparaveis: filtrados,
      explicacao: [
        "Nenhum imóvel com preço observado passou pelos critérios mínimos de tipo, cidade, área e quartos.",
        "Sem ao menos uma referência real, a avaliação não inventa um valor.",
      ],
      estrategias: [],
      metodologia: {
        ...metodologiaBase,
        medianaPonderada: null,
        medianaValorM2: null,
        dispersao: null,
      },
    };
  }

  const itensPonderados = filtrados.map((item) => ({ valor: item.valorAjustado, peso: item.pesoCalculo }));
  const medianaPonderada = quantilPonderado(itensPonderados, 0.5);
  const medianaValorM2 = quantilPonderado(
    filtrados
      .filter((item) => item.valorM2 != null)
      .map((item) => ({ valor: item.valorM2!, peso: item.pesoCalculo })),
    0.5,
  );
  const q25 = quantilPonderado(itensPonderados, 0.25);
  const q75 = quantilPonderado(itensPonderados, 0.75);
  const dispersao = medianaPonderada > 0 ? (q75 - q25) / medianaPonderada : 1;
  const confiancaCalculada = scoreConfianca(entrada, filtrados, dispersao);
  const confianca = resultadoPreliminar ? Math.min(44, confiancaCalculada) : confiancaCalculada;
  const penalidade = (100 - confianca) / 100 * 0.13;
  const meiaFaixa = limitar(
    Math.max(resultadoPreliminar ? 0.18 : 0.055, dispersao * 0.7) + penalidade,
    resultadoPreliminar ? 0.18 : 0.07,
    resultadoPreliminar ? 0.32 : 0.28,
  );
  const recomendado = arredondar(medianaPonderada);
  const minimo = Math.min(recomendado, arredondar(medianaPonderada * (1 - meiaFaixa)));
  const maximo = Math.max(recomendado, arredondar(medianaPonderada * (1 + meiaFaixa)));
  const nivel = nivelConfianca(confianca);
  const estrategias = !resultadoPreliminar && confianca >= 45 ? [
    {
      id: "rapida" as const,
      titulo: "Locação rápida",
      valor: minimo,
      descricao: "Faixa competitiva, com tendência de reduzir o tempo anunciado.",
    },
    {
      id: "mercado" as const,
      titulo: "Valor de mercado",
      valor: recomendado,
      descricao: "Melhor equilíbrio entre valor pedido e liquidez.",
    },
    {
      id: "maximizar" as const,
      titulo: "Maximizar aluguel",
      valor: maximo,
      descricao: "Posicionamento no topo da faixa, com possível espera maior.",
    },
  ] : [];

  return {
    situacao: resultadoPreliminar ? "preliminar" : "calculada",
    valorMinimo: minimo,
    valorRecomendado: recomendado,
    valorMaximo: maximo,
    nivelConfianca: nivel,
    scoreConfianca: confianca,
    comparaveis: filtrados,
    explicacao: explicacaoResultado(
      entrada,
      filtrados,
      recomendado,
      resultadoPreliminar,
      quantidadeLocais,
      amostraRegional,
    ),
    estrategias,
    metodologia: {
      ...metodologiaBase,
      medianaPonderada: Math.round(medianaPonderada),
      medianaValorM2: medianaValorM2 > 0 ? Math.round(medianaValorM2) : null,
      dispersao: Math.round(dispersao * 1000) / 1000,
    },
  };
}

export function descricaoSemanticaComDiferenciais(
  textoBase: string | null | undefined,
  diferenciais: DiferencialAvaliacao[],
): string | null {
  const base = (textoBase || "").trim();
  const rotulos = DIFERENCIAIS_AVALIACAO
    .filter((item) => diferenciais.includes(item.id))
    .map((item) => item.rotulo);
  const resumo = rotulos.length ? `Diferenciais informados: ${rotulos.join(", ")}.` : "";
  return [base, resumo].filter(Boolean).join("\n") || null;
}

/** Área declarada no texto original do anúncio. Não tenta inferir quando o
    texto não contém a unidade: número solto pode ser preço, endereço ou área. */
export function extrairAreaM2(texto: string | null | undefined): number | null {
  return extrairAreaM2Declarada(texto);
}

function dataDoComparavel(imovel: Imovel): string | null {
  if (imovel.locadoEm) return imovel.locadoEm;
  const historico = imovel.statusHistory || [];
  const marco = [...historico].reverse().find((item) =>
    item.status === "Locado" || item.status === "Publicado" || item.status === "Angariado",
  );
  return marco?.date || imovel.dataAngariacao || null;
}

export interface ContextoComparaveisInternos {
  imoveis: Imovel[];
}

export const internalComparablesProvider: ComparaveisProvider<ContextoComparaveisInternos> = {
  id: "interno",
  buscar(entrada, contexto) {
    // A carteira atual só possui preço de locação. Para venda, a ausência de
    // fonte é explícita e o motor responde "dados insuficientes".
    if (entrada.finalidade === "venda") return [];
    return contexto.imoveis
      .filter((imovel) => imovel.id !== entrada.imovelId && (imovel.valorAluguel || 0) > 0)
      .map((imovel) => ({
        origem: "interno" as const,
        id: imovel.id,
        codigo: imovel.codigo,
        endereco: imovel.endereco,
        bairro: imovel.bairro,
        cidade: imovel.cidade,
        edificio: imovel.edificio,
        tipo: imovel.tipo || "Outro",
        areaM2: extrairAreaM2(imovel.textoAnuncio),
        quartos: imovel.quartos,
        banheiros: imovel.banheiros,
        vagas: imovel.vagas,
        conservacao: null,
        latitude: imovel.latitude,
        longitude: imovel.longitude,
        valorAnunciado: Number(imovel.valorAluguel),
        dataInformacao: dataDoComparavel(imovel),
        url: null,
        status: imovel.status,
      }));
  },
};

export function entradaDeImovel(
  imovel: Imovel,
  finalidade: FinalidadeAvaliacao = "locacao",
): Partial<EntradaAvaliacao> {
  return {
    imovelId: imovel.id,
    finalidade,
    endereco: imovel.endereco,
    bairro: imovel.bairro,
    cidade: imovel.cidade,
    estado: imovel.estado,
    edificio: imovel.edificio,
    tipo: imovel.tipo || "Apartamento",
    areaM2: extrairAreaM2(imovel.textoAnuncio) || undefined,
    quartos: imovel.quartos ?? 0,
    banheiros: imovel.banheiros,
    vagas: imovel.vagas ?? 0,
    latitude: imovel.latitude,
    longitude: imovel.longitude,
  };
}

export function compararPretensao(
  valorPretendido: number | null | undefined,
  valorRecomendado: number | null | undefined,
): { percentual: number; direcao: "acima" | "abaixo" | "alinhada" } | null {
  if (!(valorPretendido && valorPretendido > 0) || !(valorRecomendado && valorRecomendado > 0)) return null;
  const percentual = Math.round(Math.abs(valorPretendido / valorRecomendado - 1) * 100);
  const relacao = valorPretendido / valorRecomendado;
  return {
    percentual,
    direcao: relacao > 1.025 ? "acima" : relacao < 0.975 ? "abaixo" : "alinhada",
  };
}
