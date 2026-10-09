/** INV-Q1: ensaio local destrutivo só sobre a View; restaura a fonte em finally.
 * Executar sem outra edição simultânea no arquivo. */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const view = join(raiz, "components/investigador/InvestigadorImoveisView.tsx");
const original = readFileSync(view, "utf8");
const ensaios = [
  { nome: "M1 não confirmado tratado como confirmado", trocas: [
    ['item.confianca === "muito-forte" || item.confianca === "forte"', 'item.confianca !== "indicio"'],
  ] },
  { nome: "M2 sem o estado \"Nenhum resultado confirmado\"", trocas: [
    ["{TITULO_NENHUM_CONFIRMADO}</h2>", '{plural(resultado.resultados.length, "resultado", "resultados")}</h2>'],
    ["<p>{EXPLICACAO_NENHUM_CONFIRMADO}</p>", "<p />"],
  ] },
  { nome: "M3 não confirmados começam expandidos", trocas: [
    ["setNaoConfirmadosAbertos] = useState(false);", "setNaoConfirmadosAbertos] = useState(true);"],
    ["setNaoConfirmadosAbertos(false);", "setNaoConfirmadosAbertos(true);"],
  ] },
  { nome: "M4 contador incorreto", trocas: [
    ["resultados não confirmados ({itens.length})", "resultados não confirmados ({itens.length + 1})"],
  ] },
  { nome: "M5 confirmado some junto com os não confirmados", trocas: [
    ["grupos?.melhores.length === 0;", "(grupos?.outros.length ?? 0) > 0;"],
  ] },
  { nome: "M6 zero resultados vira \"nenhum confirmado\"", trocas: [
    ["Boolean(resultado?.resultados.length) && ", ""],
  ] },
];

try {
  for (const ensaio of ensaios) {
    let mutado = original.replace(/\r\n/g, "\n");
    for (const [antes, depois] of ensaio.trocas) {
      if (mutado.split(antes).length !== 2) throw new Error(`Alvo do ${ensaio.nome} não é único ou mudou: ${antes}`);
      mutado = mutado.replace(antes, depois);
    }
    let retorno;
    try {
      writeFileSync(view, original.includes("\r\n") ? mutado.replace(/\n/g, "\r\n") : mutado);
      retorno = spawnSync(process.execPath, [
        join(raiz, "node_modules/vitest/vitest.mjs"), "run",
        "tests/investigador-inv-q1-nenhum-confirmado.test.ts", "tests/investigador-ab4-ux.test.ts", "--maxWorkers=1",
      ], { cwd: raiz, encoding: "utf8", timeout: 180000 });
    } finally { writeFileSync(view, original); }
    const saida = `${retorno.stdout ?? ""}\n${retorno.stderr ?? ""}`;
    if (retorno.error || retorno.status === 0 || !/Tests\s+\d+ failed/.test(saida)) {
      process.stderr.write(saida);
      throw new Error(`${ensaio.nome}: sobreviveu.`);
    }
    const falhas = [...saida.matchAll(/(?:FAIL|×)\s+[^\n]*?(?:INV-Q1|AB4)[^\n]*/g)].map((m) => m[0].trim());
    console.log(`${ensaio.nome}: morto (${saida.match(/Tests\s+[^\n]+/)?.[0].trim()}); fonte restaurada.`);
    for (const linha of new Set(falhas)) console.log(`    ${linha.replace(/\x1b\[[0-9;]*m/g, "")}`);
  }
} finally {
  writeFileSync(view, original);
}
console.log("Todos os mutantes restaurados.");
