/* ================================================================
   O MODELO RELACIONAL DE CONTATOS, LIDO PELO SERVIDOR.

   A Fase 1a-A criou `contatos`, `contatos_telefones`, `imoveis_contatos`
   e `contatos_revisoes`; a 1a-B criou o motor puro que decide a qual
   imóvel uma mensagem pertence. Este módulo é a ponte entre os dois: lê o
   canal, resolve a pessoa, monta os candidatos e chama o motor.

   Na 1a-C1 o resultado só era observado. Desde a 1a-C2.1a ele é lido
   ANTES da nota e entra na decisão de autoridade
   (`calculo/autoridadeAtribuicao.ts`): o motor manda quando resolve um
   imóvel não terminal, e o legado continua mandando em todo o resto. Quem
   decide não é este módulo; aqui só se resolve, uma vez por mensagem.

   Duas regras que valem para todo este arquivo:

   - **A service role ignora a RLS**, então TODA consulta filtra
     `user_id` explicitamente — o mesmo contrato do resto do webhook, onde
     o dono nasce da instância e nunca da requisição.
   - **Nada aqui escreve dado de negócio.** Sem insert, sem update, sem
     RPC de escrita, sem IA, sem transcrição. A única escrita permitida é
     o evento de observabilidade, e ela acontece fora deste módulo.

   `updated_at` não é lido em lugar nenhum: é justamente o que o modelo
   novo existe para parar de usar como evidência.
   ================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolverAtribuicaoMensagem,
  type ContextoAgendamento,
  type ImovelParaAtribuicao,
  type ResultadoAtribuicao,
} from "../calculo/atribuicaoMensagem";
import {
  classificarComparacao,
  resolverContatoSobrevivente,
  MAX_SALTOS_FUSAO,
  type CategoriaComparacao,
  type ContatoParaResolucao,
  type FalhaResolucaoContato,
} from "../calculo/resolucaoContato";
import type { DecisaoAutoridade, ResolucaoRelacional } from "../calculo/autoridadeAtribuicao";
import { ATRIBUICAO_MENSAGEM } from "../constantes";
import { instanteParaISOOperacional, isoDeTimestamp, timestampDeIso } from "../datas";

/** Quantas buscas a travessia de lápide pode fazer: o contato do canal
    mais um salto por fusão, até o teto da cadeia. Cada busca é por ID —
    nunca uma página da tabela. */
const MAX_BUSCAS_CADEIA = MAX_SALTOS_FUSAO + 1;

export interface EntradaShadow {
  userId: string;
  /** Telefone já canonizado pela mesma regra do banco. */
  telefoneCanonico: string;
  /** Texto da mensagem recebida — usado só pelo motor (referência
      explícita); nunca sai deste processo. */
  texto: string;
  /** Instante da mensagem, na convenção ISO local do projeto. */
  recebidaEm: string;
  /** O imóvel que o fluxo legado escolheu, para a comparação. */
  legadoImovelId: string | null;
  /** Direção do evento, só para o log distinguir entrada de saída. */
  direcao: "recebida" | "enviada";
}

export interface ObservacaoShadow {
  categoria: CategoriaComparacao;
  /** O estado da resolução em si, sem a comparação com o legado. É ele
      que entra na decisão de autoridade. */
  estado: "resolvido" | "pendente" | "sem-candidatos" | "sem-contato-relacional" | "falha";
  contatoId: string | null;
  /** Nível do motor quando resolveu (`unico`, `contexto-tentativa`…). */
  nivel: string | null;
  terminal: boolean;
  candidatos: number;
  terminais: number;
  /** Os ids por trás das contagens, ordenados como o motor devolve. */
  candidatoIds: readonly string[];
  terminalIds: readonly string[];
  novoImovelId: string | null;
  legadoImovelId: string | null;
  direcao: "recebida" | "enviada";
  /** Preenchido só quando a categoria é `falha`. Vocabulário fechado —
      nunca a mensagem de erro crua, que poderia carregar dado do banco. */
  falha?: FalhaShadow;
  /** Quantos saltos de fusão a resolução do contato precisou. */
  saltos?: number;
}

export type FalhaShadow =
  | "consulta-canal"
  | "consulta-contatos"
  | "consulta-vinculos"
  | "consulta-imoveis"
  | "consulta-agendamentos"
  | "motor"
  | `lapide-${FalhaResolucaoContato}`
  | "inesperada";

