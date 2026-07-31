/* ================================================================
   MOTOR DE CÁLCULO
   Port literal da seção 4 do app.js original. Todas as métricas
   derivadas dos imóveis vivem aqui, para que Dashboard, Metas,
   Insights e Relatórios usem a mesma fonte de verdade e nunca
   divirjam entre si.

   Diferença de FORMA (não de lógica) vs. o original: as funções
   não leem mais o STATE global — recebem os imóveis e o
   comissaoPercent por parâmetro, o que mantém o módulo puro e
   testável (decisão registrada no MIGRATION_NEXT.md, Etapa 2).

   A verdade sobre o progresso de um imóvel mora no statusHistory,
   não no campo status atual nem na existência do registro.

   Por isso a REGRA de como o histórico cresce também mora aqui
   (`historicoComStatus`), e não junto das escritas: o webhook do
   WhatsApp precisa dela no servidor, e `mutacoes.ts` importa store e
   Supabase. Duas cópias da regra é o caminho mais curto para o
   histórico divergir dependendo de quem mexeu no status.
   ================================================================ */
import {
  MAX_TENTATIVAS_SEM_RETORNO,
  STATUS_PERDA_DECIDIDA,
  STATUS_TERMINAL_NEGATIVE,
  STALE_DAYS_THRESHOLD,
  STALE_DAYS_THRESHOLD_POS_ANGARIACAO,
  STATUS_STALE_LENTO,
} from "../constantes";
import { daysBetween, monthKey, todayISO } from "../datas";
import type { Imovel, StatusHistoryEntry } from "../tipos";
import { dataUltimaResposta } from "./notas";

/**
 * O histórico depois de uma mudança de status — a REGRA, num só lugar.
 *
 * Não duplica quando a última entrada já é o status novo: reabrir e salvar um
 * imóvel sem mexer na etapa não deve criar transição, senão "dias parado" e
 * tempo médio contariam a partir do último clique em Salvar.
 *
 * Devolve novo array em vez de mutar o recebido: quem escreve precisa poder
 * montar o histórico ANTES de saber se a escrita deu certo — mutar o objeto do
 * store mudaria a tela mesmo com o Supabase recusando.
 */
export function historicoComStatus(
  historico: StatusHistoryEntry[] | null | undefined,
  novoStatus: string,
  statusAnterior: string | null,
  hoje: string,
): StatusHistoryEntry[] {
  const hist = [...(historico || [])];
  if (statusAnterior !== null && statusAnterior === novoStatus) return hist;
  if (hist.length === 0 || hist[hist.length - 1].status !== novoStatus) {
    hist.push({ status: novoStatus, date: hoje });
  }
  return hist;
}

// Retorna a data (ISO) em que o imóvel entrou em determinado status,
// usando o histórico de transições. Cai para dataAngariacao se não
// houver histórico (compatibilidade com registros antigos).
export function dateEnteredStatus(imovel: Imovel, status: string): string | null {
  const hist = imovel.statusHistory || [];
  const entry = hist.find((h) => h.status === status);
  return entry ? entry.date : (status === "Novo contato" ? imovel.dataAngariacao ?? null : null);
}

export function currentStatusSince(imovel: Imovel): string | null {
  const hist = imovel.statusHistory || [];
  if (hist.length === 0) return imovel.dataAngariacao ?? null;
  return hist[hist.length - 1].date;
}

export function isPausado(imovel: Imovel): boolean {
  return !!(imovel.pausadoAte && imovel.pausadoAte >= todayISO());
}

// Prazo (em dias) até um imóvel nesse status contar como "parado".
// Angariado/Publicado já estão captados e aguardando locação — ficam
// semanas/meses no mesmo status por natureza, então usam um prazo bem
// mais longo do que as etapas de perseguição ativa do funil.
export function limiteStaleParaStatus(status: string): number {
  return (STATUS_STALE_LENTO as readonly string[]).includes(status)
    ? STALE_DAYS_THRESHOLD_POS_ANGARIACAO
    : STALE_DAYS_THRESHOLD;
}

