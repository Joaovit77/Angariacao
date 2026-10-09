/** Muda apenas fontes desta fatia; restaura em finally, mesmo em falha ou timeout. */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const modal = "components/vendas/ModalCriarOportunidadeVenda.tsx", formulario = "components/vendas/criacaoVenda.ts", leitura = "lib/persistencia/vendasContatosLeitura.ts";
const originais = new Map([modal, formulario, leitura].map((f) => [f, readFileSync(join(raiz, f), "utf8")]));
const ensaios = [
  { nome: "M1", arquivo: modal, antes: 'resultado = await executarComandoVenda("criar", pedido.current);', depois: 'await (await import("@/lib/persistencia/supabase")).getSupabase().from("contatos").insert({ nome: "Cadastro separado" }); resultado = await executarComandoVenda("criar", pedido.current);', teste: "fronteira" },
  { nome: "M2", arquivo: modal, antes: 'executarComandoVenda("criar", pedido.current)', depois: 'executarComandoVenda("criar", { ...pedido.current, chaveIdempotencia: crypto.randomUUID() })', teste: "interface", filtro: "após commit: retry" },
  { nome: "M3", arquivo: formulario, antes: 'telefone: r.telefone.trim() || null', depois: 'telefone: r.telefone.trim()', teste: "formulario", filtro: "telefone vazio" },
  { nome: "M4", arquivo: leitura, antes: 'r.user_id !== usuarioId', depois: 'false', teste: "contatos", filtro: "estrangeira" },
  { nome: "M5", arquivo: formulario, antes: 'valorNegocioPrevisto: valor,', depois: 'valorNegocioPrevisto: valor || null,', teste: "formulario", filtro: "zero e origem" },
  { nome: "M6", arquivo: modal, antes: 'const codigo = resultado.erro.codigo;', depois: 'if (resultado.erro.codigo === "telefone-ja-cadastrado") { void executarComandoVenda("criar", { ...pedido.current!, chaveIdempotencia: crypto.randomUUID() }); } const codigo = resultado.erro.codigo;', teste: "interface", filtro: "telefone-ja-cadastrado mantém" },
  { nome: "M7", arquivo: modal, antes: 'chaveIdempotencia: crypto.randomUUID(), ...validacao.dados', depois: 'chaveIdempotencia: crypto.randomUUID(), ...validacao.dados, etapa: "nova"', teste: "interface", filtro: "novo: foco" },
  { nome: "M8", arquivo: modal, antes: 'chaveIdempotencia: crypto.randomUUID(), ...validacao.dados', depois: 'chaveIdempotencia: crypto.randomUUID(), ...validacao.dados, imovelTratado: null', teste: "interface", filtro: "novo: foco" },
];
try {
  for (const m of ensaios) {
    const original = originais.get(m.arquivo), caminho = join(raiz, m.arquivo);
    if (!original.includes(m.antes)) throw new Error(`Alvo ${m.nome} ausente`);
    let r;
    try {
      writeFileSync(caminho, original.replace(m.antes, m.depois));
      const args = [join(raiz, "node_modules/vitest/vitest.mjs"), "run", `tests/vendas-v1-b3-4b-b1-${m.teste}.test.ts`, "--maxWorkers=1", "--no-file-parallelism"];
      if (m.filtro) args.push("-t", m.filtro);
      r = spawnSync(process.execPath, args, { cwd: raiz, encoding: "utf8", timeout: 120000 });
    } finally { writeFileSync(caminho, original); }
    const saida = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    if (r.error || r.status === 0 || !/AssertionError/.test(saida) || !/Tests\s+\d+ failed/.test(saida)) { process.stderr.write(saida); throw new Error(`Mutante ${m.nome} não foi morto por asserção`); }
    console.log(`${m.nome}: morto por asserção; fonte restaurada. ${saida.match(/Tests\s+[^\n]+/)?.[0].trim()}`);
  }
} finally { for (const [f, original] of originais) writeFileSync(join(raiz, f), original); }
console.log("M1–M8 restaurados em finally.");
