/* ================================================================
   BACKFILL — transcreve os áudios que já estão no banco como `[áudio]`

   A transcrição passou a rodar no webhook, mas só vale para o que chega
   DAQUI PRA FRENTE. O que já entrou continua como `[áudio]`: em
   31/07/2026 eram 43 respostas na carteira real, 20 delas num imóvel só,
   incluindo uma negociação inteira de contrato e um "vai desocupar esse
   mês, está disponível" num imóvel parado em "Novo contato".

   O id da mensagem na Evolution está no id da nota (`wa:<id>`), então o
   backfill não precisa de nenhum dado que já não esteja gravado — é a
   mesma porta que o webhook usa.

   IDEMPOTENTE: só toca nota cujo texto ainda é o marcador `[áudio]`.
   Rodar duas vezes não retranscreve nada nem gasta chamada à toa.

   Uso (a partir da raiz do repositório):

     node scripts/backfill-transcricao.mjs                 # simulação
     node scripts/backfill-transcricao.mjs --aplicar       # grava

   Lê as credenciais de web/.env.local (ou das variáveis de ambiente).
   Precisa da SUPABASE_SERVICE_ROLE_KEY: o script roda fora do app, sem
   sessão, e a RLS não vale aqui — por isso ele SEMPRE filtra por
   user_id, como manda o CLAUDE.md ("o banco tem mais de uma conta").
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APLICAR = process.argv.includes("--aplicar");

/* --- Configuração ---------------------------------------------------- */

function carregarEnv() {
  const env = { ...process.env };
  try {
    for (const linha of readFileSync(resolve(RAIZ, "web/.env.local"), "utf8").split(/\r?\n/)) {
      if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
      const i = linha.indexOf("=");
      const chave = linha.slice(0, i).trim();
      if (env[chave]) continue; // variável de ambiente tem precedência
      env[chave] = linha.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
  } catch {
    // Sem .env.local: seguimos só com o ambiente.
  }
  return env;
}

const env = carregarEnv();
const OBRIGATORIAS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EVOLUTION_SERVER_URL",
  "OPENAI_API_KEY",
];
const faltando = OBRIGATORIAS.filter((k) => !env[k]);
if (faltando.length) {
  console.error(`Faltam variáveis: ${faltando.join(", ")}`);
  process.exit(1);
}

// Mesmas constantes do app. Duplicadas de propósito: este script roda em Node
// puro, sem o bundler, e não importa de web/lib.
const MODELO = "gpt-4o-mini-transcribe-2025-12-15";
const MAX_TENTATIVAS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const PREFIXO_TEXTO = "Resposta pelo WhatsApp: ";
const MAX_TEXTO_NOTA = 1000;
/** Pausa entre áudios. Não é anti-spam: é o limite de taxa da OpenAI, que foi
    exatamente o que produziu 11 falhas na medição em rajada. */
const PAUSA_MS = 1200;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ehMarcadorAudio = (texto) => /\[(áudio|audio)\]\s*$/.test((texto || "").trim());

/* --- Supabase (REST, sem SDK) ---------------------------------------- */

