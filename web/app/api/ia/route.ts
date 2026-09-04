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
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registrarEvento, registrarUsoDaResposta } from "@/lib/servidor/registro";
import { desempenhoPorAbordagem, resumoTentativas } from "@/lib/calculo/abordagens";
import { kpisDashboard } from "@/lib/calculo/dashboard";
import { focoInteligenteDoDia } from "@/lib/calculo/focoDia";
import { addDaysISO, todayISO } from "@/lib/datas";
import {
  CARACTERISTICAS_AUSENTES,
  ESQUEMA_ABORDAGEM_ANUNCIO,
  ESQUEMA_ACAO_TERRITORIAL,
  ESQUEMA_ANUNCIO,
  ESQUEMA_ANUNCIO_GERADO,
  ESQUEMA_ROTEIROS,
  MAX_CARACTERISTICAS,
  PONTOS_ANUNCIO_PROPRIETARIO,
  contagemPorStatus,
  corrigirMarcadores,
  panoramaDoDia,
  promptAnalisarAbordagens,
  promptAnalisarDashboard,
  promptAbordagemDoAnuncio,
  promptAcaoTerritorial,
  promptExplicarFocoInteligente,
  promptExtrairAnuncio,
  promptGerarAnuncio,
  promptResumoDia,
  promptSugerirRoteiros,
  type AbordagemDoAnuncio,
  type AcaoTerritorialIa,
  type AnuncioExtraido,
  type AnuncioGerado,
  type ContextoRoteiro,
  type FalhaIa,
  type RoteiroSugerido,
} from "@/lib/calculo/ia";
import { filtrarImoveisMapa, leituraTerritorialMapa } from "@/lib/calculo/mapa";
import {
  fromDbAbordagem,
  fromDbAgenda,
  fromDbImovel,
  type DbAbordagemRow,
  type DbAgendaRow,
  type DbImovelRow,
  type DbUserConfigRow,
} from "@/lib/persistencia/mapeadores";
import { MAX_TOKENS_IA as MAX_TOKENS } from "@/lib/servidor/ia/config";
import { carregarConfiguracaoIa } from "@/lib/servidor/ia/configuracao";
import {
  classificarErroIa,
  criarExecutorOpenAI,
  textoDaResposta,
} from "@/lib/servidor/ia/executor-openai";
import {
  despacharPedidoIa,
  ehTipoPedidoIa,
  type CorpoPedidoIa,
  type RegistroHandlersIa,
} from "@/lib/servidor/ia/dispatcher";
import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";
import { respostaErroIa as erro } from "@/lib/servidor/ia/respostas";
import { aplicarSystemPromptAngario } from "@/lib/ia/system-prompt";
import { feedbackSugestoesIaHabilitado } from "@/lib/servidor/ia/feedback-config";
import { registrarSugestaoIa } from "@/lib/servidor/ia/sugestoes";

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
  /** tipo "rascunhar-resposta": títulos dos protocolos em que o rascunho se
      apoiou, para a tela mostrar em que ele se baseou. */
  protocolosUsados?: string[];
  /** Identificador persistido da mensagem sugerida. */
  sugestaoId?: string;
  /** tipo "gerar-anuncio" */
  anuncioGerado?: AnuncioGerado;
  /** tipo "abordagem-anuncio" */
  abordagem?: AbordagemDoAnuncio;
  /** tipo "analisar-mapa" */
  leitura?: AcaoTerritorialIa;
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
    console.error("IA: falha ao ler a permissão:", sanitizarErroExterno(error, "consultarSupabase"));
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
  if (!(await podeUsarIa(supabase, sessao.user.id))) {
    // Vale registrar: uma conta que TENTA usar a IA e não pode é quase
    // sempre alguém esperando liberação — o admin vê no log de quem é,
    // em vez de esperar a reclamação chegar por fora.
    registrarEvento({
      userId: sessao.user.id,
      categoria: "ia",
      nivel: "aviso",
      evento: "ia-sem-permissao",
      detalhe: null,
    });
    return erro("sem-permissao", 403);
  }
  const donoDaChamada = sessao.user.id;

  // 3. Corpo — só os tipos conhecidos.
  let corpo: CorpoPedidoIa;
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }
  if (!ehTipoPedidoIa(corpo.tipo)) return erro("requisicao-invalida", 400);
  const pedido = corpo.tipo;

  const openai = new OpenAI({ apiKey });
  const configuracaoIa = await carregarConfiguracaoIa();
  const MODELO = configuracaoIa.operacoes.modelo;
  const ESFORCO = configuracaoIa.operacoes.esforco;
  const handlers = {
    "rascunhar-resposta": atenderProprietario,
  } satisfies RegistroHandlersIa;
  const respostaEspecializada = await despacharPedidoIa(
    pedido,
    {
      corpo,
      supabase,
      userId: donoDaChamada,
      executor: criarExecutorOpenAI(openai, donoDaChamada, configuracaoIa.atendimento),
      configuracao: configuracaoIa,
    },
    handlers,
  );
  if (respostaEspecializada) return respostaEspecializada;

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
    if (abErro) console.error("IA: falha ao ler abordagens existentes:", sanitizarErroExterno(abErro, "consultarSupabase"));
    const nomesExistentes = ((abData || []) as { nome: string; arquivada: boolean | null }[])
      .filter((a) => !a.arquivada && typeof a.nome === "string" && a.nome.trim() !== "")
      .map((a) => a.nome);

    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: ESFORCO,
        // strict: true faz o modelo aderir ao esquema, em vez de "tentar".
        // Exige que todo objeto liste tudo em `required` e traga
        // additionalProperties: false — o ESQUEMA_ROTEIROS já atende.
        response_format: {
          type: "json_schema",
          json_schema: { name: "roteiros", strict: true, schema: ESQUEMA_ROTEIROS },
        },
        messages: aplicarSystemPromptAngario([
          { role: "user", content: promptSugerirRoteiros(contexto, nomesExistentes) },
        ]),
      });
    } catch (e) {
      console.error("IA: falha ao sugerir roteiros:", sanitizarErroExterno(e, "iaTexto"));
      const falha = classificarErroIa(e);
      registrarEvento({ userId: donoDaChamada, categoria: "ia", nivel: "erro", evento: "ia-falhou", detalhe: `${pedido}: ${falha}` });
      return erro(falha, 502);
    }
    // O gasto é registrado assim que a chamada volta, ANTES de a resposta
    // ser validada: token consumido é token cobrado, mesmo quando o JSON
    // vem quebrado e a rota devolve erro. Registrar só no caminho feliz
    // faria o painel mostrar menos que a fatura — justo nas contas que
    // mais falham, que são as que mais interessa olhar.
    registrarUsoDaResposta(donoDaChamada, pedido, MODELO, conclusao.usage);

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
      console.error("IA: resposta de roteiros não veio parseável:", sanitizarErroExterno(e, "processarRespostaIa"));
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
        reasoning_effort: ESFORCO,
        response_format: {
          type: "json_schema",
          json_schema: { name: "anuncio", strict: true, schema: ESQUEMA_ANUNCIO },
        },
        messages: aplicarSystemPromptAngario([{ role: "user", content: conteudo }]),
      });
    } catch (e) {
      console.error("IA: falha ao extrair o anúncio:", sanitizarErroExterno(e, "iaTexto"));
      const falha = classificarErroIa(e);
      registrarEvento({ userId: donoDaChamada, categoria: "ia", nivel: "erro", evento: "ia-falhou", detalhe: `${pedido}: ${falha}` });
      return erro(falha, 502);
    }
    registrarUsoDaResposta(donoDaChamada, pedido, MODELO, conclusao.usage);

    try {
      const anuncio = JSON.parse(textoDaResposta(conclusao)) as AnuncioExtraido;
      const resposta: Resposta = { ok: true, anuncio };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: resposta da extração não veio parseável:", sanitizarErroExterno(e, "processarRespostaIa"));
      return erro("falha-ia", 502);
    }
  }

  // ---------------------------------------------------------------
  // 3a-ter. Gerar título e descrição para o portal.
  //
  //   O imóvel sai do BANCO pelo id, com o token de quem chamou — o
  //   browser não manda característica nenhuma do cadastro, pelo mesmo
  //   motivo de o destinatário do WhatsApp sair do banco: aqui o texto
  //   gerado vira anúncio público, e um valor forjado pelo cliente
  //   publicaria o aluguel errado com o nome da imobiliária junto.
  //
  //   `caracteristicas` é a exceção, e é consciente: é a ficha que o
  //   corretor colou da Sophia, que este sistema não tem como ler
  //   (a integração é só de entrada — ver INTEGRACAO_SOPHIA.md). Mesmo
  //   desvio da extração de anúncio, seguro pelas mesmas travas: prompt
  //   e esquema montados aqui, saída FECHADA, `podeUsarIa` na porta e
  //   MAX_CARACTERISTICAS limitando o custo por chamada.
  // ---------------------------------------------------------------
  if (pedido === "gerar-anuncio") {
    const imovelId = typeof corpo.imovelId === "string" ? corpo.imovelId : "";
    if (!imovelId) return erro("requisicao-invalida", 400);
    const caracteristicas =
      typeof corpo.caracteristicas === "string"
        ? corpo.caracteristicas.slice(0, MAX_CARACTERISTICAS)
        : "";

    const { data: imRow, error: imErr } = await supabase
      .from("imoveis")
      .select("*")
      .eq("id", imovelId)
      .maybeSingle();
    if (imErr) {
      console.error("IA: falha ao ler o imóvel para o anúncio:", sanitizarErroExterno(imErr, "consultarSupabase"));
      return erro("falha-ia", 500);
    }
    // Id inválido ou imóvel de outro dono (barrado pelo RLS).
    if (!imRow) return erro("sem-dados", 422);
    const imovel = fromDbImovel(imRow as DbImovelRow);

    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: ESFORCO,
        response_format: {
          type: "json_schema",
          json_schema: { name: "anuncio_gerado", strict: true, schema: ESQUEMA_ANUNCIO_GERADO },
        },
        messages: aplicarSystemPromptAngario([
          { role: "user", content: promptGerarAnuncio(imovel, caracteristicas) },
        ]),
      });
    } catch (e) {
      console.error("IA: falha ao gerar o anúncio:", sanitizarErroExterno(e, "iaTexto"));
      const falha = classificarErroIa(e);
      registrarEvento({ userId: donoDaChamada, categoria: "ia", nivel: "erro", evento: "ia-falhou", detalhe: `${pedido}: ${falha}` });
      return erro(falha, 502);
    }
    registrarUsoDaResposta(donoDaChamada, pedido, MODELO, conclusao.usage);

    try {
      const dados = JSON.parse(textoDaResposta(conclusao)) as {
        titulo?: unknown;
        descricao?: unknown;
        faltando?: unknown;
      };
      const titulo = typeof dados.titulo === "string" ? dados.titulo.trim() : "";
      const descricao = typeof dados.descricao === "string" ? dados.descricao.trim() : "";
      // Título sozinho não serve para nada, e descrição sozinha o corretor
      // teria que completar à mão — nos dois casos é melhor errar claro.
      if (!titulo || !descricao) return erro("falha-ia", 502);
      /* Mesma desconfiança do `protocolosUsados`: o enum do esquema já deveria
         bastar, mas a tela transforma esta lista numa instrução ao corretor
         ("cole a ficha para incluir X"). Um rótulo fora da lista viraria um
         pedido que ele não tem como atender. */
      const permitidos = new Set<string>(CARACTERISTICAS_AUSENTES);
      const faltando = Array.isArray(dados.faltando)
        ? dados.faltando.filter((f): f is string => typeof f === "string" && permitidos.has(f))
        : [];
      const resposta: Resposta = { ok: true, anuncioGerado: { titulo, descricao, faltando } };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: anúncio gerado não veio parseável:", sanitizarErroExterno(e, "processarRespostaIa"));
      return erro("falha-ia", 502);
    }
  }

  // ---------------------------------------------------------------
  // 3a-quater. Abordagem escrita a partir do anúncio do proprietário.
  //
  //   O inverso do gerar-anuncio: lá o imóvel já é nosso; aqui ele é de
  //   alguém anunciando sozinho, e o texto vai para o WhatsApp DELE.
  //   Nada vem do browser além do id — o anúncio e a idade saem do
  //   banco, com o token de quem chamou. É primeira mensagem a uma
  //   pessoa real: conteúdo vindo do cliente escolheria o que a IA
  //   afirma a um proprietário, que é a regra do rascunho de resposta.
  // ---------------------------------------------------------------
  if (pedido === "abordagem-anuncio") {
    const imovelId = typeof corpo.imovelId === "string" ? corpo.imovelId : "";
    if (!imovelId) return erro("requisicao-invalida", 400);

    const { data: imRow, error: imErr } = await supabase
      .from("imoveis")
      .select("*")
      .eq("id", imovelId)
      .maybeSingle();
    if (imErr) {
      console.error("IA: falha ao ler o imóvel para a abordagem:", sanitizarErroExterno(imErr, "consultarSupabase"));
      return erro("falha-ia", 500);
    }
    if (!imRow) return erro("sem-dados", 422);
    const imovel = fromDbImovel(imRow as DbImovelRow);

    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: ESFORCO,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "abordagem_anuncio",
            strict: true,
            schema: ESQUEMA_ABORDAGEM_ANUNCIO,
          },
        },
        messages: aplicarSystemPromptAngario([
          { role: "user", content: promptAbordagemDoAnuncio(imovel) },
        ]),
      });
    } catch (e) {
      console.error("IA: falha ao escrever a abordagem do anúncio:", sanitizarErroExterno(e, "iaTexto"));
      const falha = classificarErroIa(e);
      registrarEvento({ userId: donoDaChamada, categoria: "ia", nivel: "erro", evento: "ia-falhou", detalhe: `${pedido}: ${falha}` });
      return erro(falha, 502);
    }
    registrarUsoDaResposta(donoDaChamada, pedido, MODELO, conclusao.usage);

    try {
      const dados = JSON.parse(textoDaResposta(conclusao)) as {
        mensagem?: unknown;
        pontos?: unknown;
      };
      const mensagem = typeof dados.mensagem === "string" ? dados.mensagem.trim() : "";
      if (!mensagem) return erro("falha-ia", 502);
      /* Mesma desconfiança do `protocolosUsados`: a tela exibe estes rótulos
         como "em que a mensagem se apoiou", e um fora da lista viraria uma
         justificativa que o corretor não tem como conferir. Dois é o teto que
         o prompt pede — cortar aqui evita a tela crescer se o modelo exagerar. */
      const permitidos = new Set<string>(PONTOS_ANUNCIO_PROPRIETARIO);
      const pontos = Array.isArray(dados.pontos)
        ? dados.pontos.filter((p): p is string => typeof p === "string" && permitidos.has(p)).slice(0, 2)
        : [];
      let sugestaoId: string | undefined;
      if (feedbackSugestoesIaHabilitado()) {
        sugestaoId = await registrarSugestaoIa({
          supabase,
          userId: donoDaChamada,
          imovelId,
          tipo: "prospeccao",
          textoSugerido: mensagem,
          contexto: { versao: 1, pontosAnuncio: pontos },
          origem: "pipeline-anuncio",
          modelo: MODELO,
        }) || undefined;
        if (!sugestaoId) return erro("falha-ia", 500);
      }
      const resposta: Resposta = {
        ok: true,
        abordagem: { mensagem, pontos },
        ...(sugestaoId ? { sugestaoId } : {}),
      };
      return Response.json(resposta);
    } catch (e) {
      console.error("IA: abordagem do anúncio não veio parseável:", sanitizarErroExterno(e, "processarRespostaIa"));
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
      sanitizarErroExterno(imRes.error || abRes.error || agRes.error, "consultarSupabase"),
    );
    return erro("falha-ia", 500);
  }

  const imoveis = ((imRes.data || []) as DbImovelRow[]).map(fromDbImovel);
  // Mesma tolerância do carregarEstado: um erro (ou ausência) em user_config
  // não derruba nada — sem config, vale o padrão comissaoPercent = 100. Usar
  // outro padrão aqui faria a comissão da análise divergir da tela.
  const cfg = cfgRes.data as DbUserConfigRow | null;
  const comissaoPercent = cfg ? Number(cfg.comissao_percent) : 100;

  if (pedido === "analisar-mapa") {
    const bruto = corpo.filtros && typeof corpo.filtros === "object" ? corpo.filtros as Record<string, unknown> : {};
    const texto = (chave: string) => typeof bruto[chave] === "string" ? (bruto[chave] as string).trim().slice(0, 120) : "";
    const periodoDias = [30, 90, 180].includes(Number(bruto.periodoDias)) ? Number(bruto.periodoDias) : 0;
    const recorte = filtrarImoveisMapa(imoveis, {
      busca: texto("busca"),
      bairro: texto("bairro"),
      status: texto("status"),
      responsavel: texto("responsavel"),
      origem: texto("origem"),
      desde: periodoDias ? addDaysISO(todayISO(), -periodoDias) : null,
    });
    const leitura = leituraTerritorialMapa(recorte);
    if (!leitura.concentracao) return erro("sem-dados", 422);
    let conclusao: OpenAI.Chat.ChatCompletion;
    try {
      conclusao = await openai.chat.completions.create({
        model: MODELO,
        max_completion_tokens: 1000,
        reasoning_effort: ESFORCO,
        response_format: {
          type: "json_schema",
          json_schema: { name: "acao_territorial", strict: true, schema: ESQUEMA_ACAO_TERRITORIAL },
        },
        messages: aplicarSystemPromptAngario([
          { role: "user", content: promptAcaoTerritorial(leitura) },
        ]),
      });
    } catch (e) {
      console.error("IA: falha ao analisar o mapa:", sanitizarErroExterno(e, "iaTexto"));
      const falha = classificarErroIa(e);
      registrarEvento({ userId: donoDaChamada, categoria: "ia", nivel: "erro", evento: "ia-falhou", detalhe: `${pedido}: ${falha}` });
      return erro(falha, 502);
    }
    registrarUsoDaResposta(donoDaChamada, pedido, MODELO, conclusao.usage);
    try {
      const dados = JSON.parse(textoDaResposta(conclusao)) as { acao?: unknown };
      const acao = typeof dados.acao === "string" ? dados.acao.trim().slice(0, 180) : "";
      if (!acao) return erro("falha-ia", 502);
      return Response.json({ ok: true, leitura: { acao } } satisfies Resposta);
    } catch (e) {
      console.error("IA: leitura territorial não veio parseável:", sanitizarErroExterno(e, "processarRespostaIa"));
      return erro("falha-ia", 502);
    }
  }

  let prompt: string;

  if (pedido === "analisar-abordagens") {
    const abordagens = ((abRes.data || []) as DbAbordagemRow[]).map(fromDbAbordagem);
    const ranking = desempenhoPorAbordagem(imoveis, abordagens, todayISO());
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
    const agenda = ((agRes.data || []) as DbAgendaRow[]).map(fromDbAgenda);
    const foco = focoInteligenteDoDia(imoveis, agenda, origensExtras, todayISO());
    prompt = promptExplicarFocoInteligente(foco);
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
      reasoning_effort: ESFORCO,
      messages: aplicarSystemPromptAngario([{ role: "user", content: prompt }]),
    });
  } catch (e) {
    console.error(`IA: falha em ${pedido}:`, sanitizarErroExterno(e, "iaTexto"));
    const falha = classificarErroIa(e);
    registrarEvento({ userId: donoDaChamada, categoria: "ia", nivel: "erro", evento: "ia-falhou", detalhe: `${pedido}: ${falha}` });
    return erro(falha, 502);
  }
  registrarUsoDaResposta(donoDaChamada, pedido, MODELO, conclusao.usage);

  const texto = textoDaResposta(conclusao);
  if (!texto) return erro("falha-ia", 502);
  const resposta: Resposta = { ok: true, texto };
  return Response.json(resposta);
}
