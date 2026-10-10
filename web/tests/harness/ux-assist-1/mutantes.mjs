/** Altera somente fontes desta fase e restaura os bytes originais em finally. */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const assistente = "components/assistente/Assistente.tsx", vendas = "components/vendas/ModalCriarOportunidadeVenda.tsx";
const overlay = "components/modais/ModalOverlay.tsx", registro = "lib/superficiesBloqueantes.ts";
const originais = new Map([assistente, vendas, overlay, registro].map((f) => [f, readFileSync(join(raiz, f))]));
const casos = [
  { nome: "M1 ignorar bloqueio", arquivo: assistente, antes: "if (!permitido || !flutuanteAtivo || bloqueado) return null;", depois: "if (!permitido || !flutuanteAtivo) return null;", filtro: "matriz de preferência true" },
  { nome: "M2 Vendas sem registro", arquivo: vendas, antes: "useRegistrarSuperficieBloqueante();", depois: "useRegistrarSuperficieBloqueante(false);", filtro: "Vendas suspende painel/acionador" },
  { nome: "M3 ModalOverlay sem registro", arquivo: overlay, antes: "useRegistrarSuperficieBloqueante(modal !== null);", depois: "useRegistrarSuperficieBloqueante(false);", filtro: "matriz de preferência true" },
  { nome: "M4 liberar outro registro", arquivo: registro, antes: "registros.delete(token);", depois: "registros.clear();", filtro: "dois registros" },
  { nome: "M5 ignorar preferência OFF após fechamento", arquivo: assistente, antes: "if (!permitido || !flutuanteAtivo || bloqueado) return null;", depois: "if (!permitido || bloqueado) return null;", filtro: "preferência OFF continua" },
];
try {
  for (const caso of casos) {
    const caminho = join(raiz, caso.arquivo), original = originais.get(caso.arquivo).toString("utf8");
    if (!original.includes(caso.antes)) throw new Error(`Alvo ausente: ${caso.nome}`);
    let resultado;
    try {
      writeFileSync(caminho, original.replace(caso.antes, caso.depois));
      resultado = spawnSync(process.execPath, [join(raiz, "node_modules/vitest/vitest.mjs"), "run", "tests/ux-assist-1.test.ts", "--no-cache", "--configLoader", "runner", "-t", caso.filtro], { cwd: raiz, encoding: "utf8", timeout: 60000 });
    } finally { writeFileSync(caminho, originais.get(caso.arquivo)); }
    const saida = `${resultado.stdout ?? ""}\n${resultado.stderr ?? ""}`;
    if (resultado.error || resultado.status === 0 || !/AssertionError/.test(saida) || !/Tests\s+\d+ failed/.test(saida)) {
      process.stderr.write(saida); throw new Error(`${caso.nome}: não foi morto por assertion útil.`);
    }
    console.log(`${caso.nome}: morto por assertion; fonte restaurada. ${saida.match(/Tests\s+[^\n]+/)?.[0].trim()}`);
  }
} finally { for (const [arquivo, bytes] of originais) writeFileSync(join(raiz, arquivo), bytes); }
console.log("M1–M5: fontes restauradas byte a byte.");
