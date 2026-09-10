/* Etiquetas derivadas, vigência temporal e validação da saída classificada. */
import { daysBetween, timestampDeIso } from "../datas";
import { chaveNormalizada } from "../normalizacao";
import { regiaoDeBairroLondrina, regiaoPorCoordenadasLondrina } from "./regioesLondrina";
import {
  CATEGORIAS_ETIQUETAS_CLASSIFICADAS,
  obterEtiquetaCatalogo,
  type CategoriaEtiquetaProspeccao,
  type CodigoEtiquetaProspeccao,
} from "./catalogoEtiquetas";
import type {
  EstadoClassificacaoAvistamento,
  EstadoEtiquetaProspeccao,
  EstadoFotoAvistamento,
  OrigemEtiquetaProspeccao,
  SituacaoImovelIdentificado,
  TipoImovelProspeccao,
} from "./prospeccao";

export const CONFIANCA_MINIMA_ETIQUETA = 70;
const DIAS_HISTORICO_ANTIGO = 90;
const ACURACIA_IMPRECISA_METROS = 100;
const TIPOS_VERTICAIS = new Set<TipoImovelProspeccao>([
  "Apartamento",
  "Kitnet/Studio",
  "Sala Comercial",
]);

export interface EntradaEtiquetasDeterministicas {
  logradouro?: string | null;
  numero?: string | null;
  unidade?: string | null;
  bloco?: string | null;
  edificio?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  pontoReferencia?: string | null;
  tipo?: TipoImovelProspeccao | null;
  latitude?: number | null;
  longitude?: number | null;
  acuraciaMetros?: number | null;
  fotos?: readonly EstadoFotoAvistamento[];
  avistamentosTotal: number;
  ultimoAvistamentoEm?: string | null;
  ultimaInvestigacaoEm?: string | null;
  classificacaoEstado?: EstadoClassificacaoAvistamento | null;
  situacao: SituacaoImovelIdentificado;
  possivelDuplicata?: boolean;
  jaNaCarteira?: boolean;
  foraDaAreaAtendida?: boolean;
  hoje: string;
}

export interface EtiquetaDerivadaProspeccao {
  categoria: CategoriaEtiquetaProspeccao;
  codigo: CodigoEtiquetaProspeccao;
  grauCerteza: "derivado";
}

function preenchido(valor: string | null | undefined): boolean {
  return !!valor?.trim();
}

function temCoordenada(entrada: EntradaEtiquetasDeterministicas): boolean {
  return entrada.latitude != null
    && entrada.longitude != null
    && Number.isFinite(entrada.latitude)
    && Number.isFinite(entrada.longitude)
    && entrada.latitude >= -90
    && entrada.latitude <= 90
    && entrada.longitude >= -180
    && entrada.longitude <= 180;
}

function diasDesde(iso: string | null | undefined, hoje: string): number | null {
  return daysBetween(iso?.slice(0, 10), hoje.slice(0, 10));
}