function falha(motivo: FalhaShadow, entrada: EntradaShadow, saltos?: number): ObservacaoShadow {
  return {
    categoria: "falha",
    estado: "falha",
    contatoId: null,
    nivel: null,
    terminal: false,
    candidatos: 0,
    terminais: 0,
    candidatoIds: [],
    terminalIds: [],
    novoImovelId: null,
    legadoImovelId: entrada.legadoImovelId,
    direcao: entrada.direcao,
    falha: motivo,
    ...(saltos === undefined ? {} : { saltos }),
  };
}

/**
 * Resolve contato + candidatos, roda o motor e devolve o resultado junto
 * com a comparação com o legado.
 *
 * **Nunca lança.** Qualquer anomalia — consulta recusada, lápide
 * inconsistente, motor reclamando de entrada — vira uma observação com
 * `estado: "falha"`, porque o webhook não pode parar por causa da
 * resolução nova. Falhar aberto para o legado continua sendo o contrato:
 * a decisão de autoridade trata `falha` como fallback, nunca como "sem
 * candidato".
 */
export async function observarAtribuicao(
  supabase: SupabaseClient,
  entrada: EntradaShadow,
): Promise<ObservacaoShadow> {
  try {
    // 1. Canal ativo -> contato. A unicidade do canal ativo por conta é
    //    garantida por índice parcial desde a 1a-A, então `maybeSingle`
    //    descreve o contrato real, não um palpite.
    const canal = await supabase
      .from("contatos_telefones")
      .select("contato_id")
      .eq("user_id", entrada.userId)
      .eq("telefone_canonico", entrada.telefoneCanonico)
      .is("desativado_em", null)
      .maybeSingle();
    if (canal.error) return falha("consulta-canal", entrada);
    const contatoDoCanal = canal.data?.contato_id as string | undefined;
    if (!contatoDoCanal) {
      // Sem contato relacional: o legado segue sozinho, e o evento existe
      // para medir quanto o fallback ainda seria necessário no cutover.
      return {
        categoria: "sem-contato-relacional",
        estado: "sem-contato-relacional",
        contatoId: null,
        nivel: null,
        terminal: false,
        candidatos: 0,
        terminais: 0,
        candidatoIds: [],
        terminalIds: [],
        novoImovelId: null,
        legadoImovelId: entrada.legadoImovelId,
        direcao: entrada.direcao,
      };
    }

    // 2. Lápide: o contato do canal pode ter sido absorvido por outro. A
    //    cadeia é buscada pelo ID que o canal devolveu — identidade, não
    //    posição na tabela.
    const porId = await carregarCadeiaDeFusao(supabase, entrada.userId, contatoDoCanal);
    if (porId === null) return falha("consulta-contatos", entrada);
    const resolucao = resolverContatoSobrevivente(contatoDoCanal, entrada.userId, porId);
    if (!resolucao.ok) return falha(`lapide-${resolucao.falha}`, entrada, resolucao.saltos);
    const contatoId = resolucao.contatoId;

    // 3. Vínculos VIGENTES do contato sobrevivente.
    const vinculos = await supabase
      .from("imoveis_contatos")
      .select("imovel_id")
      .eq("user_id", entrada.userId)
      .eq("contato_id", contatoId)
      .is("encerrado_em", null);
    if (vinculos.error) return falha("consulta-vinculos", entrada);
    const imovelIds = [...new Set((vinculos.data || []).map((v) => String(v.imovel_id)))];

    // 4. O mínimo dos imóveis: o que o motor lê, e nada além. `notas` fica
    //    de fora de propósito — o shadow não grava, não deduplica e não
    //    monta contexto de IA; carregar o histórico seria custo sem uso.
    let candidatos: ImovelParaAtribuicao[] = [];
    if (imovelIds.length > 0) {
      const imoveis = await supabase
        .from("imoveis")
        .select("id, user_id, codigo, status, retirado, tentativas")
        .eq("user_id", entrada.userId)
        .in("id", imovelIds);
      if (imoveis.error) return falha("consulta-imoveis", entrada);
      candidatos = (imoveis.data || []).map((linha) => ({
        id: String(linha.id),
        userId: String(linha.user_id),
        codigo: (linha.codigo as string | null) ?? null,
        status: String(linha.status ?? ""),
        retirado: (linha.retirado as boolean | null) ?? null,
        tentativas: Array.isArray(linha.tentativas)
          ? (linha.tentativas as { data: string; aguardandoResultado?: boolean | null }[])
          : null,
      }));
    }

    // 5. Contextos de agendamento (N3): mensagens JÁ enviadas dentro da
    //    janela, tanto pelo `imovel_id` quanto pela consolidação
    //    (`imoveis_consultados`). A janela é ancorada na mensagem, nunca
    //    no relógio do servidor.
    const agendamentos = await carregarAgendamentos(supabase, entrada, candidatos);
    if (agendamentos === null) return falha("consulta-agendamentos", entrada);

    // 6. O motor decide — e a decisão fica aqui dentro.
    let resultado: ResultadoAtribuicao;
    try {
      resultado = resolverAtribuicaoMensagem({
        userId: entrada.userId,
        contatoId,
        mensagem: { texto: entrada.texto, recebidaEm: entrada.recebidaEm },
        vinculos: candidatos,
        agendamentos,
      });
    } catch {
      return falha("motor", entrada, resolucao.saltos);
    }

    return {
      categoria: classificarComparacao(entrada.legadoImovelId, {
        ok: resultado.ok,
        imovelId: resultado.ok ? resultado.imovelId : undefined,
        terminal: resultado.ok ? resultado.terminal : undefined,
        motivo: resultado.ok ? undefined : resultado.motivo,
      }),
      estado: resultado.ok ? "resolvido" : resultado.motivo,
      contatoId,
      nivel: resultado.ok ? resultado.nivel : (resultado.nivelEmpate ?? null),
      terminal: resultado.ok ? resultado.terminal : false,
      candidatos: resultado.candidatos.length,
      terminais: resultado.terminais.length,
      candidatoIds: [...resultado.candidatos],
      terminalIds: [...resultado.terminais],
      novoImovelId: resultado.ok ? resultado.imovelId : null,
      legadoImovelId: entrada.legadoImovelId,
      direcao: entrada.direcao,
      saltos: resolucao.saltos,
    };
  } catch {
    return falha("inesperada", entrada);
  }
}

