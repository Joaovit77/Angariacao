/* ----------------------------------------------------------------
   POST /api/prospeccao/excluir — o ator único da remoção (§13.3 da V7).

   Três corpos, e só três: `{ fotoId }`, `{ imovelIdentificadoId }` ou
   `{ tudo: true }`. A identidade vem de `auth.getUser()`; a posse do alvo
   é provada lendo o registro SOB RLS com o cliente do chamador; só então
   a service role entra, para o que exige Storage físico e as RPCs do
   modelo Servidor. `p_user_id` nunca vem do corpo.

   Dois fatos governam a ordem daqui: `delete from storage.objects` não
   apaga o arquivo físico — só `storage.remove()` pelo SDK apaga —, e o
   cliente não tem `delete` em tabela nenhuma do módulo. Então objeto
   primeiro, linha por último, e a RPC não confia na rota:
   `confirmar_objeto_removido` prova a ausência em `storage.objects` antes
   de apagar a linha. A reconciliação de prefixo (§5.3) é o backstop para
   o que ficou sem linha. Falha de Storage NUNCA vira "concluído": a
   resposta é `{ removidos, pendentes, prefixoVazio, concluido }` e só.

   Tudo é idempotente: chamar de novo, de qualquer ponto, continua de onde
   parou. A retomada é humana (sem cron no MVP).
   ---------------------------------------------------------------- */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { clienteDoChamador, tokenDaRequisicao } from "@/lib/servidor/iaAcesso";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET_FACHADAS = "fachadas";
/** Limite prático do `remove()` do Storage por chamada. */
const LOTE_REMOCAO_STORAGE = 100;
/** Um UUID e um booleano cabem folgadamente aqui; corpo maior é recusado sem ler. */
const LIMITE_CORPO_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PedidoExclusao =
  | { alvo: "foto"; fotoId: string }
  | { alvo: "identificado"; imovelIdentificadoId: string }
  | { alvo: "tudo" };

/** O contrato público da rota (§19). Nenhum campo a mais. */
interface ResultadoExclusao {
  removidos: number;
  pendentes: number;
  prefixoVazio: boolean;
  concluido: boolean;
}

type Falha = "nao_autenticado" | "corpo_invalido" | "nao_encontrado" | "indisponivel";

class ErroExclusao extends Error {
  constructor(public readonly codigo: "nao_encontrado" | "rpc_invalida" | "storage_indisponivel") {
    super("A exclusão não pôde prosseguir.");
    this.name = "ErroExclusao";
  }
}

interface FotoInventariada {
  foto_id: string;
  caminho: string;
  caminho_miniatura: string;
}

interface FotoPossuida {
  id: string;
  imovelIdentificadoId: string;
  caminho: string;
  caminhoMiniatura: string;
}

type RespostaRpc = Record<string, unknown> & { ok?: boolean; codigo?: string };

function responder(corpo: ResultadoExclusao | { falha: Falha }, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function pedidoDoCorpo(corpo: unknown): PedidoExclusao | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  if (Object.keys(corpo).length !== 1) return null;
  const { fotoId, imovelIdentificadoId, tudo } = corpo as Record<string, unknown>;
  if (typeof fotoId === "string" && UUID.test(fotoId)) return { alvo: "foto", fotoId };
  if (typeof imovelIdentificadoId === "string" && UUID.test(imovelIdentificadoId)) {
    return { alvo: "identificado", imovelIdentificadoId };
  }
  if (tudo === true) return { alvo: "tudo" };
  return null;
}

