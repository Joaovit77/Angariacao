/* ================================================================
   QUALIDADE DA LOCALIZAÇÃO DO RADAR (R4.2a, somente medição)

   Diz quanto de localização confiável o card de um portal trouxe. Serve
   para observabilidade e debugging, NUNCA para decidir se o anúncio
   existe no Radar: um anúncio só com bairro (a OLX inteira) ou com
   "Endereço indisponível" continua válido.

   Também não é regra de identidade. "Rua Brasil" é localização útil,
   mas não identifica o imóvel; a deduplicação continua nas regras do
   R4.1 (`numeroConfiavel`, `partesEnderecoCasa`), que este módulo não
   altera. Por isso aqui se aceitam formatos que o dedupe recusa, como
   "Rua Alagoas 1674" (sem vírgula) e o endereço completo com CEP.

   Usa só o texto do card persistido. A rua lida do nome da foto do
   Chaves continua sendo sinal auxiliar do R4.1a e não entra aqui.

   Núcleo puro: sem React/Next/Supabase.
   ================================================================ */
import type { AnuncioCentralAngariacao } from "./centralAngariacao";
import { chaveEndereco } from "./duplicidade";
import { chaveLogradouro } from "./sinaisRepeticaoRadar";
import { chaveNormalizada } from "../normalizacao";

/** Em ordem de prioridade: cada anúncio cai na primeira que se aplica. */
export const CATEGORIAS_LOCALIZACAO_RADAR = [
  "logradouro_numero",
  "logradouro_numero_placeholder",
  "logradouro_sem_numero",
  "indisponivel",
  "bairro",
  "cidade",
  "sem_localizacao",
] as const;

export type CategoriaLocalizacaoRadar = (typeof CATEGORIAS_LOCALIZACAO_RADAR)[number];

export interface QualidadeLocalizacaoRadar {
  categoria: CategoriaLocalizacaoRadar;
  /** Número confiável ("378", "89a"), presente só em `logradouro_numero`. */
  numero: string | null;
}

type AnuncioLocalizavel = Pick<AnuncioCentralAngariacao, "endereco" | "bairro" | "cidade" | "descricao">;

/** Texto que o próprio portal publica no lugar do endereço. O Chaves e o Viva
    Real o descartam no parser (sobra no início da descrição); o Wimoveis o
    grava no campo `endereco`, às vezes seguido de "1". */
const AVISO_SEM_ENDERECO = /^endereco (?:nao informado|indisponivel)\b/;

/** Sufixo "- CEP: 86010520" do endereço completo do Wimoveis. */
const CEP_NO_FIM = /[\s,-]*cep:?\s*\d{5}-?\d{3}\s*$/i;

/** Número isolado no fim, com letra ou milhar: "610", "89 A", "1291.", "1.200", "--", "s/n". */
const NUMERO_NO_FIM = /^(.+?)\s+(\d{1,5}(?:\s?[a-z])?\.?|\d{1,3}\.\d{3}|-+|s\/?n)$/i;

type LeituraNumero = { tipo: "numero"; valor: string } | { tipo: "placeholder" };

/**
 * "0", "00", "000", "1", "--", "sn" e "s/n" são os números que os portais
 * usam para esconder o número (medidos no Chaves e no Wimoveis). Qualquer
 * outro trecho que não seja número devolve null: não é número nem aviso.
 */
function lerNumero(trecho: string): LeituraNumero | null {
  const valor = chaveNormalizada(trecho);
  if (/^(?:-+|s\.?\s?\/?\s?n\.?|sem numero)$/.test(valor)) return { tipo: "placeholder" };
  const milhar = valor.match(/^(\d{1,3})\.(\d{3})$/);
  if (milhar) return { tipo: "numero", valor: String(Number(milhar[1] + milhar[2])) };
  const numero = valor.match(/^(\d{1,5})\s?([a-z])?\.?$/);
  if (!numero) return null;
  const inteiro = Number(numero[1]);
  return inteiro <= 1 ? { tipo: "placeholder" } : { tipo: "numero", valor: `${inteiro}${numero[2] || ""}` };
}

/** Separa logradouro e número nos formatos vistos nos portais: "Rua X, 378",
    "Rua X, Casa, 378", "Rua X, 123, Bairro, Cidade - CEP: ...", "Rua X 123". */
function lerEndereco(texto: string): { logradouro: string; numero: LeituraNumero | null } {
  const partes = texto.replace(CEP_NO_FIM, "").split(",").map((parte) => parte.trim()).filter(Boolean);
  const [primeira = ""] = partes;
  const trechoNumero = chaveEndereco(partes[1]) === "casa" ? partes[2] : partes[1];
  const doTrecho = trechoNumero ? lerNumero(trechoNumero) : null;
  if (doTrecho) return { logradouro: primeira, numero: doTrecho };
  const noFim = primeira.match(NUMERO_NO_FIM);
  const doFim = noFim ? lerNumero(noFim[2]) : null;
  return doFim ? { logradouro: noFim![1], numero: doFim } : { logradouro: primeira, numero: null };
}

/** Logradouro que ajuda a localizar: tem nome (não só o tipo), não é o bairro
    repetido nem "Bairro Colinas", o pseudo-endereço visto no Chaves. */
function logradouroUtil(logradouro: string, bairro: string | null | undefined): boolean {
  const chave = chaveLogradouro(logradouro);
  if (!chave || chave.startsWith("bairro ")) return false;
  return !bairro || chave !== chaveLogradouro(bairro);
}

/** Classificação determinística da localização publicada no card. */
export function qualidadeLocalizacaoRadar(anuncio: AnuncioLocalizavel): QualidadeLocalizacaoRadar {
  const endereco = (anuncio.endereco || "").replace(/\s+/g, " ").trim();
  const avisoNoEndereco = AVISO_SEM_ENDERECO.test(chaveNormalizada(endereco));
  if (endereco && !avisoNoEndereco) {
    const { logradouro, numero } = lerEndereco(endereco);
    if (logradouroUtil(logradouro, anuncio.bairro)) {
      if (numero?.tipo === "numero") return { categoria: "logradouro_numero", numero: numero.valor };
      if (numero?.tipo === "placeholder") return { categoria: "logradouro_numero_placeholder", numero: null };
      return { categoria: "logradouro_sem_numero", numero: null };
    }
  }
  if (avisoNoEndereco || AVISO_SEM_ENDERECO.test(chaveNormalizada(anuncio.descricao))) {
    return { categoria: "indisponivel", numero: null };
  }
  if (chaveNormalizada(anuncio.bairro)) return { categoria: "bairro", numero: null };
  if (chaveNormalizada(anuncio.cidade)) return { categoria: "cidade", numero: null };
  return { categoria: "sem_localizacao", numero: null };
}

/** Contagem por categoria, com todas presentes: a soma é o total classificado. */
export function resumirLocalizacaoRadar(
  anuncios: AnuncioLocalizavel[],
): Record<CategoriaLocalizacaoRadar, number> {
  const resumo = Object.fromEntries(CATEGORIAS_LOCALIZACAO_RADAR.map((categoria) => [categoria, 0])) as Record<
    CategoriaLocalizacaoRadar,
    number
  >;
  for (const anuncio of anuncios) resumo[qualidadeLocalizacaoRadar(anuncio).categoria] += 1;
  return resumo;
}
