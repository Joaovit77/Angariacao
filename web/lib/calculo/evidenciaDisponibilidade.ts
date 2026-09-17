/* ================================================================
   EVIDÊNCIA TEMPORAL DE DISPONIBILIDADE (M2)

   Responde, a partir do que o app já grava, a uma pergunta só:
   "existe registro ESTRUTURADO de que este imóvel estava disponível ou
   indisponível, e QUANDO isso foi registrado?"

   Não decide nada sobre mensagens agendadas, lembretes ou cadência: isso é
   dos checkpoints seguintes (M3/M4), que consomem a saída daqui. Não lê banco,
   não usa IA, não interpreta texto livre.

   O que conta como evidência POSITIVA (disponível), e por quê:
   - tentativa com `resultado === "agendou"`: categoria fixa confirmada por
     uma pessoa (nudge, formulário ou ação do assistente confirmada). O webhook
     nunca grava esse resultado sozinho: "respondeu" é o teto do que a IA
     pode afirmar (ver `sugerirNaTentativaPendente`). O instante é a `data` da
     tentativa, o contato em que a visita foi combinada.
   - compromisso `Visita` com `motivoCodigo === "visita_confirmada_pelo_proprietario"`:
     é o caminho DETERMINÍSTICO da confirmação de visita (o corretor enviou o
     modelo com dia e hora, e a resposta imediata foi um "ok" inequívoco). O
     instante é `criadoEm` (quando a confirmação foi registrada), nunca `date`
     (o dia da visita) nem `done` (se ela aconteceu). Uma visita combinada e
     não realizada continua sendo evidência de que, ao combinar, o imóvel
     estava disponível; o não comparecimento não acrescenta nem retira nada.

   O que NÃO conta como evidência positiva, de propósito:
   - compromisso `Visita` com `prazo_combinado_na_resposta`: nasce da
     classificação da IA sobre uma frase solta; o M1 separou os dois códigos
     justamente para esta função poder recusar o segundo.
   - compromisso `Visita` criado à mão ou por outra origem: "Visita para gravar
     vídeo" não diz nada sobre o proprietário.
   - lembrete "Verificar disponibilidade" concluído: `done` vem tanto do
     ModalVerificacao (contato registrado) quanto do lote de disponibilidade
     (mensagem ENVIADA, sem resposta nenhuma) e do toggle genérico da agenda,
     sem motivo estruturado que os separe. Mensagem enviada não é confirmação.
   - mensagem agendada pendente/enviada, resposta do proprietário sem
     categoria, tentativa "respondeu"/"vai-retornar", `sugestaoIa`, notas.
   - ausência de evidência negativa.

   O que conta como evidência NEGATIVA (indisponível): somente o ESTADO ATUAL
   do imóvel, quando ele saiu da carteira ou fechou: `retirado`, "Locado",
   "Perdido", "Cancelado". Uma passagem antiga por "Perdido" que depois foi
   reaberta não é fato vigente (LD-50 real: Perdido em 20/07, Angariado em
   31/07, Publicado hoje). "Sem resposta" não afirma nada sobre o imóvel e
   fica de fora; quem o trata é a regra de pertinência do M3.

   Instantes: todos os `ocorridoEm` ficam no datetime civil do fuso
   operacional (a convenção de `Tentativa.data` e `NotaImovel.data`), com a
   precisão que a fonte realmente tem. Comparar precisões diferentes é feito
   na precisão mais grossa das duas; empate nessa precisão entre sinais
   opostos vira `conflitante`, nunca um desempate silencioso.

   Para o M3/M4, que consomem esta saída:
   1. Não existe hoje resultado positivo estruturado vindo só da conclusão
      de uma mensagem/lembrete de verificação: `done` sozinho não significa
      "o proprietário confirmou disponibilidade".
   2. `retirado` não tem timestamp estruturado. Enquanto for assim, o estado
      atual `retirado` é fato presente (sem data), nunca uma data inventada.
   3. `AgendaItemComCriacao.criadoEm` é obrigatório para a visita confirmada
      virar evidência; o servidor preenche a partir do `created_at` real.
   4. Uma futura mensagem consolidada por proprietário precisa guardar quais
      imóveis foram perguntados; a resposta não se aplica a todos sem contexto
      inequívoco (ver `contextoProprietario.ts`).
   ================================================================ */
import { instanteParaISOOperacional } from "../datas";
import type { AgendaItem, Imovel, StatusHistoryEntry } from "../tipos";
import { TIPO_AGENDA_VISITA } from "./webhookWhatsapp";

