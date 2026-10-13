import type { PortalAngariacao } from "./centralAngariacao";

/** URL individual estrita; nenhuma identidade nasce da posição ou do filtro. */
export function identidadeVendaRadar(portal: PortalAngariacao, valor: unknown): { id: string; url: string } | null {
  const hosts: Partial<Record<PortalAngariacao, string>> = {
    zap: "www.zapimoveis.com.br", "viva-real": "www.vivareal.com.br", "chaves-na-mao": "www.chavesnamao.com.br",
  };
  const host = hosts[portal];
  if (!host || typeof valor !== "string") return null;
  try {
    const u = new URL(valor, `https://${host}`);
    const id = u.pathname.match(portal === "chaves-na-mao" ? /^\/imovel\/[^/]+\/id-(\d+)\/?$/ : /^\/imovel\/[^/]+-id-(\d+)\/?$/)?.[1];
    if (!id || u.protocol !== "https:" || u.hostname !== host || u.port || u.username || u.password) return null;
    return { id, url: `${u.origin}${u.pathname.replace(/\/?$/, "/")}` };
  } catch { return null; }
}
