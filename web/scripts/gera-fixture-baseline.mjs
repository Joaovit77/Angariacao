/* ================================================================
   Baixa do Supabase as linhas da conta de TESTE (as mesmas semeadas
   por scripts/seed-teste.mjs, na raiz) e grava tests/fixtures-baseline.json.

   Essa fixture é o dataset do BASELINE_ETAPA0.md em forma de linhas
   do banco — os testes de baseline a passam pelos mapeadores fromDb*
   e conferem os números de cada view com o relógio congelado em
   2026-07-09, exatamente como o baseline foi capturado.

   Uso (somente leitura, nada é escrito no banco):
     SEED_EMAIL=... SEED_PASSWORD=... node scripts/gera-fixture-baseline.mjs
   ================================================================ */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPABASE_URL = "https://jkkzknmdrvbstouekosi.supabase.co";
const ANON_KEY = "sb_publishable_m7IOOA53WnXlhKDvW1C3xA_Ch3OQoRE";
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Defina SEED_EMAIL e SEED_PASSWORD (conta de teste) antes de rodar.");
  process.exit(1);
}

const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error("FALHA NO LOGIN:", loginRes.status, await loginRes.text());
  process.exit(1);
}
const { access_token: TOKEN } = await loginRes.json();
const headers = { apikey: ANON_KEY, Authorization: `Bearer ${TOKEN}` };

async function tabela(nome) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${nome}?select=*`, { headers });
  if (!res.ok) {
    console.error(`FALHA AO LER ${nome}:`, res.status, await res.text());
    process.exit(1);
  }
  return res.json();
}

const [imoveis, metas, agenda, userConfig] = await Promise.all([
  tabela("imoveis"),
  tabela("metas"),
  tabela("agenda"),
  tabela("user_config"),
]);

const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures-baseline.json");
writeFileSync(
  destino,
  JSON.stringify(
    {
      comentario:
        "Linhas do banco da conta de teste (dataset do BASELINE_ETAPA0.md). Regenerar com scripts/gera-fixture-baseline.mjs apenas se o seed mudar.",
      imoveis,
      metas,
      agenda,
      user_config: userConfig[0] ?? null,
    },
    null,
    2,
  ) + "\n",
);
console.log(`OK — ${imoveis.length} imóveis, ${metas.length} metas, ${agenda.length} agenda -> ${destino}`);
