/* ================================================================
   EXTRAÇÃO DE TEXTO POSICIONADO DO PDF — somente servidor

   O getTextContent do PDF.js junta células vizinhas quando o texto do
   endereço invade visualmente a coluna Bairro. O relatório real já mostrou
   os casos "AP 304CONJUNTO..." e "AP 203AURORA". O operator list preserva
   cada célula e sua coordenada original, então é ele que alimenta o parser
   puro de `calculo/importacaoPdf.ts`.
   ================================================================ */
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextoPdfPosicionado } from "@/lib/calculo/importacaoPdf";

const MAX_PAGINAS = 50;
const MAX_TEXTOS = 100_000;

interface GlifoPdf {
  unicode?: unknown;
}

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function textoDosGlifos(argumentos: unknown): string {
  if (!Array.isArray(argumentos) || !Array.isArray(argumentos[0])) return "";
  return argumentos[0]
    .map((glifo: unknown) => {
      if (!glifo || typeof glifo !== "object") return "";
      const unicode = (glifo as GlifoPdf).unicode;
      return typeof unicode === "string" ? unicode : "";
    })
    .join("");
}

/** Lê um PDF em memória sem persistir o arquivo enviado. */
export async function extrairTextosPosicionadosPdf(
  dados: Uint8Array,
): Promise<TextoPdfPosicionado[]> {
  const tarefa = getDocument({ data: dados });
  try {
    const documento = await tarefa.promise;
    if (documento.numPages < 1 || documento.numPages > MAX_PAGINAS) {
      throw new Error(`O PDF precisa ter entre 1 e ${MAX_PAGINAS} páginas.`);
    }

    const textos: TextoPdfPosicionado[] = [];
    for (let paginaNumero = 1; paginaNumero <= documento.numPages; paginaNumero += 1) {
      const pagina = await documento.getPage(paginaNumero);
      try {
        const operadores = await pagina.getOperatorList();
        let x = 0;
        let y = 0;

        for (let indice = 0; indice < operadores.fnArray.length; indice += 1) {
          const operacao = operadores.fnArray[indice];
          const argumentos = operadores.argsArray[indice] as unknown;

          if (operacao === OPS.beginText) {
            x = 0;
            y = 0;
          } else if (operacao === OPS.moveText || operacao === OPS.setLeadingMoveText) {
            const lista = Array.isArray(argumentos) ? argumentos : [];
            x += numero(lista[0]);
            y += numero(lista[1]);
          } else if (operacao === OPS.setTextMatrix) {
            const lista = Array.isArray(argumentos) ? argumentos : [];
            x = numero(lista[4]);
            y = numero(lista[5]);
          } else if (operacao === OPS.showText) {
            const texto = textoDosGlifos(argumentos).replace(/\s+/g, " ").trim();
            if (texto) textos.push({ pagina: paginaNumero, x, y, texto });
          }

          if (textos.length > MAX_TEXTOS) {
            throw new Error("O PDF contém texto demais para uma importação segura.");
          }
        }
      } finally {
        pagina.cleanup();
      }
    }
    return textos;
  } finally {
    await tarefa.destroy();
  }
}
