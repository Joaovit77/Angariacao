import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const capacidade = "lib/calculo/aquisicaoRadar.ts", parser = "lib/servidor/parserOlx.ts", persistencia = "lib/servidor/comparaveisMercado.ts";
const originais = new Map([capacidade, parser, persistencia].map(a => [a, readFileSync(resolve(raiz, a))]));
const restaurar = () => { for (const [a, b] of originais) writeFileSync(resolve(raiz, a), b); };
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => { restaurar(); process.exit(130); });
const fonte = originais.get(parser).toString();
const tipo = fonte.match(/const tipoDeclarado = categoria[\s\S]+?: null;/)?.[0];
const preco = fonte.match(/const preco = blocoPreco[\s\S]+?\? valor : null;/)?.[0];
if (!tipo || !preco) throw Error("Contrato OLX não localizado.");
const comparacaoTipo = "tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte";
const mutantes = [
  ["Tipo solicitado vira observado", [[parser, tipo, 'const tipoDeclarado = filtros.tipoRecorte === "casa" ? "Casa" : "Apartamento";']]],
  ["Fallback posicional vira identidade admitida", [[capacidade, 'const identidade = identidadeOlx(anuncio.url), evidencia = anuncio.evidenciaLocacaoOlx;', 'if (idExternoEhFallback(anuncio.portal, anuncio.idExterno)) return true; const identidade = identidadeOlx(anuncio.url), evidencia = anuncio.evidenciaLocacaoOlx;']]],
  ["Primeiro R$ vira aluguel", [[parser, preco, 'const preco = Number(card.text().match(/R\\$\\s*([\\d.]+)/)?.[1]?.replace(/\\./g, "")) || null;']]],
  ["Venda entra como Locação", [[capacidade, 'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.[recorte.finalidade]?.[recorte.tipoRecorte]', 'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.["locacao"]?.[recorte.tipoRecorte]']]],
  ["Casa aceita Apartamento", [[parser, 'if (tipoObservado !== filtros.tipoRecorte) return [];', 'if (filtros.tipoRecorte !== "casa" && tipoObservado !== filtros.tipoRecorte) return [];'], [capacidade, comparacaoTipo, '(filtros.tipoRecorte === "casa" || tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte)']]],
  ["Apartamento aceita Casa", [[parser, 'if (tipoObservado !== filtros.tipoRecorte) return [];', 'if (filtros.tipoRecorte !== "apartamento" && tipoObservado !== filtros.tipoRecorte) return [];'], [capacidade, comparacaoTipo, '(filtros.tipoRecorte === "apartamento" || tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte)']]],
  ["Parcial executa", [[capacidade, 'suportado: status === "suportado"', 'suportado: status !== "nao-suportado"']]],
  ["Geografia inválida executa", [[capacidade, '(recorte.portal === "olx" || recorte.portal === "zap") && !londrina', 'recorte.portal === "zap" && !londrina'], [capacidade, 'if (!londrina) {', 'if (!londrina && recorte.portal !== "olx") {']]],
  ["Identidade divergente é aceita", [[parser, 'if (!a || identidadeOlx(a.url)?.url !== identidade.url || String(a.listId) !== identidade.id) return [];', 'if (!a) return [];']]],
  ["Reobservação duplica comparável por nova identidade", [[persistencia, 'id_externo: anuncio.idExterno,', 'id_externo: anuncio.idExterno + "-" + crypto.randomUUID(),']]],
];
const executar = () => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/olx-locacao.test.ts", "tests/aquisicao-radar-capacidade.test.ts", "tests/aquisicao-radar-execucao.test.ts", "tests/aquisicao-radar-transporte.test.ts", "--maxWorkers=2"], {
  cwd: raiz, encoding: "utf8", timeout: 60000, windowsHide: true,
  env: { ...process.env, ALLOW_REAL_OPENAI: "0", OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "" },
});
const resultados = [];
try {
  const controle = executar();
  if (controle.status !== 0) throw Error(`Controle falhou: ${controle.stdout}\n${controle.stderr}`);
  for (const [nome, edicoes] of mutantes) {
    restaurar();
    for (const [arquivo, de, para] of edicoes) {
      const original = readFileSync(resolve(raiz, arquivo), "utf8");
      if (!original.includes(de)) throw Error(`Alvo ausente: ${nome}`);
      writeFileSync(resolve(raiz, arquivo), original.replace(de, para));
    }
    const r = executar();
    const morto = r.status === 1 && /AssertionError/.test(r.stdout + r.stderr);
    resultados.push({ nome, morto }); console.log(`${morto ? "MORTO" : "SOBREVIVEU"}: ${nome}`);
    if (!morto) console.log(r.stdout, r.stderr);
  }
  const pasta = resolve(raiz, "node_modules/.cache/radar-r6-0c-b2-5"); mkdirSync(pasta, { recursive: true });
  writeFileSync(resolve(pasta, "mutantes.json"), JSON.stringify(resultados, null, 2));
  if (resultados.some(r => !r.morto)) process.exitCode = 1;
} finally { restaurar(); }
