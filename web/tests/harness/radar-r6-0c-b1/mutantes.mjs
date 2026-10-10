import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const capacidade = "lib/calculo/aquisicaoRadar.ts";
const tipos = "lib/calculo/centralAngariacao.ts";
const originais = new Map([capacidade, tipos].map((arquivo) => [arquivo, readFileSync(resolve(raiz, arquivo))]));
const restaurar = () => { for (const [arquivo, conteudo] of originais) writeFileSync(resolve(raiz, arquivo), conteudo); };
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => { restaurar(); process.exit(130); });

const mutantes = [
  ["Venda cai na capacidade de Locação", capacidade,
    "MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.[recorte.finalidade]?.[recorte.tipoRecorte]",
    'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.["locacao"]?.[recorte.tipoRecorte]'],
  ["Tipo solicitado vira observado", tipos,
    "(anuncio.tipo?.trim() || extrairTipoImovelDeclarado(texto))",
    "(tipoPreferido || anuncio.tipo?.trim() || extrairTipoImovelDeclarado(texto))"],
  ["Capacidade parcial executa", capacidade,
    'suportado: status === "suportado"', 'suportado: status !== "nao-suportado"'],
  ["ZAP Casa liberado", capacidade,
    'zap: { locacao: { casa: "nao-suportado"', 'zap: { locacao: { casa: "suportado"'],
];
const testes = ["tests/aquisicao-radar-capacidade.test.ts", "tests/aquisicao-radar-execucao.test.ts", "tests/aquisicao-radar-transporte.test.ts", "tests/radar-r6-tipo-declarado.test.ts"];
const executar = () => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...testes, "--maxWorkers=2"], {
  cwd: raiz, encoding: "utf8", timeout: 60000,
  env: { ...process.env, ALLOW_REAL_OPENAI: "0", OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "" },
});

try {
  const controle = executar();
  if (controle.status !== 0) throw new Error(`Controle falhou; mutantes não avaliados.\n${controle.stdout}\n${controle.stderr}`);
  let mortos = 0;
  for (const [nome, arquivo, de, para] of mutantes) {
    restaurar();
    const original = originais.get(arquivo).toString("utf8");
    if (!original.includes(de)) throw new Error(`Alvo não encontrado: ${nome}`);
    writeFileSync(resolve(raiz, arquivo), original.replace(de, para));
    const resultado = executar();
    // Erro de ambiente/importação não é evidência de mutante detectado.
    const detectado = resultado.status === 1 && /AssertionError/.test(resultado.stdout + resultado.stderr);
    console.log(`${detectado ? "DETECTADO" : "NÃO DETECTADO"}: ${nome}`);
    if (detectado) mortos += 1;
    else console.log(resultado.stdout, resultado.stderr);
  }
  console.log(`Mutantes detectados: ${mortos}/${mutantes.length}`);
  if (mortos !== mutantes.length) process.exitCode = 1;
} finally {
  restaurar();
}
