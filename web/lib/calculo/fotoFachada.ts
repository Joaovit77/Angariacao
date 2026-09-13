/* Política pura de redução progressiva da foto de fachada. */

export const ALVO_BYTES_FOTO_FACHADA = 400 * 1024;
export const LIMITE_BYTES_FOTO_FACHADA = 5 * 1024 * 1024;
export const LADO_INICIAL_FOTO_FACHADA = 1600;
export const LADO_MINIMO_FOTO_FACHADA = 1024;
export const LADO_MINIATURA_FOTO_FACHADA = 320;
export const QUALIDADE_INICIAL_FOTO_FACHADA = 0.82;
export const QUALIDADE_MINIMA_FOTO_FACHADA = 0.55;
export const QUALIDADE_MINIATURA_FOTO_FACHADA = 0.7;
export const MIMES_FOTO_FACHADA = ["image/jpeg", "image/webp"] as const;

export type MimeFotoFachada = (typeof MIMES_FOTO_FACHADA)[number];
export type CodigoErroFotoFachada = "mime-invalido" | "dimensoes-invalidas" | "arquivo-muito-grande";

export class ErroFotoFachada extends Error {
  constructor(public readonly codigo: CodigoErroFotoFachada, mensagem: string) {
    super(mensagem);
    this.name = "ErroFotoFachada";
  }
}

export interface DimensoesImagem {
  largura: number;
  altura: number;
}

export interface TentativaCodificacaoFoto extends DimensoesImagem {
  qualidade: number;
  mimeType: MimeFotoFachada;
  finalidade: "original" | "miniatura";
}

export interface ArquivoCodificado<T> {
  conteudo: T;
  bytes: number;
}

export type CodificadorFotoFachada<T> = (
  tentativa: TentativaCodificacaoFoto,
) => Promise<ArquivoCodificado<T>> | ArquivoCodificado<T>;

export interface EntradaProcessamentoFoto extends DimensoesImagem {
  mimeType: string;
  mimeSaida?: MimeFotoFachada;
}

export interface ResultadoProcessamentoFoto<T> {
  original: ArquivoCodificado<T> & TentativaCodificacaoFoto;
  miniatura: ArquivoCodificado<T> & TentativaCodificacaoFoto;
  exifPreservado: false;
}

export function dimensoesDentroDoLimite(
  dimensoes: DimensoesImagem,
  ladoMaior: number,
): DimensoesImagem {
  const maiorAtual = Math.max(dimensoes.largura, dimensoes.altura);
  if (maiorAtual <= ladoMaior) return { ...dimensoes };
  const escala = ladoMaior / maiorAtual;
  return {
    largura: Math.max(1, Math.round(dimensoes.largura * escala)),
    altura: Math.max(1, Math.round(dimensoes.altura * escala)),
  };
}

function dimensoesValidas(dimensoes: DimensoesImagem): boolean {
  return Number.isInteger(dimensoes.largura)
    && Number.isInteger(dimensoes.altura)
    && dimensoes.largura > 0
    && dimensoes.altura > 0;
}

export function planejarTentativasFotoFachada(
  entrada: EntradaProcessamentoFoto,
): TentativaCodificacaoFoto[] {
  if (!MIMES_FOTO_FACHADA.includes(entrada.mimeType as MimeFotoFachada)) {
    throw new ErroFotoFachada("mime-invalido", "Use uma imagem JPEG ou WebP.");
  }
  if (entrada.mimeSaida
    && !MIMES_FOTO_FACHADA.includes(entrada.mimeSaida as MimeFotoFachada)) {
    throw new ErroFotoFachada("mime-invalido", "Use uma saída JPEG ou WebP.");
  }
  if (!dimensoesValidas(entrada)) {
    throw new ErroFotoFachada("dimensoes-invalidas", "A imagem tem dimensões inválidas.");
  }

  const mimeType = entrada.mimeSaida || "image/jpeg";
  const inicial = dimensoesDentroDoLimite(entrada, LADO_INICIAL_FOTO_FACHADA);
  const qualidades = [0.82, 0.74, 0.66, 0.58, 0.55];
  const tentativas = qualidades.map((qualidade) => ({
    ...inicial,
    qualidade,
    mimeType,
    finalidade: "original" as const,
  }));
  for (const ladoMaior of [1280, LADO_MINIMO_FOTO_FACHADA]) {
    const reduzida = dimensoesDentroDoLimite(entrada, ladoMaior);
    if (reduzida.largura === inicial.largura && reduzida.altura === inicial.altura) continue;
    if (tentativas.some((tentativa) =>
      tentativa.largura === reduzida.largura && tentativa.altura === reduzida.altura)) continue;
    tentativas.push({
      ...reduzida,
      qualidade: QUALIDADE_MINIMA_FOTO_FACHADA,
      mimeType,
      finalidade: "original",
    });
  }
  return tentativas;
}

function conferirSaidaValida<T>(saida: ArquivoCodificado<T>): void {
  if (!Number.isInteger(saida.bytes) || saida.bytes <= 0) {
    throw new ErroFotoFachada("dimensoes-invalidas", "A codificação da imagem não produziu bytes válidos.");
  }
}

/**
 * Tenta qualidade antes de resolução. Se o alvo não couber nos pisos, aceita
 * o melhor arquivo legível até 5 MB. O codificador injetado será o canvas no C5.
 */
export async function processarFotoFachada<T>(
  entrada: EntradaProcessamentoFoto,
  codificar: CodificadorFotoFachada<T>,
): Promise<ResultadoProcessamentoFoto<T>> {
  const tentativas = planejarTentativasFotoFachada(entrada);
  let original: (ArquivoCodificado<T> & TentativaCodificacaoFoto) | null = null;
  for (const tentativa of tentativas) {
    const codificada = await codificar(tentativa);
    conferirSaidaValida(codificada);
    original = { ...tentativa, ...codificada };
    if (codificada.bytes <= ALVO_BYTES_FOTO_FACHADA) break;
  }
  if (!original || original.bytes > LIMITE_BYTES_FOTO_FACHADA) {
    throw new ErroFotoFachada("arquivo-muito-grande", "A foto excede o limite de 5 MB.");
  }

  const dimensoesMiniatura = dimensoesDentroDoLimite(entrada, LADO_MINIATURA_FOTO_FACHADA);
  const tentativaMiniatura: TentativaCodificacaoFoto = {
    ...dimensoesMiniatura,
    qualidade: QUALIDADE_MINIATURA_FOTO_FACHADA,
    mimeType: entrada.mimeSaida || "image/jpeg",
    finalidade: "miniatura",
  };
  const miniaturaCodificada = await codificar(tentativaMiniatura);
  conferirSaidaValida(miniaturaCodificada);
  if (miniaturaCodificada.bytes > LIMITE_BYTES_FOTO_FACHADA) {
    throw new ErroFotoFachada("arquivo-muito-grande", "A miniatura excede o limite de 5 MB.");
  }

  return {
    original: original!,
    miniatura: { ...tentativaMiniatura, ...miniaturaCodificada },
    exifPreservado: false,
  };
}
