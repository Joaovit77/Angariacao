import type { ItemHistoricoAssistente } from "./tipos";

export type ReferenciaImovelResolvida =
  | { estado: "resolvida"; id?: string; codigo: string; origem: "explicita" | "ordinal" | "conversa" }
  | { estado: "ambigua"; candidatos: Array<{ id: string; codigo: string }> }
  | { estado: "ausente"; candidatos: [] };

const CODIGO_NO_TEXTO = /\b[A-Z]{1,12}[-/][A-Z0-9][A-Z0-9._/-]{0,38}\b/gi;

function normalizarCodigo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const codigo = valor.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(codigo) ? codigo : null;
}

function codigosNoTexto(texto: string): string[] {
  return [...new Set((texto.match(CODIGO_NO_TEXTO) || []).map(normalizarCodigo).filter((codigo): codigo is string => !!codigo && /\d/.test(codigo)))];
}

function referenciasEstruturadas(historico: ItemHistoricoAssistente[]) {
  const referencias = new Map<string, { id: string; codigo: string }>();
  for (const mensagem of historico) {
    if (mensagem.papel !== "assistente") continue;
    for (const bloco of mensagem.resultados || []) {
      if (bloco.tipo !== "imoveis" && bloco.tipo !== "conversas_respondidas") continue;
      for (const item of bloco.itens) {
        const codigo = normalizarCodigo(item.codigo);
        const id = "id" in item ? item.id : item.imovelId;
        if (codigo && id) referencias.set(codigo, { id, codigo });
      }
    }
  }
  return referencias;
}

function ultimaListaEstruturada(historico: ItemHistoricoAssistente[]) {
  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    const mensagem = historico[indice];
    if (mensagem.papel !== "assistente") continue;
    const bloco = [...(mensagem.resultados || [])].reverse().find((resultado) =>
      resultado.tipo === "imoveis" || resultado.tipo === "conversas_respondidas",
    );
    if (bloco?.tipo === "imoveis" || bloco?.tipo === "conversas_respondidas") {
      return bloco.itens.flatMap((item) => {
        const codigo = normalizarCodigo(item.codigo);
        const id = "id" in item ? item.id : item.imovelId;
        return codigo && id ? [{ id, codigo }] : [];
      });
    }
  }
  return [];
}

function indiceOrdinal(pergunta: string): number | null {
  const texto = pergunta.toLocaleLowerCase("pt-BR");
  const ordinais = [
    /\b(?:o |a )?(?:primeir[oa]|1[ºª]?)\b/,
    /\b(?:o |a )?(?:segund[oa]|2[ºª]?)\b/,
    /\b(?:o |a )?(?:terceir[oa]|3[ºª]?)\b/,
    /\b(?:o |a )?(?:quart[oa]|4[ºª]?)\b/,
    /\b(?:o |a )?(?:quint[oa]|5[ºª]?)\b/,
  ];
  const indice = ordinais.findIndex((padrao) => padrao.test(texto));
  return indice >= 0 ? indice : null;
}

/**
 * Resolve somente referencias que possam ser conferidas contra resultados
 * estruturados anteriores. O retorno nunca e usado como dado confiavel: ele
 * apenas escolhe qual registro sera reconsultado no backend sob RLS.
 */
export function resolverReferenciaImovelHistorico(
  pergunta: string,
  historico: ItemHistoricoAssistente[],
): ReferenciaImovelResolvida {
  const codigoExplicito = codigosNoTexto(pergunta)[0];
  if (codigoExplicito) return { estado: "resolvida", codigo: codigoExplicito, origem: "explicita" };

  const ultimaLista = ultimaListaEstruturada(historico);
  const ordinal = indiceOrdinal(pergunta);
  if (ordinal != null) {
    const item = ultimaLista[ordinal];
    return item
      ? { estado: "resolvida", ...item, origem: "ordinal" }
      : { estado: "ambigua", candidatos: ultimaLista.slice(0, 5) };
  }

  const permitidas = referenciasEstruturadas(historico);
  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    const mensagem = historico[indice];
    if (mensagem.papel !== "assistente") continue;
    if (/amb[ií]gu|qual im[oó]vel|informe|me diga.*c[oó]digo/i.test(mensagem.texto)) {
      return { estado: "ambigua", candidatos: ultimaLista.slice(0, 5) };
    }
    const mencionadas = codigosNoTexto(mensagem.texto)
      .map((codigo) => permitidas.get(codigo))
      .filter((item): item is { id: string; codigo: string } => !!item);
    const unicas = [...new Map(mencionadas.map((item) => [item.id, item])).values()];
    if (unicas.length === 1) return { estado: "resolvida", ...unicas[0], origem: "conversa" };
    if (unicas.length > 1) return { estado: "ambigua", candidatos: unicas.slice(0, 5) };
  }

  const todas = [...permitidas.values()];
  if (todas.length === 1) return { estado: "resolvida", ...todas[0], origem: "conversa" };
  if (todas.length > 1) return { estado: "ambigua", candidatos: ultimaLista.length ? ultimaLista.slice(0, 5) : todas.slice(0, 5) };
  return { estado: "ausente", candidatos: [] };
}