/** Deriva somente do snapshot recebido; não persiste nem chama serviço. */
export function derivarEtiquetasProspeccao(
  entrada: EntradaEtiquetasDeterministicas,
): EtiquetaDerivadaProspeccao[] {
  const etiquetas: EtiquetaDerivadaProspeccao[] = [];
  const adicionar = (categoria: CategoriaEtiquetaProspeccao, codigo: CodigoEtiquetaProspeccao) => {
    etiquetas.push({ categoria, codigo, grauCerteza: "derivado" });
  };

  if (chaveNormalizada(entrada.cidade) === "londrina") {
    const regiao = regiaoPorCoordenadasLondrina(entrada.latitude, entrada.longitude)
      || regiaoDeBairroLondrina(entrada.bairro);
    const codigoPorRegiao = {
      "Zona Central": "regiao:central",
      "Zona Sul": "regiao:sul",
      "Zona Leste": "regiao:leste",
      "Zona Oeste": "regiao:oeste",
      "Zona Norte": "regiao:norte",
    } as const;
    if (regiao) adicionar("localizacao", codigoPorRegiao[regiao]);
  }
  if (preenchido(entrada.bairro)) adicionar("localizacao", "bairro-conhecido");
  if (entrada.foraDaAreaAtendida) adicionar("localizacao", "fora-da-area-atendida");

  const temLogradouro = preenchido(entrada.logradouro);
  const temNumero = preenchido(entrada.numero);
  if (temLogradouro && temNumero) adicionar("qualidade-do-dado", "endereco-completo");
  else if (temLogradouro) adicionar("qualidade-do-dado", "endereco-sem-numero");
  else if (preenchido(entrada.pontoReferencia)) adicionar("qualidade-do-dado", "so-referencia");

  const coordenada = temCoordenada(entrada);
  if (coordenada) adicionar("qualidade-do-dado", "com-coordenada");
  if (coordenada && (entrada.acuraciaMetros == null
    || !Number.isFinite(entrada.acuraciaMetros)
    || entrada.acuraciaMetros <= 0
    || entrada.acuraciaMetros > ACURACIA_IMPRECISA_METROS)) {
    adicionar("qualidade-do-dado", "coordenada-imprecisa");
  }
  if (entrada.tipo && TIPOS_VERTICAIS.has(entrada.tipo) && !preenchido(entrada.unidade)) {
    adicionar("qualidade-do-dado", "unidade-desconhecida");
  }

  const fotos = entrada.fotos || [];
  if (fotos.includes("ativa")) adicionar("qualidade-do-dado", "com-foto");
  else adicionar("qualidade-do-dado", "sem-foto");
  if (fotos.includes("reservada")) adicionar("qualidade-do-dado", "envio-de-foto-pendente");

  if (entrada.ultimaInvestigacaoEm) {
    adicionar("historico", "investigado");
    if ((diasDesde(entrada.ultimaInvestigacaoEm, entrada.hoje) || 0) > DIAS_HISTORICO_ANTIGO) {
      adicionar("historico", "investigado-ha-mais-de-90-dias");
    }
  } else {
    adicionar("historico", "nunca-investigado");
  }
  if (entrada.avistamentosTotal === 1) adicionar("historico", "um-avistamento");
  if (entrada.avistamentosTotal > 1) adicionar("historico", "varios-avistamentos");
  if ((diasDesde(entrada.ultimoAvistamentoEm, entrada.hoje) || 0) > DIAS_HISTORICO_ANTIGO) {
    adicionar("historico", "sem-retorno-ha-mais-de-90-dias");
  }
  if (entrada.classificacaoEstado === "pendente" || entrada.classificacaoEstado === "indisponivel") {
    adicionar("historico", "aguardando-classificacao");
  }
  if (entrada.possivelDuplicata) adicionar("historico", "possivel-duplicata");
  if (entrada.jaNaCarteira) adicionar("historico", "ja-na-carteira");
  if (entrada.situacao === "promovido") adicionar("historico", "promovido");
  if (entrada.situacao === "descartado") adicionar("historico", "descartado");

  return etiquetas;
}

export interface SugestaoEtiquetaClassificada {
  categoria: unknown;
  codigo: unknown;
  confianca: unknown;
  evidencia?: unknown;
}

export interface EtiquetaClassificadaValidada {
  categoria: (typeof CATEGORIAS_ETIQUETAS_CLASSIFICADAS)[number];
  codigo: CodigoEtiquetaProspeccao;
  confianca: number;
}

export interface ResultadoValidacaoEtiquetas {
  etiquetas: EtiquetaClassificadaValidada[];
  contadores: {
    sugeridas: number;
    aplicadas: number;
    abaixoDoPiso: number;
    foraDoCatalogo: number;
    semEvidencia: number;
  };
}

function normalizarTrecho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Valida catálogo, piso e evidência antes de qualquer escrita. */
export function validarEtiquetasClassificadas(
  sugestoes: readonly SugestaoEtiquetaClassificada[],
  observacao: string,
  confiancaMinima = CONFIANCA_MINIMA_ETIQUETA,
): ResultadoValidacaoEtiquetas {
  const contadores = {
    sugeridas: sugestoes.length,
    aplicadas: 0,
    abaixoDoPiso: 0,
    foraDoCatalogo: 0,
    semEvidencia: 0,
  };
  const aceitas = new Map<string, EtiquetaClassificadaValidada>();
  const observacaoNormalizada = normalizarTrecho(observacao);

  for (const sugestao of sugestoes) {
    const definicao = obterEtiquetaCatalogo(sugestao.categoria, sugestao.codigo);
    if (!definicao || !CATEGORIAS_ETIQUETAS_CLASSIFICADAS.includes(
      definicao.categoria as (typeof CATEGORIAS_ETIQUETAS_CLASSIFICADAS)[number],
    )) {
      contadores.foraDoCatalogo++;
      continue;
    }
    if (typeof sugestao.confianca !== "number"
      || !Number.isInteger(sugestao.confianca)
      || sugestao.confianca < 0
      || sugestao.confianca > 100) {
      contadores.foraDoCatalogo++;
      continue;
    }
    if (sugestao.confianca < confiancaMinima) {
      contadores.abaixoDoPiso++;
      continue;
    }
    if (definicao.exigeEvidenciaExplicita) {
      const evidencia = typeof sugestao.evidencia === "string"
        ? normalizarTrecho(sugestao.evidencia)
        : "";
      if (!evidencia || !observacaoNormalizada.includes(evidencia)) {
        contadores.semEvidencia++;
        continue;
      }
    }
    const etiqueta: EtiquetaClassificadaValidada = {
      categoria: definicao.categoria as EtiquetaClassificadaValidada["categoria"],
      codigo: definicao.codigo,
      confianca: sugestao.confianca,
    };
    const chave = `${etiqueta.categoria}|${etiqueta.codigo}`;
    const anterior = aceitas.get(chave);
    if (!anterior || anterior.confianca < etiqueta.confianca) aceitas.set(chave, etiqueta);
  }

  const etiquetas = [...aceitas.values()];
  contadores.aplicadas = etiquetas.length;
  return { etiquetas, contadores };
}

