/* ================================================================
   DETECÇÃO DE IMÓVEL JÁ CADASTRADO

   O mesmo imóvel entra duas vezes o tempo todo: ele reaparece no site
   de outra imobiliária, o proprietário liga de novo, passa um tempo e
   ninguém lembra. O que identifica um imóvel é o ENDEREÇO — mas o
   endereço digitado à mão nunca sai igual ("Rua Souza Naves, 100" vs
   "R. Souza Naves 100"), então a comparação é por CHAVE normalizada,
   não por igualdade de texto.

   A unidade faz parte da identidade: no mesmo prédio, o ap 101 e o
   ap 202 são imóveis DIFERENTES. Sem isso, quem trabalha com prédio
   veria alerta falso em todo cadastro.

   Núcleo puro: sem React/Next/Supabase (regra do CLAUDE.md).
   ================================================================ */
import { chaveNormalizada } from "../normalizacao";
import type { Imovel } from "../tipos";

/** Abreviações de logradouro que a mesma pessoa escreve de dois jeitos. */
const ABREVIACOES: [RegExp, string][] = [
  [/\b(r|rua)\b/g, "rua"],
  [/\b(av|avenida)\b/g, "avenida"],
  [/\b(al|alameda)\b/g, "alameda"],
  [/\b(tv|trav|travessa)\b/g, "travessa"],
  [/\b(pc|praca)\b/g, "praca"],
  [/\b(rod|rodovia)\b/g, "rodovia"],
  [/\b(est|estrada)\b/g, "estrada"],
];

/**
 * Chave de comparação de um trecho de endereço: sem acento/caixa (via
 * `chaveNormalizada`), sem pontuação, com as abreviações de logradouro
 * uniformizadas. "R. Souza Naves, 100" e "Rua Souza Naves 100" caem na
 * mesma chave.
 */
function chaveEndereco(valor: string | null | undefined): string {
  const base = chaveNormalizada(valor)
    .replace(/[.,;/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ABREVIACOES.reduce((s, [de, para]) => s.replace(de, para), base)
    .replace(/\s+/g, " ")
    .trim();
}

/** Identidade do imóvel: endereço + cidade + unidade (ap/bloco). */
function chaveImovel(i: Pick<Imovel, "endereco" | "cidade" | "unidade" | "bloco">): string {
  return [
    chaveEndereco(i.endereco),
    chaveEndereco(i.cidade),
    chaveEndereco(i.unidade),
    chaveEndereco(i.bloco),
  ].join("|");
}

/**
 * Os imóveis já cadastrados que batem com `candidato`. Devolve lista (e não
 * um booleano) porque quem chama mostra QUAL imóvel é o repetido — avisar
 * "já existe" sem dizer qual não ajuda ninguém.
 *
 * `ignorarId` tira o próprio registro da comparação na edição; sem isso,
 * todo imóvel seria duplicata de si mesmo.
 */
export function imoveisDuplicados(
  candidato: Pick<Imovel, "endereco" | "cidade" | "unidade" | "bloco">,
  imoveis: Imovel[],
  ignorarId?: string | null,
): Imovel[] {
  const chave = chaveImovel(candidato);
  // Sem endereço não há identidade — não dá para afirmar duplicata.
  if (!chaveEndereco(candidato.endereco)) return [];
  return imoveis.filter((i) => i.id !== ignorarId && chaveImovel(i) === chave);
}

/** Texto do aviso, com o código/endereço do imóvel repetido. */
export function descreverDuplicados(duplicados: Imovel[]): string {
  if (!duplicados.length) return "";
  const [primeiro] = duplicados;
  const nome = primeiro.codigo?.trim() || primeiro.endereco;
  const status = primeiro.status ? ` — status "${primeiro.status}"` : "";
  const resto =
    duplicados.length > 1 ? ` (e mais ${duplicados.length - 1} com o mesmo endereço)` : "";
  return `Este endereço já está cadastrado em ${nome}${status}${resto}.`;
}
