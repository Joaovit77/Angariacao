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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { desempenhoPorAbordagem, resumoTentativas } from "@/lib/calculo/abordagens";
import { kpisDashboard } from "@/lib/calculo/dashboard";
import { planoDoDia } from "@/lib/calculo/planoDia";
import { todayISO } from "@/lib/datas";
import {
  ESQUEMA_ANUNCIO,
  ESQUEMA_RASCUNHO,
  ESQUEMA_ROTEIROS,
  contagemPorStatus,
  corrigirMarcadores,
  mensagemFalhaIa,
  panoramaDoDia,
  promptAnalisarAbordagens,
  promptAnalisarDashboard,
  promptExplicarFoco,
  promptExtrairAnuncio,
  promptRascunharResposta,
  promptResumoDia,
  promptSugerirRoteiros,
  type AnuncioExtraido,
  type ContextoRoteiro,
  type FalhaIa,
  type RoteiroSugerido,
} from "@/lib/calculo/ia";
import { corpoDaResposta, ehSoMidia } from "@/lib/calculo/notas";
import { respostasDoImovel } from "@/lib/calculo/respostas";
import {
  fromDbAbordagem,
  fromDbAgenda,
  fromDbImovel,
  type DbAbordagemRow,
  type DbAgendaRow,
  type DbImovelRow,
  type DbUserConfigRow,
} from "@/lib/persistencia/mapeadores";

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
  /** tipo "extrair-anuncio" */
  anuncio?: AnuncioExtraido;
  /** tipo "rascunhar-resposta" */
  rascunho?: string;
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

/** Cliente do Supabase com a identidade de QUEM CHAMOU — o RLS escopa
    tudo ao dono do token. Nunca usar service role aqui: é o que faz a
    rota ler apenas os dados de quem pediu. */
