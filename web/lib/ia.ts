/* ================================================================
   IA (lado do browser)
   Chama a nossa rota /api/ia, que é quem fala com a OpenAI — a
   chave nunca chega aqui. Fora de mutacoes.ts pelo mesmo motivo do
   envioWhatsapp: não é escrita no Supabase, é efeito externo.
   Nunca lança: devolve o resultado ou o motivo da falha, e a UI
   decide entre avisar e seguir sem a sugestão.
   ================================================================ */
import type { AnuncioExtraido, ContextoRoteiro, FalhaIa, RoteiroSugerido } from "./calculo/ia";
import { getSupabase } from "./persistencia/supabase";

export interface ResultadoRoteiros {
  ok: boolean;
  falha?: FalhaIa;
  mensagem?: string;
  roteiros?: RoteiroSugerido[];
}

export interface ResultadoAnalise {
  ok: boolean;
  falha?: FalhaIa;
  mensagem?: string;
  texto?: string;
}

export interface ResultadoExtracao {
  ok: boolean;
  falha?: FalhaIa;
  mensagem?: string;
  anuncio?: AnuncioExtraido;
}

export interface ResultadoRascunho {
  ok: boolean;
  falha?: FalhaIa;
  /** Mensagem de erro pronta (quando ok=false). */
  mensagem?: string;
  /** O texto sugerido para responder ao proprietário (quando ok=true). */
  rascunho?: string;
  /** Títulos dos protocolos da imobiliária em que o rascunho se apoiou, já
      filtrados pela rota contra os que existem de verdade. Serve para o
      corretor conferir a FONTE do que a IA afirmou sem reler a base inteira. */
  protocolosUsados?: string[];
}

async function chamar<T>(corpo: unknown): Promise<T | { ok: false; falha: FalhaIa }> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return { ok: false, falha: "sessao-expirada" };

  try {
    const resposta = await fetch("/api/ia", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => null)) as T | null;
    if (!dados) return { ok: false, falha: "falha-ia" };
    return dados;
  } catch {
    // Rede caiu, offline, rota fora do ar.
    return { ok: false, falha: "falha-ia" };
  }
}

/** A IA está disponível PARA ESTE USUÁRIO? São duas condições: o ambiente
    tem chave e a conta tem permissão (tabela ia_permissoes).

    Serve só para a UI esconder os botões em vez de oferecer algo que
    responderia erro. Quem de fato barra é o POST — esconder botão não é
    controle de acesso.

    Falha de rede ou sessão ausente contam como "não disponível": na
    dúvida, não oferece. */
export async function iaDisponivelParaUsuario(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    if (!session) return false;

    const resposta = await fetch("/api/ia", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!resposta.ok) return false;
    const dados = (await resposta.json().catch(() => null)) as {
      configurado?: unknown;
      permitido?: unknown;
    } | null;
    return dados?.configurado === true && dados?.permitido === true;
  } catch {
    return false;
  }
}

/** Pede 3 roteiros de abordagem para o cenário informado. */
export function sugerirRoteiros(contexto: ContextoRoteiro): Promise<ResultadoRoteiros> {
  return chamar<ResultadoRoteiros>({ tipo: "sugerir-roteiros", contexto });
}

/** Lê o texto de um anúncio COLADO e devolve os campos do imóvel para
    PREENCHER o cadastro — nunca para salvar sozinho. Já leu foto também; ver
    em lib/calculo/ia.ts por que a imagem saiu. */
export function extrairAnuncio(texto: string): Promise<ResultadoExtracao> {
  return chamar<ResultadoExtracao>({ tipo: "extrair-anuncio", texto });
}

/** Rascunha a resposta ao proprietário a partir da ÚLTIMA mensagem dele.
    Só passa o `imovelId`: a rota relê a mensagem do banco (a nota do webhook),
    não confia no texto do browser — mesma regra do "o conteúdo sai do banco".
    O resultado é sugestão: cai no ModalWhatsapp editável, quem envia é o
    corretor. */
export function rascunharResposta(imovelId: string): Promise<ResultadoRascunho> {
  return chamar<ResultadoRascunho>({ tipo: "rascunhar-resposta", imovelId });
}

/* As três leituras abaixo não recebem parâmetro de propósito: os números
   são recalculados no servidor a partir do banco (ver a rota). Passar o
   que está na tela abriria espaço para análise em cima de número forjado. */

/** Pede a leitura do ranking de abordagens. */
export function analisarAbordagens(): Promise<ResultadoAnalise> {
  return chamar<ResultadoAnalise>({ tipo: "analisar-abordagens" });
}

/** Pede a leitura dos KPIs do Dashboard. */
export function analisarDashboard(): Promise<ResultadoAnalise> {
  return chamar<ResultadoAnalise>({ tipo: "analisar-dashboard" });
}

/** Pede a lista priorizada do que fazer hoje. */
export function resumoDoDia(): Promise<ResultadoAnalise> {
  return chamar<ResultadoAnalise>({ tipo: "resumo-dia" });
}

/** Pede a explicação da ordem de prioridade dos portais (Foco do dia). */
export function explicarFoco(): Promise<ResultadoAnalise> {
  return chamar<ResultadoAnalise>({ tipo: "explicar-foco" });
}
