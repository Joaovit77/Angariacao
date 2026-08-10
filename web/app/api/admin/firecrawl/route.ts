import { exigirAdmin } from "../_comum";
import { consultarUsoFirecrawl } from "@/lib/servidor/usoFirecrawl";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        configurado: false,
        mensagem: "O Firecrawl não está configurado neste ambiente.",
      },
      { status: 503 },
    );
  }

  try {
    const uso = await consultarUsoFirecrawl(apiKey);
    return Response.json({
      ok: true,
      configurado: true,
      uso,
    });
  } catch (erro) {
    console.error(
      "Admin: falha ao consultar o consumo do Firecrawl:",
      erro instanceof Error ? erro.message : erro,
    );
    return Response.json(
      {
        ok: false,
        configurado: true,
        mensagem: "Não foi possível consultar o consumo do Firecrawl agora.",
      },
      { status: 502 },
    );
  }
}
