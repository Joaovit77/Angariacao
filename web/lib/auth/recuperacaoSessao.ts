/* ================================================================
   RECUPERAÇÃO DE SESSÃO STALE (lado do browser)

   A sessão deste app vive no localStorage, e o PostgREST só confere a
   assinatura e o `exp` do JWT — não a tabela de sessões do Auth. Então,
   quando a sessão é revogada no servidor (logout global em outro
   aparelho, expiração por política), o CRUD segue funcionando até o
   `exp`, mas toda rota /api que valida com `auth.getUser()` responde 401.
   Sem nada aqui, o corretor fica com meio app quebrado até sair e entrar
   de novo na mão.

   O que este módulo faz depois de um 401 de rota nossa, e só depois dele:

   1. NÃO presume que 401 é sessão morta. Pergunta ao Auth (`getUser`).
   2. Sessão confirmada válida → nada muda; o 401 era outra coisa.
   3. Sessão inexistente (`session_not_found` e afins) → refresh não
      adianta, porque o refresh token morreu junto com a sessão. Encerra
      SÓ a sessão local; o `onAuthStateChange` do SessaoProvider leva ao
      login. Este módulo nunca navega: navegar para "/" com a sessão
      local ainda de pé faria a raiz mandar de volta para /home, que
      daria 401 de novo — um loop.
   4. JWT recusado (`bad_jwt`) → exatamente um `refreshSession()`.
   5. Auth indisponível ou erro que não prova nada → a sessão fica como
      está. Derrubar todo mundo porque o Auth piscou seria pior que o
      problema.

   Uma recuperação por vez (single-flight): cinco chamadas que recebem
   401 juntas esperam a MESMA verificação — um `getUser`, no máximo um
   refresh, um `signOut` e um aviso.

   403 nunca entra aqui: é RLS, permissão ou recurso de outra conta, e
   nenhum refresh muda isso.
   ================================================================ */
import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { getSupabase } from "@/lib/persistencia/supabase";
import { toast } from "@/lib/toast";

/**
 * - `valida`: o Auth confirmou a sessão; o 401 não era de sessão.
 * - `renovada`: o JWT foi recusado e um refresh funcionou.
 * - `encerrada`: a sessão não existe mais; a local foi encerrada.
 * - `indeterminada`: não dá para afirmar que a sessão morreu.
 */
export type ResultadoRecuperacao = "valida" | "renovada" | "encerrada" | "indeterminada";

export const MENSAGEM_SESSAO_ENCERRADA = "Sua sessão expirou. Entre novamente.";
export const MENSAGEM_SESSAO_RENOVADA = "Sua sessão foi renovada. Tente novamente.";

/** Códigos do Auth (ErrorCode do SDK) que provam que a sessão acabou.
    `session_not_found` não está aqui porque o SDK já o converte em
    `AuthSessionMissingError`, testado por `isAuthSessionMissingError`.
    `refresh_token_already_used` fica de fora de propósito: numa corrida
    entre abas ele pode aparecer com a sessão viva na aba vizinha, e
    encerrar aqui derrubaria as duas. */
const CODIGOS_SESSAO_INEXISTENTE: ReadonlySet<string> = new Set([
  "session_expired",
  "refresh_token_not_found",
  "user_not_found",
]);

type Diagnostico = "inexistente" | "jwt-recusado" | "indisponivel" | "desconhecido";

function diagnosticar(erro: unknown): Diagnostico {
  if (isAuthSessionMissingError(erro)) return "inexistente";
  if (isAuthRetryableFetchError(erro)) return "indisponivel";
  if (isAuthApiError(erro)) {
    if (erro.code === "bad_jwt") return "jwt-recusado";
    if (erro.code && CODIGOS_SESSAO_INEXISTENTE.has(erro.code)) return "inexistente";
  }
  return "desconhecido";
}

type Motivo = "sessao-valida" | Diagnostico | "refresh-falhou" | "erro-inesperado";

/** Só o resultado e um motivo fechado. Nunca token, header, e-mail,
    `user_id` ou o objeto de erro (que pode carregar a resposta crua). */
function registrar(resultado: ResultadoRecuperacao, motivo: Motivo): void {
  console.info("[auth]", { recuperacao: resultado, motivo });
}

async function encerrarSessaoLocal(cliente: SupabaseClient): Promise<ResultadoRecuperacao> {
  try {
    // Só este browser. `global` derrubaria os outros aparelhos do
    // corretor — é justamente o que costuma causar a sessão stale.
    await cliente.auth.signOut({ scope: "local" });
  } catch {
    /* com scope local o SDK limpa o storage mesmo quando o servidor falha */
  }
  toast(MENSAGEM_SESSAO_ENCERRADA, "error");
  return "encerrada";
}

