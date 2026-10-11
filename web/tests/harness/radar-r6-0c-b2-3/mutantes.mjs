import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const capacidade = "lib/calculo/aquisicaoRadar.ts";
const tipos = "lib/calculo/centralAngariacao.ts";
const parser = "lib/servidor/firecrawlCentralAngariacao.ts";
const originais = new Map([capacidade, tipos, parser].map(a => [a, readFileSync(resolve(raiz, a))]));
const restaurar = () => { for (const [a, b] of originais) writeFileSync(resolve(raiz, a), b); };
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => { restaurar(); process.exit(130); });
const mutantes = [
  ["Chaves usa tipo solicitado como observado", tipos, "(anuncio.tipo?.trim() || extrairTipoImovelDeclarado(texto))", "(tipoPreferido || anuncio.tipo?.trim() || extrairTipoImovelDeclarado(texto))"],
  ["Casa aceita Apartamento declarado", capacidade, "tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte", "true"],
  ["Fallback posicional vira identidade", capacidade, "!idExternoEhFallback(anuncio.portal, anuncio.idExterno)", "true"],
  ["Venda usa suporte de Locação", capacidade, "MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.[recorte.finalidade]?.[recorte.tipoRecorte]", 'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.["locacao"]?.[recorte.tipoRecorte]'],
  ["Recorte parcial executa", capacidade, 'suportado: status === "suportado"', 'suportado: status !== "nao-suportado"'],
  ["Wimoveis dispensa prova RentAction", parser, '!idsLocacao.has(idNativo)', 'false'],
  ["Condomínio vira aluguel no Chaves", parser, "dinheiro(texto(link.find('p[aria-label=\"Preço\"] b').first()))", "dinheiro(precoTexto)"],
];
const executar = () => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/locacao-chaves-wimoveis.test.ts", "tests/aquisicao-radar-capacidade.test.ts", "tests/aquisicao-radar-transporte.test.ts", "--maxWorkers=2"], {
  cwd: raiz, encoding: "utf8", timeout: 60000, windowsHide: true,
  env: { ...process.env, ALLOW_REAL_OPENAI: "0", OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "" },
});
const resultados = [];
try {
  const controle = executar();
  if (controle.status !== 0) throw Error(`Controle falhou: ${controle.stdout}\n${controle.stderr}`);
  for (const [nome, arquivo, de, para] of mutantes) {
    restaurar(); const original = originais.get(arquivo).toString("utf8");
    if (!original.includes(de)) throw Error(`Alvo ausente: ${nome}`);
    writeFileSync(resolve(raiz, arquivo), original.replace(de, para));
    const r = executar();
    const morto = r.status === 1 && /AssertionError/.test(r.stdout + r.stderr);
    resultados.push({ nome, morto }); console.log(`${morto ? "MORTO" : "SOBREVIVEU"}: ${nome}`);
    if (!morto) console.log(r.stdout, r.stderr);
  }
  const pasta = resolve(raiz, "node_modules/.cache/radar-r6-0c-b2-3"); mkdirSync(pasta, { recursive: true });
  writeFileSync(resolve(pasta, "mutantes.json"), JSON.stringify(resultados, null, 2));
  console.log(`${resultados.filter(r => r.morto).length}/${mutantes.length} mutantes mortos`);
  if (resultados.some(r => !r.morto)) process.exitCode = 1;
} finally { restaurar(); }
