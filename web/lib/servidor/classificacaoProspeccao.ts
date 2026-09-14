/* ================================================================
   GARIMPO EM CAMPO — classificação de um avistamento (C8)

   ATENÇÃO: módulo SÓ DE SERVIDOR. Recebe o cliente de service role e o
   executor da OpenAI já criados pela rota; nunca importe daqui em nada que
   chegue ao browser.

   O ciclo, na ordem da V7 (§8.2), e a ordem NÃO é negociável:

     reler o avistamento SOB RLS  →  texto curto? 'nao_aplicavel', sem token
       →  fingerprint de conteúdo  →  iniciar_classificacao (claim no banco)
       →  repetida / ocupado / exclusão respondem sem modelo
       →  modo 'reuso': concluir direto, ZERO token, ZERO ia_uso
       →  modo 'modelo': permissão, ambiente, teto diário — UMA chamada
       →  parse tudo-ou-nada  →  validação determinística (catálogo, piso,
          evidência)  →  concluir_classificacao (UMA transação)

   Três coisas que este módulo nunca faz: chamar o modelo antes do claim,
   confiar em texto vindo do browser, e gravar meia classificação. E o que
   ele nunca escreve em log: observação, endereço, nome, telefone, caminho
   de foto ou resposta bruta do modelo — só código e contadores.
   ================================================================ */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CategoriaEtiquetaProspeccao, CodigoEtiquetaProspeccao } from "@/lib/calculo/catalogoEtiquetas";