function clienteDoChamador(supabaseUrl: string, anonKey: string, accessToken: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Extrai o access token do header. Vazio quando não veio. */
function tokenDaRequisicao(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

/** Esta conta pode usar a IA?

    A permissão vive em `ia_permissoes`, que o usuário LÊ mas não escreve
    (ver supabase-schema.sql: existe política de select e nenhuma de
    escrita). Por isso dá para confiar no que a leitura devolve.

    Ausência de linha = sem acesso. O padrão é negar: uma conta nova não
    ganha IA por descuido, e revogar é apagar a linha. */
async function podeUsarIa(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ia_permissoes")
    .select("liberado")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Falha de leitura não libera — na dúvida, nega.
    console.error("IA: falha ao ler a permissão:", error.message);
    return false;
  }
  return data?.liberado === true;
}

/** A UI precisa saber se vale mostrar os botões de IA. Duas condições
    independentes: o ambiente tem chave E esta conta tem acesso.

    Passou a exigir o token (antes era público) porque a resposta agora é
    POR USUÁRIO. Sem token responde `permitido: false` em vez de 401: o
    boot do app não deve quebrar por causa disto, e a UI só precisa saber
    se esconde os botões. Quem vale mesmo é a checagem do POST. */
export async function GET(request: Request): Promise<Response> {
  const configurado = !!process.env.OPENAI_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = tokenDaRequisicao(request);

  if (!configurado || !supabaseUrl || !anonKey || !accessToken) {
    return Response.json({ configurado, permitido: false });
  }

  const supabase = clienteDoChamador(supabaseUrl, anonKey, accessToken);
  const { data: sessao, error } = await supabase.auth.getUser();
  if (error || !sessao.user) return Response.json({ configurado, permitido: false });

  return Response.json({ configurado, permitido: await podeUsarIa(supabase, sessao.user.id) });
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
  const accessToken = tokenDaRequisicao(request);
  if (!accessToken) return erro("sessao-expirada", 401);

  const supabase = clienteDoChamador(supabaseUrl, anonKey, accessToken);
  const { data: sessao, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || !sessao.user) return erro("sessao-expirada", 401);

  // 2. Esta conta pode usar a IA? A checagem mora AQUI, não na UI: o botão
  //    escondido é conveniência, e quem souber o endereço chama a rota
  //    direto. Sem isto, qualquer usuário autenticado gastaria tokens.
  if (!(await podeUsarIa(supabase, sessao.user.id))) return erro("sem-permissao", 403);

  // 3. Corpo — só os tipos conhecidos.
  let corpo: { tipo?: unknown; contexto?: unknown; texto?: unknown; imovelId?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }
  const TIPOS = ["sugerir-roteiros", "analisar-abordagens", "analisar-dashboard", "resumo-dia", "explicar-foco", "extrair-anuncio", "rascunhar-resposta"] as const;
  type Tipo = (typeof TIPOS)[number];
  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  if (!(TIPOS as readonly string[]).includes(tipo)) return erro("requisicao-invalida", 400);
  const pedido = tipo as Tipo;

  const openai = new OpenAI({ apiKey });

  // ---------------------------------------------------------------
  // 3a. Sugerir roteiros — o contexto vem do browser, mas só os campos
  //     que conhecemos, e o promptSugerirRoteiros trunca cada um.
  // ---------------------------------------------------------------
  if (pedido === "sugerir-roteiros") {
    const bruto = (corpo.contexto ?? {}) as Record<string, unknown>;
    const texto = (chave: string) => (typeof bruto[chave] === "string" ? (bruto[chave] as string) : null);
    const contexto: ContextoRoteiro = {
      tipoImovel: texto("tipoImovel"),
      bairro: texto("bairro"),
      situacao: texto("situacao"),
      canal: texto("canal"),
      captador: texto("captador"),
      empresa: texto("empresa"),
    };

    // Nomes já cadastrados (ativos), para a IA não devolver o mesmo ângulo
    // com outras palavras — a reclamação de quem gera duas vezes. Vêm do
    // BANCO, não do browser; erro aqui não impede a sugestão, só perde a
    // proteção contra repetição.
    const { data: abData, error: abErro } = await supabase
      .from("abordagens")
      .select("nome, arquivada")
      .order("created_at", { ascending: false });
    if (abErro) console.error("IA: falha ao ler abordagens existentes:", abErro.message);
    const nomesExistentes = ((abData || []) as { nome: string; arquivada: boolean | null }[])
      .filter((a) => !a.arquivada && typeof a.nome === "string" && a.nome.trim() !== "")
      .map((a) => a.nome);

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
        messages: [{ role: "user", content: promptSugerirRoteiros(contexto, nomesExistentes) }],
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
      const roteiros = (dados.roteiros || [])
        .filter((r) => r && typeof r.nome === "string" && typeof r.roteiro === "string")
        // Rede contra o {imovel} escapado — ver corrigirMarcadores.
        .map((r) => ({ ...r, roteiro: corrigirMarcadores(r.roteiro) }));
      if (roteiros.length === 0) return erro("falha-ia", 502);
      const resposta: Resposta = { ok: true, roteiros };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: resposta de roteiros não veio parseável:", e);
      return erro("falha-ia", 502);
    }
  }

  // ---------------------------------------------------------------
  // 3a-bis. Extrair anúncio COLADO — a captura rápida do garimpo.
  //
  //   É a ÚNICA chamada em que o browser manda conteúdo (o texto do
  //   anúncio) em vez de um contexto curto e tipado, então vale
  //   repetir o que a segura (ver o bloco em lib/calculo/ia.ts): o
  //   prompt e o esquema saem daqui, a resposta é um objeto fechado —
  //   não texto livre —, a conta já passou pela allowlist de IA, e o
  //   teto do texto limita o custo. O que ela devolve preenche um
  //   formulário; quem salva é o corretor, depois de conferir.
  //
  //   Não aceita imagem, e isso foi uma decisão tomada com o recurso
  //   já pronto: ver o bloco em lib/calculo/ia.ts.
  // ---------------------------------------------------------------
  if (pedido === "extrair-anuncio") {
    const texto = typeof corpo.texto === "string" ? corpo.texto : "";

    // Sem material não há o que ler.
    if (!texto.trim()) return erro("requisicao-invalida", 400);

    // O prompt trunca o texto.
    const conteudo: OpenAI.Chat.ChatCompletionContentPart[] = [
      // A data de hoje entra para o modelo conseguir converter "publicado em
      // 10/07" na idade do anúncio. Vem do servidor, não do browser: é o mesmo
      // princípio do resto da rota — o cliente manda conteúdo, não contexto.
      { type: "text", text: promptExtrairAnuncio(texto, todayISO()) },
    ];

    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: "medium",
        response_format: {
          type: "json_schema",
          json_schema: { name: "anuncio", strict: true, schema: ESQUEMA_ANUNCIO },
        },
        messages: [{ role: "user", content: conteudo }],
      });
    } catch (e) {
      console.error("IA: falha ao extrair o anúncio:", e);
      return erro(classificarErroIa(e), 502);
    }

    try {
      const anuncio = JSON.parse(textoDaResposta(conclusao)) as AnuncioExtraido;
      const resposta: Resposta = { ok: true, anuncio };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: resposta da extração não veio parseável:", e);
      return erro("falha-ia", 502);
    }
  }

  // ---------------------------------------------------------------
  // 3a-ter. Rascunhar a resposta ao proprietário (camada 2 da caixa de
  //   respostas). O "respondeu" genérico não tem réplica pronta porque
  //   depende de LER a mensagem — a IA lê e devolve um rascunho editável.
  //
  //   O texto da mensagem NÃO vem do browser: relemos a nota que o webhook
  //   gravou, com o token de quem chamou (RLS escopa ao dono). É a forma
  //   mais forte da regra "o conteúdo sai do banco" — o cliente manda só o
  //   imovelId, e nem o alvo do rascunho ele escolhe.
  // ---------------------------------------------------------------
  if (pedido === "rascunhar-resposta") {
    const imovelId = typeof corpo.imovelId === "string" ? corpo.imovelId : "";
    if (!imovelId) return erro("requisicao-invalida", 400);

    const { data: imRow, error: imErr } = await supabase
      .from("imoveis")
      .select("*")
      .eq("id", imovelId)
      .maybeSingle();
    if (imErr) {
      console.error("IA: falha ao ler o imóvel para rascunho:", imErr.message);
      return erro("falha-ia", 500);
    }
    // Sem imóvel (id inválido ou de outro dono, barrado pelo RLS) ou sem
    // mensagem com texto para responder: não há o que rascunhar.
    if (!imRow) return erro("sem-dados", 422);
    const imovel = fromDbImovel(imRow as DbImovelRow);

    const comTexto = respostasDoImovel(imovel).filter((n) => !ehSoMidia(n.texto));
    const ultima = comTexto[comTexto.length - 1];
    const mensagemProp = ultima ? corpoDaResposta(ultima.texto) : "";
    if (!mensagemProp.trim()) return erro("sem-dados", 422);

    const ref = [imovel.endereco, imovel.bairro].map((s) => (s || "").trim()).filter(Boolean).join(", ");

    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: "low",
        response_format: {
          type: "json_schema",
          json_schema: { name: "rascunho", strict: true, schema: ESQUEMA_RASCUNHO },
        },
        messages: [
          { role: "user", content: promptRascunharResposta(mensagemProp, imovel.proprietarioNome, ref) },
        ],
      });
    } catch (e) {
      console.error("IA: falha ao rascunhar a resposta:", e);
      return erro(classificarErroIa(e), 502);
    }

    try {
      const dados = JSON.parse(textoDaResposta(conclusao)) as { mensagem?: unknown };
      const rascunho = typeof dados.mensagem === "string" ? dados.mensagem.trim() : "";
      if (!rascunho) return erro("falha-ia", 502);
      const resposta: Resposta = { ok: true, rascunho };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: rascunho não veio parseável:", e);
      return erro("falha-ia", 502);
    }
  }

  // ---------------------------------------------------------------
  // 3b. As três análises de texto. Todas leem o BANCO e rodam os MESMOS
  //     cálculos puros da tela — o browser não manda número nenhum.
  //     Se mandasse, a análise sairia bem escrita em cima de dados
  //     forjados, e ninguém notaria.
  // ---------------------------------------------------------------
  const [imRes, abRes, agRes, cfgRes] = await Promise.all([
    supabase.from("imoveis").select("*"),
    supabase.from("abordagens").select("*"),
    supabase.from("agenda").select("*"),
    supabase.from("user_config").select("*").maybeSingle(),
  ]);
  if (imRes.error || abRes.error || agRes.error) {
    console.error(
      "IA: falha ao ler os dados:",
      imRes.error?.message || abRes.error?.message || agRes.error?.message,
    );
    return erro("falha-ia", 500);
  }

  const imoveis = ((imRes.data || []) as DbImovelRow[]).map(fromDbImovel);
  // Mesma tolerância do carregarEstado: um erro (ou ausência) em user_config
  // não derruba nada — sem config, vale o padrão comissaoPercent = 100. Usar
  // outro padrão aqui faria a comissão da análise divergir da tela.
  const cfg = cfgRes.data as DbUserConfigRow | null;
  const comissaoPercent = cfg ? Number(cfg.comissao_percent) : 100;

  let prompt: string;

  if (pedido === "analisar-abordagens") {
    const abordagens = ((abRes.data || []) as DbAbordagemRow[]).map(fromDbAbordagem);
    const ranking = desempenhoPorAbordagem(imoveis, abordagens);
    // Sem tentativa com roteiro não há o que interpretar — e pedir análise de
    // uma tabela vazia só produziria texto genérico convincente.
    if (ranking.length === 0) return erro("sem-dados", 422);
    prompt = promptAnalisarAbordagens(ranking, resumoTentativas(imoveis));
  } else if (pedido === "analisar-dashboard") {
    // Carteira vazia: os KPIs seriam todos zero e a leitura, pura invenção.
    if (imoveis.length === 0) return erro("sem-dados", 422);
    prompt = promptAnalisarDashboard(kpisDashboard(imoveis, comissaoPercent), contagemPorStatus(imoveis));
  } else if (pedido === "explicar-foco") {
    // origens_extras é jsonb; mesma blindagem do carregarEstado. Sem portal em
    // jogo não há ordem a explicar — texto genérico só encheria linguiça.
    const origensExtras = Array.isArray(cfg?.origens_extras)
      ? cfg.origens_extras.filter((o): o is string => typeof o === "string" && o.trim() !== "")
      : [];
    const plano = planoDoDia(imoveis, origensExtras, todayISO());
    if (plano.portais.length === 0) return erro("sem-dados", 422);
    prompt = promptExplicarFoco(plano);
  } else {
    const agenda = ((agRes.data || []) as DbAgendaRow[]).map(fromDbAgenda);
    // Aqui NÃO há "sem-dados": nada pendente é uma resposta legítima e útil
    // ("seu dia está limpo"), diferente de uma tabela vazia para analisar.
    prompt = promptResumoDia(panoramaDoDia(imoveis, agenda));
  }

  let conclusao: OpenAI.Chat.ChatCompletion;
  try {
    conclusao = await openai.chat.completions.create({
      model: MODELO,
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: "medium",
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    console.error(`IA: falha em ${pedido}:`, e);
    return erro(classificarErroIa(e), 502);
  }

  const texto = textoDaResposta(conclusao);
  if (!texto) return erro("falha-ia", 502);
  const resposta: Resposta = { ok: true, texto };
  return Response.json(resposta);
}
