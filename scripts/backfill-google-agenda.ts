/* ================================================================
   BACKFILL — leva ao Google Agenda os compromissos que ficaram para trás

   O espelhamento passou a valer para os CINCO caminhos em que o app cria
   compromisso sozinho, mas só DAQUI PRA FRENTE. O que já estava no banco
   continua sem `google_event_id`, e continua invisível no celular: em
   03/08/2026 eram 14 compromissos futuros em aberto na carteira real,
   de hoje até 29/09 — inclusive uma visita das 11h daquele mesmo dia,
   cuja hora a própria proprietária havia combinado por escrito.

   SÓ FUTURO E SÓ EM ABERTO. Compromisso de ontem não tem lembrete para
   tocar, e criar hoje um evento com "✓" numa data que já passou é
   arqueologia, não agenda — encheria o calendário do corretor com dezenas
   de eventos que ele nunca vai abrir. A integração existe para o telefone
   apitar na hora certa; o que não pode mais apitar, fica onde está.

   IDEMPOTENTE: só toca linha cujo `google_event_id` ainda é nulo. Rodar
   duas vezes não cria evento duplicado.

   Uso (a partir da raiz do repositório):

     node scripts/backfill-google-agenda.ts              # simulação
     node scripts/backfill-google-agenda.ts --aplicar    # grava
     node scripts/backfill-google-agenda.ts --agenda-id=<uuid> --aplicar
                                                       # grava só um item

   Lê as credenciais de web/.env.local (ou das variáveis de ambiente).
   Precisa da SUPABASE_SERVICE_ROLE_KEY: o script roda fora do app, sem
   sessão, e a RLS não vale aqui. O `user_id` NUNCA vem de argumento — ele
   sai de `google_contas`, uma linha por conta conectada, e toda consulta
   seguinte é filtrada por ele. É a mesma regra do webhook e da rota de
   envio, pela mesma razão: aqui o banco tem mais de um dono.

   Diferente do backfill de transcrição, este NÃO reescreve as constantes
   do app: ele importa `eventoDoCompromisso` de web/lib e monta o evento
   com o mesmo código que a rota usa (o Node 24 executa TypeScript direto).
   Não é preciosismo — se o evento saísse daqui com outro formato, os 14
   antigos ficariam diferentes dos novos no calendário, e a divergência só
   apareceria olhando o celular.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eventoDoCompromisso } from "../web/lib/calculo/googleAgenda.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APLICAR = process.argv.includes("--aplicar");
const ARGUMENTO_AGENDA_ID = process.argv.find((arg) => arg.startsWith("--agenda-id="));
const AGENDA_ID = ARGUMENTO_AGENDA_ID?.slice("--agenda-id=".length) || null;

if (AGENDA_ID && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(AGENDA_ID)) {
  console.error("O valor de --agenda-id precisa ser um UUID válido.");
  process.exit(1);
}

/* --- Configuração ---------------------------------------------------- */

function carregarEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
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
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];
const faltando = OBRIGATORIAS.filter((k) => !env[k]);
if (faltando.length) {
  console.error(`Faltam variáveis: ${faltando.join(", ")}`);
  process.exit(1);
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

/* --- Supabase (REST, sem SDK) ----------------------------------------
   Node puro, e o node_modules vive em web/. REST evita a resolução. */

const sbHeaders = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet<T>(caminho: string): Promise<T> {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${caminho}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`GET ${caminho}: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

async function sbPatch(caminho: string, corpo: unknown): Promise<void> {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${caminho}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`PATCH ${caminho}: HTTP ${r.status} ${await r.text()}`);
}

/* --- Google ----------------------------------------------------------- */

async function accessToken(refreshToken: string): Promise<string> {
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const corpo = (await r.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!r.ok || !corpo?.access_token) {
    // A armadilha do modo "Teste": passados 7 dias o refresh token morre e o
    // Google responde invalid_grant. Não adianta insistir nos outros 13.
    const detalhe = corpo?.error === "invalid_grant"
      ? "invalid_grant — a autorização expirou (tela de consentimento em modo Teste?). Reconecte em Configurações."
      : `HTTP ${r.status} ${corpo?.error || ""}`;
    throw new Error(detalhe);
  }
  return corpo.access_token;
}

/* --- Linhas do banco -------------------------------------------------- */

interface LinhaAgenda {
  id: string;
  title: string | null;
  type: string | null;
  date: string;
  hora: string | null;
  done: boolean;
  notes: string | null;
  imovel_id: string | null;
  is_verificacao_disponibilidade: boolean;
}

interface LinhaImovel {
  id: string;
  codigo: string | null;
  referencia_crm: string | null;
  proprietario_nome: string | null;
  proprietario_telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
}

/** O de-para mínimo para o construtor de evento. Não usa `fromDbAgenda` de
    propósito: aquele módulo importa outros sem extensão explícita, o que o
    Node não resolve. Os campos abaixo são exatamente os que
    `eventoDoCompromisso` lê — o resto do tipo não entra na conta. */
function paraItem(l: LinhaAgenda) {
  return {
    id: l.id,
    title: l.title || "",
    type: l.type || "",
    date: l.date,
    hora: l.hora,
    done: l.done,
    notes: l.notes,
    imovelId: l.imovel_id,
    isVerificacaoDisponibilidade: l.is_verificacao_disponibilidade,
  };
}

function paraImovel(l: LinhaImovel) {
  return {
    id: l.id,
    codigo: l.codigo,
    referenciaCrm: l.referencia_crm,
    proprietarioNome: l.proprietario_nome,
    proprietarioTelefone: l.proprietario_telefone,
    endereco: l.endereco,
    bairro: l.bairro,
    cidade: l.cidade,
  };
}

/* --- O trabalho ------------------------------------------------------- */

function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

async function main(): Promise<void> {
  const hoje = hojeISO();
  console.log(`Backfill do Google Agenda — ${APLICAR ? "APLICANDO" : "simulação"} (hoje: ${hoje})\n`);

  const contas = await sbGet<{ user_id: string; refresh_token: string; calendar_id: string | null; email: string | null }[]>(
    "google_contas?select=user_id,refresh_token,calendar_id,email",
  );
  if (contas.length === 0) {
    console.log("Nenhuma conta do Google conectada. Nada a fazer.");
    return;
  }

  let criados = 0;
  let falhas = 0;

  for (const conta of contas) {
    const calendarId = conta.calendar_id || "primary";
    console.log(`Conta ${conta.email || conta.user_id} (agenda: ${calendarId})`);

    const pendentes = await sbGet<LinhaAgenda[]>(
      `agenda?select=id,title,type,date,hora,done,notes,imovel_id,is_verificacao_disponibilidade` +
        `&user_id=eq.${conta.user_id}&google_event_id=is.null&done=is.false&date=gte.${hoje}` +
        (AGENDA_ID ? `&id=eq.${AGENDA_ID}` : "") +
        `&order=date.asc`,
    );
    if (pendentes.length === 0) {
      console.log("  Nada pendente.\n");
      continue;
    }
    console.log(`  ${pendentes.length} compromisso(s) sem evento no Google:\n`);

    let token = "";
    if (APLICAR) {
      try {
        token = await accessToken(conta.refresh_token);
      } catch (e) {
        // Falha de autorização vale para todos os compromissos desta conta —
        // insistir 14 vezes só produziria 14 linhas iguais de erro.
        console.error(`  Não foi possível autenticar no Google: ${(e as Error).message}\n`);
        falhas += pendentes.length;
        continue;
      }
    }

    for (const linha of pendentes) {
      const item = paraItem(linha);
      let imovel = null;
      if (linha.imovel_id) {
        const achados = await sbGet<LinhaImovel[]>(
          `imoveis?select=id,codigo,referencia_crm,proprietario_nome,proprietario_telefone,endereco,bairro,cidade` +
            `&id=eq.${linha.imovel_id}&user_id=eq.${conta.user_id}`,
        );
        if (achados[0]) imovel = paraImovel(achados[0]);
      }

      // O mesmo construtor que a rota usa. Ver o cabeçalho.
      const evento = eventoDoCompromisso(
        item as Parameters<typeof eventoDoCompromisso>[0],
        imovel as Parameters<typeof eventoDoCompromisso>[1],
      );
      const quando = linha.hora ? `${linha.date} ${linha.hora}` : `${linha.date} (dia inteiro)`;

      if (!APLICAR) {
        console.log(`  · ${quando} — ${evento.summary}`);
        continue;
      }

      try {
        const r = await fetch(
          `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(evento),
          },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 200)}`);
        const criado = (await r.json()) as { id?: string };
        if (!criado.id) throw new Error("o Google não devolveu id do evento");

        // Guarda o ponteiro. Sem ele o próximo salvamento criaria um DUPLICADO,
        // e o backfill deixaria de ser idempotente.
        await sbPatch(`agenda?id=eq.${linha.id}&user_id=eq.${conta.user_id}`, {
          google_event_id: criado.id,
        });
        criados++;
        console.log(`  ✓ ${quando} — ${evento.summary}`);
      } catch (e) {
        falhas++;
        console.error(`  ✗ ${quando} — ${evento.summary}: ${(e as Error).message}`);
      }
    }
    console.log("");
  }

  if (APLICAR) {
    console.log(`Concluído: ${criados} evento(s) criado(s), ${falhas} falha(s).`);
  } else {
    console.log("Simulação. Rode com --aplicar para criar os eventos no Google.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
