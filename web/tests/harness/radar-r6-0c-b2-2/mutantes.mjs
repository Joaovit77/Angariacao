import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const capacidade = "lib/calculo/aquisicaoRadar.ts";
const parser = "lib/servidor/parserZap.ts";
const originais = new Map([capacidade, parser].map(arquivo => [arquivo, readFileSync(resolve(raiz, arquivo))]));
const restaurar = () => { for (const [arquivo, bytes] of originais) writeFileSync(resolve(raiz, arquivo), bytes); };
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => { restaurar(); process.exit(130); });
const mutantes = [
  ["Casa continua bloqueada", capacidade, 'zap: { locacao: { casa: "suportado"', 'zap: { locacao: { casa: "nao-suportado"'],
  ["Venda usa capacidade de Locação", capacidade, 'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.[recorte.finalidade]?.[recorte.tipoRecorte]', 'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.["locacao"]?.[recorte.tipoRecorte]'],
  ["House associado pela posição", parser, 'casa: c.length === 1 ? c[0] : null', 'casa: [...casas.values()][0]?.[0] ?? null'],
  ["Sobrado vira Casa", parser, '      tipoDeclarado,', '      tipoDeclarado: tipoDeclarado === "Sobrado" ? "Casa" : tipoDeclarado,'],
  ["Tipo solicitado vira observado", parser, '      tipoDeclarado,', '      tipoDeclarado: filtros.tipo || filtros.tipoRecorte || tipoDeclarado,'],
  ["Apartment deixa de ser indexado", parser, 'if (id && temTipo(obj, "Apartment")) apartamentos.set', 'if (false && id && temTipo(obj, "Apartment")) apartamentos.set'],
];
const testes = ["tests/zap-casa-radar.test.ts", "tests/zap-radar.test.ts", "tests/aquisicao-radar-capacidade.test.ts"];
const executar = () => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...testes, "--maxWorkers=2"], {
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
    const resultado = executar();
    const morto = resultado.status === 1 && /AssertionError/.test(resultado.stdout + resultado.stderr);
    resultados.push({ nome, morto });
    console.log(`${morto ? "MORTO" : "SOBREVIVEU"}: ${nome}`);
    if (!morto) console.log(resultado.stdout, resultado.stderr);
  }
  const pasta = resolve(raiz, "node_modules/.cache/radar-r6-0c-b2-2"); mkdirSync(pasta, { recursive: true });
  writeFileSync(resolve(pasta, "mutantes.json"), JSON.stringify(resultados, null, 2));
  console.log(`${resultados.filter(r => r.morto).length}/${mutantes.length} mutantes mortos`);
  if (resultados.some(r => !r.morto)) process.exitCode = 1;
} finally { restaurar(); }
