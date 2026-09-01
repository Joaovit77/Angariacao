/* ================================================================
   COMPARÁVEIS OBSERVADOS NO MERCADO

   Contratos puros para identidade e conteúdo semântico. Preço, data e
   status não entram no texto do embedding: mudar qualquer um deles deve
   criar uma observação, não gastar uma nova geração vetorial.
   ================================================================ */
import { chaveEndereco } from "./duplicidade";
import { chaveNormalizada } from "../normalizacao";
import { normalizarUf, ufValida } from "./geografia";

export const CONFIGURACAO_COMPARAVEIS_MERCADO = {
  versaoTextoEmbedding: "imovel-mercado-v1",
  modeloEmbedding: "text-embedding-3-small",
  dimensoesEmbedding: 512,
  maximoTextosPorLote: 100,
  concorrenciaPersistencia: 8,
  maximoCandidatosVetoriais: 80,
  filtros: {
    areaMinimaRelativa: 0.45,
    areaMaximaRelativa: 1.55,
    diferencaMaximaQuartos: 1,
  },
} as const;

export interface ImovelParaRepresentacaoSemantica {
  finalidade?: string | null;
  tipo?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  regiao?: string | null;
  endereco?: string | null;
  edificio?: string | null;
  areaPrivativaM2?: number | null;
  areaTotalM2?: number | null;
  areaTerrenoM2?: number | null;
  quartos?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  andar?: number | null;
  pavimentos?: number | null;
  mobiliado?: boolean | null;
  conservacao?: string | null;
  titulo?: string | null;
  descricao?: string | null;
}

export interface SinaisIdentidadeAnuncio {
  portal: string;
  idExterno: string;
  url: string;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  tipo?: string | null;
  areaM2?: number | null;
  quartos?: number | null;
  anunciante?: string | null;
}

export interface EstadoEmbeddingComparavel {
  embeddingHash?: string | null;
  embeddingModelo?: string | null;
  embeddingDimensoes?: number | null;
  possuiEmbedding?: boolean;
}

const TIPOS_APARTAMENTO = new Set(["apartamento", "kitnet/studio"]);
const TIPOS_CASA = new Set(["casa", "casa de condominio", "sobrado"]);
const TIPOS_COMERCIAL = new Set(["sala comercial", "galpao"]);

export function familiaTipoMercado(tipo: string | null | undefined): string {
  const chave = chaveNormalizada(tipo);
  if (TIPOS_APARTAMENTO.has(chave)) return "apartamento";
  if (TIPOS_CASA.has(chave)) return "casa";
  if (TIPOS_COMERCIAL.has(chave)) return "comercial";
  return chave;
}

function textoLimpo(valor: string | null | undefined): string {
  return (valor || "").replace(/\s+/g, " ").trim();
}

function numeroSemRuido(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "";
  return Number.isInteger(valor) ? String(valor) : String(Math.round(valor * 100) / 100);
}

/** URL estável para identidade: conserva parâmetros funcionais e remove
    somente rastreadores conhecidos, fragmento e variações cosméticas. */