export interface EtiquetaProspeccaoLeitura {
  categoria: CategoriaEtiquetaProspeccao;
  codigo: CodigoEtiquetaProspeccao;
  avistamentoId: string | null;
  revisaoObservacao: number | null;
  observadoEm: string | null;
  createdAt: string;
  estado: EstadoEtiquetaProspeccao;
  origem: OrigemEtiquetaProspeccao;
  confianca: number | null;
}

export interface EtiquetaDoImovel {
  categoria: CategoriaEtiquetaProspeccao;
  codigo: CodigoEtiquetaProspeccao;
  ultimaVezObservado: string;
  vigenteNoAvistamentoCorrente: boolean;
  estado: EstadoEtiquetaProspeccao;
  origem: OrigemEtiquetaProspeccao;
  confianca: number | null;
}

function instanteEtiqueta(etiqueta: EtiquetaProspeccaoLeitura): number {
  return timestampDeIso(etiqueta.observadoEm) ?? timestampDeIso(etiqueta.createdAt) ?? 0;
}

function estadoVigente(estado: EstadoEtiquetaProspeccao): boolean {
  return estado === "inferida" || estado === "confirmada";
}

function estaVigenteNoCorrente(
  etiqueta: EtiquetaProspeccaoLeitura,
  corrente: { id: string; observacaoRevisao: number } | null,
): boolean {
  if (!estadoVigente(etiqueta.estado)) return false;
  if (etiqueta.avistamentoId === null) return etiqueta.origem === "manual";
  if (!corrente || etiqueta.avistamentoId !== corrente.id) return false;
  // A correção do texto não revoga uma confirmação humana; o conflito de
  // revisão é apresentado separadamente e será resolvido por uma pessoa.
  if (etiqueta.estado === "confirmada") return true;
  return etiqueta.revisaoObservacao === null
    || etiqueta.revisaoObservacao === corrente.observacaoRevisao;
}

function prioridadeVigencia(
  etiqueta: EtiquetaProspeccaoLeitura,
  corrente: { id: string; observacaoRevisao: number } | null,
): number {
  if (!estaVigenteNoCorrente(etiqueta, corrente)) return 0;
  return etiqueta.avistamentoId === null && etiqueta.origem === "manual" ? 2 : 1;
}

/**
 * Por código, escolhe primeiro uma afirmação vigente do lugar, depois uma do
 * avistamento corrente e, por fim, a ocorrência histórica mais recente.
 */
export function etiquetasDoImovel(
  etiquetas: readonly EtiquetaProspeccaoLeitura[],
  avistamentoCorrente: { id: string; observacaoRevisao: number } | null,
): EtiquetaDoImovel[] {
  const grupos = new Map<string, EtiquetaProspeccaoLeitura[]>();
  for (const etiqueta of etiquetas) {
    const chave = `${etiqueta.categoria}|${etiqueta.codigo}`;
    grupos.set(chave, [...(grupos.get(chave) || []), etiqueta]);
  }

  return [...grupos.values()].map((grupo) => {
    const ordenado = [...grupo].sort((a, b) => {
      const vigenteA = prioridadeVigencia(a, avistamentoCorrente);
      const vigenteB = prioridadeVigencia(b, avistamentoCorrente);
      return vigenteB - vigenteA || instanteEtiqueta(b) - instanteEtiqueta(a);
    });
    const escolhida = ordenado[0];
    return {
      categoria: escolhida.categoria,
      codigo: escolhida.codigo,
      ultimaVezObservado: escolhida.observadoEm || escolhida.createdAt,
      vigenteNoAvistamentoCorrente: estaVigenteNoCorrente(escolhida, avistamentoCorrente),
      estado: escolhida.estado,
      origem: escolhida.origem,
      confianca: escolhida.confianca,
    };
  }).sort((a, b) => Number(b.vigenteNoAvistamentoCorrente) - Number(a.vigenteNoAvistamentoCorrente)
    || b.ultimaVezObservado.localeCompare(a.ultimaVezObservado)
    || a.codigo.localeCompare(b.codigo, "pt-BR"));
}
