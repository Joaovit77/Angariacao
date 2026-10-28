/** Lê somente os literais JSON publicados por self.__next_f.push; nunca executa JavaScript. */
function partesFlight(script: string): string[] {
  const partes: string[] = [];
  let i = 0;
  while (i < script.length) {
    while (/[\s;]/.test(script[i] ?? "") && i < script.length) i++;
    if (i === script.length) break;
    const chamada = "self.__next_f.push(";
    if (!script.startsWith(chamada, i)) return [];
    i += chamada.length;
    while (/\s/.test(script[i] ?? "") && i < script.length) i++;
    if (script[i] !== "[") return [];
    const inicio = i;
    let nivel = 0, texto = false, escape = false;
    for (; i < script.length; i++) {
      const c = script[i];
      if (texto) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') texto = false;
      } else if (c === '"') texto = true;
      else if (c === "[") nivel++;
      else if (c === "]" && --nivel === 0) { i++; break; }
    }
    if (nivel !== 0 || texto) return [];
    let literal: unknown;
    try { literal = JSON.parse(script.slice(inicio, i)); } catch { return []; }
    while (/\s/.test(script[i] ?? "") && i < script.length) i++;
    if (script[i++] !== ")") return [];
    if (Array.isArray(literal) && literal.length === 2 && literal[0] === 1 && typeof literal[1] === "string") partes.push(literal[1]);
  }
  return partes;
}

/** Enquadramento Flight: texto/binário tem tamanho hexadecimal em bytes; não é um modelo JSON.
 * Respeitar esse tamanho impede ler trechos de descrição como se fossem novos registros. */
function modelosFlight(scripts: string[]): unknown[] {
  const bytes = Buffer.from(scripts.flatMap(partesFlight).join(""), "utf8");
  const modelos: unknown[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] === 10) { i++; continue; }
    const doisPontos = bytes.indexOf(58, i);
    // H é controle de recurso, publicado sem ID textual; não contém modelo de paginação.
    const controleHint = doisPontos === i && bytes[doisPontos + 1] === 72;
    if (doisPontos < 0 || (!/^[a-f0-9]+$/i.test(bytes.toString("utf8", i, doisPontos)) && !controleHint)) return [];
    i = doisPontos + 1;
    const tag = String.fromCharCode(bytes[i]);
    if ("TAOobUSsLlGgMmV".includes(tag)) {
      const virgula = bytes.indexOf(44, ++i);
      const tamanhoHex = bytes.toString("utf8", i, virgula);
      if (virgula < 0 || !/^[a-f0-9]+$/i.test(tamanhoHex)) return [];
      const tamanho = Number.parseInt(tamanhoHex, 16);
      i = virgula + 1 + tamanho;
      if (!Number.isSafeInteger(i) || i > bytes.length) return [];
      continue;
    }
    const tipado = /^[A-Z#rx]$/.test(tag);
    if (tipado) i++;
    const fim = bytes.indexOf(10, i);
    if (fim < 0) return [];
    if (!tipado) {
      try { modelos.push(JSON.parse(bytes.toString("utf8", i, fim))); } catch { return []; }
    }
    i = fim + 1;
  }
  return modelos;
}
function objeto(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }

/** Formato observado em P2: props.metadata.pagination + totalPages + links.nextPage.
 * A URL explícita deve pertencer à mesma rota; o ordinal sozinho nunca cria destino. */
export function continuacaoHidratacaoChavesRadar(scripts: string[], url: string, base: string, numero: number) {
  const destinos = new Set<string>();
  let conflito = false;
  const pendentes = modelosFlight(scripts);
  while (pendentes.length) {
    const valor = pendentes.pop();
    if (Array.isArray(valor)) {
      if (valor[0] === "$" && objeto(valor[3]) && objeto(valor[3].metadata)) {
        const m = valor[3].metadata;
        if (m.pagination === numero && objeto(m.links) && typeof m.links.nextPage === "string") {
          let destino: URL;
          try { destino = new URL(m.links.nextPage, url); } catch { conflito = true; continue; }
          const origem = new URL(base);
          let paginaCompativel = m.links.pageURL === undefined;
          if (typeof m.links.pageURL === "string") {
            try { paginaCompativel = new URL(m.links.pageURL, url).href === url; } catch { /* Sem vínculo com a aquisição. */ }
          }
          // Estado de outro recorte não é evidência da listagem adquirida.
          if (destino.origin === origem.origin && destino.pathname === origem.pathname && paginaCompativel) {
            const esperado = new URL(base); esperado.searchParams.set("pg", String(numero + 1));
            if (!Number.isSafeInteger(m.totalPages) || Number(m.totalPages) <= numero || destino.href !== esperado.href) conflito = true;
            else destinos.add(destino.href);
          }
        }
      }
      pendentes.push(...valor);
    } else if (objeto(valor)) pendentes.push(...Object.values(valor));
  }
  return { proxima: destinos.size === 1 ? [...destinos][0] : null, conflito: conflito || destinos.size > 1 };
}
