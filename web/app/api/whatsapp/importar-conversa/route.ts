/* ================================================================
   API: IMPORTAR CONVERSA RECENTE DO WHATSAPP

   POST { acao: "prever" | "importar", imovelId, mensagemIds? }

   O browser nunca manda telefone, instância, token nem texto a persistir.
   Todos saem novamente das fontes confiáveis: imóvel sob RLS, instância do
   usuário autenticado e histórico retornado pela Evolution. Na importação os
   ids escolhidos são apenas uma seleção; o servidor relê as mensagens e monta
   as notas. Assim o cliente não consegue forjar uma fala do proprietário.
   ================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  LIMITE_IMPORTACAO_CONVERSA,
  idExternoDaNotaWhatsapp,
  jidsDaEvolutionPorIdsConhecidos,
  mesclarMensagensRecentesDaEvolution,
  notaDaMensagemImportada,
  type MensagemRecenteWhatsapp,
} from "@/lib/calculo/importacaoConversaWhatsapp";
import { numeroEvolution } from "@/lib/calculo/whatsapp";
import type { NotaImovel } from "@/lib/tipos";
import { instanciaWhatsappDoUsuario } from "@/lib/servidor/instanciaWhatsapp";

type FalhaImportacao =
  | "sessao-expirada"
  | "nao-configurado"
  | "sem-instancia"
  | "imovel-nao-encontrado"
  | "sem-telefone"
  | "numero-invalido"
  | "falha-evolution"
  | "falha-persistencia";

interface RespostaImportacao {
  ok: boolean;
  falha?: FalhaImportacao;
  mensagem?: string;
  mensagens?: MensagemRecenteWhatsapp[];
  importadas?: NotaImovel[];
  ignoradas?: number;
}

function erro(falha: FalhaImportacao, mensagem: string, status: number): Response {
  return Response.json({ ok: false, falha, mensagem } satisfies RespostaImportacao, { status });
}

async function instanciaDoUsuario(
  supabaseUrl: string,
  userId: string,
): Promise<Awaited<ReturnType<typeof instanciaWhatsappDoUsuario>>> {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) return { ok: false, falha: "persistencia" };
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return instanciaWhatsappDoUsuario(admin, userId);
}

async function jidDoNumero(
  base: string,
  instancia: string,
  token: string,
  numero: string,
): Promise<string> {
  try {
    const resposta = await fetch(`${base}/chat/whatsappNumbers/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify({ numbers: [numero] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok) return `${numero}@s.whatsapp.net`;
    const lista = (await resposta.json().catch(() => null)) as Array<{ jid?: unknown; exists?: unknown }> | null;
    const primeiro = Array.isArray(lista) ? lista[0] : null;
    return typeof primeiro?.jid === "string" && primeiro.jid.trim()
      ? primeiro.jid.trim()
      : `${numero}@s.whatsapp.net`;
  } catch {
    return `${numero}@s.whatsapp.net`;
  }
}

async function consultarEvolution(
  base: string,
  instancia: string,
  token: string,
  corpo: unknown,
): Promise<{ ok: boolean; corpo: unknown }> {
  try {
    const resposta = await fetch(`${base}/chat/findMessages/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: token },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000),
    });
    if (!resposta.ok) return { ok: false, corpo: null };
    return { ok: true, corpo: await resposta.json().catch(() => null) };
  } catch {
    return { ok: false, corpo: null };
  }
}

/** Consulta os contratos atual e legado e também uma janela global curta.
    As respostas precisam ser reunidas: uma versão da Evolution pode aceitar
    a consulta, ignorar parte do filtro e devolver apenas mensagens recentes.
    Mesmo depois da união, o núcleo confere de novo o telefone. */
