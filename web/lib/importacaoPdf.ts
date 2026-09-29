import { fetchAutenticado } from "@/lib/auth/recuperacaoSessao";

interface RespostaImportacaoPdf {
  ok: boolean;
  mensagem?: string;
  textoCsv?: string;
  registros?: number;
  paginas?: number;
}

export interface PdfPreparadoParaImportacao {
  textoCsv: string;
  registros: number;
  paginas: number;
}

/** Envia o PDF apenas para leitura temporária no servidor autenticado. */
export async function prepararPdfParaImportacao(
  arquivo: File,
): Promise<PdfPreparadoParaImportacao> {
  const formulario = new FormData();
  formulario.append("arquivo", arquivo);
  const resposta = await fetchAutenticado("/api/importacao/pdf", {
    method: "POST",
    body: formulario,
  }, { repetivel: false });
  if (!resposta) throw new Error("Sessão expirada. Entre novamente e tente importar o PDF.");
  const dados = (await resposta.json().catch(() => null)) as RespostaImportacaoPdf | null;
  if (!resposta.ok || !dados?.ok || !dados.textoCsv) {
    throw new Error(dados?.mensagem || "Não foi possível preparar o PDF para importação.");
  }
  return {
    textoCsv: dados.textoCsv,
    registros: dados.registros || 0,
    paginas: dados.paginas || 0,
  };
}
