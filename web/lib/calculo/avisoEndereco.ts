import { chaveNormalizada } from "../normalizacao";

/** Reconhece o aviso publicado pelo portal no lugar de um endereço. */
const AVISO_SEM_ENDERECO = /^endereco (?:nao informado|indisponivel)\b/;

export function ehAvisoEnderecoIndisponivel(texto: string | null | undefined): boolean {
  return AVISO_SEM_ENDERECO.test(chaveNormalizada(texto));
}