/* --- "Parado" é ausência de MOVIMENTO, não de mudança de status -------------
   `isStale` contava dias desde a última mudança de status, e só. Enquanto o
   app era cego para o que acontecia entre uma etapa e outra, dava no mesmo.
   Deixou de dar quando passaram a existir tentativas registradas e respostas
   chegando pelo webhook: o status não se move sozinho — nada o move —, então
   um imóvel podia levar follow-up ontem, ter o proprietário respondendo hoje,
   e ainda assim aparecer como "parado há 14 dias".

   Foi um caso real (LD-55, 28/07/2026): o filho respondeu passando o telefone
   do pai, o pai respondeu confirmando ser o proprietário, e o card continuava
   cobrando estagnação. Na carteira daquele dia, 11 dos 46 imóveis marcados
   como parados tinham tido contato depois da última mudança de status, e 2
   tinham resposta do próprio proprietário.

   Movimento é qualquer uma das três coisas que o app sabe datar: mudança de
   status, tentativa enviada e resposta recebida. As três, e não só a última,
   porque cada uma cobre um buraco das outras — o corretor que trabalha o lead
   sem mexer na etapa, e o proprietário que reage sem ninguém confirmar nada.

   O que isto NÃO é: um jeito de esconder imóvel que não anda. Quem não avança
   continua parado assim que passa o prazo sem NADA acontecer — só que agora
   "nada acontecer" quer dizer o que a frase diz. E o funil continua medido por
   status: `daysInCurrentStatus`, coortes e tempo médio não mudam, porque ali a
   pergunta é mesmo sobre a etapa. */

/** A mais recente entre duas datas ISO, ignorando as ausentes. */
function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Dia (YYYY-MM-DD) do último movimento do imóvel: mudança de status,
    tentativa de contato ou resposta do proprietário — o que veio por último. */
export function ultimoMovimentoISO(imovel: Imovel): string | null {
  let ultimo = currentStatusSince(imovel);
  for (const t of imovel.tentativas || []) {
    const dia = (t.data || "").slice(0, 10);
    if (dia) ultimo = maisRecente(ultimo, dia);
  }
  return maisRecente(ultimo, dataUltimaResposta(imovel.notas));
}

/** Dias desde o último movimento. É o número que acompanha a palavra "parado"
    na tela — mostrar `daysInCurrentStatus` ao lado do selo diria "parado há 20
    dias" para um imóvel cujo prazo foi contado a partir de ontem. */
export function diasSemMovimento(imovel: Imovel): number | null {
  return daysBetween(ultimoMovimentoISO(imovel), todayISO());
}

export function isStale(imovel: Imovel): boolean {
  if ((STATUS_TERMINAL_NEGATIVE as readonly string[]).includes(imovel.status) || imovel.status === "Locado") return false;
  if (isPausado(imovel)) return false;
  const d = diasSemMovimento(imovel);
  return d !== null && d >= limiteStaleParaStatus(imovel.status);
}

export function daysInCurrentStatus(imovel: Imovel): number | null {
  const since = currentStatusSince(imovel);
  return daysBetween(since, todayISO());
}

export function comissaoEstimada(imovel: Imovel, comissaoPercent: number): number {
  return (imovel.valorAluguel || 0) * (comissaoPercent / 100);
}

export function comissaoRecebidaValor(imovel: Imovel, comissaoPercent: number): number {
  return imovel.status === "Locado" && imovel.comissaoRecebida ? (imovel.comissaoRecebidaValor ?? comissaoEstimada(imovel, comissaoPercent)) : 0;
}

export function tempoAteLocacao(imovel: Imovel): number | null {
  if (imovel.status !== "Locado") return null;
  const dLocado = dateEnteredStatus(imovel, "Locado");
  return daysBetween(imovel.dataAngariacao, dLocado);
}

export interface MetricsForRange {
  total: number;
  locados: number;
  perdidosCancelados: number;
  conversaoGeral: number;
  conversaoFechados: number;
  tempoMedio: number | null;
  comissaoEst: number;
  comissaoRec: number;
  valorMedioAluguel: number;
}

