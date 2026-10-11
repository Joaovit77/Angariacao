import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const raiz = fileURLToPath(new URL("../../../", import.meta.url));
const capacidade = "lib/calculo/aquisicaoRadar.ts", parser = "lib/servidor/parserVivaReal.ts";
const originais = new Map([capacidade, parser].map(a => [a, readFileSync(resolve(raiz, a))]));
const restaurar = () => { for (const [a, b] of originais) writeFileSync(resolve(raiz, a), b); };
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => { restaurar(); process.exit(130); });
const preco = originais.get(parser).toString().match(/const preco = especificacao[\s\S]+?\? valor : null;/)?.[0];
if (!preco) throw Error("Contrato de preço não localizado.");
const mutantes = [
  ["Primeiro R$ vira aluguel", parser, preco, 'const preco = Number(card.text().match(/R\\$\\s*([\\d.]+)/)?.[1]?.replace(/\\./g, "")) || null;'],
  ["Condomínio vira aluguel", parser, preco, "const preco = numero(objeto(oferta.additionalProperty).value);"],
  ["Tipo solicitado vira tipo observado", capacidade, "tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte", 'tipoRecorteRadar(filtros.tipoRecorte) === filtros.tipoRecorte'],
  ["Fallback posicional vira identidade", capacidade, "identidade.id === anuncio.idExterno", "(identidade.id === anuncio.idExterno || idExternoEhFallback(anuncio.portal, anuncio.idExterno))"],
  ["Venda é liberada", capacidade, "MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.[recorte.finalidade]?.[recorte.tipoRecorte]", 'MATRIZ_CAPACIDADE_RADAR[recorte.portal]?.["locacao"]?.[recorte.tipoRecorte]'],
  ["Parcial executa", capacidade, 'suportado: status === "suportado"', 'suportado: status !== "nao-suportado"'],
  ["Casa aceita Apartamento", capacidade, "tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte", '(filtros.tipoRecorte === "casa" || tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte)'],
  ["Apartamento aceita Casa", capacidade, "tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte", '(filtros.tipoRecorte === "apartamento" || tipoRecorteObservadoRadar(anuncio) === filtros.tipoRecorte)'],
  ["Dispensa RentAction", parser, 'acao["@type"] !== "RentAction"', 'false'],
  ["Preço divergente é aceito", parser, "numero(oferta.price) === valor", "true"],
];
const executar = () => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/viva-real-locacao.test.ts", "tests/aquisicao-radar-capacidade.test.ts", "tests/aquisicao-radar-transporte.test.ts", "--maxWorkers=2"], {
  cwd: raiz, encoding: "utf8", timeout: 60000, windowsHide: true,
  env: { ...process.env, ALLOW_REAL_OPENAI: "0", OPENAI_API_KEY: "", FIRECRAWL_API_KEY: "" },
});
const resultados = [];
try {
  const controle = executar();
  if (controle.status !== 0) throw Error(`Controle falhou: ${controle.stdout}\n${controle.stderr}`);
  for (const [nome, arquivo, de, para] of mutantes) {
    restaurar(); const original = originais.get(arquivo).toString();
    if (!original.includes(de)) throw Error(`Alvo ausente: ${nome}`);
    writeFileSync(resolve(raiz, arquivo), original.replace(de, para));
    const r = executar();
    const morto = r.status === 1 && /AssertionError/.test(r.stdout + r.stderr);
    resultados.push({ nome, morto }); console.log(`${morto ? "MORTO" : "SOBREVIVEU"}: ${nome}`);
    if (!morto) console.log(r.stdout, r.stderr);
  }
  const pasta = resolve(raiz, "node_modules/.cache/radar-r6-0c-b2-4"); mkdirSync(pasta, { recursive: true });
  writeFileSync(resolve(pasta, "mutantes.json"), JSON.stringify(resultados, null, 2));
  console.log(`${resultados.filter(r => r.morto).length}/${mutantes.length} mutantes mortos`);
  if (resultados.some(r => !r.morto)) process.exitCode = 1;
} finally { restaurar(); }
