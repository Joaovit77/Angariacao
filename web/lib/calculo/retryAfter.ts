/** `Retry-After` em segundos inteiros (delta-seconds). Data HTTP, texto,
    fração ou negativo não são interpretados: devolvem `undefined`. */
export function segundosRetryAfter(valor: string | null | undefined): number | undefined {
  const bruto = valor?.trim();
  if (!bruto || !/^\d+$/.test(bruto)) return undefined;
  const segundos = Number(bruto);
  return Number.isSafeInteger(segundos) && segundos >= 0 ? segundos : undefined;
}