const sbHeaders = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const sbGet = (caminho) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${caminho}`, { headers: sbHeaders }).then((r) => r.json());

async function sbPatch(caminho, corpo) {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${caminho}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`PATCH ${caminho}: HTTP ${r.status} ${await r.text()}`);
}

/* --- Evolution + OpenAI ---------------------------------------------- */

async function baixarAudio(instancia, token, mensagemId) {
  const r = await fetch(`${env.EVOLUTION_SERVER_URL}/chat/getBase64FromMediaMessage/${instancia}`, {
    method: "POST",
    headers: { apikey: token, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { key: { id: mensagemId } }, convertToMp4: false }),
  });
  if (!r.ok) throw new Error(`mídia indisponível (HTTP ${r.status})`);
  const corpo = await r.json();
  if (!corpo?.base64) throw new Error("mídia sem base64");
  const bytes = Buffer.from(corpo.base64, "base64");
  if (bytes.length > MAX_BYTES) throw new Error(`áudio grande demais (${Math.round(bytes.length / 1024)} KB)`);
  return bytes;
}

async function transcrever(bytes) {
  let ultimoErro = "falha desconhecida";
  for (let n = 1; n <= MAX_TENTATIVAS; n++) {
    if (n > 1) await dormir(1500 * Math.pow(2, n - 2));

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/ogg" }), "audio.ogg");
    form.append("model", MODELO);
    form.append("language", "pt");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });

    if (r.ok) {
      const j = await r.json();
      const texto = (j.text || "").replace(/\s+/g, " ").trim();
      if (!/\p{L}/u.test(texto)) throw new Error("transcrição sem fala");
      return texto;
    }

    // 403 é retentável aqui: a OpenAI o usa para limite de taxa com a mesma
    // mensagem de "modelo sem acesso". Ver o comentário em _transcricao.ts.
    ultimoErro = `HTTP ${r.status}`;
    if (![403, 429].includes(r.status) && r.status < 500) break;
  }
  throw new Error(ultimoErro);
}

/* --- Execução --------------------------------------------------------- */

const instancias = await sbGet("whatsapp_instancias?select=instancia,user_id,token");
if (!Array.isArray(instancias) || instancias.length === 0) {
  console.error("Nenhuma instância de WhatsApp cadastrada.");
  process.exit(1);
}

console.log(APLICAR ? "MODO: aplicando no banco\n" : "MODO: simulação (use --aplicar para gravar)\n");

let total = 0;
let transcritos = 0;
let falhas = 0;

for (const inst of instancias) {
  // SEMPRE por user_id: a service role ignora a RLS e o banco tem mais de uma
  // conta (a real, a de teste do seed e sobras de experimento).
  const imoveis = await sbGet(`imoveis?user_id=eq.${inst.user_id}&select=id,codigo,notas`);
  console.log(`--- instância ${inst.instancia} · ${imoveis.length} imóveis ---`);

  for (const imovel of imoveis) {
    const notas = imovel.notas || [];
    const alvos = notas.filter((n) => String(n.id || "").startsWith("wa:") && ehMarcadorAudio(n.texto));
    if (alvos.length === 0) continue;

    let mudou = false;
    const novas = [...notas];

    for (const nota of alvos) {
      total++;
      const mensagemId = String(nota.id).slice(3);
      const rotulo = `${imovel.codigo || imovel.id} · ${nota.data}`;
      try {
        const bytes = await baixarAudio(inst.instancia, inst.token, mensagemId);
        const texto = await transcrever(bytes);
        const corpo = texto.length > MAX_TEXTO_NOTA ? `${texto.slice(0, MAX_TEXTO_NOTA)}…` : texto;

        const i = novas.findIndex((n) => n.id === nota.id);
        novas[i] = { ...nota, texto: `${PREFIXO_TEXTO}${corpo}` };
        mudou = true;
        transcritos++;
        console.log(`  ✓ ${rotulo}\n    "${corpo.slice(0, 160)}${corpo.length > 160 ? "…" : ""}"`);
      } catch (e) {
        falhas++;
        console.log(`  ✗ ${rotulo} — ${e.message}`);
      }
      await dormir(PAUSA_MS);
    }

    if (mudou && APLICAR) {
      // Update PARCIAL da coluna `notas` — nunca a linha inteira. O upsert do
      // app grava todas as colunas jsonb de uma vez, e usá-lo aqui apagaria
      // tentativas e histórico de status. É a mesma regra do webhook.
      await sbPatch(`imoveis?id=eq.${imovel.id}&user_id=eq.${inst.user_id}`, { notas: novas });
    }
  }
}

console.log("\n================ RESUMO ================");
console.log(`áudios encontrados .. ${total}`);
console.log(`transcritos ......... ${transcritos}`);
console.log(`falharam ............ ${falhas}`);
if (!APLICAR && transcritos > 0) console.log("\nNada foi gravado. Rode com --aplicar para valer.");