/**
 * A cadeia de fusão que sai do contato do canal, e só ela.
 *
 * O primeiro `select` é pelo id que `contatos_telefones` devolveu; cada
 * lápide encontrada gera a busca do id seguinte. Nenhuma página, nenhum
 * `order`, nenhum teto de linhas: a identidade do contato vem do canal, e
 * onde a linha está fisicamente na tabela é irrelevante. (Foi exatamente
 * isso que quebrou em Production: uma conta com 331 contatos, uma consulta
 * que lia 20 linhas quaisquer, e o contato certo fora delas.)
 *
 * Sem fusão — o caso de hoje, com zero lápides em Production — isto custa
 * **uma** consulta. O teto de buscas é o da cadeia (`MAX_SALTOS_FUSAO`),
 * então dado inconsistente vira parada, não laço.
 *
 * Devolve `null` só quando o banco recusa. Ciclo, alvo ausente e cadeia
 * funda demais NÃO são tratados aqui: a busca simplesmente para, e quem
 * classifica é `resolverContatoSobrevivente`, que já tem as três regras
 * testadas.
 */
async function carregarCadeiaDeFusao(
  supabase: SupabaseClient,
  userId: string,
  contatoInicial: string,
): Promise<Map<string, ContatoParaResolucao> | null> {
  const porId = new Map<string, ContatoParaResolucao>();
  let atual = contatoInicial;

  for (let busca = 0; busca < MAX_BUSCAS_CADEIA; busca += 1) {
    if (porId.has(atual)) break; // ciclo
    const contato = await supabase
      .from("contatos")
      .select("id, user_id, fundido_em_contato_id")
      .eq("user_id", userId)
      .eq("id", atual)
      .maybeSingle();
    if (contato.error) return null;
    const linha = contato.data as {
      id?: unknown;
      user_id?: unknown;
      fundido_em_contato_id?: unknown;
    } | null;
    if (!linha?.id) break; // alvo ausente (ou de outra conta: o filtro é explícito)

    const proximo = (linha.fundido_em_contato_id as string | null) ?? null;
    porId.set(String(linha.id), {
      id: String(linha.id),
      userId: String(linha.user_id),
      fundidoEmContatoId: proximo,
    });
    if (!proximo) break; // sobrevivente: nenhuma busca a mais
    atual = proximo;
  }

  return porId;
}

/** As mensagens programadas que já saíram dentro da janela e falam de
    algum candidato. Devolve `null` só quando a consulta falha. */
