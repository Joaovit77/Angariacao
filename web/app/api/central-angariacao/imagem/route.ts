const HOSTS_IMAGEM = [
  "img.olx.com.br",
  "images.olx.com.br",
  "resizedimgs.vivareal.com",
  "imgbr.imovelwebcdn.com",
  "www.chavesnamao.com.br",
] as const;

function origemPara(host: string): string {
  if (host.includes("vivareal")) return "https://www.vivareal.com.br/";
  if (host.includes("imovelwebcdn")) return "https://www.wimoveis.com.br/";
  if (host.includes("chavesnamao")) return "https://www.chavesnamao.com.br/";
  return "https://www.olx.com.br/";
}

export async function GET(request: Request) {
  const valor = new URL(request.url).searchParams.get("url");
  let url: URL;
  try {
    url = new URL(valor || "");
  } catch {
    return new Response("URL inválida", { status: 400 });
  }

  if (url.protocol !== "https:" || !HOSTS_IMAGEM.includes(url.hostname as (typeof HOSTS_IMAGEM)[number])) {
    return new Response("Origem não permitida", { status: 403 });
  }

  try {
    const resposta = await fetch(url, {
      headers: {
        Referer: origemPara(url.hostname),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
      cache: "force-cache",
    });
    const tipo = resposta.headers.get("content-type") || "";
    if (!resposta.ok || !tipo.startsWith("image/")) {
      return new Response("Imagem indisponível", { status: 502 });
    }
    const bytes = await resposta.arrayBuffer();
    if (bytes.byteLength > 8 * 1024 * 1024) return new Response("Imagem muito grande", { status: 413 });
    return new Response(bytes, {
      headers: {
        "Content-Type": tipo,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Imagem indisponível", { status: 502 });
  }
}
