import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(import.meta.dirname, "..");
const servidor = readFileSync(join(raiz, "lib/servidor/investigadorImoveis.ts"), "utf8");
const cliente = readFileSync(join(raiz, "lib/investigadorImoveis.ts"), "utf8");
const componente = readFileSync(join(raiz, "components/investigador/InvestigadorImoveisView.tsx"), "utf8");
const rota = readFileSync(join(raiz, "app/api/investigador-imoveis/route.ts"), "utf8");

describe("segurança estrutural do Investigador", () => {
  it("mantém a chave exclusivamente na fronteira de servidor", () => {
    expect(servidor).toContain("process.env.FIRECRAWL_API_KEY");
    expect(`${servidor}\n${cliente}\n${componente}`).not.toContain("NEXT_PUBLIC_FIRECRAWL_API_KEY");
    expect(`${servidor}\n${cliente}\n${componente}`).not.toContain("NEXT_PUBLIC_RAPIDAPI_KEY");
    expect(cliente).not.toContain("FIRECRAWL_API_KEY");
    expect(componente).not.toContain("FIRECRAWL_API_KEY");
  });

  it("fixa o host externo no servidor e limita as pesquisas", () => {
    expect(servidor).toContain('const HOST_FIRECRAWL = "api.firecrawl.dev"');
    expect(cliente).not.toContain("firecrawl.dev");
    expect(componente).not.toContain("firecrawl.dev");
    expect(rota).toContain("investigacoesEmAndamento");
    expect(rota).toContain("status: 409");
  });
});