async function carregarAgendamentos(
  supabase: SupabaseClient,
  entrada: EntradaShadow,
  candidatos: readonly ImovelParaAtribuicao[],
): Promise<ContextoAgendamento[] | null> {
  if (candidatos.length === 0) return [];
  const desde = inicioDaJanela(entrada.recebidaEm);
  if (!desde) return [];
  const ids = candidatos.map((c) => c.id);
  const enviadas = await supabase
    .from("mensagens_agendadas")
    .select("imovel_id, imoveis_consultados, enviado_em")
    .eq("user_id", entrada.userId)
    .eq("status", "enviada")
    .gte("enviado_em", desde);
  if (enviadas.error) return null;

  const contextos: ContextoAgendamento[] = [];
  for (const linha of enviadas.data || []) {
    const enviadoEm = instanteParaISOOperacional(linha.enviado_em as string | null);
    if (!enviadoEm) continue;
    const consultados = Array.isArray(linha.imoveis_consultados)
      ? (linha.imoveis_consultados as string[]).map(String)
      : [];
    const alvo = [...new Set([...(linha.imovel_id ? [String(linha.imovel_id)] : []), ...consultados])]
      .filter((id) => ids.includes(id));
    if (alvo.length === 0) continue;
    contextos.push({ enviadoEm, imovelIds: alvo });
  }
  return contextos;
}

/** O começo da janela de agendamento, em ISO UTC, a partir do instante da
    mensagem — pelos helpers de `lib/datas.ts`, nunca por `new Date` cru.
    Só serve para ENCURTAR a consulta: quem decide se o envio está na
    janela é o motor, com a regra da 1a-B. */
function inicioDaJanela(recebidaEm: string): string | null {
  const ms = timestampDeIso(recebidaEm);
  if (ms === null) return null;
  return isoDeTimestamp(ms - ATRIBUICAO_MENSAGEM.janelaAgendamentoHoras * 3_600_000);
}

/** A falha que nem chegou a ser uma observação (a promessa rejeitou, o
    que o contrato acima diz que não acontece). Existe para a rota nunca
    precisar montar esse objeto à mão. */
export function observacaoDeFalhaInesperada(
  legadoImovelId: string | null,
  direcao: "recebida" | "enviada",
): ObservacaoShadow {
  return falha("inesperada", {
    userId: "",
    telefoneCanonico: "",
    texto: "",
    recebidaEm: "",
    legadoImovelId,
    direcao,
  });
}

/** O que a decisão de autoridade (e a nota) precisa da observação. */
export function resolucaoDaObservacao(observacao: ObservacaoShadow): ResolucaoRelacional {
  return {
    estado: observacao.estado,
    imovelId: observacao.novoImovelId,
    terminal: observacao.terminal,
    nivel: observacao.nivel,
    contatoId: observacao.contatoId,
    candidatos: observacao.candidatoIds,
    terminais: observacao.terminalIds,
  };
}

/** O detalhe do evento: contagens, ids técnicos e vocabulário fechado.
    NUNCA telefone, nome, texto, endereço ou conteúdo de nota. As listas de
    ids ficam na nota; aqui vão só as contagens. */
export function detalheDoEvento(
  observacao: ObservacaoShadow,
  decisao: DecisaoAutoridade,
  /** O que aconteceu com a nota desta entrega (Fase 1a-C2.1b.1):
      `gravada`, `duplicada-mesmo-imovel`, `duplicada-outro-imovel`,
      `imovel-inexistente` ou `falha`. */
  persistencia?: string,
): string {
  return JSON.stringify({
    categoria: observacao.categoria,
    estado: observacao.estado,
    direcao: observacao.direcao,
    nivel: observacao.nivel,
    terminal: observacao.terminal,
    candidatos: observacao.candidatos,
    terminais: observacao.terminais,
    contato_id: observacao.contatoId,
    legado_imovel_id: observacao.legadoImovelId,
    novo_imovel_id: observacao.novoImovelId,
    autoridade: decisao.autoridade,
    operacional_imovel_id: decisao.imovelId,
    concordante: decisao.concordante,
    fallback_motivo: decisao.fallbackMotivo,
    ...(persistencia ? { persistencia } : {}),
    ...(observacao.falha ? { falha: observacao.falha } : {}),
    ...(observacao.saltos ? { saltos: observacao.saltos } : {}),
  });
}

/** O evento único por mensagem. Desde a 1a-C2.1a ele deixou de ser
    `webhook-atribuicao-shadow`: a resolução passou a ter autoridade, e a
    série nova começa com nome novo. `falha` continua subindo para `aviso`,
    porque uma falha isolada é ruído e vinte são um problema de modelo. */
export function eventoDaObservacao(observacao: ObservacaoShadow): {
  evento: string;
  nivel: "info" | "aviso";
} {
  if (observacao.categoria === "falha") {
    return { evento: "webhook-atribuicao-falhou", nivel: "aviso" };
  }
  return { evento: "webhook-atribuicao", nivel: "info" };
}