async function buscarConversa(
  base: string,
  instancia: string,
  token: string,
  jid: string,
  telefone: string,
  notas: NotaImovel[],
): Promise<{ ok: boolean; mensagens: MensagemRecenteWhatsapp[] }> {
  const tentativasIniciais = [
    {
      where: { key: { remoteJid: jid } },
      take: 100,
      skip: 0,
      orderBy: { messageTimestamp: "desc" },
    },
    {
      where: { key: { remoteJid: jid } },
      page: 1,
      offset: 100,
    },
    {
      where: { key: { remoteJidAlt: jid } },
      take: 100,
      skip: 0,
      orderBy: { messageTimestamp: "desc" },
    },
    {
      where: { key: { remoteJidAlt: jid } },
      page: 1,
      offset: 100,
    },
    {
      where: {},
      take: 200,
      skip: 0,
      orderBy: { messageTimestamp: "desc" },
    },
    {
      where: {},
      page: 1,
      offset: 100,
    },
  ];
  const consultasIniciais = await Promise.all(
    tentativasIniciais.map((corpo) => consultarEvolution(base, instancia, token, corpo)),
  );
  const respondidas = consultasIniciais.filter((consulta) => consulta.ok);
  const corpos = respondidas.map((consulta) => consulta.corpo);

  // Quando o contato é salvo depois do começo da conversa, o WhatsApp pode
  // trocar o remoteJid numérico por um LID (ou o inverso). Os ids das notas
  // já registradas pelo webhook são a ponte segura entre as duas identidades.
  const idsConhecidos = notas.map(idExternoDaNotaWhatsapp).filter((id): id is string => !!id);
  const jidAtual = jid.trim();
  let jidsVinculados = jidsDaEvolutionPorIdsConhecidos(corpos, idsConhecidos);
  const temIdentificadorAnterior = () => jidsVinculados.some((item) => item !== jidAtual);

  // O contrato legado pagina globalmente. Procuramos a âncora em pequenos
  // lotes e paramos assim que aparece um identificador anterior confiável.
  if (idsConhecidos.length > 0 && !temIdentificadorAnterior()) {
    for (let primeiraPagina = 2; primeiraPagina <= 8; primeiraPagina += 2) {
      const paginas = [primeiraPagina, primeiraPagina + 1];
      const lote = await Promise.all(
        paginas.map((page) =>
          consultarEvolution(base, instancia, token, { where: {}, page, offset: 100 }),
        ),
      );
      const validas = lote.filter((consulta) => consulta.ok);
      respondidas.push(...validas);
      corpos.push(...validas.map((consulta) => consulta.corpo));
      jidsVinculados = jidsDaEvolutionPorIdsConhecidos(corpos, idsConhecidos);
      if (temIdentificadorAnterior()) break;
    }
  }

  const jidsParaBuscar = [...new Set(jidsVinculados)].filter((item) => item !== jidAtual);
  if (jidsParaBuscar.length > 0) {
    const consultasAnteriores = await Promise.all(
      jidsParaBuscar.flatMap((jidAnterior) => [
        consultarEvolution(base, instancia, token, {
          where: { key: { remoteJid: jidAnterior } },
          take: 100,
          skip: 0,
          orderBy: { messageTimestamp: "desc" },
        }),
        consultarEvolution(base, instancia, token, {
          where: { key: { remoteJid: jidAnterior } },
          page: 1,
          offset: 100,
        }),
      ]),
    );
    const validas = consultasAnteriores.filter((consulta) => consulta.ok);
    respondidas.push(...validas);
    corpos.push(...validas.map((consulta) => consulta.corpo));
  }

  return {
    ok: respondidas.length > 0,
    mensagens: mesclarMensagensRecentesDaEvolution(
      corpos,
      telefone,
      notas,
      LIMITE_IMPORTACAO_CONVERSA,
      jidsVinculados,
    ),
  };
}

async function registrarNotas(
  supabase: SupabaseClient,
  imovelId: string,
  userId: string,
  mensagens: MensagemRecenteWhatsapp[],
): Promise<{ importadas: NotaImovel[]; falhas: number }> {
  const resultados = await Promise.all(
    mensagens.map(async (mensagem) => {
      const nota = notaDaMensagemImportada(mensagem);
      const { data, error: falha } = await supabase.rpc("registrar_nota_imovel", {
        p_imovel_id: imovelId,
        p_user_id: userId,
        p_nota: nota,
      });
      return { nota, gravou: data === true, falhou: !!falha };
    }),
  );
  return {
    importadas: resultados.filter((item) => item.gravou).map((item) => item.nota),
    falhas: resultados.filter((item) => item.falhou).length,
  };
}

