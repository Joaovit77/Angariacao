/* ================================================================
   GERADOR DO ORÁCULO — Etapa 2 (MIGRATION_NEXT.md)

   Executa o app.js ANTIGO (raiz do repo) dentro de um sandbox Node
   com data congelada em 2026-07-09 e captura a saída real de cada
   função do núcleo puro (utilidades de data, formatadores e motor
   de cálculo) para as fixtures de tests/fixtures.json.

   O resultado (tests/oracle-expected.json) é o comportamento
   OBSERVADO do código legado — os testes de caracterização exigem
   que o port em TypeScript produza exatamente esses valores.

   Rodar (de dentro de web/):  node scripts/gera-oraculo.mjs
   Regerar apenas se as fixtures mudarem — e sempre ANTES de
   qualquer mudança no port, nunca depois (o oráculo descreve o
   app antigo, não o novo).

   Atenção: depende do fuso horário da máquina (America/Sao_Paulo),
   como o próprio app antigo. Gerar sempre na mesma máquina/fuso.
   ================================================================ */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_JS = join(__dirname, "..", "..", "app.js");
const FIXTURES = join(__dirname, "..", "tests", "fixtures.json");
const OUT = join(__dirname, "..", "tests", "oracle-expected.json");

// Instante congelado: 2026-07-09 12:00 em São Paulo (15:00 UTC).
// new Date() sem argumentos retorna sempre esse instante; com
// argumentos, comporta-se normalmente (parseDate precisa disso).
const FIXED_ISO = "2026-07-09T15:00:00.000Z";
const RealDate = Date;
const FIXED_TS = new RealDate(FIXED_ISO).getTime();
class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED_TS);
    else super(...args);
  }
  static now() { return FIXED_TS; }
}

