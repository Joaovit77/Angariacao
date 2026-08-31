import { createClient } from "@supabase/supabase-js";
import {
  csvDoRelatorioCasaSoft,
  interpretarRelatorioCasaSoft,
} from "@/lib/calculo/importacaoPdf";
import { extrairTextosPosicionadosPdf } from "@/lib/servidor/importacaoPdf";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_REGISTROS = 1_000;

async function usuarioAutenticado(request: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !anonKey || !token) return false;

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  return !error && !!data.user;
}

function respostaErro(mensagem: string, status: number): Response {
  return Response.json({ ok: false, mensagem }, { status });
}

function mensagemConhecida(erro: unknown): string | null {
  if (!(erro instanceof Error)) return null;
  const permitidas = [
    "Este PDF não é",
    "Não foi possível confirmar",
    "O PDF informa",
    "O PDF precisa ter",
    "O PDF contém texto demais",
  ];
  return permitidas.some((inicio) => erro.message.startsWith(inicio)) ? erro.message : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!(await usuarioAutenticado(request))) {
    return respostaErro("Sessão inválida. Entre novamente e tente importar o PDF.", 401);
  }

  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("arquivo");
  if (!(arquivo instanceof File)) return respostaErro("Selecione um arquivo PDF.", 400);
  if (arquivo.size < 5 || arquivo.size > MAX_PDF_BYTES) {
    return respostaErro("O PDF precisa ter no máximo 5 MB.", 413);
  }

  const dados = new Uint8Array(await arquivo.arrayBuffer());
  const assinatura = new TextDecoder("ascii").decode(dados.subarray(0, 5));
  if (assinatura !== "%PDF-") return respostaErro("O arquivo selecionado não é um PDF válido.", 415);

  try {
    const textos = await extrairTextosPosicionadosPdf(dados);
    const relatorio = interpretarRelatorioCasaSoft(textos);
    if (relatorio.registros.length > MAX_REGISTROS) {
      return respostaErro(`O PDF excede o limite de ${MAX_REGISTROS} imóveis por importação.`, 413);
    }
    return Response.json({
      ok: true,
      textoCsv: csvDoRelatorioCasaSoft(relatorio.registros),
      registros: relatorio.registros.length,
      paginas: relatorio.paginas,
    });
  } catch (erro) {
    const conhecida = mensagemConhecida(erro);
    if (conhecida) return respostaErro(conhecida, 422);
    console.error("[importacao-pdf] não foi possível interpretar o arquivo", erro);
    return respostaErro(
      "Não foi possível ler este PDF. Gere novamente o relatório 'Imóveis Angariados' no CasaSoft.",
      422,
    );
  }
}