export function urlCanonicaDeAnuncio(valor: string | null | undefined): string {
  const original = textoLimpo(valor);
  if (!original) return "";
  try {
    const url = new URL(original);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const rastreadores = ["fbclid", "gclid", "msclkid", "ref", "referrer"];
    for (const chave of [...url.searchParams.keys()]) {
      if (chave.toLowerCase().startsWith("utm_") || rastreadores.includes(chave.toLowerCase())) {
        url.searchParams.delete(chave);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return original.split("#", 1)[0].trim();
  }
}

/** Base determinística do fingerprint. O valor anunciado fica de fora para
    que uma redução de preço continue pertencendo ao mesmo anúncio. */
export function baseFingerprintAnuncio(sinais: SinaisIdentidadeAnuncio): string {
  return [
    "fingerprint-v2-uf",
    chaveNormalizada(sinais.portal),
    normalizarUf(sinais.estado),
    chaveNormalizada(sinais.cidade),
    chaveNormalizada(sinais.bairro),
    chaveEndereco(sinais.endereco),
    chaveNormalizada(sinais.tipo),
    numeroSemRuido(sinais.areaM2),
    numeroSemRuido(sinais.quartos),
    chaveNormalizada(sinais.anunciante),
  ].join("|");
}

/** Fingerprint só é usado como identidade alternativa quando há endereço
    suficientemente específico e características que reduzam falsos merges. */
export function fingerprintEhForte(sinais: SinaisIdentidadeAnuncio): boolean {
  const endereco = chaveEndereco(sinais.endereco);
  return ufValida(sinais.estado)
    && !!chaveNormalizada(sinais.cidade)
    && /\b\d+[a-z]?\b/.test(endereco)
    && !!chaveNormalizada(sinais.tipo)
    && !!sinais.areaM2
    && sinais.quartos != null;
}

export function anunciosRepresentamMesmaOferta(
  a: SinaisIdentidadeAnuncio,
  b: SinaisIdentidadeAnuncio,
): boolean {
  const mesmoPortal = chaveNormalizada(a.portal) === chaveNormalizada(b.portal);
  if (mesmoPortal && a.idExterno.trim() && a.idExterno.trim() === b.idExterno.trim()) return true;
  const urlA = urlCanonicaDeAnuncio(a.url);
  const urlB = urlCanonicaDeAnuncio(b.url);
  if (urlA && urlA === urlB) return true;
  return fingerprintEhForte(a)
    && fingerprintEhForte(b)
    && baseFingerprintAnuncio(a) === baseFingerprintAnuncio(b);
}

/** Texto curto, ordenado e reproduzível. Dados objetivos continuam também
    em colunas próprias; aqui dão contexto à descrição semântica. */
export function textoSemanticoDoImovel(dados: ImovelParaRepresentacaoSemantica): string {
  const campos: [string, string][] = [
    ["finalidade", chaveNormalizada(dados.finalidade)],
    ["tipo", textoLimpo(dados.tipo)],
    ["cidade", textoLimpo(dados.cidade)],
    ["bairro", textoLimpo(dados.bairro)],
    ["região", textoLimpo(dados.regiao)],
    ["endereço", textoLimpo(dados.endereco)],
    ["edifício", textoLimpo(dados.edificio)],
    ["área privativa", dados.areaPrivativaM2 ? `${numeroSemRuido(dados.areaPrivativaM2)} m²` : ""],
    ["área total", dados.areaTotalM2 ? `${numeroSemRuido(dados.areaTotalM2)} m²` : ""],
    ["terreno", dados.areaTerrenoM2 ? `${numeroSemRuido(dados.areaTerrenoM2)} m²` : ""],
    ["quartos", numeroSemRuido(dados.quartos)],
    ["suítes", numeroSemRuido(dados.suites)],
    ["banheiros", numeroSemRuido(dados.banheiros)],
    ["vagas", numeroSemRuido(dados.vagas)],
    ["andar", numeroSemRuido(dados.andar)],
    ["pavimentos", numeroSemRuido(dados.pavimentos)],
    ["mobiliado", dados.mobiliado == null ? "" : (dados.mobiliado ? "sim" : "não")],
    ["conservação", textoLimpo(dados.conservacao)],
    ["título", textoLimpo(dados.titulo)],
    ["descrição", textoLimpo(dados.descricao)],
  ];
  return [
    `representação=${CONFIGURACAO_COMPARAVEIS_MERCADO.versaoTextoEmbedding}`,
    ...campos.filter(([, valor]) => !!valor).map(([rotulo, valor]) => `${rotulo}=${valor}`),
  ].join(" | ");
}

export function deveGerarEmbedding(
  atual: EstadoEmbeddingComparavel | null | undefined,
  proximoHash: string,
  modelo = CONFIGURACAO_COMPARAVEIS_MERCADO.modeloEmbedding,
  dimensoes = CONFIGURACAO_COMPARAVEIS_MERCADO.dimensoesEmbedding,
): boolean {
  return !atual?.possuiEmbedding
    || atual.embeddingHash !== proximoHash
    || atual.embeddingModelo !== modelo
    || atual.embeddingDimensoes !== dimensoes;
}
