/** Estado antigo simulado para exercitar regressão pela fronteira autenticada.
 * Não concede a exceção pelo payload: a rota precisa ler a linha do banco falso. */
const buscas = new Map<string, Record<string, unknown>>();

export function corpoBuscaLegada(filtros: Record<string, unknown>): string {
  const id = `fixture-legada-${filtros.portal}`;
  buscas.set(id, filtros);
  return JSON.stringify({ ...filtros, buscaLegadaId: id });
}

export function lerBuscaLegada(tabela: string, dono = "usuario-central") {
  if (tabela !== "radar_buscas") throw new Error(`Tabela inesperada: ${tabela}`);
  return { select: () => ({ eq: (_coluna: string, id: string) => ({
    eq: (_dono: string, userId: string) => ({ maybeSingle: async () => ({
      data: userId === dono && buscas.has(id) ? { filtros: buscas.get(id) } : null,
      error: null,
    }) }),
  }) }) };
}
