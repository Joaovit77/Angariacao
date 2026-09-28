/* R4.2f — rota TEMPORÁRIA do discovery do ZAP. Só Preview, só admin, só POST
   vazio. A URL é fixa no servidor e cada POST faz no máximo uma chamada ao
   Firecrawl. Nada é gravado; a resposta tem somente agregados estruturais. */
import { exigirAdmin } from "../_comum";
import {
  adquirirHtmlZapUmaVez,
  diagnosticarHtmlZap,
  URL_DIAGNOSTICO_ZAP,
} from "@/lib/servidor/diagnosticoTemporarioZap";
import { analisarJsonLdZap } from "@/lib/servidor/diagnosticoTemporarioZapJsonLd";
import { agoraISOString } from "@/lib/datas";

export const runtime = "nodejs";
export const maxDuration = 120;

const SEM_CACHE = { "Cache-Control": "no-store" };

// Impede dois POSTs simultâneos na mesma instância (duplo clique, aba repetida).
let emAndamento = false;

function falha(falha: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ ok: false, falha, ...extra }, { status, headers: SEM_CACHE });
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") return falha("ambiente_bloqueado", 403);

  // O runtime pode entregar um stream de body mesmo num POST de zero bytes:
  // o que conta é haver conteúdo, não existir `request.body`.
  let corpo: string;
  try {
    corpo = await request.text();
  } catch {
    return falha("pedido_invalido", 400);
  }
  if (new URL(request.url).search || corpo.length > 0) return falha("pedido_invalido", 400);

  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) return falha("firecrawl_nao_configurado", 503);
  if (emAndamento) return falha("diagnostico_em_andamento", 409);

  emAndamento = true;
  const inicio = performance.now();
  try {
    const { aquisicao, html } = await adquirirHtmlZapUmaVez(apiKey);
    const duracaoMs = () => Math.round(performance.now() - inicio);
    if (html == null) {
      return falha(aquisicao.falha ?? "firecrawl_indisponivel", 502, {
        horario: agoraISOString(), url: URL_DIAGNOSTICO_ZAP, duracaoMs: duracaoMs(), aquisicao,
      });
    }
    let diagnostico: ReturnType<typeof diagnosticarHtmlZap>;
    try {
      diagnostico = diagnosticarHtmlZap(html);
    } catch {
      return falha("diagnostico_falhou", 500, {
        horario: agoraISOString(), url: URL_DIAGNOSTICO_ZAP, duracaoMs: duracaoMs(), aquisicao,
      });
    }
    // Segunda prova: campos do JSON-LD. Uma falha aqui não derruba o restante do diagnóstico.
    let jsonLd: ReturnType<typeof analisarJsonLdZap> | { falha: "analise_jsonld_falhou" };
    try {
      jsonLd = analisarJsonLdZap(html);
    } catch {
      jsonLd = { falha: "analise_jsonld_falhou" };
    }
    return Response.json({
      ok: true,
      horario: agoraISOString(),
      url: URL_DIAGNOSTICO_ZAP,
      duracaoMs: duracaoMs(),
      aquisicao,
      ...diagnostico,
      jsonLd,
    }, { headers: SEM_CACHE });
  } finally {
    emAndamento = false;
  }
}
