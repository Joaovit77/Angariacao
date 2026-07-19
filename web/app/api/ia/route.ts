/* ================================================================
   API: SUGESTÃO E LEITURA POR IA (Claude)
   A SEGUNDA rota de servidor do projeto, pelo mesmo motivo da
   primeira: a chave da Anthropic não pode chegar ao browser. Quem
   tivesse a chave gastaria na nossa conta à vontade.

   Contrato: POST + Authorization: Bearer <access_token do Supabase>
     { tipo: "sugerir-roteiros", contexto?: ContextoRoteiro }
     { tipo: "analisar-abordagens" }
   Responde { ok: true, ... } ou { ok: false, falha: FalhaIa }.

   DUAS regras que dão forma a esta rota:

   1. **O prompt é montado aqui, nunca recebido do browser.** O cliente
      manda no máximo um contexto curto e tipado (lib/calculo/ia.ts
      trunca cada campo). Aceitar texto livre transformaria isto num
      proxy de LLM aberto, pago por nós — o análogo exato do "o
      destinatário sai do banco" da rota do WhatsApp.

   2. **Os números da análise saem do banco, não do cliente.** A rota
      relê os imóveis com o token de quem chamou (o RLS escopa ao dono)
      e roda o MESMO cálculo puro da tela (calculo/abordagens.ts). Se o
      browser mandasse o ranking pronto, a análise poderia ser feita em
      cima de números forjados — e ninguém notaria, porque o texto sai
      bem escrito de qualquer jeito.
   ================================================================ */
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { desempenhoPorAbordagem, resumoTentativas } from "@/lib/calculo/abordagens";
import {
  ESQUEMA_ROTEIROS,
  mensagemFalhaIa,
  promptAnalisarAbordagens,
  promptSugerirRoteiros,
  type ContextoRoteiro,
  type FalhaIa,
  type RoteiroSugerido,
} from "@/lib/calculo/ia";
import { fromDbAbordagem, fromDbImovel, type DbAbordagemRow, type DbImovelRow } from "@/lib/persistencia/mapeadores";

/** Opus 4.8 — o modelo mais capaz da linha Opus. Trocar por
    "claude-sonnet-5" corta o custo por token se o volume crescer. */
const MODELO = "claude-opus-4-8";

interface Resposta {
  ok: boolean;
  falha?: FalhaIa;
  mensagem?: string;
  /** tipo "sugerir-roteiros" */
  roteiros?: RoteiroSugerido[];
  /** tipo "analisar-abordagens" */
  texto?: string;
}

function erro(falha: FalhaIa, status: number): Response {
  const corpo: Resposta = { ok: false, falha, mensagem: mensagemFalhaIa(falha) };
  return Response.json(corpo, { status });
}

/** Traduz a falha do SDK para o nosso vocabulário. O detalhe fica no log
    do servidor; o browser recebe só o motivo classificado. */
function classificarErroIa(e: unknown): FalhaIa {
  if (e instanceof Anthropic.RateLimitError) return "limite-excedido";
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return "nao-configurado";
  return "falha-ia";
}

/** Extrai o texto da resposta. `content` é uma união — sem estreitar por
    `.type`, um bloco de thinking viria no lugar da resposta. */
function textoDaResposta(mensagem: Anthropic.Message): string {
  return mensagem.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!apiKey || !supabaseUrl || !anonKey) {
    console.error("IA: variáveis de ambiente ausentes (ver web/.env.example).");
    return erro("nao-configurado", 503);
  }

  // 1. Quem está chamando? Sem sessão do Supabase a rota não existe — senão
  //    qualquer um na internet gastaria nossa cota de tokens.
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return erro("sessao-expirada", 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || !sessao.user) return erro("sessao-expirada", 401);

  // 2. Corpo — só os dois tipos conhecidos.
  let corpo: { tipo?: unknown; contexto?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }
  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  if (tipo !== "sugerir-roteiros" && tipo !== "analisar-abordagens") {
    return erro("requisicao-invalida", 400);
  }

  const anthropic = new Anthropic({ apiKey });

  // ---------------------------------------------------------------
  // 3a. Sugerir roteiros — o contexto vem do browser, mas só os campos
  //     que conhecemos, e o promptSugerirRoteiros trunca cada um.
  // ---------------------------------------------------------------
  if (tipo === "sugerir-roteiros") {
    const bruto = (corpo.contexto ?? {}) as Record<string, unknown>;
    const texto = (chave: string) => (typeof bruto[chave] === "string" ? (bruto[chave] as string) : null);
    const contexto: ContextoRoteiro = {
      tipoImovel: texto("tipoImovel"),
      bairro: texto("bairro"),
      situacao: texto("situacao"),
      canal: texto("canal"),
    };

    let mensagem: Anthropic.Message;
    try {
      mensagem = await anthropic.messages.create({
        model: MODELO,
        max_tokens: 2000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: ESQUEMA_ROTEIROS },
        },
        messages: [{ role: "user", content: promptSugerirRoteiros(contexto) }],
      });
    } catch (e) {
      console.error("IA: falha ao sugerir roteiros:", e);
      return erro(classificarErroIa(e), 502);
    }

    // Segurança de exibição: o structured output garante o formato, mas se a
    // resposta vier truncada (max_tokens) o JSON quebra — melhor um erro
    // claro do que meia sugestão.
    try {
      const dados = JSON.parse(textoDaResposta(mensagem)) as { roteiros?: RoteiroSugerido[] };
      const roteiros = (dados.roteiros || []).filter(
        (r) => r && typeof r.nome === "string" && typeof r.roteiro === "string",
      );
      if (roteiros.length === 0) return erro("falha-ia", 502);
      const resposta: Resposta = { ok: true, roteiros };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: resposta de roteiros não veio parseável:", e);
      return erro("falha-ia", 502);
    }
  }

  // ---------------------------------------------------------------
  // 3b. Analisar abordagens — os números saem do BANCO e do mesmo
  //     cálculo puro da tela. O browser não manda nada.
  // ---------------------------------------------------------------
  const [imRes, abRes] = await Promise.all([
    supabase.from("imoveis").select("*"),
    supabase.from("abordagens").select("*"),
  ]);
  if (imRes.error || abRes.error) {
    console.error("IA: falha ao ler os dados:", imRes.error?.message || abRes.error?.message);
    return erro("falha-ia", 500);
  }

  const imoveis = ((imRes.data || []) as DbImovelRow[]).map(fromDbImovel);
  const abordagens = ((abRes.data || []) as DbAbordagemRow[]).map(fromDbAbordagem);
  const ranking = desempenhoPorAbordagem(imoveis, abordagens);
  const resumo = resumoTentativas(imoveis);
  // Sem tentativa com roteiro não há o que interpretar — e pedir análise de
  // uma tabela vazia só produziria texto genérico convincente.
  if (ranking.length === 0) return erro("sem-dados", 422);

  let mensagem: Anthropic.Message;
  try {
    mensagem = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: promptAnalisarAbordagens(ranking, resumo) }],
    });
  } catch (e) {
    console.error("IA: falha ao analisar abordagens:", e);
    return erro(classificarErroIa(e), 502);
  }

  const texto = textoDaResposta(mensagem);
  if (!texto) return erro("falha-ia", 502);
  const resposta: Resposta = { ok: true, texto };
  return Response.json(resposta);
}
