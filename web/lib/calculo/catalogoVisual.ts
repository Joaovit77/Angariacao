/* ================================================================
   CATÁLOGO VISUAL (C12) — núcleo puro

   O catálogo é uma CAMADA DE LEITURA do Garimpo em Campo: um card por
   imóvel identificado que tenha ao menos uma foto ativa em alguma
   passagem. Aqui mora só o que é regra de apresentação e não depende de
   React nem de Supabase: qual foto vira capa e como o texto digitado vira
   filtro. Nada aqui grava, move ou copia foto: a capa é uma ESCOLHA entre
   fotos que continuam pertencendo às suas passagens.
   ================================================================ */
import { chaveEndereco } from "./duplicidade";

/** O que a escolha da capa precisa saber de cada foto: a passagem a que
    ela pertence e quando essa passagem foi observada. */
export interface FotoParaCapa {
  id: string;
  avistamentoId: string;
  estado: string;
  caminho: string;
  caminhoMiniatura: string;
  /** `observado_em` da passagem dona da foto (a data do evento). */
  observadoEm: string | null;
  /** `created_at` da foto, só para desempate. */
  criadoEm: string;
}

export interface CapaCatalogo {
  fotoId: string;
  avistamentoId: string;
  caminho: string;
  caminhoMiniatura: string;
  observadoEm: string | null;
}

/** A capa é a foto ATIVA da passagem mais recente (maior `observado_em`,
    a data do evento, como a passagem corrente), com desempate por
    `created_at` e `id` para ser determinística. Sem foto ativa, sem capa
    — e sem capa o identificado não entra no catálogo. */
export function escolherCapaCatalogo(fotos: readonly FotoParaCapa[]): CapaCatalogo | null {
  const ativas = fotos.filter((foto) => foto.estado === "ativa");
  if (!ativas.length) return null;
  const [melhor] = [...ativas].sort((a, b) =>
    (b.observadoEm ?? "").localeCompare(a.observadoEm ?? "")
    || b.criadoEm.localeCompare(a.criadoEm)
    || b.id.localeCompare(a.id));
  return {
    fotoId: melhor.id,
    avistamentoId: melhor.avistamentoId,
    caminho: melhor.caminho,
    caminhoMiniatura: melhor.caminhoMiniatura,
    observadoEm: melhor.observadoEm,
  };
}

/** O texto digitado passa pela MESMA normalização das chaves persistidas
    (`endereco_chave`, `bairro_chave`, `cidade_chave`), então "R. Sergipe"
    encontra "Rua Sergipe" pelo mesmo motivo que a dedupe encontra. Vazio
    depois de normalizar é "sem filtro". */
export function termoBuscaCatalogo(texto: string | null | undefined): string {
  return chaveEndereco(texto);
}
