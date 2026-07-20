/* ================================================================
   API: SUGESTÃO E LEITURA POR IA (OpenAI)
   A SEGUNDA rota de servidor do projeto, pelo mesmo motivo da
   primeira: a chave da OpenAI não pode chegar ao browser. Quem
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
import OpenAI from "openai";
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

/** Modelo da OpenAI. A linha "-mini" é o meio-termo custo/qualidade:
    sobe para "gpt-5.4" se a análise sair rasa, desce para "gpt-5.4-nano"
    se o volume crescer e o custo pesar. É a ÚNICA linha a mudar para isso
    — confira o preço atual em platform.openai.com/docs/pricing. */
const MODELO = "gpt-5.4-mini";

/** Teto de tokens da resposta. Nos modelos de raciocínio o orçamento é
    compartilhado entre raciocínio e texto visível, por isso a folga: um
    teto curto demais consome tudo pensando e devolve conteúdo vazio. */
const MAX_TOKENS = 4000;

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
    do servidor; o browser recebe só o motivo classificado.
    Cota esgotada chega como 429 igual a rate limit — daí o "limite
    excedido" cobrir os dois casos; a mensagem pt-BR serve para ambos. */
function classificarErroIa(e: unknown): FalhaIa {
  if (e instanceof OpenAI.RateLimitError) return "limite-excedido";
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError)
    return "nao-configurado";
  return "falha-ia";
}

/** Extrai o texto da resposta.
    Dois casos que não são "deu certo" e precisam virar erro em vez de
    string vazia silenciosa:
    - `refusal`: o modelo se recusou a responder (campo próprio, separado
      do content — ignorá-lo devolveria vazio sem explicação no log).
    - `finish_reason: "length"`: bateu no MAX_TOKENS e o texto veio pela
      metade — no caso dos roteiros o JSON quebra, no da análise sai um
      parágrafo cortado no meio da frase. */
function textoDaResposta(conclusao: OpenAI.Chat.ChatCompletion): string {
  const escolha = conclusao.choices[0];
  if (!escolha) return "";
  if (escolha.message.refusal) {
    console.error("IA: o modelo recusou responder:", escolha.message.refusal);
    return "";
  }
  if (escolha.finish_reason === "length") {
    console.error("IA: resposta truncada em MAX_TOKENS.");
    return "";
  }
  return (escolha.message.content || "").trim();
}

/** A UI precisa saber se vale mostrar os botões de IA. Devolve só um
    booleano — nunca a chave, nem parte dela. Sem sessão exigida de
    propósito: a informação "este ambiente tem IA" não é sensível, e pedir
    token aqui só complicaria o boot. */
export function GET(): Response {
  return Response.json({ configurado: !!process.env.OPENAI_API_KEY });
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
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

  const openai = new OpenAI({ apiKey });

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

    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: "medium",
        // strict: true faz o modelo aderir ao esquema, em vez de "tentar".
        // Exige que todo objeto liste tudo em `required` e traga
        // additionalProperties: false — o ESQUEMA_ROTEIROS já atende.
        response_format: {
          type: "json_schema",
          json_schema: { name: "roteiros", strict: true, schema: ESQUEMA_ROTEIROS },
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
      const dados = JSON.parse(textoDaResposta(conclusao)) as { roteiros?: RoteiroSugerido[] };
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

  let conclusao: OpenAI.Chat.ChatCompletion;
  try {
    conclusao = await openai.chat.completions.create({
      model: MODELO,
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: "medium",
      messages: [{ role: "user", content: promptAnalisarAbordagens(ranking, resumo) }],
    });
  } catch (e) {
    console.error("IA: falha ao analisar abordagens:", e);
    return erro(classificarErroIa(e), 502);
  }

  const texto = textoDaResposta(conclusao);
  if (!texto) return erro("falha-ia", 502);
  const resposta: Resposta = { ok: true, texto };
  return Response.json(resposta);
}
