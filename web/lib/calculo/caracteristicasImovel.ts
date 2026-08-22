/* ================================================================
   CARACTERÍSTICAS DECLARADAS EM ANÚNCIOS

   Extrai somente medidas acompanhadas da unidade e quantidades ligadas
   ao respectivo rótulo. Números soltos podem ser preço ou endereço e
   nunca são tratados como característica do imóvel.
   ================================================================ */

export interface CaracteristicasImovelDeclaradas {
  tipo: string | null;
  areaM2: number | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
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
  return {
    tipo: tipoPreferido?.trim() || extrairTipoImovelDeclarado(valor),
    areaM2: extrairAreaM2Declarada(valor),
    quartos: extrairQuantidade(valor, "quartos?|dormit[oó]rios?"),
    banheiros: extrairQuantidade(valor, "banheiros?|su[ií]tes?"),
    vagas: /\bsem\s+(?:vaga|garagem)\b/i.test(valor)
      ? 0
      : extrairQuantidade(valor, "vagas?(?:\\s+de\\s+garagem)?|garagens?"),
  };
}