function clienteDeServico(url: string): SupabaseClient | null {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ---------------- Passo 0: posse sob RLS, com o token do chamador ---------------- */

/** Alheio == inexistente: a RLS não devolve a linha, e a resposta é 404. */
async function provarPosseDoIdentificado(
  chamador: SupabaseClient,
  imovelIdentificadoId: string,
): Promise<boolean> {
  const { data, error } = await chamador
    .from("imoveis_identificados")
    .select("id")
    .eq("id", imovelIdentificadoId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function provarPosseDaFoto(
  chamador: SupabaseClient,
  fotoId: string,
): Promise<FotoPossuida | null> {
  const { data, error } = await chamador
    .from("imoveis_identificados_fotos")
    .select("id, imovel_identificado_id, caminho, caminho_miniatura")
    .eq("id", fotoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    imovelIdentificadoId: String(data.imovel_identificado_id),
    caminho: String(data.caminho),
    caminhoMiniatura: String(data.caminho_miniatura),
  };
}

/* ---------------- Modelo Servidor: RPCs e Storage com service role ---------------- */

async function rpc(
  servico: SupabaseClient,
  nome: string,
  parametros: Record<string, unknown>,
): Promise<RespostaRpc> {
  const { data, error } = await servico.rpc(nome, parametros);
  if (error) {
    if (error.code === "P0002") throw new ErroExclusao("nao_encontrado");
    throw error;
  }
  if (!data || typeof data !== "object") throw new ErroExclusao("rpc_invalida");
  return data as RespostaRpc;
}

/**
 * Remove caminhos em lotes e devolve os que o Storage declarou removidos.
 * Um caminho reservado que nunca recebeu upload simplesmente não aparece
 * na resposta — não é erro, e quem decide sobre ele é a releitura do
 * prefixo mais a prova de ausência da RPC.
 */
async function removerObjetos(servico: SupabaseClient, caminhos: string[]): Promise<Set<string>> {
  const removidos = new Set<string>();
  for (let inicio = 0; inicio < caminhos.length; inicio += LOTE_REMOCAO_STORAGE) {
    const lote = caminhos.slice(inicio, inicio + LOTE_REMOCAO_STORAGE);
    const { data, error } = await servico.storage.from(BUCKET_FACHADAS).remove(lote);
    if (error) throw new ErroExclusao("storage_indisponivel");
    for (const objeto of data ?? []) if (lote.includes(objeto.name)) removidos.add(objeto.name);
  }
  return removidos;
}

async function listarPrefixo(
  servico: SupabaseClient,
  userId: string,
  prefixo: string,
): Promise<Set<string>> {
  const resposta = await rpc(servico, "listar_objetos_do_usuario", {
    p_user_id: userId,
    p_prefixo: prefixo,
  });
  const objetos = Array.isArray(resposta.objetos) ? resposta.objetos : [];
  return new Set(objetos.filter((nome): nome is string => typeof nome === "string"));
}

/**
 * Linha por último: só depois de os DOIS objetos da foto terem saído. A RPC
 * é a segunda prova — relê `storage.objects` e recusa com `objeto_pendente`
 * se algum reapareceu; nesse caso a linha fica e conta como pendência.
 */
async function confirmarFoto(
  servico: SupabaseClient,
  userId: string,
  foto: FotoInventariada,
): Promise<number> {
  const resposta = await rpc(servico, "confirmar_objeto_removido", {
    p_user_id: userId,
    p_foto_id: foto.foto_id,
  });
  if (resposta.ok === true) return 0;
  if (resposta.codigo !== "objeto_pendente") throw new ErroExclusao("rpc_invalida");
  return Number(resposta.original_presente === true) + Number(resposta.miniatura_presente === true);
}

/**
 * O backstop de §5.3: enumera o prefixo direto de `storage.objects`, remove
 * o que restou e RELÊ. Só a releitura vazia vale como prova.
 */
async function reconciliarPrefixo(
  servico: SupabaseClient,
  userId: string,
  prefixo: string,
): Promise<{ removidos: number; presentes: Set<string> }> {
  const encontrados = await listarPrefixo(servico, userId, prefixo);
  if (!encontrados.size) return { removidos: 0, presentes: encontrados };
  const removidos = (await removerObjetos(servico, [...encontrados])).size;
  return { removidos, presentes: await listarPrefixo(servico, userId, prefixo) };
}

function fotosDaResposta(resposta: RespostaRpc): FotoInventariada[] {
  const fotos = Array.isArray(resposta.fotos) ? resposta.fotos : [];
  return fotos.filter((foto): foto is FotoInventariada =>
    Boolean(foto) && typeof foto === "object"
    && typeof (foto as FotoInventariada).foto_id === "string"
    && typeof (foto as FotoInventariada).caminho === "string"
    && typeof (foto as FotoInventariada).caminho_miniatura === "string");
}

/**
 * Passos 3 a 7 de §13.3 sobre as fotos de um prefixo: remove os caminhos
 * conhecidos; confirma cada foto cujos DOIS objetos saíram; reconcilia o
 * prefixo (lista, remove resíduos, relê); e, com a releitura em mãos,
 * confirma o que ainda não pôde ser confirmado e já não está lá — a
 * reserva que nunca recebeu upload, e o objeto que só a reconciliação
 * alcançou. O que segue presente conta como pendência.
 *
 * Com `reconciliar = false` (foto isolada) o prefixo é apenas LIDO: as
 * outras fotos da mesma identidade estão lá por direito, e só os objetos
 * das fotos pedidas respondem pela pendência e pelo "vazio".
 */
async function removerFotos(
  servico: SupabaseClient,
  userId: string,
  prefixo: string,
  fotos: FotoInventariada[],
  reconciliar: boolean,
): Promise<ResultadoExclusao> {
  const caminhos = fotos.flatMap((foto) => [foto.caminho, foto.caminho_miniatura]);
  const saidos = caminhos.length ? await removerObjetos(servico, caminhos) : new Set<string>();

  let pendentes = 0;
  const naoConfirmadas: FotoInventariada[] = [];
  for (const foto of fotos) {
    if (saidos.has(foto.caminho) && saidos.has(foto.caminho_miniatura)) {
      pendentes += await confirmarFoto(servico, userId, foto);
    } else {
      naoConfirmadas.push(foto);
    }
  }

  const { removidos, presentes } = reconciliar
    ? await reconciliarPrefixo(servico, userId, prefixo)
    : { removidos: 0, presentes: await listarPrefixo(servico, userId, prefixo) };
  for (const foto of naoConfirmadas) {
    const objetosDaFoto = [foto.caminho, foto.caminho_miniatura]
      .filter((caminho) => presentes.has(caminho)).length;
    pendentes += objetosDaFoto > 0 ? objetosDaFoto : await confirmarFoto(servico, userId, foto);
  }
  const conhecidos = new Set(caminhos);
  const residuais = [...presentes].filter((nome) => !conhecidos.has(nome)).length;
  if (reconciliar) pendentes += residuais;

  return {
    removidos: saidos.size + removidos,
    pendentes,
    prefixoVazio: reconciliar ? presentes.size === 0 : presentes.size === residuais,
    concluido: false,
  };
}

/** Passos 2 a 7 para uma identidade: marca o pai e inventaria, depois `removerFotos`. */
async function removerObjetosDaIdentidade(
  servico: SupabaseClient,
  userId: string,
  imovelIdentificadoId: string,
): Promise<ResultadoExclusao> {
  const inicio = await rpc(servico, "iniciar_exclusao_imovel_identificado", {
    p_user_id: userId,
    p_imovel_identificado_id: imovelIdentificadoId,
  });
  if (inicio.ok !== true) throw new ErroExclusao("rpc_invalida");
  return removerFotos(servico, userId, `${userId}/${imovelIdentificadoId}/`, fotosDaResposta(inicio), true);
}

async function excluirImovelIdentificado(
  servico: SupabaseClient,
  userId: string,
  imovelIdentificadoId: string,
): Promise<ResultadoExclusao> {
  const etapa = await removerObjetosDaIdentidade(servico, userId, imovelIdentificadoId);
  // Objeto no prefixo, com ou sem linha: concluir agora o orfanaria para
  // sempre (o pai é o que torna o prefixo enumerável). Fica pendente.
  if (etapa.pendentes > 0 || !etapa.prefixoVazio) return etapa;

  const conclusao = await rpc(servico, "concluir_exclusao_imovel_identificado", {
    p_user_id: userId,
    p_imovel_identificado_id: imovelIdentificadoId,
  });
  if (conclusao.ok === true) return { ...etapa, concluido: true };
  if (conclusao.codigo === "objetos_pendentes") {
    return { ...etapa, pendentes: Number(conclusao.pendentes ?? 1) };
  }
  throw new ErroExclusao("rpc_invalida");
}

/**
 * Foto isolada: mesma disciplina, sem marcar o pai e sem reconciliar — o
 * prefixo da identidade dona só é lido, para provar que os dois objetos
 * desta foto saíram. Se o Storage falhar, a linha fica e a foto continua
 * aparecendo — honesto, porque o arquivo continua existindo.
 */
async function removerFotoAvistamento(
  servico: SupabaseClient,
  userId: string,
  foto: FotoPossuida,
): Promise<ResultadoExclusao> {
  const etapa = await removerFotos(servico, userId, `${userId}/${foto.imovelIdentificadoId}/`, [
    { foto_id: foto.id, caminho: foto.caminho, caminho_miniatura: foto.caminhoMiniatura },
  ], false);
  return { ...etapa, concluido: etapa.pendentes === 0 };
}

/**
 * "Apagar todos os meus dados": a versão em lote. Cada identidade passa
 * pelos passos 2 a 7, o prefixo `{user_id}/` inteiro é reconciliado, e só
 * então `apagar_prospeccao_do_usuario` — que recusa enquanto sobrar linha
 * de foto. Sucesso só com o prefixo do usuário vazio na releitura final.
 */
async function apagarProspeccaoDoUsuario(
  servico: SupabaseClient,
  userId: string,
): Promise<ResultadoExclusao> {
  const { data, error } = await servico
    .from("imoveis_identificados")
    .select("id")
    .eq("user_id", userId);
  if (error) throw error;
  const identidades = ((data ?? []) as { id: string }[]).map((linha) => linha.id);

  let removidos = 0;
  let pendentes = 0;
  for (const id of identidades) {
    const etapa = await removerObjetosDaIdentidade(servico, userId, id);
    removidos += etapa.removidos;
    pendentes += etapa.pendentes;
  }

  const prefixo = `${userId}/`;
  const reconciliacao = await reconciliarPrefixo(servico, userId, prefixo);
  removidos += reconciliacao.removidos;
  if (pendentes > 0 || reconciliacao.presentes.size > 0) {
    return {
      removidos,
      pendentes: Math.max(pendentes, reconciliacao.presentes.size),
      prefixoVazio: reconciliacao.presentes.size === 0,
      concluido: false,
    };
  }

  const conclusao = await rpc(servico, "apagar_prospeccao_do_usuario", { p_user_id: userId });
  if (conclusao.ok !== true) {
    if (conclusao.codigo === "objetos_pendentes") {
      return { removidos, pendentes: Number(conclusao.pendentes ?? 1), prefixoVazio: true, concluido: false };
    }
    throw new ErroExclusao("rpc_invalida");
  }
  // Releitura final: a única prova aceita de que o tenant ficou limpo.
  const restantes = (await listarPrefixo(servico, userId, prefixo)).size;
  return { removidos, pendentes: restantes, prefixoVazio: restantes === 0, concluido: restantes === 0 };
}

/* ---------------- A rota ---------------- */

/** Só depois da posse provada a service role entra em cena. */
async function executar(
  chamador: SupabaseClient,
  servico: () => SupabaseClient | null,
  userId: string,
  pedido: PedidoExclusao,
): Promise<Response> {
  let foto: FotoPossuida | null = null;
  if (pedido.alvo === "foto") {
    foto = await provarPosseDaFoto(chamador, pedido.fotoId);
    if (!foto) return responder({ falha: "nao_encontrado" }, 404);
  } else if (pedido.alvo === "identificado") {
    if (!(await provarPosseDoIdentificado(chamador, pedido.imovelIdentificadoId))) {
      return responder({ falha: "nao_encontrado" }, 404);
    }
  }

  const cliente = servico();
  if (!cliente) {
    console.error("Prospecção: SUPABASE_SERVICE_ROLE_KEY ausente (ver DEPLOY.md).");
    return responder({ falha: "indisponivel" }, 503);
  }
  if (pedido.alvo === "tudo") return responder(await apagarProspeccaoDoUsuario(cliente, userId));
  if (pedido.alvo === "identificado") {
    return responder(await excluirImovelIdentificado(cliente, userId, pedido.imovelIdentificadoId));
  }
  return responder(await removerFotoAvistamento(cliente, userId, foto as FotoPossuida));
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = tokenDaRequisicao(request);
  if (!url || !anon || !token) return responder({ falha: "nao_autenticado" }, 401);

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_CORPO_BYTES) return responder({ falha: "corpo_invalido" }, 413);
  const pedido = pedidoDoCorpo(await request.json().catch(() => null));
  if (!pedido) return responder({ falha: "corpo_invalido" }, 400);

  const chamador = clienteDoChamador(url, anon, token);
  const { data, error } = await chamador.auth.getUser();
  if (error || !data.user) return responder({ falha: "nao_autenticado" }, 401);

  try {
    return await executar(chamador, () => clienteDeServico(url), data.user.id, pedido);
  } catch (e) {
    if (e instanceof ErroExclusao && e.codigo === "nao_encontrado") {
      return responder({ falha: "nao_encontrado" }, 404);
    }
    console.error("Prospecção: falha na exclusão coordenada:", sanitizarErroExterno(e, "consultarSupabase"));
    return responder({ falha: "indisponivel" }, 503);
  }
}
