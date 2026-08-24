/* ================================================================
   CARACTERÍSTICAS DECLARADAS EM ANÚNCIOS

   Extrai somente medidas acompanhadas da unidade e quantidades ligadas
   ao respectivo rótulo. Números soltos podem ser preço ou endereço e
   nunca são tratados como característica do imóvel.
   ================================================================ */

export interface CaracteristicasImovelDeclaradas {
  tipo: string | null;
  areaM2: number | null;
  areaTotalM2: number | null;
  areaTerrenoM2: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  andar: number | null;
  pavimentos: number | null;
  mobiliado: boolean | null;
  valorCondominio: number | null;
  valorIptu: number | null;
}

export function extrairAreaM2Declarada(texto: string | null | undefined): number | null {
  const correspondencias = [...(texto || "").matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2|\^2)(?=\s|[.,;:|·-]|$)/gi)];
  for (const correspondencia of correspondencias) {
    const area = Number(correspondencia[1].replace(",", "."));
    if (area >= 10 && area <= 10000) return area;
  }
  return null;
}

function extrairQuantidade(texto: string, rotulos: string): number | null {
  const depois = texto.match(new RegExp(`(\\d{1,2})\\s*(?:${rotulos})\\b`, "i"));
  const antes = texto.match(new RegExp(`(?:${rotulos})\\s*[:=-]?\\s*(\\d{1,2})\\b`, "i"));
  const numero = Number(depois?.[1] || antes?.[1]);
  return Number.isInteger(numero) && numero >= 0 && numero <= 30 ? numero : null;
}

function extrairAreaRotulada(texto: string, rotulos: string): number | null {
  const correspondencia = texto.match(new RegExp(
    `(?:${rotulos})\\s*[:=-]?\\s*(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*m(?:²|2|\\^2)`,
    "i",
  ));
  const valor = Number((correspondencia?.[1] || "").replace(",", "."));
  return valor >= 10 && valor <= 1_000_000 ? valor : null;
}

function extrairValorMonetario(texto: string, rotulo: string): number | null {
  const correspondencia = texto.match(new RegExp(
    `(?:${rotulo})\\s*[:=-]?\\s*(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)`,
    "i",
  ));
  const valor = Number((correspondencia?.[1] || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) && valor >= 0 ? valor : null;
}

function extrairMobiliado(texto: string): boolean | null {
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:nao\s+mobiliad[oa]|sem\s+mobilia)\b/.test(normalizado)) return false;
  if (/\b(?:mobiliad[oa]|porteira\s+fechada)\b/.test(normalizado)) return true;
  return null;
}

function extrairAndar(texto: string): number | null {
  const depois = texto.match(/(\d{1,3})\s*(?:º|°|o)?\s*andar\b/i);
  const antes = texto.match(/\bandar\s*[:=-]?\s*(\d{1,3})\b/i);
  const valor = Number(depois?.[1] || antes?.[1]);
  return Number.isInteger(valor) && valor >= 0 && valor <= 300 ? valor : null;
}

export function extrairTipoImovelDeclarado(texto: string | null | undefined): string | null {
  const valor = (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:kitnet|studio)\b/.test(valor)) return "Kitnet/Studio";
  if (/\bapartamento\b/.test(valor)) return "Apartamento";
  if (/\bcasa\s+(?:em|de)\s+condominio\b/.test(valor)) return "Casa de Condomínio";
  if (/\bsobrado\b/.test(valor)) return "Sobrado";
  if (/\bcasa\b/.test(valor)) return "Casa";
  if (/\bsala\s+comercial\b/.test(valor)) return "Sala Comercial";
  if (/\bgalpao\b/.test(valor)) return "Galpão";
  return null;
}

export function extrairCaracteristicasImovel(
  texto: string | null | undefined,
  tipoPreferido?: string | null,
): CaracteristicasImovelDeclaradas {
  const valor = texto || "";
  const areaPrivativa = extrairAreaRotulada(valor, "área\\s+privativa|area\\s+privativa|útil|util");
  return {
    tipo: tipoPreferido?.trim() || extrairTipoImovelDeclarado(valor),
    areaM2: areaPrivativa ?? extrairAreaM2Declarada(valor),
    areaTotalM2: extrairAreaRotulada(valor, "área\\s+total|area\\s+total"),
    areaTerrenoM2: extrairAreaRotulada(valor, "terreno|área\\s+do\\s+terreno|area\\s+do\\s+terreno"),
    quartos: extrairQuantidade(valor, "quartos?|dormit[oó]rios?"),
    suites: extrairQuantidade(valor, "su[ií]tes?"),
    banheiros: extrairQuantidade(valor, "banheiros?|lavabos?"),
    vagas: /\bsem\s+(?:vaga|garagem)\b/i.test(valor)
      ? 0
      : extrairQuantidade(valor, "vagas?(?:\\s+de\\s+garagem)?|garagens?"),
    andar: extrairAndar(valor),
    pavimentos: extrairQuantidade(valor, "pavimentos?"),
    mobiliado: extrairMobiliado(valor),
    valorCondominio: extrairValorMonetario(valor, "condom[ií]nio"),
    valorIptu: extrairValorMonetario(valor, "IPTU"),
  };
}
