import "server-only";
import { load } from "cheerio";
import type { ObservacaoTotalRadar } from "../calculo/coberturaJanelaRadar";

const campos = new Set(["numberOfItems", "realResults", "totalListing", "totalPages", "maxPages", "pageBreak"]);
/** Projeção numérica sem poder de navegação, classificação ou certificação. Não executa scripts.
 * Flight registra literais publicados; sua semântica interna permanece não comprovada. */
export function telemetriaJanelaChavesRadar(html: string): ObservacaoTotalRadar[] {
  const $ = load(html), observacoes: ObservacaoTotalRadar[] = [];
  const numero = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 999999999;
  const registrar = (campo: string, valor: unknown, origem: ObservacaoTotalRadar["origem"]) => {
    if (!campos.has(campo) || observacoes.length >= 128) return;
    if (campo === "pageBreak" ? !Array.isArray(valor) || valor.length > 16 || !valor.every(numero) : !numero(valor)) return;
    observacoes.push({ campo: campo as ObservacaoTotalRadar["campo"], valor: valor as number | number[], origem });
  };
  let visitados = 0;
  const visitar = (v: unknown, origem: ObservacaoTotalRadar["origem"], nivel = 0) => {
    if (!v || typeof v !== "object" || nivel > 25 || ++visitados > 20000) return;
    for (const [campo, valor] of Object.entries(v)) {
      registrar(campo, valor, origem);
      if (valor && typeof valor === "object") visitar(valor, origem, nivel + 1);
    }
  };
  $("script:not([src])").each((_, el) => {
    const script = $(el).text();
    if ($(el).attr("type") === "application/ld+json" || $(el).attr("id") === "__NEXT_DATA__") {
      try { visitar(JSON.parse(script), $(el).attr("id") === "__NEXT_DATA__" ? "hidratacao_json" : "json_ld"); } catch { /* Telemetria ausente não inventa fatos. */ }
      return;
    }
    // Apenas a string literal da chamada publicada. O leitor de continuação continua intacto.
    for (const m of script.matchAll(/self\.__next_f\.push\(\s*\[1\s*,\s*("(?:\\.|[^"\\])*")\s*\]\s*\)/g)) {
      let texto: string;
      try { texto = JSON.parse(m[1]); } catch { continue; }
      for (const campo of texto.matchAll(/"(numberOfItems|realResults|totalListing|totalPages|maxPages|pageBreak)"\s*:\s*(\[[\d,\s]*\]|\d+)(?=\s*[,}\]])/g)) {
        try { registrar(campo[1], JSON.parse(campo[2]), "flight_literal"); } catch { /* Literal inválido não é observação. */ }
      }
    }
  });
  return observacoes;
}