export async function POST(request: Request): Promise<Response> {
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!serverUrl || !supabaseUrl || !anonKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return erro("nao-configurado", "A importação do WhatsApp não está configurada neste ambiente.", 503);
  }

  const autorizacao = request.headers.get("authorization") || "";
  const accessToken = autorizacao.toLowerCase().startsWith("bearer ")
    ? autorizacao.slice(7).trim()
    : "";
  if (!accessToken) return erro("sessao-expirada", "Sua sessão expirou. Entre novamente.", 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: falhaAuth } = await supabase.auth.getUser();
  if (falhaAuth || !sessao.user) return erro("sessao-expirada", "Sua sessão expirou. Entre novamente.", 401);

  let entrada: { acao?: unknown; imovelId?: unknown; mensagemIds?: unknown };
  try {
    entrada = await request.json();
  } catch {
    return erro("imovel-nao-encontrado", "Não foi possível identificar o imóvel.", 400);
  }
  const acao = entrada.acao === "importar" ? "importar" : entrada.acao === "prever" ? "prever" : "";
  const imovelId = typeof entrada.imovelId === "string" ? entrada.imovelId : "";
  if (!acao || !imovelId) return erro("imovel-nao-encontrado", "Não foi possível identificar o imóvel.", 400);

  // A consulta autenticada aplica RLS. O telefone nunca é aceito do browser.
  const { data: imovel, error: falhaImovel } = await supabase
    .from("imoveis")
    .select("proprietario_telefone, notas")
    .eq("id", imovelId)
    .maybeSingle();
  if (falhaImovel) {
    console.error("Importação de conversa: falha ao ler imóvel:", falhaImovel.message);
    return erro("falha-persistencia", "Não foi possível carregar o imóvel agora.", 500);
  }
  if (!imovel) return erro("imovel-nao-encontrado", "Imóvel não encontrado.", 404);
  const telefone = typeof imovel.proprietario_telefone === "string" ? imovel.proprietario_telefone : "";
  if (!telefone.trim()) return erro("sem-telefone", "Cadastre o telefone do proprietário antes de importar.", 422);
  const numero = numeroEvolution(telefone);
  if (!numero) return erro("numero-invalido", "O telefone cadastrado não é válido para o WhatsApp.", 422);
  const notas = Array.isArray(imovel.notas) ? (imovel.notas as NotaImovel[]) : [];

  const minha = await instanciaDoUsuario(supabaseUrl, sessao.user.id);
  if (!minha.ok) {
    if (minha.falha === "sem-instancia") {
      return erro("sem-instancia", "Sua conta ainda não tem um WhatsApp configurado.", 422);
    }
    if (minha.falha === "nao-configurado") {
      return erro("nao-configurado", "A recuperação automática do WhatsApp não está configurada.", 503);
    }
    return erro("falha-evolution", "Não foi possível verificar o WhatsApp agora.", 502);
  }
  const base = serverUrl.replace(/\/+$/, "");
  const jid = await jidDoNumero(base, minha.instancia, minha.token, numero);
  const conversa = await buscarConversa(base, minha.instancia, minha.token, jid, telefone, notas);
  if (!conversa.ok) {
    return erro("falha-evolution", "Não foi possível consultar o histórico do WhatsApp agora.", 502);
  }

  if (acao === "prever") {
    return Response.json({ ok: true, mensagens: conversa.mensagens } satisfies RespostaImportacao);
  }

  const ids = Array.isArray(entrada.mensagemIds)
    ? entrada.mensagemIds.filter((id): id is string => typeof id === "string").slice(0, LIMITE_IMPORTACAO_CONVERSA)
    : [];
  const selecionadas = new Set(ids);
  const paraImportar = conversa.mensagens.filter(
    (mensagem) => selecionadas.has(mensagem.id) && !mensagem.jaImportada,
  );
  if (paraImportar.length === 0) {
    return Response.json({ ok: true, importadas: [], ignoradas: ids.length } satisfies RespostaImportacao);
  }

  const gravacao = await registrarNotas(supabase, imovelId, sessao.user.id, paraImportar);
  if (gravacao.falhas > 0 && gravacao.importadas.length === 0) {
    return erro("falha-persistencia", "Não foi possível salvar a conversa. Tente novamente.", 500);
  }
  return Response.json({
    ok: true,
    importadas: gravacao.importadas,
    ignoradas: ids.length - gravacao.importadas.length,
  } satisfies RespostaImportacao);
}
