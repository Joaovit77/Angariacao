/** INV-Q1: smoke visual local com fixtures sintéticas. Sobe o harness Vite
 * em memória, abre o Chrome instalado em modo headless e fotografa os
 * cenários em 390×844 e 1366×900, nos temas escuro e claro. Sem rede externa.
 * Uso: node tests/harness/investigador-inv-q1/smoke.mjs <pasta-de-saida> */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const saida = process.argv[2];
if (!saida) throw new Error("Informe a pasta de saída.");
mkdirSync(saida, { recursive: true });

const servidor = await createServer({
  configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
  logLevel: "error",
});
await servidor.listen();
const base = "http://127.0.0.1:3415/";
const navegador = await chromium.launch({ channel: "chrome", headless: true });
const relatorio = [];

const CENARIOS = [
  { id: "0-10", botao: "0 confirmados / 10 não confirmados" },
  { id: "1-9", botao: "1 confirmado / 9 não confirmados" },
  { id: "3-0", botao: "3 confirmados / 0 não confirmados" },
  { id: "vazio", botao: "0 resultados" },
];
const TELAS = [{ nome: "390", width: 390, height: 844 }, { nome: "1366", width: 1366, height: 900 }];

try {
  for (const tela of TELAS) {
    for (const tema of ["escuro", "claro"]) {
      for (const cenario of CENARIOS) {
        const contexto = await navegador.newContext({ viewport: { width: tela.width, height: tela.height } });
        const pagina = await contexto.newPage();
        const erros = [];
        pagina.on("console", (msg) => { if (msg.type() === "error") erros.push(msg.text()); });
        pagina.on("pageerror", (erro) => erros.push(String(erro)));
        await pagina.goto(base);
        await pagina.evaluate((valor) => { document.documentElement.dataset.tema = valor; }, tema);
        // Controle do harness, não da tela auditada.
        await pagina.getByRole("button", { name: cenario.botao }).click({ force: true });
        await pagina.waitForFunction(() => document.querySelector("textarea")?.value.length > 3);
        await pagina.getByRole("button", { name: "Investigar imóvel" }).click();
        await pagina.locator("#titulo-resultados-investigador").waitFor();

        const medir = async (estado) => {
          const dados = await pagina.evaluate(() => {
            const raizDoc = document.documentElement;
            const alternador = [...document.querySelectorAll("button")].find((b) => /resultados não confirmados/.test(b.textContent));
            const secao = document.querySelector("[data-nao-confirmados]");
            return {
              titulo: document.querySelector("#titulo-resultados-investigador")?.textContent,
              // O body tem overflow-x: hidden; mede a borda real dos elementos.
              maiorDireita: Math.ceil(Math.max(...[...document.querySelectorAll("body *")].map((el) => el.getBoundingClientRect().right))),
              overflowX: raizDoc.scrollWidth > raizDoc.clientWidth
                || Math.max(...[...document.querySelectorAll("body *")].map((el) => el.getBoundingClientRect().right)) > raizDoc.clientWidth + 0.5,
              scrollWidth: raizDoc.scrollWidth,
              clientWidth: raizDoc.clientWidth,
              cards: document.querySelectorAll("article").length,
              alternador: alternador ? { texto: alternador.textContent, expandido: alternador.getAttribute("aria-expanded"), largura: Math.round(alternador.getBoundingClientRect().width) } : null,
              alturaSecaoNaoConfirmados: secao ? Math.round(secao.getBoundingClientRect().height) : null,
              vazio: Boolean(document.querySelector("[data-vazio]")),
            };
          });
          const arquivo = `${tela.nome}-${tema}-${cenario.id}-${estado}.png`;
          await pagina.screenshot({ path: join(saida, arquivo), fullPage: true });
          relatorio.push({ tela: tela.nome, tema, cenario: cenario.id, estado, ...dados, erros: [...erros], arquivo });
        };

        await medir("inicial");
        if (cenario.id === "0-10") {
          // Teclado no navegador real: Enter abre, Espaço fecha.
          const alternador = pagina.getByRole("button", { name: /resultados não confirmados/ });
          await alternador.focus();
          await pagina.keyboard.press("Enter");
          await medir("expandido-enter");
          await pagina.keyboard.press("Space");
          await medir("recolhido-espaco");
        }
        await contexto.close();
      }
    }
  }
} finally {
  await navegador.close();
  await servidor.close();
}

for (const item of relatorio) {
  console.log(JSON.stringify(item));
}
