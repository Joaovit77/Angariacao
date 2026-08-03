/* ================================================================
   EMPACOTAMENTO DO .DOCX

   Um .docx é um zip de XMLs. Os XMLs são gerados em
   `calculo/solicitacaoAngariacao.ts` (puro, testável sem browser);
   aqui fica só o que toca o mundo — zipar e entregar o arquivo.

   A separação não é cerimônia: é o que permite testar o documento
   inteiro sem abrir o Word, e é o mesmo corte de `calculo/whatsapp.ts`
   (o texto) contra `envioWhatsapp.ts` (o envio).

   O JSZip entra por import dinâmico. Ele só é necessário no instante
   em que o corretor clica em "Baixar .docx" — algumas vezes por mês,
   quando um contrato fecha —, e carregá-lo no bundle do painel faria
   toda abertura do app pagar por isso.
   ================================================================ */

/** Monta o zip e devolve o Blob do .docx. */
export async function montarDocx(arquivos: Record<string, string>): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [caminho, conteudo] of Object.entries(arquivos)) zip.file(caminho, conteudo);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * Dispara o download de um Blob com o nome dado.
 *
 * O `revokeObjectURL` importa: sem ele cada documento gerado prende o arquivo
 * inteiro na memória da aba até o recarregamento, e o painel é feito para
 * ficar aberto o dia todo (é a mesma razão do cleanup do Chart.js e do
 * Leaflet). O `setTimeout` existe porque revogar no mesmo tick cancela o
 * download em alguns navegadores — a URL some antes de eles a lerem.
 */
export function baixarArquivo(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