/**
 * Este processo foi DECIDIDO contra nós?
 *
 * Não confundir com "está fechado?", que é `STATUS_TERMINAL_NEGATIVE`. O app
 * respondia as duas perguntas com a mesma lista, e o preço aparecia na
 * conversão: em 31/07/2026 a captação marcava 13,7% porque 29 imóveis em "Sem
 * resposta" contavam como derrota no denominador. Sem eles, 19,7%.
 *
 * "Sem resposta" é silêncio, e silêncio não é decisão de ninguém — é
 * literalmente o público que o follow-up em lote trabalha
 * (`FOLLOWUP_STATUS_ALVO`). Dar por perdido quem a outra metade do app manda
 * cutucar hoje é o mesmo erro que a seção "Onde perdemos" do relatório
 * cometia, onde diluía "chegamos tarde" de 58% para 37%.
 *
 * **Mas o silêncio não fica em aberto para sempre**, e essa ressalva é o que
 * impede a taxa de virar otimismo silencioso. Passadas
 * `MAX_TENTATIVAS_SEM_RETORNO` tentativas sem retorno, o próprio app desistiu
 * de cutucar (é o corte do lote), e aí o silêncio É a resposta. O limite é o
 * mesmo dos dois lados de propósito: a conversão passa a considerar perdido
 * exatamente quem o follow-up parou de trabalhar, então não há um imóvel que
 * seja "em disputa" para uma tela e "perdido" para a outra.
 *
 * Medido em 31/07/2026: nenhum dos 29 silêncios tinha sequer 2 tentativas
 * (vieram de backfill e marcação manual), então a ressalva não mudou nenhum
 * número no dia em que nasceu. Ela passa a valer conforme a fila roda.
 */
export function ehPerdaDecidida(imovel: Imovel): boolean {
  if ((STATUS_PERDA_DECIDIDA as readonly string[]).includes(imovel.status)) return true;
  if (imovel.status !== "Sem resposta") return false;
  return (imovel.tentativas || []).length >= MAX_TENTATIVAS_SEM_RETORNO;
}

export function metricsForRange(imoveis: Imovel[], comissaoPercent: number): MetricsForRange {
  const total = imoveis.length;
  const locados = imoveis.filter((i) => i.status === "Locado");
  // Processos DECIDIDOS, não apenas fechados — ver `ehPerdaDecidida`.
  const perdidosCancelados = imoveis.filter(ehPerdaDecidida);
  const fechados = locados.length + perdidosCancelados.length;
  const conversaoGeral = total ? (locados.length / total) * 100 : 0;
  const conversaoFechados = fechados ? (locados.length / fechados) * 100 : 0;
  const tempos = locados.map(tempoAteLocacao).filter((t): t is number => t != null && t >= 0);
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  // Comissão estimada só sobre os locados — a comissão só é recebida quando o
  // imóvel é locado.
  const comissaoEst = locados.reduce((s, i) => s + comissaoEstimada(i, comissaoPercent), 0);
  const comissaoRec = imoveis.reduce((s, i) => s + comissaoRecebidaValor(i, comissaoPercent), 0);
  const valorMedioAluguel = total ? imoveis.reduce((s, i) => s + (i.valorAluguel || 0), 0) / total : 0;
  return { total, locados: locados.length, perdidosCancelados: perdidosCancelados.length, conversaoGeral, conversaoFechados, tempoMedio, comissaoEst, comissaoRec, valorMedioAluguel };
}

// Um imóvel só conta como "angariado" quando o funil realmente marca
// a passagem pela etapa "Angariado" — simplesmente cadastrar o imóvel
// ou fazer o primeiro contato NÃO conta como angariação concluída.
export function foiAngariado(imovel: Imovel): boolean {
  return dateEnteredStatus(imovel, "Angariado") != null;
}

export function dataAngariadoEfetiva(imovel: Imovel): string | null {
  return dateEnteredStatus(imovel, "Angariado");
}

