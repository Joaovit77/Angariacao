import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
if (process.env.B2_LOCAL_SMOKE !== "DESCARTAVEL" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:56421") throw Error("Transporte exige stack B2 local.");
const web = resolve(import.meta.dirname, "../../..");
const pasta = resolve(web, "tests/fixtures/radar-venda-b2");
const pastaB1 = resolve(web, "tests/fixtures/radar-venda-b1");
const manifestos = [pastaB1, pasta].flatMap(pasta => JSON.parse(readFileSync(resolve(pasta, "manifesto.json"), "utf8")).map(f => ({ ...f, pasta })));
const fetchLocal = global.fetch;
global.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return fetchLocal(input, init);
  if (url.hostname !== "api.firecrawl.dev" || url.pathname !== "/v2/scrape") throw Error("Transporte externo bloqueado no smoke B2.");
  const dados = init?.body ? JSON.parse(String(init.body)) : await input.clone().json();
  const fixture = manifestos.find(f => f.origem === dados.url);
  if (!fixture) throw Error("URL sem fixture aprovada: " + dados.url);
  appendFileSync(resolve(web, "node_modules/.cache/b2/transporte.jsonl"), JSON.stringify({ arquivo: fixture.arquivo }) + "\n");
  return Response.json({ success: true, data: { rawHtml: readFileSync(resolve(fixture.pasta, fixture.arquivo), "utf8"), metadata: { statusCode: 200 } } });
};
