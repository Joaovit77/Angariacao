/* ================================================================
   GERAÇÃO DE CSV — parte pura (sem DOM, testável)
   Feature nova da pós-migração. Monta o texto de um CSV a partir de
   um cabeçalho e linhas de valores.

   Decisões para abrir direto no Excel em pt-BR:
   - delimitador ';' (a vírgula é separador decimal no pt-BR, então
     ',' quebraria as colunas de dinheiro);
   - BOM UTF-8 no início (senão o Excel corrompe acentos);
   - quebras de linha CRLF (padrão do formato / do Excel no Windows).
   O disparo do download (Blob) é feito na camada de UI — aqui só
   produzimos a string.
   ================================================================ */

export const CSV_DELIMITADOR = ";";
const BOM = "﻿";

/** Valor aceito numa célula: vira "" quando null/undefined. */
export type CampoCsv = string | number | null | undefined;

// Escapa uma célula: envolve em aspas quando contém o delimitador, aspas ou
// quebra de linha, dobrando as aspas internas (regra do RFC 4180).
export function escaparCampoCsv(valor: CampoCsv, delim: string = CSV_DELIMITADOR): string {
  const s = valor == null ? "" : String(valor);
  if (s.includes(delim) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Monta o CSV completo (com BOM) a partir do cabeçalho e das linhas.
export function gerarCsv(
  cabecalho: string[],
  linhas: CampoCsv[][],
  delim: string = CSV_DELIMITADOR,
): string {
  const todas = [cabecalho, ...linhas].map((linha) =>
    linha.map((c) => escaparCampoCsv(c, delim)).join(delim),
  );
  return BOM + todas.join("\r\n");
}