/* ----------------------------------------------------------------
   CAPTAÇÃO vs. CARTEIRA — as unidades desdobradas

   Um espaço captado pode virar VÁRIAS linhas: o proprietário aceita
   dividir o galpão em salas, e cada sala tem aluguel, contrato e
   comissão próprios. Sem as linhas extras o dinheiro não fecha; com
   elas contando como angariações, uma conversa ganha viraria quatro.

   O corte é este: quem tem `imovelPrincipalId` entra em TUDO que é
   carteira, locação e dinheiro (esses cálculos leem a lista inteira),
   e fica de fora só das quatro funções abaixo — as que medem ESFORÇO
   de captação. É delas que descendem o KPI de angariações, a meta do
   mês, as coortes e o relatório, então o corte num lugar só mantém
   Dashboard, Metas, Insights e Relatórios concordando.

   Consequência deliberada: a meta de angariação passa a significar
   "negociações ganhas". Quantas unidades saem de cada uma é decisão
   do proprietário, não trabalho do corretor.
   ---------------------------------------------------------------- */

/** O imóvel é uma unidade de um espaço já captado (não uma captação nova). */
export function ehUnidadeDesdobrada(imovel: Imovel): boolean {
  return !!imovel.imovelPrincipalId;
}

/** As unidades desdobradas a partir de um imóvel. */
export function unidadesDesdobradas(imoveis: Imovel[], principalId: string): Imovel[] {
  return imoveis.filter((i) => i.imovelPrincipalId === principalId);
}

/** Só o que representa uma captação própria — a base de toda métrica de
    esforço. Ver o bloco acima. */
export function imoveisDeCaptacao(imoveis: Imovel[]): Imovel[] {
  return imoveis.filter((i) => !ehUnidadeDesdobrada(i));
}

export function imoveisAngariadosNoMes(imoveis: Imovel[], key: string): Imovel[] {
  return imoveisDeCaptacao(imoveis).filter((i) => foiAngariado(i) && monthKey(dataAngariadoEfetiva(i)) === key);
}

export function imoveisAngariadosNoPeriodo(imoveis: Imovel[], start: string, end: string): Imovel[] {
  return imoveisDeCaptacao(imoveis).filter((i) => {
    const d = dataAngariadoEfetiva(i);
    return d != null && d >= start && d <= end;
  });
}

// "Contato" é o topo do funil: todo imóvel que entrou no pipeline,
// independente de já ter sido efetivamente angariado ou não.
export function imoveisContatadosNoMes(imoveis: Imovel[], key: string): Imovel[] {
  return imoveisDeCaptacao(imoveis).filter((i) => monthKey(i.dataAngariacao) === key);
}

export function imoveisContatadosNoPeriodo(imoveis: Imovel[], start: string, end: string): Imovel[] {
  return imoveisDeCaptacao(imoveis).filter(
    (i) => i.dataAngariacao != null && i.dataAngariacao >= start && i.dataAngariacao <= end,
  );
}

export function imoveisLocadosNoMes(imoveis: Imovel[], key: string): Imovel[] {
  return imoveis.filter((i) => i.status === "Locado" && monthKey(dateEnteredStatus(i, "Locado")) === key);
}

// "Faturamento em contratos": soma dos aluguéis dos imóveis que entraram em
// "Locado" no mês — os contratos efetivamente fechados no período.
export function faturamentoContratosNoMes(imoveis: Imovel[], key: string): number {
  return imoveisLocadosNoMes(imoveis, key).reduce((s, i) => s + (i.valorAluguel || 0), 0);
}

// Comissão efetivamente recebida no mês, pela data de recebimento — só os
// locados marcados como recebidos contam. Fonte única para Metas e Início.
export function comissaoRecebidaNoMes(imoveis: Imovel[], key: string, comissaoPercent: number): number {
  return imoveis.reduce(
    (s, i) =>
      i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === key
        ? s + comissaoRecebidaValor(i, comissaoPercent)
        : s,
    0,
  );
}

