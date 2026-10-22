import type { FiltrosCentralAngariacao } from "./centralAngariacao";
import { chaveNormalizada } from "../normalizacao";

/** Bairro pertence ao universo; hífen de slug, acento e caixa não criam outro contexto. */
export function chaveBairroRadar(valor: string | null | undefined): string | null {
  return chaveNormalizada(valor?.replace(/-/g, " ")) || null;
}

/** Rotas publicadas qualificadas por contexto, sem gerar slugs a partir de texto livre.
 * Evidência preparatória: página pública e navegação para ?pg=2, consultadas em 21/10/2026.
 * Isso habilita a tentativa; o HTML adquirido ainda precisa comprovar a rota e a cobertura.
 * Não é uma lista automática de bairros nem amplia a matriz geográfica do produto. */
const ROTAS_QUALIFICADAS = [{
  portal: "chaves-na-mao", cidade: "londrina", uf: "PR", finalidade: "locacao", tipo: "casa",
  bairro: "jardim tokio",
  url: "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/",
}] as const;

export function rotaBairroUniversoRadar(filtros: FiltrosCentralAngariacao): string | null {
  const bairro = chaveBairroRadar(filtros.bairro);
  return ROTAS_QUALIFICADAS.find((r) => r.portal === filtros.portal
    && r.cidade === chaveNormalizada(filtros.cidade) && r.uf === filtros.estado.toUpperCase()
    && r.finalidade === filtros.finalidade && r.tipo === filtros.tipoRecorte && r.bairro === bairro)?.url ?? null;
}
