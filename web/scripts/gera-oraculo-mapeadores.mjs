/* ================================================================
   GERADOR DO ORÁCULO DOS MAPEADORES — Etapa 3 (MIGRATION_NEXT.md)

   Executa os mapeadores toDb… e fromDb… do app.js ANTIGO em sandbox
   Node e captura a saída real para as fixtures de tests/fixtures.json
   (camelCase) e tests/fixtures-db.json (linhas snake_case), incluindo
   as viagens de ida-e-volta fromDb(toDb(x)).

   Rodar (de dentro de web/):  node scripts/gera-oraculo-mapeadores.mjs
   Regerar apenas se as fixtures mudarem.
   ================================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_JS = join(__dirname, "..", "..", "app.js");
const OUT = join(__dirname, "..", "tests", "oracle-mapeadores.json");

const noopEl = { addEventListener() {}, style: {}, textContent: "", innerHTML: "" };
const sandbox = {
  Date,
  console,
  crypto: globalThis.crypto,
  document: {
    addEventListener() {},
    getElementById() { return noopEl; },
    createElement() { return { ...noopEl, className: "", remove() {}, appendChild() {} }; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  },
  window: {},
  setTimeout() { return 0; },
  clearTimeout() {},
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(readFileSync(APP_JS, "utf-8"), context, { filename: "app.js" });
const run = (expr) => vm.runInContext(expr, context);

// toDbImovel/toDbAgenda leem currentUser.id do global.
const USER_ID = "user-oraculo";
run(`currentUser = { id: ${JSON.stringify(USER_ID)} }`);

const camel = JSON.parse(readFileSync(join(__dirname, "..", "tests", "fixtures.json"), "utf-8"));
const db = JSON.parse(readFileSync(join(__dirname, "..", "tests", "fixtures-db.json"), "utf-8"));
sandbox.__camel = camel;
sandbox.__db = db;

const oracle = { userId: USER_ID };

oracle.toDbImovel = {};
oracle.roundTripImovel = {};
for (const im of camel.imoveis) {
  oracle.toDbImovel[im.id] = run(`toDbImovel(__camel.imoveis.find((x) => x.id === ${JSON.stringify(im.id)}))`);
  oracle.roundTripImovel[im.id] = run(`fromDbImovel(toDbImovel(__camel.imoveis.find((x) => x.id === ${JSON.stringify(im.id)})))`);
}

oracle.fromDbImovel = {};
for (const r of db.imoveisRows) {
  oracle.fromDbImovel[r.id] = run(`fromDbImovel(__db.imoveisRows.find((x) => x.id === ${JSON.stringify(r.id)}))`);
}

oracle.fromDbAgenda = {};
for (const r of db.agendaRows) {
  oracle.fromDbAgenda[r.id] = run(`fromDbAgenda(__db.agendaRows.find((x) => x.id === ${JSON.stringify(r.id)}))`);
}

oracle.toDbAgenda = {};
oracle.roundTripAgenda = {};
for (const a of db.agendaCamel) {
  oracle.toDbAgenda[a.id] = run(`toDbAgenda(__db.agendaCamel.find((x) => x.id === ${JSON.stringify(a.id)}))`);
  oracle.roundTripAgenda[a.id] = run(`fromDbAgenda(toDbAgenda(__db.agendaCamel.find((x) => x.id === ${JSON.stringify(a.id)})))`);
}

writeFileSync(OUT, JSON.stringify(oracle, null, 2) + "\n", "utf-8");
console.log("Oráculo dos mapeadores gerado em", OUT);
