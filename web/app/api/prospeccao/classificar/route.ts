/* ----------------------------------------------------------------
   POST /api/prospeccao/classificar — classificação de UM avistamento (§19 da V7).

   Corpo: `{ avistamentoId }`, e nada mais. A identidade vem de
   `auth.getUser()`; a observação e a revisão são RELIDAS DO BANCO sob a
   RLS do chamador — texto enviado pelo browser nunca chega ao modelo. A
   service role entra só para as RPCs do modelo Servidor (`iniciar`,
   `concluir`, `falhar`), com `p_user_id` da sessão.

   IA real só existe onde a trava de ambiente libera (Production da Vercel
   ou opt-in local). Em dev, Preview e CI o executor é `null`, o run termina
   `indisponivel` e a tela diz "aguardando classificação" — comportamento
   correto, não bug. Nenhum bypass, nenhum fallback escondido.

   Respostas: `{ ok, estado, modo, etiquetas, tipo, snapshotAplicado }` |
   `{ ok:true, repetida:true }` | `{ ok:false, falha }`.
   ---------------------------------------------------------------- */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  AvistamentoNaoEncontradoError,
  classificarAvistamento,
  tetoDiarioClassificacao,
  type FalhaClassificacao,
  type RespostaClassificacao,
} from "@/lib/servidor/classificacaoProspeccao";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { clienteDoChamador, tokenDaRequisicao } from "@/lib/servidor/iaAcesso";
import { carregarConfiguracaoIa } from "@/lib/servidor/ia/configuracao";
import { criarExecutorOpenAI, type ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { chamadaOpenAIRealAutorizada, criarClienteOpenAIReal } from "@/lib/servidor/openai-real";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Um UUID cabe folgadamente aqui; corpo maior é recusado sem ler. */
const LIMITE_CORPO_BYTES = 512;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_POR_FALHA: Record<FalhaClassificacao, number> = {
  "nao-configurado": 503,
  "sem-permissao": 403,
  "sessao-expirada": 401,
  "requisicao-invalida": 400,
  "sem-dados": 422,
  "intervencao-humana": 422,
  "historico-insuficiente": 422,
  "contexto-incompleto": 422,
  "baixa-confianca": 422,
  "geracao-reprovada": 422,
  "protocolo-inadequado": 422,
  "falha-carregamento-contexto": 502,
  "falha-modelo": 502,
  "limite-excedido": 429,
  "falha-ia": 502,
  "limite-diario": 429,
  ocupado: 409,
  "exclusao-em-andamento": 409,
};

function responder(corpo: RespostaClassificacao, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function falha(falha: FalhaClassificacao, status = STATUS_POR_FALHA[falha]): Response {
  return responder({ ok: false, falha }, status);
}

function avistamentoDoCorpo(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  if (Object.keys(corpo).length !== 1) return null;
  const { avistamentoId } = corpo as Record<string, unknown>;
  return typeof avistamentoId === "string" && UUID.test(avistamentoId) ? avistamentoId : null;
}

function clienteDeServico(url: string): SupabaseClient | null {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * O executor canônico, ou `null` onde a IA real não pode existir. A decisão
 * é exclusivamente de `chamadaOpenAIRealAutorizada` (docs/IA-AMBIENTES.md):
 * esta rota não a relê, não a contorna e não cria cliente por fora.
 */
function executorSeAutorizado(
  userId: string,
  rota: Parameters<typeof criarExecutorOpenAI>[2],
): ExecutorOpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !chamadaOpenAIRealAutorizada()) return null;
  return criarExecutorOpenAI(criarClienteOpenAIReal({ apiKey }), userId, rota);
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = tokenDaRequisicao(request);
  if (!url || !anon || !token) return falha("sessao-expirada");

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_CORPO_BYTES) return falha("requisicao-invalida", 413);
  const avistamentoId = avistamentoDoCorpo(await request.json().catch(() => null));
  if (!avistamentoId) return falha("requisicao-invalida");

  const chamador = clienteDoChamador(url, anon, token);
  const { data, error } = await chamador.auth.getUser();
  if (error || !data.user) return falha("sessao-expirada");
  const userId = data.user.id;

  const servico = clienteDeServico(url);
  if (!servico) {
    console.error("Garimpo: SUPABASE_SERVICE_ROLE_KEY ausente (ver DEPLOY.md).");
    return falha("nao-configurado");
  }

  try {
    const configuracao = await carregarConfiguracaoIa();
    const resposta = await classificarAvistamento(
      {
        chamador,
        servico,
        userId,
        executor: executorSeAutorizado(userId, configuracao.classificacao),
        configuracao,
        // 200 execuções com modelo por usuário por dia operacional, contadas
        // em `ia_uso` no servidor; o dia vira à meia-noite do fuso canônico.
        tetoDiario: tetoDiarioClassificacao(),
      },
      avistamentoId,
    );
    if (resposta.ok) return responder(resposta);
    return falha(resposta.falha);
  } catch (e) {
    // Alheio e inexistente respondem igual: a RLS não devolveu a linha.
    if (e instanceof AvistamentoNaoEncontradoError) return falha("requisicao-invalida", 404);
    console.error("Garimpo: falha na classificação:", sanitizarErroExterno(e, "consultarSupabase"));
    return falha("falha-ia");
  }
}