/* ----------------------------------------------------------------
   CONVERSÃO DE CAPTAÇÃO — o eixo que faltava

   `metricsForRange` mede LOCAÇÃO: locados ÷ processos fechados. É o
   funil inteiro, e é a régua certa para dinheiro. Só que este painel
   é de ANGARIAÇÃO, e o trabalho do corretor termina uma etapa antes:
   o "sim" do proprietário. Medir só locação num painel de captação
   tem dois efeitos ruins ao mesmo tempo —

   - a amostra fica pequena demais para dizer qualquer coisa (locação
     é o fim de um funil longo, então há poucas), e
   - o que o corretor controla desaparece da leitura: se um imóvel
     angariado não aluga por causa do preço, isso não diz nada sobre a
     qualidade da captação.

   Daí esta função, com a MESMA forma da conversão de locação (uma
   taxa sobre desfechos decididos, não sobre a carteira toda) para as
   duas serem comparáveis e para nenhuma delas inflar sozinha quando
   entram leads novos.

   Duas regras que caem do invariante do statusHistory:

   - **Angariado-e-depois-perdido conta como angariado.** A captação
     foi ganha; a perda veio depois, em outra etapa. Quem lê o campo
     `status` atual em vez do histórico contaria a mesma conversa como
     derrota e apagaria o trabalho que deu certo.
   - **Quem ainda está em jogo não entra na taxa.** Um lead em "Novo
     contato" não é fracasso, é pendência — e como a maioria da
     carteira vive aí, incluí-lo faria a taxa despencar a cada dia de
     prospecção bem-feita, exatamente ao contrário do que deveria.
   - **"Locado" conta como captação ganha mesmo sem a etapa no
     histórico.** É o ÚNICO lugar do motor que não pergunta só ao
     `foiAngariado`, e o motivo é lógico: não se aluga o que não se
     captou. Quando o corretor arrasta o imóvel direto para Locado (ou
     em dado legado que pulou a etapa), o histórico não registra a
     passagem por "Angariado" — e sem esta ressalva o caso mais
     positivo que existe cairia em "ainda em disputa", diluindo a taxa
     justamente com os melhores desfechos. `imoveisAngariadosNoMes`
     segue exigindo a entrada no histórico, e deve: lá a pergunta é
     "em que MÊS isso aconteceu", e sem a data não há resposta.
   ---------------------------------------------------------------- */

export interface ConversaoCaptacao {
  /** Captações com desfecho: angariadas + encerradas sem angariar. */
  decididos: number;
  angariados: number;
  /** Encerradas (terminal negativo) sem nunca ter chegado em "Angariado". */
  perdidosAntesDeAngariar: number;
  /** Nem angariadas nem encerradas — ainda em disputa. Fora da taxa. */
  emAberto: number;
  /** angariados ÷ decididos × 100; null quando nada foi decidido ainda. */
  taxa: number | null;
}

export function conversaoCaptacao(imoveis: Imovel[]): ConversaoCaptacao {
  const captacoes = imoveisDeCaptacao(imoveis);
  let angariados = 0;
  let perdidosAntesDeAngariar = 0;
  let emAberto = 0;
  for (const imovel of captacoes) {
    if (foiAngariado(imovel) || imovel.status === "Locado") angariados++;
    // Decidido, não apenas fechado: o silêncio que o follow-up ainda trabalha
    // é pendência, e cai em `emAberto` junto com quem está no meio do funil.
    else if (ehPerdaDecidida(imovel)) perdidosAntesDeAngariar++;
    else emAberto++;
  }
  const decididos = angariados + perdidosAntesDeAngariar;
  return {
    decididos,
    angariados,
    perdidosAntesDeAngariar,
    emAberto,
    taxa: decididos ? (angariados / decididos) * 100 : null,
  };
}

export function groupCount(imoveis: Imovel[], keyFn: (i: Imovel) => string | null | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  imoveis.forEach((i) => {
    const k = keyFn(i) || "Não informado";
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}
