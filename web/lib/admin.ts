/* ================================================================
   ADMIN (lado do browser)
   Chama as rotas /api/admin/*, que são quem fala com o banco usando a
   service role — ela nunca chega aqui. Fora de mutacoes.ts pelo mesmo
   motivo de `ia.ts` e `envioWhatsapp.ts`: não é escrita na carteira do
   usuário, é operação do sistema.
   Nunca lança: devolve o resultado ou o motivo da falha.
   ================================================================ */
import type { CorretorAdmin, EventoLog } from "./calculo/admin";
import type { Conexao, EstadoConexao } from "./calculo/conexaoWhatsapp";
import type { GastoIa, MesDeGasto } from "./calculo/custoIa";
import { getSupabase } from "./persistencia/supabase";
import type { ConfiguracaoIa, VersaoConfiguracaoIa } from "./ia/configuracao";

async function autorizacao(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface Cargo {
  /** Tem o cargo de administrador? */
  admin: boolean;
  /** Esta conta trabalha angariação, ou só opera o sistema? */
  operaCarteira: boolean;
}

/** O que se assume enquanto não se sabe: sem cargo, com o painel do
    corretor inteiro. Os dois lados erram para o lado seguro — ver o
    comentário de `api/admin/eu`. */
const NEUTRO: Cargo = { admin: false, operaCarteira: true };

/**
 * O cargo desta conta.
 *
 * Neutro em qualquer dúvida (sem sessão, rota fora do ar, resposta
 * estranha). Esconder o menu é conveniência — a trava está no
 * servidor, e toda rota de admin reconfere.
 */
export async function meuCargo(): Promise<Cargo> {
  const headers = await autorizacao();
  if (!headers) return NEUTRO;
  try {
    const r = await fetch("/api/admin/eu", { headers });
    const dados = (await r.json().catch(() => null)) as {
      admin?: unknown;
      operaCarteira?: unknown;
    } | null;
    if (dados?.admin !== true) return NEUTRO;
    return { admin: true, operaCarteira: dados.operaCarteira !== false };
  } catch {
    return NEUTRO;
  }
}

export interface PainelAdmin {
  ok: boolean;
  mensagem?: string;
  corretores?: CorretorAdmin[];
  /** Gasto de contas já removidas — não pertence a ninguém da lista,
      mas saiu da fatura. */
  orfao?: GastoIa | null;
  desde?: string;
  hoje?: string;
}

export async function carregarPainelAdmin(desde?: string): Promise<PainelAdmin> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const q = desde ? `?desde=${encodeURIComponent(desde)}` : "";
    const r = await fetch(`/api/admin/corretores${q}`, { headers });
    const dados = (await r.json().catch(() => null)) as PainelAdmin | null;
    return dados ?? { ok: false, mensagem: "Não foi possível carregar o painel." };
  } catch {
    return { ok: false, mensagem: "Não foi possível carregar o painel." };
  }
}

export interface RespostaLogs {
  ok: boolean;
  mensagem?: string;
  eventos?: EventoLog[];
}

export async function carregarLogs(
  filtro: { nivel?: string; categoria?: string; userId?: string; limite?: number } = {},
): Promise<RespostaLogs> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  const q = new URLSearchParams();
  if (filtro.nivel) q.set("nivel", filtro.nivel);
  if (filtro.categoria) q.set("categoria", filtro.categoria);
  if (filtro.userId) q.set("userId", filtro.userId);
  if (filtro.limite) q.set("limite", String(filtro.limite));
  try {
    const r = await fetch(`/api/admin/logs?${q.toString()}`, { headers });
    const dados = (await r.json().catch(() => null)) as RespostaLogs | null;
    return dados ?? { ok: false, mensagem: "Não foi possível carregar o log." };
  } catch {
    return { ok: false, mensagem: "Não foi possível carregar o log." };
  }
}

interface RespostaAcao {
  ok: boolean;
  mensagem?: string;
}

async function acao(rota: string, corpo: unknown): Promise<RespostaAcao> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch(rota, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const dados = (await r.json().catch(() => null)) as RespostaAcao | null;
    return dados ?? { ok: false, mensagem: "Não foi possível concluir." };
  } catch {
    return { ok: false, mensagem: "Não foi possível concluir." };
  }
}

export function definirIa(userId: string, liberado: boolean): Promise<RespostaAcao> {
  return acao("/api/admin/ia", { userId, liberado });
}

/** `null` remove o teto. Ausente seria "não mexa" — por isso o
    parâmetro é obrigatório aqui: quem chama esta função está mexendo. */
export function definirTetoIa(userId: string, tetoUsd: number | null): Promise<RespostaAcao> {
  return acao("/api/admin/ia", { userId, tetoUsd });
}

export interface RespostaConfiguracaoIaAdmin {
  ok: boolean;
  mensagem?: string;
  configuracao?: VersaoConfiguracaoIa;
  historico?: VersaoConfiguracaoIa[];
  persistenciaDisponivel?: boolean;
}

/** Configuração global; toda leitura e escrita é revalidada como admin no servidor. */
export async function carregarConfiguracaoIaAdmin(): Promise<RespostaConfiguracaoIaAdmin> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch("/api/admin/ia/configuracao", { headers, cache: "no-store" });
    return (await r.json().catch(() => null)) as RespostaConfiguracaoIaAdmin || {
      ok: false,
      mensagem: "Não foi possível carregar o Centro de IA.",
    };
  } catch {
    return { ok: false, mensagem: "Não foi possível carregar o Centro de IA." };
  }
}