/** Item da agenda com o instante em que a linha nasceu (`created_at`, ISO
    com fuso). `AgendaItem` não expõe esse campo: o mapeador `fromDbAgenda`
    é um dos arquivos congelados por `prospeccao-fronteira.test.ts`, e o
    consumidor desta função é o servidor (M3), que lê a linha crua e tem o
    `created_at` à mão. Para um compromisso criado a partir da resposta do
    proprietário, `criadoEm` é o momento em que a combinação foi registrada;
    `date` é o dia da visita, que é outra coisa. Sem `criadoEm` a visita
    confirmada não vira evidência: não se inventa instante. */
export type AgendaItemComCriacao = AgendaItem & { criadoEm?: string | null };

/** Código gravado pelo webhook no caminho determinístico da confirmação de
    visita. O webhook escreve a string literal; há teste amarrando as duas. */
export const MOTIVO_AGENDA_VISITA_CONFIRMADA = "visita_confirmada_pelo_proprietario";
/** Código do compromisso que nasce da classificação da IA. Listado aqui só
    para o teste provar que ele é recusado. */
export const MOTIVO_AGENDA_PRAZO_IA = "prazo_combinado_na_resposta";

export type SinalDisponibilidade = "disponivel" | "indisponivel";
export type PrecisaoInstante = "instante" | "minuto" | "dia" | "desconhecida";
export type FonteEvidencia = "tentativa" | "agenda" | "imovel";
export type OrigemEvidencia =
  | "usuario"
  | "assistente"
  | "automacao"
  | "evento_whatsapp"
  | "sophia"
  | "desconhecida";
export type CodigoEvidencia =
  | "tentativa-agendou"
  | typeof MOTIVO_AGENDA_VISITA_CONFIRMADA
  | "status-locado"
  | "status-perdido"
  | "status-cancelado"
  | "retirado";

export interface EvidenciaDisponibilidade {
  imovelId: string;
  sinal: SinalDisponibilidade;
  codigo: CodigoEvidencia;
  /** Descrição curta e factual, sem interpretação. */
  fato: string;
  /** Datetime civil operacional ("YYYY-MM-DD", "…THH:mm" ou "…THH:mm:ss").
      `null` somente para fato de estado presente sem data conhecida. */
  ocorridoEm: string | null;
  precisao: PrecisaoInstante;
  fonte: FonteEvidencia;
  origem: OrigemEvidencia;
  /** Id do registro que sustenta a evidência (tentativa, agenda ou imóvel). */
  referenciaId: string;
}

export type EstadoFactualDisponibilidade =
  | "disponivel"
  | "indisponivel"
  | "sem-evidencia"
  | "conflitante";

export interface AvaliacaoTemporalDisponibilidade {
  imovelId: string;
  estado: EstadoFactualDisponibilidade;
  positivaMaisRecente: EvidenciaDisponibilidade | null;
  negativaMaisRecente: EvidenciaDisponibilidade | null;
  /** A data `E` que o M3/M4 usará para reiniciar a cadência: a positiva
      vigente. `null` quando o estado não é `disponivel`. */
  dataEvidenciaPositiva: string | null;
  /** Todas as evidências consideradas, da mais antiga para a mais recente. */
  evidencias: EvidenciaDisponibilidade[];
}

/* ----------------------------------------------------------------
   Instantes
   ---------------------------------------------------------------- */

const TAMANHO_POR_PRECISAO: Record<Exclude<PrecisaoInstante, "desconhecida">, number> = {
  dia: 10,
  minuto: 16,
  instante: 19,
};

const ORDEM_PRECISAO: Record<PrecisaoInstante, number> = {
  desconhecida: 0,
  dia: 1,
  minuto: 2,
  instante: 3,
};

/** Reconhece o datetime civil já usado por tentativas e notas. Devolve a
    precisão que a string carrega; qualquer outra forma é desconhecida. */
export function precisaoDoDatetimeCivil(valor: string | null | undefined): PrecisaoInstante {
  if (!valor) return "desconhecida";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return "dia";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return "minuto";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(valor)) return "instante";
  return "desconhecida";
}

/** Compara dois instantes na precisão mais grossa entre eles. `null` quando
    algum lado não tem instante conhecido: não há como ordenar. */
export function compararInstantes(
  a: Pick<EvidenciaDisponibilidade, "ocorridoEm" | "precisao">,
  b: Pick<EvidenciaDisponibilidade, "ocorridoEm" | "precisao">,
): -1 | 0 | 1 | null {
  if (!a.ocorridoEm || !b.ocorridoEm || a.precisao === "desconhecida" || b.precisao === "desconhecida") {
    return null;
  }
  const comum = ORDEM_PRECISAO[a.precisao] <= ORDEM_PRECISAO[b.precisao] ? a.precisao : b.precisao;
  const tamanho = TAMANHO_POR_PRECISAO[comum];
  const valorA = a.ocorridoEm.slice(0, tamanho);
  const valorB = b.ocorridoEm.slice(0, tamanho);
  if (valorA < valorB) return -1;
  if (valorA > valorB) return 1;
  return 0;
}

