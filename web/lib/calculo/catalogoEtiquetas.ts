/* Catálogo fechado do Garimpo em Campo. Etiqueta nova entra por commit. */
import { chaveNormalizada } from "../normalizacao";

type NaturezaEtiqueta = "classificada" | "derivada";

interface DefinicaoEtiqueta {
  codigo: string;
  rotulo: string;
  natureza: NaturezaEtiqueta;
  exigeEvidenciaExplicita?: boolean;
  afirmacaoNegativa?: boolean;
}

export const VERSAO_CATALOGO_ETIQUETAS = 1;

export const CATALOGO_ETIQUETAS = {
  "estado-visual": [
    { codigo: "aparenta-vago", rotulo: "Aparenta vago", natureza: "classificada" },
    { codigo: "aparenta-ocupado", rotulo: "Aparenta ocupado", natureza: "classificada" },
    { codigo: "aparenta-bem-conservado", rotulo: "Aparenta bem conservado", natureza: "classificada" },
    { codigo: "aparenta-deteriorado", rotulo: "Aparenta deteriorado", natureza: "classificada" },
    { codigo: "aparenta-em-obra", rotulo: "Aparenta estar em obra", natureza: "classificada" },
  ],
  "sinal-de-prospeccao": [
    { codigo: "placa-aluga-se", rotulo: "Placa de aluga-se", natureza: "classificada" },
    { codigo: "placa-vende-se", rotulo: "Placa de vende-se", natureza: "classificada" },
    { codigo: "placa-de-proprietario", rotulo: "Placa de proprietário", natureza: "classificada" },
    { codigo: "placa-de-imobiliaria", rotulo: "Placa de imobiliária", natureza: "classificada" },
    {
      codigo: "sem-placa-visivel",
      rotulo: "Sem placa visível",
      natureza: "classificada",
      exigeEvidenciaExplicita: true,
      afirmacaoNegativa: true,
    },
    { codigo: "imovel-fechado", rotulo: "Imóvel fechado", natureza: "classificada" },
    { codigo: "mato-alto", rotulo: "Mato alto", natureza: "classificada" },
    { codigo: "obra-parada", rotulo: "Obra parada", natureza: "classificada" },
  ],
  localizacao: [
    { codigo: "regiao:central", rotulo: "Região central", natureza: "derivada" },
    { codigo: "regiao:sul", rotulo: "Região sul", natureza: "derivada" },
    { codigo: "regiao:leste", rotulo: "Região leste", natureza: "derivada" },
    { codigo: "regiao:oeste", rotulo: "Região oeste", natureza: "derivada" },
    { codigo: "regiao:norte", rotulo: "Região norte", natureza: "derivada" },
    { codigo: "bairro-conhecido", rotulo: "Bairro conhecido", natureza: "derivada" },
    { codigo: "fora-da-area-atendida", rotulo: "Fora da área atendida", natureza: "derivada" },
  ],
  "qualidade-do-dado": [
    { codigo: "endereco-completo", rotulo: "Endereço completo", natureza: "derivada" },
    { codigo: "endereco-sem-numero", rotulo: "Endereço sem número", natureza: "derivada" },
    { codigo: "so-referencia", rotulo: "Somente referência", natureza: "derivada" },
    { codigo: "com-coordenada", rotulo: "Com coordenada", natureza: "derivada" },
    { codigo: "coordenada-imprecisa", rotulo: "Coordenada imprecisa", natureza: "derivada" },
    { codigo: "unidade-desconhecida", rotulo: "Unidade desconhecida", natureza: "derivada" },
    { codigo: "com-foto", rotulo: "Com foto", natureza: "derivada" },
    { codigo: "sem-foto", rotulo: "Sem foto", natureza: "derivada" },
    { codigo: "envio-de-foto-pendente", rotulo: "Envio de foto pendente", natureza: "derivada" },
  ],
  historico: [
    { codigo: "nunca-investigado", rotulo: "Nunca investigado", natureza: "derivada" },
    { codigo: "investigado", rotulo: "Investigado", natureza: "derivada" },
    { codigo: "investigado-ha-mais-de-90-dias", rotulo: "Investigado há mais de 90 dias", natureza: "derivada" },
    { codigo: "um-avistamento", rotulo: "Um avistamento", natureza: "derivada" },
    { codigo: "varios-avistamentos", rotulo: "Vários avistamentos", natureza: "derivada" },
    { codigo: "sem-retorno-ha-mais-de-90-dias", rotulo: "Sem retorno há mais de 90 dias", natureza: "derivada" },
    { codigo: "aguardando-classificacao", rotulo: "Aguardando classificação", natureza: "derivada" },
    { codigo: "possivel-duplicata", rotulo: "Possível duplicata", natureza: "derivada" },
    { codigo: "ja-na-carteira", rotulo: "Já está na carteira", natureza: "derivada" },
    { codigo: "promovido", rotulo: "Promovido", natureza: "derivada" },
    { codigo: "descartado", rotulo: "Descartado", natureza: "derivada" },
  ],
} as const satisfies Record<string, readonly DefinicaoEtiqueta[]>;

export type CategoriaEtiquetaProspeccao = keyof typeof CATALOGO_ETIQUETAS;
export type CodigoEtiquetaProspeccao =
  (typeof CATALOGO_ETIQUETAS)[CategoriaEtiquetaProspeccao][number]["codigo"];
export type DefinicaoEtiquetaProspeccao = DefinicaoEtiqueta & {
  categoria: CategoriaEtiquetaProspeccao;
  codigo: CodigoEtiquetaProspeccao;
};

export const CATEGORIAS_ETIQUETAS = Object.keys(CATALOGO_ETIQUETAS) as CategoriaEtiquetaProspeccao[];
export const CATEGORIAS_ETIQUETAS_CLASSIFICADAS = [
  "estado-visual",
  "sinal-de-prospeccao",
] as const satisfies readonly CategoriaEtiquetaProspeccao[];

const INDICE_CATALOGO = new Map<string, DefinicaoEtiquetaProspeccao>();
for (const categoria of CATEGORIAS_ETIQUETAS) {
  for (const etiqueta of CATALOGO_ETIQUETAS[categoria]) {
    INDICE_CATALOGO.set(`${chaveNormalizada(categoria)}|${chaveNormalizada(etiqueta.codigo)}`, {
      ...etiqueta,
      categoria,
    });
  }
}

export function normalizarCategoriaEtiqueta(valor: unknown): CategoriaEtiquetaProspeccao | null {
  if (typeof valor !== "string") return null;
  const chave = chaveNormalizada(valor);
  return CATEGORIAS_ETIQUETAS.find((categoria) => chaveNormalizada(categoria) === chave) || null;
}

export function obterEtiquetaCatalogo(
  categoria: unknown,
  codigo: unknown,
): DefinicaoEtiquetaProspeccao | null {
  if (typeof codigo !== "string") return null;
  const categoriaCanonica = normalizarCategoriaEtiqueta(categoria);
  if (!categoriaCanonica) return null;
  return INDICE_CATALOGO.get(
    `${chaveNormalizada(categoriaCanonica)}|${chaveNormalizada(codigo)}`,
  ) || null;
}

export function etiquetaValida(categoria: unknown, codigo: unknown): boolean {
  return obterEtiquetaCatalogo(categoria, codigo) !== null;
}

export function etiquetasClassificaveisDoCatalogo(): DefinicaoEtiquetaProspeccao[] {
  return CATEGORIAS_ETIQUETAS_CLASSIFICADAS.flatMap((categoria) =>
    CATALOGO_ETIQUETAS[categoria].map((etiqueta) => ({ ...etiqueta, categoria })));
}
