import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const web = resolve(import.meta.dirname, "../../..");
const parser = "lib/servidor/parserVendaOlxWimoveis.ts";
const original = readFileSync(resolve(web, parser), "utf8");
const finalidadeOlx = 'if (!tipo || contrato !== (tipo === "Casa" ? "Venda - casa em rua pública" : "Venda - apartamento padrão")) return;';
const finalidadeWim = 'if (acao["@type"] !== "SellAction" || publicado.type !== "SellAction") return;';
const operacaoWim = 'if (operacoes.length !== 1 || objeto(operacoes[0].operationType).name !== "Venda" || objeto(operacoes[0].operationType).operationTypeId !== "1") return;';
const mutantes = [
  ["OLX 1 — Venda somente pelo filtro", [[finalidadeOlx, "if (!tipo) return;"]]],
  ["OLX 2 — identidade posicional", [['const identidade = identidadeVendaRadar("olx", links.attr("href"));', 'const identidade = identidadeVendaRadar("olx", links.attr("href")) ?? (() => { const a = [...estado.values()][_]; return a ? identidadeVendaRadar("olx", a.url) : null; })();']]],
  ["OLX 3 — direitos como preço integral", [["direitos?|entrada", "entrada"]]],
  ["OLX 4 — entrada/repasse/parcela como preço integral", [["direitos?|entrada|repasse|parcelas?|sinal|financiamento|financiad[oa]", "direitos?"]]],
  ["OLX 5 — grouped com identidade individual não comprovada", [['if (agrupado.test(semantica) || a.grouped === true || a.isGrouped === true || lista(a.matchingAds).length > 0 || lista(a.units).length > 0) return;', ""]]],
  ["OLX 6 — preço antigo/promocional", [['if (a.oldPrice || a.priceReductionBadge === true || a.installments || promocional.test(semantica)\n      || card.find("del, s, .olx-adcard__old-price").length) return;', ""]]],
  ["Wimoveis 7 — Venda somente pelo filtro", [[finalidadeWim, ""], [operacaoWim, ""]]],
  ["Wimoveis 8 — DEVELOPMENT como PROPERTY", [['if (p.postingType !== "PROPERTY" || card.attr("data-posting-type") !== "PROPERTY" || !Array.isArray(p.units) || p.units.length !== 0) return;', ""]]],
  ["Wimoveis 9 — a partir de como preço individual", [['if (agrupado.test(semantica)) return;', ""]]],
  ["Wimoveis 10 — posting sem identidade coerente", [['if (!p || !acao || texto(p.postingId) !== identidade.id || identidadeVendaRadar("wimoveis", p.url)?.url !== identidade.url) return;', 'if (!p || !acao) return;']]],
  ["Wimoveis 11 — operação diferente de Venda", [[operacaoWim, ""]]],
  ["Wimoveis 12 — condomínio/IPTU misturado ao preço", [['const precos = lista(operacoes[0].prices).map(objeto), bloco = card.find(\'[data-qa="POSTING_CARD_PRICE"]\');', 'const precos = lista(operacoes[0].prices).length ? lista(operacoes[0].prices).map(objeto) : [{ ...objeto(p.expenses ?? p.iptu), currencyId: "3", formattedAmount: String(objeto(p.expenses ?? p.iptu).amount) }], bloco = card.find(\'[data-qa="POSTING_CARD_PRICE"]\');']]],
];
const executar = arquivo => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/radar-venda-b2.test.ts", "--maxWorkers=1", "--reporter=json", `--outputFile=node_modules/.cache/b2/${arquivo}.json`], {
  cwd: web, encoding: "utf8", timeout: 60000, windowsHide: true,
  env: { ...process.env, OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "", RAPIDAPI_KEY: "", ALLOW_REAL_OPENAI: "0" },
});
try {
  const controle = executar("mutantes-controle");
  if (controle.status !== 0) throw Error("Controle falhou: " + controle.stdout + controle.stderr);
  const resultados = [];
  for (const [indice, [nome, trocas]] of mutantes.entries()) {
    let fonte = original.replace(/\r\n/g, "\n");
    for (const [de, para] of trocas) { if (!fonte.includes(de)) throw Error("Alvo ausente: " + nome); fonte = fonte.replace(de, () => para); }
    writeFileSync(resolve(web, parser), fonte);
    const arquivo = `mutante-${indice + 1}`, r = executar(arquivo);
    const resultado = JSON.parse(readFileSync(resolve(web, `node_modules/.cache/b2/${arquivo}.json`), "utf8"));
    const assercoes = resultado.testResults.flatMap(r => r.assertionResults.filter(a => a.status === "failed" && a.failureMessages.some(m => m.includes("AssertionError"))).map(a => a.fullName));
    const morto = r.status === 1 && assercoes.length > 0;
    resultados.push({ nome, morto, assercoes }); console.log(`${morto ? "MORTO" : "SOBREVIVEU"}: ${nome}`);
    writeFileSync(resolve(web, parser), original);
  }
  writeFileSync(resolve(web, "node_modules/.cache/b2/mutantes.json"), JSON.stringify(resultados, null, 2));
  if (resultados.some(r => !r.morto)) process.exitCode = 1;
} finally { writeFileSync(resolve(web, parser), original); }
