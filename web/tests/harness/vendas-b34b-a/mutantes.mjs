/** Ensaio local destrutivo apenas sobre o delta: restaura cada fonte em finally.
 * Executar com o harness fechado e sem outra edição simultânea nesses dois arquivos. */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const adaptador = "lib/persistencia/vendasImoveisLeitura.ts";
const componente = "components/vendas/SeletorImovelVenda.tsx";
const originais = new Map([adaptador, componente].map((arquivo) => [arquivo, readFileSync(join(raiz, arquivo), "utf8")]));
const ensaios = [
  { nome: "A", arquivo: adaptador, antes: "dados.push(imovel);", depois: 'if (!(imovel.finalidade === "locacao_venda" && imovel.status === "Locado")) dados.push(imovel);', teste: "leitura" },
  { nome: "B", arquivo: adaptador, antes: "const finalidade = r.finalidade ?? null;", depois: 'const finalidade = r.finalidade ?? "locacao";', teste: "leitura" },
  { nome: "C", arquivo: componente, antes: "{imovel.retirado ?", depois: "{false ?", teste: "componente" },
  { nome: "D", arquivo: componente, antes: 'imovel.valorVenda === null ? "Não informado"', depois: '!imovel.valorVenda ? "Não informado"', teste: "componente" },
  { nome: "E", arquivo: componente, antes: 'const id = useId();', depois: 'const id = useId();\n  void import("@/lib/persistencia/vendas").then(({ executarComandoVenda }) => executarComandoVenda("criar", { chaveIdempotencia: "mutante-local", contatoId: "11111111-1111-4111-8111-111111111111" }));', teste: "fronteira" },
  { nome: "F", arquivo: adaptador, antes: '.eq("user_id", usuarioId).order', depois: '.order', teste: "leitura" },
];
try {
  for (const ensaio of ensaios) {
    const arquivo = join(raiz, ensaio.arquivo);
    const original = originais.get(ensaio.arquivo);
    if (!original.includes(ensaio.antes)) throw new Error(`Alvo do mutante ${ensaio.nome} mudou.`);
    let retorno;
    try {
      writeFileSync(arquivo, original.replace(ensaio.antes, ensaio.depois));
      retorno = spawnSync(process.execPath, [join(raiz, "node_modules/vitest/vitest.mjs"), "run", `tests/vendas-v1-b3-4b-a-${ensaio.teste}.test.ts`, "--maxWorkers=1"], { cwd: raiz, encoding: "utf8", timeout: 120000 });
    } finally { writeFileSync(arquivo, original); }
    const saida = `${retorno.stdout ?? ""}\n${retorno.stderr ?? ""}`;
    if (retorno.error || retorno.status === 0 || !/AssertionError/.test(saida) || !/Tests\s+\d+ failed/.test(saida)) {
      process.stderr.write(saida);
      throw new Error(`Mutante ${ensaio.nome} não foi morto por uma asserção de produto/fronteira.`);
    }
    console.log(`Mutante ${ensaio.nome}: morto (${saida.match(/Tests\s+[^\n]+/)?.[0].trim()}); fonte restaurada.`);
  }
} finally {
  for (const [arquivo, original] of originais) writeFileSync(join(raiz, arquivo), original);
}
console.log("Todos os mutantes restaurados.");