export async function salvarConfiguracaoIaAdmin(
  configuracao: ConfiguracaoIa,
): Promise<RespostaConfiguracaoIaAdmin> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch("/api/admin/ia/configuracao", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(configuracao),
    });
    return (await r.json().catch(() => null)) as RespostaConfiguracaoIaAdmin || {
      ok: false,
      mensagem: "Não foi possível salvar a configuração.",
    };
  } catch {
    return { ok: false, mensagem: "Não foi possível salvar a configuração." };
  }
}

/** Os dois eixos do cargo, cada um opcional. Mandar os dois juntos é
    legítimo (promover alguém já dizendo que ele não opera carteira);
    mandar nenhum é pedido inválido, e a rota recusa. */
export function definirCargo(
  userId: string,
  mudanca: { admin?: boolean; operaCarteira?: boolean },
): Promise<RespostaAcao> {
  return acao("/api/admin/cargo", { userId, ...mudanca });
}

/* ----------------------------------------------------------------
   CONEXÃO DO WHATSAPP
   ---------------------------------------------------------------- */

export interface ConexaoDeCorretor extends Conexao {
  userId: string;
  instancia: string;
}

export interface RespostaConexoes {
  ok: boolean;
  mensagem?: string;
  conexoes?: ConexaoDeCorretor[];
  /** O ambiente não tem Evolution — a lista vazia não significa
      "todo mundo bem". */
  naoConfigurado?: boolean;
}

/** Varre TODAS as instâncias de uma vez, sem pedir QR (ver a rota). */
export async function verificarConexoes(): Promise<RespostaConexoes> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch("/api/admin/conexao", { headers });
    const dados = (await r.json().catch(() => null)) as RespostaConexoes | null;
    return dados ?? { ok: false, mensagem: "Não foi possível consultar as conexões." };
  } catch {
    return { ok: false, mensagem: "Não foi possível consultar as conexões." };
  }
}

/** Uma instância só, COM QR — é a tela em que alguém está reconectando
    aquele número. */
export async function conexaoDoCorretor(userId: string): Promise<Conexao> {
  const headers = await autorizacao();
  if (!headers) return { estado: "falha" };
  try {
    const r = await fetch(`/api/admin/conexao?userId=${encodeURIComponent(userId)}`, { headers });
    const dados = (await r.json().catch(() => null)) as (Conexao & { ok?: boolean }) | null;
    if (!dados?.estado) return { estado: "falha" };
    return { estado: dados.estado as EstadoConexao, qr: dados.qr ?? null, numero: dados.numero ?? null };
  } catch {
    return { estado: "falha" };
  }
}

/* ----------------------------------------------------------------
   SÉRIE MENSAL DE IA E AMBIENTE
   ---------------------------------------------------------------- */

export interface RespostaHistoricoIa {
  ok: boolean;
  mensagem?: string;
  meses?: number;
  total?: MesDeGasto[];
  historico?: { userId: string; serie: MesDeGasto[] }[];
}

export async function carregarHistoricoIa(meses?: number): Promise<RespostaHistoricoIa> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const q = meses ? `?meses=${meses}` : "";
    const r = await fetch(`/api/admin/ia${q}`, { headers });
    const dados = (await r.json().catch(() => null)) as RespostaHistoricoIa | null;
    return dados ?? { ok: false, mensagem: "Não foi possível carregar o histórico." };
  } catch {
    return { ok: false, mensagem: "Não foi possível carregar o histórico." };
  }
}

export interface CapacidadeAmbiente {
  chave: string;
  nome: string;
  variavel: string;
  configurado: boolean;
  semEla: string;
  essencial: boolean;
}

export interface RespostaAmbiente {
  ok: boolean;
  mensagem?: string;
  capacidades?: CapacidadeAmbiente[];
}

export interface UsoFirecrawlAdmin {
  creditosDisponiveis: number;
  creditosDoPlano: number;
  creditosConsumidos: number;
  percentualConsumido: number;
  inicioCiclo: string | null;
  fimCiclo: string | null;
}

export interface RespostaUsoFirecrawlAdmin {
  ok: boolean;
  configurado?: boolean;
  mensagem?: string;
  uso?: UsoFirecrawlAdmin;
}

/** Saldo global da chave Firecrawl do deploy, disponível apenas para admins. */
export async function carregarUsoFirecrawl(): Promise<RespostaUsoFirecrawlAdmin> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch("/api/admin/firecrawl", { headers, cache: "no-store" });
    const dados = (await r.json().catch(() => null)) as RespostaUsoFirecrawlAdmin | null;
    return dados ?? { ok: false, mensagem: "Não foi possível consultar o Firecrawl." };
  } catch {
    return { ok: false, mensagem: "Não foi possível consultar o Firecrawl." };
  }
}

export async function carregarAmbiente(): Promise<RespostaAmbiente> {
  const headers = await autorizacao();
  if (!headers) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
  try {
    const r = await fetch("/api/admin/ambiente", { headers });
    const dados = (await r.json().catch(() => null)) as RespostaAmbiente | null;
    return dados ?? { ok: false, mensagem: "Não foi possível ler a configuração." };
  } catch {
    return { ok: false, mensagem: "Não foi possível ler a configuração." };
  }
}

/** Token em branco mantém o que já está gravado (a rota trata isso) —
    é o caso de quem só está corrigindo o nome da instância. */
export function salvarInstancia(userId: string, instancia: string, token: string): Promise<RespostaAcao> {
  return acao("/api/admin/instancia", { userId, instancia, token });
}

/** Cria/recupera somente a instância fixa `corretora`; o servidor é
    quem conhece nome, número original e credenciais globais. */
export function provisionarWhatsappCorretora(userId: string): Promise<RespostaAcao> {
  return acao("/api/admin/instancia", { userId, modo: "corretora" });
}
