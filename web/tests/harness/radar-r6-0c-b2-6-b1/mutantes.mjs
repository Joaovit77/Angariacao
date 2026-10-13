import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const web = resolve(import.meta.dirname, "../../..");
const parser = "lib/servidor/parserVendaRadar.ts", capacidade = "lib/calculo/aquisicaoRadar.ts";
const originais = new Map([parser, capacidade].map(p => [p, readFileSync(resolve(web, p), "utf8")]));
const restaurar = () => { for (const [p, s] of originais) writeFileSync(resolve(web, p), s); };
const mutantes = [
  ["Dispensa finalidade observada", capacidade, 'anuncio.finalidadeObservada === "venda"', "true"],
  ["Aceita RentAction como Venda", parser, 'acao["@type"] !== "BuyAction"', "false"],
  ["Ignora ID do Product", parser, 'String(produto["@id"]) !== identidade.id', "false"],
  ["Ignora preço principal divergente", parser, "precoPrincipal(precoTexto) !== preco", "false"],
  ["Aceita preço acessório", parser, 'acessorio.test([oferta.name, especificacao.name, especificacao.priceType, especificacao.unitText].map(texto).join(" "))', "false"],
  ["Habilita OLX sem contrato", capacidade, 'olx: { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "nao-suportado", apartamento: "nao-suportado" } }', 'olx: { locacao: { casa: "suportado", apartamento: "suportado" }, venda: { casa: "suportado", apartamento: "suportado" } }'],
  ["Mistura Venda e Locação", parser, 'finalidade: "venda", finalidadeObservada: "venda"', 'finalidade: "locacao", finalidadeObservada: "venda"'],
];
const executar = () => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/radar-venda-b1.test.ts", "--maxWorkers=1"], {
  cwd: web, encoding: "utf8", timeout: 60000, windowsHide: true, env: { ...process.env, OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "", ALLOW_REAL_OPENAI: "0" },
});
try {
  const controle = executar(); if (controle.status !== 0) throw Error(controle.stdout + controle.stderr);
  const resultados = [];
  for (const [nome, p, de, para] of mutantes) {
    restaurar(); const fonte = originais.get(p); if (!fonte.includes(de)) throw Error("Alvo ausente: " + nome);
    writeFileSync(resolve(web, p), fonte.replace(de, () => para));
    const r = executar(), morto = r.status === 1 && /AssertionError/.test(r.stdout + r.stderr);
    resultados.push({ nome, morto }); console.log(`${morto ? "MORTO" : "SOBREVIVEU"}: ${nome}`);
  }
  writeFileSync(resolve(web, "node_modules/.cache/b1/mutantes.json"), JSON.stringify(resultados, null, 2));
  if (resultados.some(r => !r.morto)) process.exitCode = 1;
} finally { restaurar(); }