async function renovar(cliente: SupabaseClient): Promise<[ResultadoRecuperacao, Motivo]> {
  const { data, error } = await cliente.auth.refreshSession();
  if (!error && data.session) return ["renovada", "jwt-recusado"];
  if (diagnosticar(error) === "inexistente") return [await encerrarSessaoLocal(cliente), "refresh-falhou"];
  return ["indeterminada", error && isAuthRetryableFetchError(error) ? "indisponivel" : "refresh-falhou"];
}

async function verificar(cliente: SupabaseClient): Promise<ResultadoRecuperacao> {
  let resultado: ResultadoRecuperacao = "indeterminada";
  let motivo: Motivo = "erro-inesperado";
  try {
    const { data, error } = await cliente.auth.getUser();
    if (!error && data.user) {
      [resultado, motivo] = ["valida", "sessao-valida"];
    } else {
      motivo = diagnosticar(error);
      if (motivo === "inexistente") resultado = await encerrarSessaoLocal(cliente);
      else if (motivo === "jwt-recusado") [resultado, motivo] = await renovar(cliente);
    }
  } catch {
    // Exceção que não é AuthError (o SDK devolve essas como `error`) não
    // prova nada sobre a sessão.
    resultado = "indeterminada";
    motivo = "erro-inesperado";
  }
  registrar(resultado, motivo);
  return resultado;
}

interface Recuperacao {
  resultado: Promise<ResultadoRecuperacao>;
  /** O aviso de "renovada" sai uma vez por recuperação, não por chamada. */
  avisouRenovacao: boolean;
}

let emAndamento: Recuperacao | null = null;

function recuperacaoCompartilhada(cliente: SupabaseClient): Recuperacao {
  if (emAndamento) return emAndamento;
  const recuperacao: Recuperacao = {
    // `verificar` nunca rejeita; o `finally` libera a vaga mesmo assim,
    // para que um 401 depois desta recuperação possa abrir outra.
    resultado: verificar(cliente).finally(() => {
      if (emAndamento === recuperacao) emAndamento = null;
    }),
    avisouRenovacao: false,
  };
  emAndamento = recuperacao;
  return recuperacao;
}

/** Verifica a sessão depois de uma recusa 401. Chamadas simultâneas
    compartilham a mesma verificação. */
export function recuperarSessao(cliente: SupabaseClient = getSupabase()): Promise<ResultadoRecuperacao> {
  return recuperacaoCompartilhada(cliente).resultado;
}

async function tokenLocal(cliente: SupabaseClient): Promise<string | null> {
  const {
    data: { session },
  } = await cliente.auth.getSession();
  return session?.access_token || null;
}

export type InitAutenticado = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

export interface OpcoesFetchAutenticado {
  /** Pode repetir UMA vez depois de uma renovação. Só vale para GET:
      mutação nunca é repetida aqui, nem as idempotentes. */
  repetivel: boolean;
  /** Injeções para teste; em produção, o singleton e o fetch global. */
  cliente?: SupabaseClient;
  fetchImpl?: typeof fetch;
}

function comBearer(init: InitAutenticado, token: string): RequestInit {
  return { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } };
}

/**
 * `fetch` para as rotas /api protegidas: põe o Bearer da sessão local e,
 * se a rota responder 401, passa pela recuperação compartilhada.
 *
 * Devolve `null` quando não há sessão local — nada é enviado, e cada
 * cliente mantém o contrato que já tinha para "sessão expirada".
 * Qualquer outra resposta volta como veio: quem chama segue tratando o
 * status. Erros de rede propagam como no `fetch`.
 *
 * Depois de uma renovação, GET marcado `repetivel` é refeito uma única
 * vez com o token novo; mutação devolve o 401 original e o aviso de que
 * a sessão foi renovada, para o corretor repetir por conta própria.
 */
export async function fetchAutenticado(
  url: string,
  init: InitAutenticado,
  opcoes: OpcoesFetchAutenticado,
): Promise<Response | null> {
  const cliente = opcoes.cliente ?? getSupabase();
  const executar = opcoes.fetchImpl ?? fetch;

  const token = await tokenLocal(cliente);
  if (!token) return null;

  const resposta = await executar(url, comBearer(init, token));
  if (resposta.status !== 401) return resposta;

  const recuperacao = recuperacaoCompartilhada(cliente);
  if ((await recuperacao.resultado) !== "renovada") return resposta;

  const leitura = (init.method ?? "GET").toUpperCase() === "GET";
  if (!opcoes.repetivel || !leitura) {
    if (!recuperacao.avisouRenovacao) {
      recuperacao.avisouRenovacao = true;
      toast(MENSAGEM_SESSAO_RENOVADA, "warning");
    }
    return resposta;
  }

  const tokenRenovado = await tokenLocal(cliente);
  if (!tokenRenovado) return resposta;
  return executar(url, comBearer(init, tokenRenovado));
}