/* ----------------------------------------------------------------
   Coleta: o que cada fonte prova
   ---------------------------------------------------------------- */

function origemDaTentativa(origem: string | null | undefined): OrigemEvidencia {
  if (origem === "assistente" || origem === "automacao") return origem;
  return "usuario";
}

function origemDoHistorico(entrada: StatusHistoryEntry | null): OrigemEvidencia {
  if (!entrada) return "desconhecida";
  if (entrada.source) return entrada.source;
  return entrada.userId ? "usuario" : "desconhecida";
}

/** Última entrada do histórico com o status atual: é a transição que levou
    ao estado presente. `marcoDoStatus` (motor) devolve a PRIMEIRA e serve a
    outra pergunta ("quando atingiu a etapa"). */
function ultimaEntradaDoStatus(imovel: Imovel, status: string): StatusHistoryEntry | null {
  const historico = imovel.statusHistory || [];
  for (let indice = historico.length - 1; indice >= 0; indice -= 1) {
    if (historico[indice].status === status) return historico[indice];
  }
  return null;
}

function evidenciasPositivasDasTentativas(imovel: Imovel): EvidenciaDisponibilidade[] {
  return (imovel.tentativas || []).flatMap((tentativa) => {
    if (tentativa.resultado !== "agendou" || tentativa.aguardandoResultado) return [];
    const precisao = precisaoDoDatetimeCivil(tentativa.data);
    if (precisao === "desconhecida") return [];
    return [{
      imovelId: imovel.id,
      sinal: "disponivel" as const,
      codigo: "tentativa-agendou" as const,
      fato: "Visita ou reunião combinada com o proprietário (resultado confirmado da tentativa).",
      ocorridoEm: tentativa.data,
      precisao,
      fonte: "tentativa" as const,
      origem: origemDaTentativa(tentativa.origem),
      referenciaId: tentativa.id,
    }];
  });
}

function evidenciasPositivasDaAgenda(imovel: Imovel, agenda: AgendaItemComCriacao[]): EvidenciaDisponibilidade[] {
  return agenda.flatMap((item) => {
    if (item.imovelId !== imovel.id) return [];
    if (item.type !== TIPO_AGENDA_VISITA) return [];
    if (item.origem !== "evento_whatsapp") return [];
    if (item.motivoCodigo !== MOTIVO_AGENDA_VISITA_CONFIRMADA) return [];
    const ocorridoEm = instanteParaISOOperacional(item.criadoEm);
    if (!ocorridoEm) return [];
    return [{
      imovelId: imovel.id,
      sinal: "disponivel" as const,
      codigo: MOTIVO_AGENDA_VISITA_CONFIRMADA,
      fato: "Proprietário confirmou por escrito a visita proposta com dia e hora.",
      ocorridoEm,
      precisao: "instante" as const,
      fonte: "agenda" as const,
      origem: "evento_whatsapp" as const,
      referenciaId: item.id,
    }];
  });
}

function evidenciasNegativasDoImovel(imovel: Imovel): EvidenciaDisponibilidade[] {
  const evidencias: EvidenciaDisponibilidade[] = [];

  if (imovel.retirado) {
    evidencias.push({
      imovelId: imovel.id,
      sinal: "indisponivel",
      codigo: "retirado",
      fato: "Proprietário retirou o imóvel da carteira.",
      ocorridoEm: null,
      precisao: "desconhecida",
      fonte: "imovel",
      origem: "desconhecida",
      referenciaId: imovel.id,
    });
  }

  if (imovel.status === "Locado") {
    const entrada = ultimaEntradaDoStatus(imovel, "Locado");
    const ocorridoEm = imovel.locadoEm || entrada?.date || null;
    evidencias.push({
      imovelId: imovel.id,
      sinal: "indisponivel",
      codigo: "status-locado",
      fato: "Imóvel locado.",
      ocorridoEm,
      precisao: precisaoDoDatetimeCivil(ocorridoEm),
      fonte: "imovel",
      // `locadoEm` chega pela Sophia ou pelo RPC de locação em lote; sem
      // `source` no histórico não há como afirmar qual, e não se inventa.
      origem: origemDoHistorico(entrada),
      referenciaId: imovel.id,
    });
  } else if (imovel.status === "Perdido" || imovel.status === "Cancelado") {
    const entrada = ultimaEntradaDoStatus(imovel, imovel.status);
    const ocorridoEm = entrada?.date || null;
    evidencias.push({
      imovelId: imovel.id,
      sinal: "indisponivel",
      codigo: imovel.status === "Perdido" ? "status-perdido" : "status-cancelado",
      fato: imovel.motivoPerda
        ? `Imóvel encerrado como ${imovel.status.toLowerCase()}: ${imovel.motivoPerda}.`
        : `Imóvel encerrado como ${imovel.status.toLowerCase()}.`,
      ocorridoEm,
      precisao: precisaoDoDatetimeCivil(ocorridoEm),
      fonte: "imovel",
      origem: origemDoHistorico(entrada),
      referenciaId: imovel.id,
    });
  }

  return evidencias;
}