import { VERSAO_CATALOGO_ETIQUETAS } from "@/lib/calculo/catalogoEtiquetas";
import {
  CONFIANCA_MINIMA_ETIQUETA,
  validarEtiquetasClassificadas,
} from "@/lib/calculo/etiquetasProspeccao";
import {
  ESQUEMA_ETIQUETAS,
  VERSAO_CLASSIFICADOR_ETIQUETAS,
  interpretarSaidaClassificador,
  materialFingerprintClassificacao,
  observacaoClassificavel,
  promptClassificarObservacao,
  type FalhaIa,
} from "@/lib/calculo/ia";
import type {
  EstadoClassificacaoAvistamento,
  ModoClassificacaoProspeccao,
  TipoImovelProspeccao,
} from "@/lib/calculo/prospeccao";
import { agoraISOComHora, inicioDoDiaOperacionalISO } from "@/lib/datas";
import type { VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { MAX_TOKENS_CLASSIFICACAO_IA } from "@/lib/servidor/ia/config";
import { classificarErroIa, type ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { podeUsarIa } from "@/lib/servidor/iaAcesso";
import { registrarEvento } from "@/lib/servidor/registro";
import { ChamadaOpenAIRealNaoAutorizadaError } from "@/lib/servidor/openai-real";

/** O `tipo` gravado em `ia_uso` e o nome do pedido no executor. */
export const TIPO_PEDIDO_CLASSIFICACAO = "classificar-imovel-identificado";

/** Teto diário por usuário (V7 §8.7, trava 6): contado no servidor sobre
    `ia_uso` com service role, filtrado pelo `user_id` autenticado. Só o que
    gerou uso real de IA entra na conta — a linha em `ia_uso` nasce no
    executor, então reuso, repetida, ocupado, `nao_aplicavel`, indisponível
    antes da chamada e falha de claim não consomem cota por construção.
    Decisão de produto (14/09/2026): 200 execuções `modo='modelo'` por
    usuário por DIA OPERACIONAL, com reset à meia-noite do fuso canônico
    (`FUSO_OPERACIONAL`, via `inicioDoDiaOperacionalISO`). Sem janela móvel. */
export const TETO_DIARIO_CLASSIFICACOES = 200;

export interface TetoDiarioClassificacao {
  maximo: number;
  /** Instante ISO (timestamptz) a partir do qual as chamadas contam. */
  desde: string;
}

/** O teto do dia operacional corrente. `hojeOperacional` é "YYYY-MM-DD" no
    fuso do projeto (padrão: agora), injetável em teste. */
export function tetoDiarioClassificacao(
  hojeOperacional: string = agoraISOComHora().slice(0, 10),
): TetoDiarioClassificacao {
  const desde = inicioDoDiaOperacionalISO(hojeOperacional);
  if (!desde) throw new Error("Dia operacional inválido para o teto diário.");
  return { maximo: TETO_DIARIO_CLASSIFICACOES, desde };
}

export type FalhaClassificacao =
  | FalhaIa
  | "limite-diario"
  | "ocupado"
  | "exclusao-em-andamento";

export interface EtiquetaClassificada {
  categoria: CategoriaEtiquetaProspeccao;
  codigo: CodigoEtiquetaProspeccao;
  confianca: number;
}

/** O contrato público da rota (V7 §19). Nenhum campo a mais. */
export type RespostaClassificacao =
  | { ok: true; repetida: true }
  | {
      ok: true;
      estado: EstadoClassificacaoAvistamento;
      modo: ModoClassificacaoProspeccao | null;
      etiquetas: EtiquetaClassificada[];
      tipo: { sugerido: TipoImovelProspeccao; confianca: number | null } | null;
      snapshotAplicado: boolean;
    }
  | { ok: false; falha: FalhaClassificacao };

export interface DependenciasClassificacao {
  /** Cliente com o token do chamador: tudo que lê passa pela RLS. */
  chamador: SupabaseClient;
  /** Service role: só para as RPCs do modelo Servidor, a contagem do teto e
      o `nao_aplicavel`. Sempre filtrado por `userId`. */
  servico: SupabaseClient;
  /** De `auth.getUser()`, nunca do corpo. */
  userId: string;
  /** `null` quando o ambiente não libera IA real (sem chave, Preview, CI):
      o run termina `indisponivel` e isso é o comportamento CORRETO. */
  executor: ExecutorOpenAI | null;
  configuracao: VersaoConfiguracaoIa;
  /** O teto do dia (`tetoDiarioClassificacao()`); `null` só em teste, para
      isolar o resto do ciclo. */
  tetoDiario: TetoDiarioClassificacao | null;
}

/** Erro de posse/inexistência: a rota responde 404 sem distinguir os dois. */
export class AvistamentoNaoEncontradoError extends Error {
  constructor() {
    super("Avistamento não encontrado.");
    this.name = "AvistamentoNaoEncontradoError";
  }
}

type RespostaRpc = Record<string, unknown> & { ok?: boolean; codigo?: string; repetida?: boolean };

interface AvistamentoRelido {
  id: string;
  imovelIdentificadoId: string;
  observacao: string;
  observacaoRevisao: number;
  classificacaoEstado: EstadoClassificacaoAvistamento;
}

interface IdentidadeRelida {
  exclusaoSolicitadaEm: string | null;
  tipo: string | null;
  tipoOrigem: string | null;
}

interface Claim {
  avistamentoId: string;
  runId: string;
  leaseToken: string;
  modo: ModoClassificacaoProspeccao;
}

export function fingerprintClassificacao(material: string): string {
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/* ---------------- Releitura sob RLS: a posse é do cliente do chamador ---------------- */

async function relerAvistamento(chamador: SupabaseClient, avistamentoId: string): Promise<AvistamentoRelido> {
  const { data, error } = await chamador
    .from("imoveis_identificados_avistamentos")
    .select("id, imovel_identificado_id, observacao, observacao_revisao, classificacao_estado")
    .eq("id", avistamentoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AvistamentoNaoEncontradoError();
  return {
    id: String(data.id),
    imovelIdentificadoId: String(data.imovel_identificado_id),
    observacao: typeof data.observacao === "string" ? data.observacao : "",
    observacaoRevisao: Number(data.observacao_revisao) || 1,
    classificacaoEstado: data.classificacao_estado as EstadoClassificacaoAvistamento,
  };
}

async function relerIdentidade(chamador: SupabaseClient, imovelIdentificadoId: string): Promise<IdentidadeRelida> {
  const { data, error } = await chamador
    .from("imoveis_identificados")
    .select("id, exclusao_solicitada_em, tipo, tipo_origem")
    .eq("id", imovelIdentificadoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AvistamentoNaoEncontradoError();
  return {
    exclusaoSolicitadaEm: (data.exclusao_solicitada_em as string | null) ?? null,
    tipo: (data.tipo as string | null) ?? null,
    tipoOrigem: (data.tipo_origem as string | null) ?? null,
  };
}

/** As etiquetas vigentes do avistamento depois da execução, relidas sob
    RLS. A resposta da rota descreve o que está no banco, não o que o módulo
    pretendia gravar — e inclui o que a execução reafirmou (a RPC mantém a
    linha antiga em vez de duplicar) e o que um humano já confirmou. */
async function etiquetasVigentesDoAvistamento(chamador: SupabaseClient, avistamentoId: string): Promise<EtiquetaClassificada[]> {
  const { data, error } = await chamador
    .from("imoveis_identificados_etiquetas")
    .select("categoria, codigo, confianca")
    .eq("avistamento_id", avistamentoId)
    .in("estado", ["inferida", "confirmada"])
    .order("categoria")
    .order("codigo");
  if (error) throw error;
  return ((data ?? []) as { categoria: string; codigo: string; confianca: number | null }[]).map((linha) => ({
    categoria: linha.categoria as CategoriaEtiquetaProspeccao,
    codigo: linha.codigo as CodigoEtiquetaProspeccao,
    confianca: Number(linha.confianca ?? 0),
  }));
}

/** O tipo sugerido que a execução guardou, relido sob RLS. */
async function execucaoRelida(
  chamador: SupabaseClient,
  runId: string,
): Promise<{ tipo: { sugerido: TipoImovelProspeccao; confianca: number | null } | null } | null> {
  const { data, error } = await chamador
    .from("imoveis_identificados_classificacoes")
    .select("tipo_sugerido, tipo_confianca")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sugerido = data.tipo_sugerido as TipoImovelProspeccao | null;
  const confianca = data.tipo_confianca as number | null;
  return { tipo: sugerido ? { sugerido, confianca: confianca === null ? null : Number(confianca) } : null };
}

/* ---------------- Modelo Servidor: RPCs com service role, p_user_id da sessão ---------------- */

async function rpc(servico: SupabaseClient, nome: string, parametros: Record<string, unknown>): Promise<RespostaRpc> {
  const { data, error } = await servico.rpc(nome, parametros);
  if (error) {
    if (error.code === "P0002") throw new AvistamentoNaoEncontradoError();
    throw error;
  }
  if (!data || typeof data !== "object") throw new Error("Resposta inválida da RPC de classificação.");
  return data as RespostaRpc;
}

async function falhar(deps: DependenciasClassificacao, claim: Claim, codigo: string): Promise<void> {
  await rpc(deps.servico, "falhar_classificacao", {
    p_user_id: deps.userId,
    p_run_id: claim.runId,
    p_lease_token: claim.leaseToken,
    p_falha_codigo: codigo,
  });
}

/** Texto curto: o avistamento fica `nao_aplicavel`, sem execução e sem
    token. Update direto com service role, filtrado pelo usuário
    autenticado e nunca sobre um avistamento já concluído (a bicondicional
    do C2a não admitiria). */
async function marcarNaoAplicavel(deps: DependenciasClassificacao, avistamento: AvistamentoRelido): Promise<void> {
  if (avistamento.classificacaoEstado === "nao_aplicavel" || avistamento.classificacaoEstado === "concluida") return;
  const { error } = await deps.servico
    .from("imoveis_identificados_avistamentos")
    .update({ classificacao_estado: "nao_aplicavel" })
    .eq("id", avistamento.id)
    .eq("user_id", deps.userId);
  if (error) throw error;
}

async function classificacoesDesde(deps: DependenciasClassificacao, desde: string): Promise<number> {
  const { count, error } = await deps.servico
    .from("ia_uso")
    .select("id", { count: "exact", head: true })
    .eq("user_id", deps.userId)
    .eq("tipo", TIPO_PEDIDO_CLASSIFICACAO)
    .gte("criado_em", desde);
  if (error) throw error;
  return count ?? 0;
}

function registrar(
  deps: DependenciasClassificacao,
  nivel: "info" | "aviso" | "erro",
  evento: string,
  detalhe: string,
): void {
  registrarEvento({ userId: deps.userId, categoria: "ia", nivel, evento, detalhe });
}

/* ---------------- O ciclo ---------------- */

async function concluir(
  deps: DependenciasClassificacao,
  claim: Claim,
  tipo: { sugerido: TipoImovelProspeccao; confianca: number | null } | null,
  etiquetas: EtiquetaClassificada[],
  contadores: { sugeridas: number; abaixoDoPiso: number; foraDoCatalogo: number; semEvidencia: number },
): Promise<RespostaClassificacao> {
  const resposta = await rpc(deps.servico, "concluir_classificacao", {
    p_user_id: deps.userId,
    p_run_id: claim.runId,
    p_lease_token: claim.leaseToken,
    p_tipo_sugerido: tipo?.sugerido ?? null,
    p_tipo_confianca: tipo?.confianca ?? null,
    p_etiquetas: etiquetas.map((etiqueta) => ({
      categoria: etiqueta.categoria,
      codigo: etiqueta.codigo,
      confianca: etiqueta.confianca,
    })),
    p_contadores: {
      sugeridas: contadores.sugeridas,
      abaixo_do_piso: contadores.abaixoDoPiso,
      fora_do_catalogo: contadores.foraDoCatalogo,
      sem_evidencia: contadores.semEvidencia,
    },
  });

  if (resposta.ok !== true) {
    // A RPC já encerrou o run como `abandonada` nos dois casos; nada a
    // compensar aqui. O código vai para o log, nunca o conteúdo.
    const codigo = String(resposta.codigo ?? "rpc_invalida");
    registrar(deps, "aviso", "ia-classificacao-falhou", `concluir: ${codigo}`);
    if (codigo === "exclusao_em_andamento") return { ok: false, falha: "exclusao-em-andamento" };
    return { ok: false, falha: "falha-ia" };
  }
  if (resposta.repetida === true) return { ok: true, repetida: true };

  // A resposta descreve o que o banco gravou — inclusive no reuso, em que o
  // tipo e as etiquetas foram copiados dentro da RPC e este módulo não os viu.
  const [gravadas, execucao] = await Promise.all([
    etiquetasVigentesDoAvistamento(deps.chamador, claim.avistamentoId),
    execucaoRelida(deps.chamador, claim.runId),
  ]);
  const snapshotAplicado = resposta.snapshot_aplicado === true;
  registrar(
    deps,
    "info",
    "ia-classificacao-concluida",
    `modo=${claim.modo} aplicadas=${Number(resposta.aplicadas ?? gravadas.length)} snapshot=${snapshotAplicado ? "sim" : "nao"}`,
  );
  return {
    ok: true,
    estado: "concluida",
    modo: claim.modo,
    etiquetas: gravadas,
    tipo: execucao?.tipo ?? tipo,
    snapshotAplicado,
  };
}

async function executarModelo(
  deps: DependenciasClassificacao,
  claim: Claim,
  avistamento: AvistamentoRelido,
  rota: { modelo: string; esforco: VersaoConfiguracaoIa["classificacao"]["esforco"] },
): Promise<RespostaClassificacao> {
  // 1. Permissão da conta, lida sob RLS — igual a /api/ia.
  if (!(await podeUsarIa(deps.chamador, deps.userId))) {
    await falhar(deps, claim, "sem-permissao");
    registrar(deps, "aviso", "ia-sem-permissao", TIPO_PEDIDO_CLASSIFICACAO);
    return { ok: false, falha: "sem-permissao" };
  }

  // 2. Ambiente: sem executor não há IA real aqui (dev, Preview, CI). O run
  //    fica `indisponivel` e a tela diz "aguardando classificação".
  if (!deps.executor) {
    await falhar(deps, claim, "indisponivel");
    registrar(deps, "info", "ia-classificacao-falhou", "indisponivel");
    return { ok: false, falha: "nao-configurado" };
  }

  // 3. Teto diário, no servidor, pelo usuário autenticado — quando definido.
  if (deps.tetoDiario && (await classificacoesDesde(deps, deps.tetoDiario.desde)) >= deps.tetoDiario.maximo) {
    await falhar(deps, claim, "limite-diario");
    registrar(deps, "aviso", "ia-classificacao-limite-diario", `teto=${deps.tetoDiario.maximo}`);
    return { ok: false, falha: "limite-diario" };
  }

  // 4. UMA chamada. O executor registra o uso em `ia_uso` por dentro — é a
  //    única linha de custo desta execução, e só existe porque o modelo rodou.
  let texto: string;
  try {
    const resultado = await deps.executor.executar({
      tipo: TIPO_PEDIDO_CLASSIFICACAO,
      mensagens: [{ role: "user", content: promptClassificarObservacao(avistamento.observacao) }],
      reasoningEffort: rota.esforco,
      maxCompletionTokens: MAX_TOKENS_CLASSIFICACAO_IA,
      formato: { nome: "etiquetas_avistamento", esquema: ESQUEMA_ETIQUETAS as unknown as Record<string, unknown> },
    });
    texto = resultado.texto;
  } catch (e) {
    const naoAutorizada = e instanceof ChamadaOpenAIRealNaoAutorizadaError;
    const falha: FalhaIa = naoAutorizada ? "nao-configurado" : classificarErroIa(e);
    console.error("Garimpo: falha ao classificar avistamento:", sanitizarErroExterno(e, "iaTexto"));
    await falhar(deps, claim, naoAutorizada ? "indisponivel" : falha);
    registrar(deps, naoAutorizada ? "info" : "erro", "ia-classificacao-falhou", naoAutorizada ? "indisponivel" : falha);
    return { ok: false, falha };
  }

  // 5. Parse tudo ou nada: estrutura quebrada descarta a execução inteira.
  const saida = texto ? interpretarSaidaClassificador(texto) : null;
  if (!saida) {
    await falhar(deps, claim, "saida-invalida");
    registrar(deps, "erro", "ia-classificacao-falhou", "saida-invalida");
    return { ok: false, falha: "falha-modelo" };
  }

  // 6. Validação determinística das ETIQUETAS: catálogo, piso e evidência
  //    literal na observação GUARDADA. O tipo sugerido não passa por piso:
  //    o enum do esquema e o parse (0..100) já o validam, e quem decide se
  //    ele vira snapshot é `concluir_classificacao`, pelas regras canônicas
  //    (corrente, manual, confirmado, nulo não apaga). A execução guarda
  //    `tipo_sugerido` + `tipo_confianca` como o modelo devolveu.
  const validacao = validarEtiquetasClassificadas(saida.etiquetas, avistamento.observacao, CONFIANCA_MINIMA_ETIQUETA);
  const tipo = saida.tipo ? { sugerido: saida.tipo, confianca: saida.tipoConfianca } : null;

  return concluir(deps, claim, tipo, validacao.etiquetas, validacao.contadores);
}

/**
 * Classifica UM avistamento. `avistamentoId` é a única coisa que vem de
 * fora; texto, revisão, tipo declarado e exclusão são relidos do banco sob
 * a RLS do chamador. Lança `AvistamentoNaoEncontradoError` para alheio ou
 * inexistente (indistinguíveis de propósito).
 */
export async function classificarAvistamento(
  deps: DependenciasClassificacao,
  avistamentoId: string,
): Promise<RespostaClassificacao> {
  const avistamento = await relerAvistamento(deps.chamador, avistamentoId);
  const identidade = await relerIdentidade(deps.chamador, avistamento.imovelIdentificadoId);
  if (identidade.exclusaoSolicitadaEm) return { ok: false, falha: "exclusao-em-andamento" };

  if (!observacaoClassificavel(avistamento.observacao)) {
    await marcarNaoAplicavel(deps, avistamento);
    return { ok: true, estado: "nao_aplicavel", modo: null, etiquetas: [], tipo: null, snapshotAplicado: false };
  }

  // A MESMA rota `classificacao` do classificador do webhook, resolvida pelo
  // Centro de IA: versão publicada, ou `CONFIGURACAO_IA_PADRAO` quando não
  // há nenhuma. O recomendado do /admin é proposta, não fallback. O Garimpo
  // não tem configuração própria de modelo, e não deve ganhar uma.
  const rota = deps.configuracao.classificacao;
  const fingerprint = fingerprintClassificacao(materialFingerprintClassificacao({
    observacao: avistamento.observacao,
    // Só o tipo que um humano declarou entra na chave: o inferido pela IA é
    // saída de uma execução anterior, não contexto.
    tipoDeclarado: identidade.tipoOrigem === "manual" ? identidade.tipo : null,
    versaoCatalogo: VERSAO_CATALOGO_ETIQUETAS,
    versaoClassificador: VERSAO_CLASSIFICADOR_ETIQUETAS,
    modelo: rota.modelo,
    confiancaMinima: CONFIANCA_MINIMA_ETIQUETA,
  }));

  // O claim é do banco: uma execução `processando` por avistamento,
  // idempotência por revisão + fingerprint, lease de 2 min e advisory lock
  // — tudo dentro da RPC. Aqui só se lê a decisão.
  const inicio = await rpc(deps.servico, "iniciar_classificacao", {
    p_user_id: deps.userId,
    p_avistamento_id: avistamento.id,
    p_fingerprint: fingerprint,
    p_modelo: rota.modelo,
    p_esforco: rota.esforco,
    p_versao_catalogo: VERSAO_CATALOGO_ETIQUETAS,
    p_versao_classificador: VERSAO_CLASSIFICADOR_ETIQUETAS,
    p_confianca_minima: CONFIANCA_MINIMA_ETIQUETA,
  });

  if (inicio.ok !== true) {
    if (inicio.codigo === "exclusao_em_andamento") return { ok: false, falha: "exclusao-em-andamento" };
    if (inicio.ocupado === true) return { ok: false, falha: "ocupado" };
    throw new Error("Resposta inválida de iniciar_classificacao.");
  }
  if (inicio.repetida === true) return { ok: true, repetida: true };
  if (typeof inicio.run_id !== "string" || typeof inicio.lease_token !== "string"
      || (inicio.modo !== "modelo" && inicio.modo !== "reuso")) {
    throw new Error("Claim de classificação sem execução.");
  }
  const claim: Claim = {
    avistamentoId: avistamento.id,
    runId: inicio.run_id,
    leaseToken: inicio.lease_token,
    modo: inicio.modo,
  };

  // Reuso (decidido pelo banco, nunca pelo cliente): a RPC copia as
  // etiquetas da execução de origem por dentro e ignora o payload. Zero
  // token, zero linha em `ia_uso`. A UX do reuso é do C9; aqui só se honra o
  // contrato de não deixar uma execução pendurada.
  if (claim.modo === "reuso") {
    return concluir(deps, claim, null, [], { sugeridas: 0, abaixoDoPiso: 0, foraDoCatalogo: 0, semEvidencia: 0 });
  }

  return executarModelo(deps, claim, avistamento, rota);
}
