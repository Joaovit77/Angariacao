export function urlPaginaChavesRadar(base: string, numero: number): string {
  const url = new URL(base);
  if (numero > 1) url.searchParams.set("pg", String(numero));
  return url.toString();
}