/**
 * Todas as evidências estruturadas de um imóvel, da mais antiga para a mais
 * recente. A agenda pode vir inteira: só entram itens do próprio imóvel.
 * Evidências de outro imóvel nunca contaminam este, mesmo do mesmo
 * proprietário.
 */
export function evidenciasDisponibilidadeDoImovel(
  imovel: Imovel,
  agenda: AgendaItemComCriacao[] = [],
): EvidenciaDisponibilidade[] {
  const evidencias = [
    ...evidenciasPositivasDasTentativas(imovel),
    ...evidenciasPositivasDaAgenda(imovel, agenda),
    ...evidenciasNegativasDoImovel(imovel),
  ];
  return [...evidencias].sort(ordenarDaMaisAntiga);
}

/* ----------------------------------------------------------------
   Decisão temporal
   ---------------------------------------------------------------- */

/** Ordenação total e determinística: instante (na precisão comum), depois
    precisão mais fina como "mais recente" no mesmo instante, depois id.
    Fato de estado presente sem data vai para o fim (é observado AGORA). */
function ordenarDaMaisAntiga(a: EvidenciaDisponibilidade, b: EvidenciaDisponibilidade): number {
  const semDataA = a.precisao === "desconhecida" ? 1 : 0;
  const semDataB = b.precisao === "desconhecida" ? 1 : 0;
  if (semDataA !== semDataB) return semDataA - semDataB;
  if (!semDataA) {
    const comparacao = compararInstantes(a, b);
    if (comparacao !== null && comparacao !== 0) return comparacao;
    const precisao = ORDEM_PRECISAO[a.precisao] - ORDEM_PRECISAO[b.precisao];
    if (precisao !== 0) return precisao;
  }
  return a.referenciaId < b.referenciaId ? -1 : a.referenciaId > b.referenciaId ? 1 : 0;
}

function maisRecente(evidencias: EvidenciaDisponibilidade[]): EvidenciaDisponibilidade | null {
  if (!evidencias.length) return null;
  return [...evidencias].sort(ordenarDaMaisAntiga)[evidencias.length - 1];
}

/**
 * Estado factual mais recente de UM imóvel.
 *
 * - sem evidência → `sem-evidencia` (ausência de negativa não é positiva);
 * - só positivas → `disponivel`; só negativas → `indisponivel`;
 * - ambas: vence a mais recente. Um fato de estado presente sem data
 *   (`retirado`, status terminal sem histórico) é observado agora e por isso
 *   vence qualquer positiva datada. Empate na precisão comum entre uma
 *   positiva e uma negativa é `conflitante`: a função não escolhe.
 */
export function avaliarEvidenciaTemporalDisponibilidade(
  imovel: Imovel,
  agenda: AgendaItemComCriacao[] = [],
): AvaliacaoTemporalDisponibilidade {
  const evidencias = evidenciasDisponibilidadeDoImovel(imovel, agenda);
  const positivaMaisRecente = maisRecente(evidencias.filter((e) => e.sinal === "disponivel"));
  const negativaMaisRecente = maisRecente(evidencias.filter((e) => e.sinal === "indisponivel"));

  let estado: EstadoFactualDisponibilidade;
  if (!positivaMaisRecente && !negativaMaisRecente) estado = "sem-evidencia";
  else if (!negativaMaisRecente) estado = "disponivel";
  else if (!positivaMaisRecente) estado = "indisponivel";
  else {
    const comparacao = compararInstantes(positivaMaisRecente, negativaMaisRecente);
    if (comparacao === null) estado = "indisponivel"; // negativa é estado presente sem data
    else if (comparacao > 0) estado = "disponivel";
    else if (comparacao < 0) estado = "indisponivel";
    else estado = "conflitante";
  }

  return {
    imovelId: imovel.id,
    estado,
    positivaMaisRecente,
    negativaMaisRecente,
    dataEvidenciaPositiva: estado === "disponivel" ? positivaMaisRecente?.ocorridoEm ?? null : null,
    evidencias,
  };
}
