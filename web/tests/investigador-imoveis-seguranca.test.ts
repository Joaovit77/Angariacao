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
    expect(servidor).toContain("process.env.RAPIDAPI_KEY");
    expect(`${servidor}\n${cliente}\n${componente}`).not.toContain("NEXT_PUBLIC_RAPIDAPI_KEY");
    expect(cliente).not.toContain("RAPIDAPI_KEY");
    expect(componente).not.toContain("RAPIDAPI_KEY");
  });

  it("fixa o host externo no servidor e limita as pesquisas", () => {
    expect(servidor).toContain('const HOST_RAPIDAPI = "google-search-api7.p.rapidapi.com"');
    expect(cliente).not.toContain("rapidapi.com");
    expect(componente).not.toContain("rapidapi.com");
    expect(rota).toContain("investigacoesEmAndamento");
    expect(rota).toContain("status: 409");
  });
});
