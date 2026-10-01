/* ================================================================
   IA-M1c-E: SANEAMENTO DO QUE O PROVEDOR DEVOLVE

   Os dois valores que os fluxos fora do executor (embeddings e, depois,
   transcrição) leem da resposta do provedor para a linha de uso. O mesmo
   contrato do M1c-A: texto curto e, no request id, só o formato de um id.
   Fora disso, null. Nunca lança.
   ================================================================ */

const textoCurto = (valor: unknown, maximo: number, padrao?: RegExp): string | null =>
  typeof valor === "string" && valor.length > 0 && valor.length <= maximo && (!padrao || padrao.test(valor))
    ? valor
    : null;

/** O `model` que a resposta declara, até 120 caracteres. */
export function modeloServidoSaneado(valor: unknown): string | null {
  return textoCurto(valor, 120);
}

/** O request id do provedor, até 200 caracteres de `[\w.:-]`. */
export function requisicaoProvedorSaneada(valor: unknown): string | null {
  return textoCurto(valor, 200, /^[\w.:-]+$/);
}