// Stubs mínimos de browser — só o que o app.js toca em top-level
// (document.addEventListener) ou dentro de utilitários puros.
const noopEl = { addEventListener() {}, style: {}, textContent: "", innerHTML: "" };
const sandbox = {
  Date: FixedDate,
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
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

// Carrega o app.js inteiro no contexto. As declarações top-level
// (const/let/function) ficam no escopo léxico global do contexto e
// permanecem acessíveis para os scripts seguintes.
vm.runInContext(readFileSync(APP_JS, "utf-8"), context, { filename: "app.js" });

// Helper: avalia uma expressão dentro do contexto do app antigo.
const run = (expr) => vm.runInContext(expr, context);

// Injeta as fixtures no STATE global do app antigo.
const fixtures = JSON.parse(readFileSync(FIXTURES, "utf-8"));
sandbox.__fixtures = fixtures;
run(`
  STATE.imoveis = __fixtures.imoveis;
  STATE.config = { comissaoPercent: __fixtures.config.comissaoPercent };
`);

const oracle = { geradoEm: FIXED_ISO, fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone };

// ---- utilidades de data (puras: entrada -> saída) -----------------
oracle.datas = {
  todayISO: run(`todayISO()`),
  currentMonthKey: run(`currentMonthKey()`),
  last6MonthKeys: run(`last6MonthKeys()`),
  parseDate_null: run(`parseDate(null)`),
  parseDate_vazio: run(`parseDate("")`),
  parseDate_iso_como_iso: run(`parseDate("2026-07-09") && parseDate("2026-07-09").toISOString()`),
  daysBetween: {
    "2026-07-01__2026-07-09": run(`daysBetween("2026-07-01","2026-07-09")`),
    "2026-07-09__2026-07-01": run(`daysBetween("2026-07-09","2026-07-01")`),
    "null__2026-07-09": run(`daysBetween(null,"2026-07-09")`),
    "2026-07-09__null": run(`daysBetween("2026-07-09",null)`),
    "2025-12-31__2026-01-01": run(`daysBetween("2025-12-31","2026-01-01")`),
    iguais: run(`daysBetween("2026-07-09","2026-07-09")`),
  },
  addDaysISO: {
    "2026-01-31_mais1": run(`addDaysISO("2026-01-31",1)`),
    "2026-12-31_mais1": run(`addDaysISO("2026-12-31",1)`),
    "2024-02-28_mais1": run(`addDaysISO("2024-02-28",1)`),
    "2026-07-05_mais60": run(`addDaysISO("2026-07-05",60)`),
    "2026-07-09_menos30": run(`addDaysISO("2026-07-09",-30)`),
    null_mais5: run(`addDaysISO(null,5)`),
  },
  monthKey: {
    null: run(`monthKey(null)`),
    "2026-07-09": run(`monthKey("2026-07-09")`),
  },
  monthLabel: {
    "2026-07": run(`monthLabel("2026-07")`),
    "2026-02": run(`monthLabel("2026-02")`),
    "2025-12": run(`monthLabel("2025-12")`),
  },
  monthLabelLong: {
    "2026-07": run(`monthLabelLong("2026-07")`),
    "2026-02": run(`monthLabelLong("2026-02")`),
  },
  shiftMonthKey: {
    "2026-01_menos1": run(`shiftMonthKey("2026-01",-1)`),
    "2026-12_mais1": run(`shiftMonthKey("2026-12",1)`),
    "2026-07_menos6": run(`shiftMonthKey("2026-07",-6)`),
    "2026-07_mais0": run(`shiftMonthKey("2026-07",0)`),
  },
};

// ---- formatadores --------------------------------------------------
oracle.formatadores = {
  fmtDate: {
    null: run(`fmtDate(null)`),
    "2026-07-09": run(`fmtDate("2026-07-09")`),
  },
  fmtDateLong: {
    null: run(`fmtDateLong(null)`),
    "2026-07-09": run(`fmtDateLong("2026-07-09")`),
    "2026-01-02": run(`fmtDateLong("2026-01-02")`),
  },
  fmtMoney: {
    null: run(`fmtMoney(null)`),
    nan: run(`fmtMoney(NaN)`),
    zero: run(`fmtMoney(0)`),
    "1800": run(`fmtMoney(1800)`),
    "1234.56": run(`fmtMoney(1234.56)`),
    "9500000": run(`fmtMoney(9500000)`),
  },
  fmtMoneyFull: {
    null: run(`fmtMoneyFull(null)`),
    "1234.56": run(`fmtMoneyFull(1234.56)`),
    "1800": run(`fmtMoneyFull(1800)`),
  },
};

// ---- motor de cálculo: por imóvel ----------------------------------
oracle.porImovel = {};
for (const im of fixtures.imoveis) {
  oracle.porImovel[im.id] = run(`(() => {
    const i = STATE.imoveis.find((x) => x.id === "${im.id}");
    return {
      dateEnteredStatus_NovoContato: dateEnteredStatus(i, "Novo contato"),
      dateEnteredStatus_Angariado: dateEnteredStatus(i, "Angariado"),
      dateEnteredStatus_Locado: dateEnteredStatus(i, "Locado"),
      currentStatusSince: currentStatusSince(i),
      isPausado: isPausado(i),
      isStale: isStale(i),
      daysInCurrentStatus: daysInCurrentStatus(i),
      comissaoEstimada: comissaoEstimada(i),
      comissaoRecebidaValor: comissaoRecebidaValor(i),
      tempoAteLocacao: tempoAteLocacao(i),
      foiAngariado: foiAngariado(i),
      dataAngariadoEfetiva: dataAngariadoEfetiva(i),
    };
  })()`);
}

// ---- motor de cálculo: agregados -----------------------------------
oracle.metricsForRange = {
  todos: run(`metricsForRange(STATE.imoveis)`),
  vazio: run(`metricsForRange([])`),
  soLocados: run(`metricsForRange(STATE.imoveis.filter((i) => i.status === "Locado"))`),
};

oracle.porMes = {
  angariadosNoMes: {
    "2026-05": run(`imoveisAngariadosNoMes("2026-05").map((i) => i.id)`),
    "2026-06": run(`imoveisAngariadosNoMes("2026-06").map((i) => i.id)`),
    "2026-07": run(`imoveisAngariadosNoMes("2026-07").map((i) => i.id)`),
  },
  angariadosNoPeriodo: {
    "2026-06-01__2026-06-30": run(`imoveisAngariadosNoPeriodo("2026-06-01","2026-06-30").map((i) => i.id)`),
    "2026-06-05__2026-06-10": run(`imoveisAngariadosNoPeriodo("2026-06-05","2026-06-10").map((i) => i.id)`),
  },
  contatadosNoMes: {
    "2026-06": run(`imoveisContatadosNoMes("2026-06").map((i) => i.id)`),
    "2026-07": run(`imoveisContatadosNoMes("2026-07").map((i) => i.id)`),
  },
  contatadosNoPeriodo: {
    "2026-07-01__2026-07-09": run(`imoveisContatadosNoPeriodo("2026-07-01","2026-07-09").map((i) => i.id)`),
  },
  locadosNoMes: {
    "2026-05": run(`imoveisLocadosNoMes("2026-05").map((i) => i.id)`),
    "2026-06": run(`imoveisLocadosNoMes("2026-06").map((i) => i.id)`),
    "2026-07": run(`imoveisLocadosNoMes("2026-07").map((i) => i.id)`),
  },
};

oracle.groupCount = {
  porBairro: run(`groupCount(STATE.imoveis, (i) => i.bairro)`),
  porTipo: run(`groupCount(STATE.imoveis, (i) => i.tipo)`),
  porStatus: run(`groupCount(STATE.imoveis, (i) => i.status)`),
};

// ---- filtros do pipeline -------------------------------------------
// filteredImoveisEnhanced lê os globals pipelineFilters/pipelineViewMode/
// pipelineColFilters — cada cenário seta esses globals e roda a função.
const FILTROS_ZERO = `{ search: "", tipo: "", bairro: "", status: "", responsavel: "", cidade: "" }`;
const COLS_ZERO = `{ bairro: [], tipo: [], origem: [], status: [], captador: [] }`;
function cenarioFiltro(nome, { filters = {}, mode = "lista", colFilters = {} }) {
  return run(`(() => {
    pipelineFilters = Object.assign(${FILTROS_ZERO}, ${JSON.stringify(filters)});
    pipelineViewMode = ${JSON.stringify(mode)};
    pipelineColFilters = Object.assign(${COLS_ZERO}, ${JSON.stringify(colFilters)});
    return filteredImoveisEnhanced().map((i) => i.id);
  })()`);
}
oracle.filtros = {
  semFiltro_lista: cenarioFiltro("semFiltro", {}),
  busca_cidade_osasco: cenarioFiltro("buscaCidade", { filters: { search: "osasco" } }),
  busca_telefone: cenarioFiltro("buscaTelefone", { filters: { search: "98888-0002" } }),
  busca_com_espacos: cenarioFiltro("buscaEspacos", { filters: { search: "  Haddock  " } }),
  tipo_apartamento: cenarioFiltro("tipo", { filters: { tipo: "Apartamento" } }),
  cidade_osasco: cenarioFiltro("cidade", { filters: { cidade: "Osasco" } }),
  status_locado: cenarioFiltro("status", { filters: { status: "Locado" } }),
  responsavel_maria: cenarioFiltro("responsavel", { filters: { responsavel: "Maria" } }),
  busca_e_tipo: cenarioFiltro("buscaETipo", { filters: { search: "rua", tipo: "Casa" } }),
  col_bairro_vazio_lista: cenarioFiltro("colVazio", { colFilters: { bairro: [""] } }),
  col_bairro_pinheiros_lista: cenarioFiltro("colPinheiros", { colFilters: { bairro: ["Pinheiros"] } }),
  col_bairro_pinheiros_kanban: cenarioFiltro("colKanban", { mode: "kanban", colFilters: { bairro: ["Pinheiros"] } }),
  col_combinado_lista: cenarioFiltro("colCombinado", { colFilters: { bairro: ["Pinheiros", "Lapa"], captador: ["João"] } }),
};

oracle.pipelineColDistinct = {
  bairro: run(`(() => { pipelineColFilters = ${COLS_ZERO}; return pipelineColDistinct("bairro"); })()`),
  captador: run(`pipelineColDistinct("captador")`),
};
oracle.pipelineUniqueSorted = {
  bairros: run(`pipelineUniqueSorted(STATE.imoveis.map((i) => i.bairro))`),
  comEspacosEDuplicatas: run(`pipelineUniqueSorted([" a", "a ", "", null, "B", "á"])`),
};

writeFileSync(OUT, JSON.stringify(oracle, null, 2) + "\n", "utf-8");
console.log("Oráculo gerado em", OUT);
console.log("Fuso horário da geração:", oracle.fusoHorario);
