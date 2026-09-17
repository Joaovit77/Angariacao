/* ================================================================
   LISTAGEM SOMENTE LEITURA — candidatas ao backfill de M1

   Uso, a partir da raiz do repositório:

     npx --yes tsx scripts/listar-backfill-mensagens-disponibilidade.ts --user-id=<uuid>

   O script nunca escreve. Ele lista apenas ids de linhas que satisfazem AO
   MESMO TEMPO os sinais estruturais aprovados:

   1. imóvel e lembrete de disponibilidade do mesmo usuário e mesma data;
   2. texto byte a byte igual ao modelo do sistema renderizado para o imóvel;
   3. lote de pelo menos duas mensagens criado no mesmo segundo.

   Não imprime texto, telefone, nome ou endereço. A escrita do backfill fica
   bloqueada até autorização própria, posterior a esta listagem.
   ================================================================ */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { textoBaseDisponibilidade, textoFollowUp } from "../web/lib/calculo/followup.ts";
import { dataOperacionalDeTimestamp } from "../web/lib/datas.ts";
import type { Imovel } from "../web/lib/tipos.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGUMENTO_USUARIO = process.argv.find((arg) => arg.startsWith("--user-id="));
const USUARIO_ID = ARGUMENTO_USUARIO?.slice("--user-id=".length) || "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (process.argv.includes("--aplicar")) {
  console.error("Este script é somente leitura e não possui modo de aplicação.");
  process.exit(1);
}
if (!UUID.test(USUARIO_ID)) {
  console.error("Informe --user-id com um UUID válido.");
  process.exit(1);
}

function carregarEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    for (const linha of readFileSync(resolve(RAIZ, "web/.env.local"), "utf8").split(/\r?\n/)) {
      if (!linha || linha.startsWith("#") || !linha.includes("=")) continue;
      const separador = linha.indexOf("=");
      const chave = linha.slice(0, separador).trim();
      if (!env[chave]) env[chave] = linha.slice(separador + 1).trim().replace(/^"|"$/g, "");
    }
  } catch {
    // Ambiente explícito é suficiente; o arquivo local é apenas conveniência.
  }
  return env;
}

const env = carregarEnv();
for (const chave of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
  if (!env[chave]) {
    console.error(`Falta a variável ${chave}.`);
    process.exit(1);
  }
}

const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};

async function consultar<T>(recurso: string, parametros: URLSearchParams): Promise<T[]> {
  const itens: T[] = [];
  const tamanhoPagina = 1_000;
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const resposta = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${recurso}?${parametros.toString()}`,
      {
        headers: {
          ...headers,
          "Range-Unit": "items",
          Range: `${inicio}-${inicio + tamanhoPagina - 1}`,
        },
      },
    );
    if (!resposta.ok) throw new Error(`GET ${recurso}: HTTP ${resposta.status}`);
    const pagina = (await resposta.json()) as T[];
    itens.push(...pagina);
    if (pagina.length < tamanhoPagina) return itens;
  }
}

interface LinhaMensagem {
  id: string;
  imovel_id: string | null;
  mensagem: string;
  data_envio: string;
  created_at: string;
}

interface LinhaAgenda {
  id: string;
  imovel_id: string | null;
  date: string;
}

interface LinhaImovel {
  id: string;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  unidade: string | null;
  bloco: string | null;
  edificio: string | null;
  proprietario_nome: string | null;
  status: string;
}

function parametros(select: string, extras: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({ select, user_id: `eq.${USUARIO_ID}`, ...extras });
}

function segundoIso(valor: string): string | null {
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString().slice(0, 19);
}

async function main(): Promise<void> {
  const [mensagens, compromissos, linhasImoveis] = await Promise.all([
    consultar<LinhaMensagem>(
      "mensagens_agendadas",
      parametros("id,imovel_id,mensagem,data_envio,created_at", { tipo: "eq.livre" }),
    ),
    consultar<LinhaAgenda>(
      "agenda",
      parametros("id,imovel_id,date", { is_verificacao_disponibilidade: "eq.true" }),
    ),
    consultar<LinhaImovel>(
      "imoveis",
      parametros("id,endereco,bairro,cidade,unidade,bloco,edificio,proprietario_nome,status"),
    ),
  ]);

  const imoveis = new Map(
    linhasImoveis.map((linha) => [linha.id, {
      id: linha.id,
      endereco: linha.endereco,
      bairro: linha.bairro,
      cidade: linha.cidade,
      unidade: linha.unidade,
      bloco: linha.bloco,
      edificio: linha.edificio,
      proprietarioNome: linha.proprietario_nome,
      status: linha.status,
    } satisfies Imovel]),
  );
  const agendaPorImovelDia = new Map<string, LinhaAgenda[]>();
  for (const compromisso of compromissos) {
    if (!compromisso.imovel_id) continue;
    const chave = `${compromisso.imovel_id}:${compromisso.date}`;
    agendaPorImovelDia.set(chave, [...(agendaPorImovelDia.get(chave) || []), compromisso]);
  }

  const base = textoBaseDisponibilidade();
  const estruturalmenteCompativeis = mensagens.flatMap((mensagem) => {
    if (!mensagem.imovel_id) return [];
    const imovel = imoveis.get(mensagem.imovel_id);
    const data = dataOperacionalDeTimestamp(Date.parse(mensagem.data_envio));
    const segundo = segundoIso(mensagem.created_at);
    if (!imovel || !data || !segundo) return [];
    const agendas = agendaPorImovelDia.get(`${mensagem.imovel_id}:${data}`) || [];
    if (agendas.length !== 1) return [];
    if (mensagem.mensagem !== textoFollowUp(base, imovel)) return [];
    return [{ mensagemId: mensagem.id, agendaId: agendas[0].id, dataEnvio: data, segundo }];
  });

  const tamanhoDosLotes = new Map<string, number>();
  for (const item of estruturalmenteCompativeis) {
    tamanhoDosLotes.set(item.segundo, (tamanhoDosLotes.get(item.segundo) || 0) + 1);
  }

  const candidatas = estruturalmenteCompativeis
    .filter((item) => (tamanhoDosLotes.get(item.segundo) || 0) >= 2)
    .map((item) => ({
      mensagem_id: item.mensagemId,
      agenda_id: item.agendaId,
      data_envio: item.dataEnvio,
      criado_no_segundo: `${item.segundo}Z`,
      tamanho_lote: tamanhoDosLotes.get(item.segundo),
    }));

  console.log(JSON.stringify({ usuario_id: USUARIO_ID, total: candidatas.length, candidatas }, null, 2));
}

void main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : "Falha ao listar candidatas ao backfill.");
  process.exitCode = 1;
});
