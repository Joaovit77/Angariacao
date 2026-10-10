import { readFileSync } from "node:fs";
import { load } from "cheerio";

/** Recortes reais minimizados. As variações de falha abaixo são sintéticas,
 * derivadas desses recortes; não representam novas capturas do portal. */
export const casaReal = readFileSync(new URL("./zap-r6-casa/casa.html", import.meta.url), "utf8");
export const sobradoReal = readFileSync(new URL("./zap-r6-casa/sobrado.html", import.meta.url), "utf8");
export const apartamentoReal = readFileSync(new URL("./zap-r6-casa/apartamento.html", import.meta.url), "utf8");

export function variarJsonLd(html: string, alterar: (objeto: Record<string, any>) => void): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const $ = load(html);
  $('script[type="application/ld+json"]').each((_, el) => {
    const obj = JSON.parse($(el).text());
    alterar(obj);
    $(el).text(JSON.stringify(obj));
  });
  return $.html();
}

export const idIncompativel = variarJsonLd(casaReal, (obj) => {
  if (obj["@type"] === "House") obj["@id"] = "9999999999";
});
export const precoAusente = variarJsonLd(casaReal, (obj) => { if (obj.offers) delete obj.offers.potentialAction; });
export const precoDivergente = variarJsonLd(casaReal, (obj) => { if (obj.offers) obj.offers.price = 999; });
export const tipoAusente = variarJsonLd(casaReal, (obj) => { obj.name = "Imóvel para alugar"; delete obj.additionalType; });
export const agrupadoSemLink = casaReal.replace(/<a href="[^"]+">/, '<button data-testid="listing-card-deduplicated-button">').replace("</a>", "</button>");
