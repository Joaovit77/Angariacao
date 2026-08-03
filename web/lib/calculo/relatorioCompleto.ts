/* ================================================================
   RELATÓRIO COMPLETO — o TRABALHO do período, não só o desfecho
   Feature nova da pós-migração (sem oráculo do app antigo).

   O relatório mensal/semanal (`relatorios.ts`) continua exatamente como
   está: ele mede DESFECHO — angariações, locados, conversão, comissão.
   É a régua do dinheiro e não se mexe nela.

   O problema é que, numa carteira de captação, o desfecho é raro e
   lento. Medido em 31/07/2026: 177 imóveis, 12 angariados e **zero
   locados** — ou seja, o relatório imprimia zeros em quase todas as
   linhas enquanto 190 tentativas saíam, 22 proprietários respondiam e
   52 registros eram encerrados com motivo. Todo esse trabalho existia
   no banco e não aparecia em relatório nenhum.

   Este documento é o outro recorte, e são quatro perguntas:

   1. **Esforço** — quanto contato saiu, de que tipo e por onde.
   2. **Respostas** — quem reagiu, em quanto tempo, e no que deu.
   3. **Perdas** — onde os registros morreram, com o balde "chegamos
      tarde" separado do resto.
   4. **Fila** — o que ficou pendente (ver a ressalva na seção 4).

   ## Duas armadilhas de medição, e o que foi feito com elas

   **Coorte, não fotografia.** "Taxa de resposta do período" seria
   `responderam no período ÷ abordados no período`, e isso mistura
   populações: quem foi abordado no dia 30 ainda não teve tempo de
   responder, e entra no denominador puxando a taxa para baixo. A
   medição aqui é por COORTE — dos imóveis cuja PRIMEIRA tentativa caiu
   no período, quantos já responderam alguma vez. Continua otimista
   para o começo do período e pessimista para o fim (não há como não
   ser, num período aberto), mas ao menos numerador e denominador
   falam da mesma gente.

   **Desfecho é o de HOJE, não o do período.** Os imóveis que
   responderam podem seguir em disputa; classificá-los como "não deu
   em nada" seria dar por perdido quem ainda está em jogo — o mesmo
   erro que `conversaoCaptacao` evita ao só olhar desfechos DECIDIDOS.
   Por isso `emAberto` é uma categoria exibida, e não um zero
   escondido.

   Puro: só tipos, datas, constantes e outros módulos de cálculo. Sem
   React/Next/Supabase/store.
   ================================================================ */
import {
  MOTIVO_PERDA_LOCADO_FORA,
  MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO,
  STATUS_TERMINAL_NEGATIVE,
} from "../constantes";
import { daysBetween } from "../datas";
import type { Abordagem, AgendaItem, Imovel, Tentativa } from "../tipos";
import { tentativasOrdenadas } from "./abordagens";
import { dateEnteredStatus, ehPerdaDecidida, foiAngariado, motivoPerdaPelaFase } from "./motor";
import { ehNotaDeResposta } from "./notas";
import { rodadaDoDia, type RodadaDia } from "./rodadaDia";

/**
 * Os motivos de perda que significam "o proprietário já tinha resolvido a
 * vida quando chegamos".
 *
 * É o maior balde da carteira — 30 de 50 encerramentos em 28/07/2026 — e é o
 * mesmo agrupamento que motivou `calculo/idadeAnuncio.ts`. Ele está aqui como
 * CONSTANTE, e não repetido em prosa, porque duas listas soltas do mesmo
 * conceito divergem em silêncio (a mesma razão de `calculo/notas.ts` existir).
 *
 * "Optou por outra imobiliária" entra: não é o proprietário recusando o
 * serviço, é ele já tendo escolhido antes de a gente aparecer.
 *
 * O que NÃO entra, e é o vizinho fácil de confundir: perder a locação de um
 * imóvel que já tinha sido captado (ver {@link MOTIVOS_PERDA_POS_CAPTACAO}).
 * Ali não chegamos tarde — chegamos, e ganhamos.
 */
export const MOTIVOS_CHEGAMOS_TARDE: readonly string[] = [
  "Imóvel já alugado por conta própria",
  "Imóvel já vendido",
  "Optou por outra imobiliária",
];

/**
 * Perda de quem JÁ TINHA SIDO CAPTADO: angariamos, e a locação fechou fora —
 * com a imobiliária concorrente que anunciava o mesmo imóvel, ou direto entre
 * proprietário e inquilino.
 *
 * Balde próprio por eliminação, e as duas exclusões dizem a mesma coisa por
 * ângulos opostos. Não é "chegamos tarde": lá a captação nunca aconteceu, e é
 * dali que sai o diagnóstico do garimpo — jogar esta perda naquele número faria
 * o trabalho que deu certo piorar a leitura do trabalho que não deu. E não é
 * "demais motivos", onde estão as recusas: aqui o proprietário disse SIM.
 *
 * A conversão de captação já trata este imóvel como ganho (`conversaoCaptacao`,
 * no motor: "angariado-e-depois-perdido conta como angariado"). Esta seção é o
 * único lugar do documento que ainda o lia pelo campo `status`.
 *
 * O balde tem um rótulo só, mas não depende de o corretor tê-lo escolhido:
 * `perdasDoPeriodo` passa todo motivo por `motivoPerdaPelaFase` antes de
 * classificar, então o imóvel captado que foi encerrado com um dos rótulos de
 * "chegamos tarde" cai aqui do mesmo jeito. Ver o comentário lá.
 */
export const MOTIVOS_PERDA_POS_CAPTACAO: readonly string[] = [MOTIVO_PERDA_LOCADO_FORA];

/**
 * Perda que fala do nosso CADASTRO, não do mercado.
 *
 * Fica separada porque somá-la às demais faz o mercado parecer pior do que é
 * — e a ação que ela pede é outra: telefone errado se corrige, concorrente que
 * chegou antes não. Na carteira real são 6 dos 52.
 */
export const MOTIVOS_DADO_RUIM: readonly string[] = [MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO];

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

/** Rótulo usado quando a tentativa não registrou canal (dado antigo). */
export const CANAL_NAO_INFORMADO = "Não informado";
/** Rótulo usado quando o encerramento não tem motivo preenchido. */
export const MOTIVO_NAO_INFORMADO = "Sem motivo informado";

/* --- Seção 1: esforço -------------------------------------------------- */

export interface ContagemRotulada {
  rotulo: string;
  n: number;
}

export interface EsforcoPeriodo {
  tentativas: number;
  /** Imóveis distintos que receberam ao menos um contato no período. */
  imoveis: number;
  /** Tentativas que foram a PRIMEIRA daquele imóvel (abertura de conversa). */
  aberturas: number;
  /** As demais — retomada de quem já tinha sido contatado. */
  seguimentos: number;
  /** Saíram pelo follow-up em lote. */
  viaLote: number;
  /** Saíram uma a uma (botão 💬, pré-cadastro, registro manual). */
  avulsas: number;
  porCanal: ContagemRotulada[];
  /** Um item por dia COM envio, em ordem crescente (alimenta a mini-barra). */
  porDia: ContagemRotulada[];
  /** Dias em que houve ao menos um contato. */
  diasAtivos: number;
  /** Tentativas ÷ dias ativos. Divide pelos dias TRABALHADOS, não pelos dias
      do período: o corretor prospecta em rajadas, e dividir por 31 descreveria
      um ritmo que nunca existiu em nenhum dia. */
  mediaPorDiaAtivo: number | null;
}

function diaDa(t: Tentativa): string {
  return (t.data || "").slice(0, 10);
}

function ordenarContagem(mapa: Map<string, number>): ContagemRotulada[] {
  return [...mapa.entries()]
    .map(([rotulo, n]) => ({ rotulo, n }))
    .sort((a, b) => (b.n !== a.n ? b.n - a.n : a.rotulo.localeCompare(b.rotulo)));
}

export function esforcoDoPeriodo(imoveis: Imovel[], start: string, end: string): EsforcoPeriodo {
  let tentativas = 0;
  let aberturas = 0;
  let viaLote = 0;
  const imoveisTocados = new Set<string>();
  const porCanal = new Map<string, number>();
  const porDia = new Map<string, number>();

  for (const imovel of imoveis) {
    // Ordena o histórico INTEIRO do imóvel antes de recortar o período: só
    // assim se sabe se a tentativa do dia 5 foi a primeira daquela conversa ou
    // a terceira. Recortar antes faria toda tentativa do começo do período
    // parecer abertura.
    const todas = tentativasOrdenadas(imovel);
    todas.forEach((t, indice) => {
      const dia = diaDa(t);
      if (!dia || dia < start || dia > end) return;

      tentativas++;
      imoveisTocados.add(imovel.id);
      if (indice === 0) aberturas++;
      if (t.viaLote) viaLote++;

      const canal = (t.canal || "").trim() || CANAL_NAO_INFORMADO;
      porCanal.set(canal, (porCanal.get(canal) || 0) + 1);
      porDia.set(dia, (porDia.get(dia) || 0) + 1);
    });
  }

  const diasAtivos = porDia.size;
  return {
    tentativas,
    imoveis: imoveisTocados.size,
    aberturas,
    seguimentos: tentativas - aberturas,
    viaLote,
    avulsas: tentativas - viaLote,
    porCanal: ordenarContagem(porCanal),
    porDia: [...porDia.entries()]
      .map(([rotulo, n]) => ({ rotulo, n }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo)),
    diasAtivos,
    mediaPorDiaAtivo: diasAtivos > 0 ? tentativas / diasAtivos : null,
  };
}

/* --- Seção 2: respostas ------------------------------------------------- */

export interface RespostasPeriodo {
  /** Mensagens que o proprietário mandou dentro do período. */
  mensagens: number;
  /** Imóveis distintos de onde veio ao menos uma dessas mensagens. */
  imoveisQueResponderam: number;
  /** COORTE: imóveis cuja primeira tentativa caiu no período. */
  coorteAbordados: number;
  /** Destes, quantos já responderam alguma vez (ver "Coorte" no cabeçalho). */
  coorteResponderam: number;
  /** `coorteResponderam ÷ coorteAbordados × 100`; null sem coorte. */
  taxaCoorte: number | null;
  /** Dias entre a primeira tentativa e a primeira resposta, na coorte que
      respondeu. Mediana, não média: uma conversa que só respondeu 20 dias
      depois desloca a média e some na mediana. */
  medianaAteResponder: number | null;
  /** Desfecho ATUAL dos imóveis que responderam no período — não o desfecho
      "do período" (ver o cabeçalho). */
  angariados: number;
  encerrados: number;
  emAberto: number;
}

/** Dias (YYYY-MM-DD) das mensagens que o proprietário mandou. */
function diasDeResposta(imovel: Imovel): string[] {
  return (imovel.notas || [])
    .filter(ehNotaDeResposta)
    .map((n) => (n.data || "").slice(0, 10))
    .filter((d) => d.length === 10)
    .sort();
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 === 1 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}

export function respostasDoPeriodo(imoveis: Imovel[], start: string, end: string): RespostasPeriodo {
  let mensagens = 0;
  const responderamNoPeriodo: Imovel[] = [];
  let coorteAbordados = 0;
  let coorteResponderam = 0;
  const atrasos: number[] = [];

  for (const imovel of imoveis) {
    const respostas = diasDeResposta(imovel);
    const noPeriodo = respostas.filter((d) => d >= start && d <= end);
    mensagens += noPeriodo.length;
    if (noPeriodo.length > 0) responderamNoPeriodo.push(imovel);

    // Coorte: a conversa NASCEU neste período?
    const todas = tentativasOrdenadas(imovel);
    const primeira = todas.length > 0 ? diaDa(todas[0]) : "";
    if (!primeira || primeira < start || primeira > end) continue;

    coorteAbordados++;
    // "Já respondeu alguma vez" — inclusive depois do fim do período. É o que
    // torna a coorte comparável entre meses: cortar no fim do período puniria
    // sempre o mês mais recente.
    const primeiraResposta = respostas.find((d) => d >= primeira);
    if (!primeiraResposta) continue;
    coorteResponderam++;
    const dias = daysBetween(primeira, primeiraResposta);
    if (dias !== null && dias >= 0) atrasos.push(dias);
  }

  let angariados = 0;
  let encerrados = 0;
  let emAberto = 0;
  for (const imovel of responderamNoPeriodo) {
    // Mesma ressalva do motor: "Locado" conta como captação ganha mesmo sem a
    // etapa no histórico — não se aluga o que não se captou.
    if (foiAngariado(imovel) || imovel.status === "Locado") angariados++;
    else if (TERMINAIS.includes(imovel.status)) encerrados++;
    else emAberto++;
  }

  return {
    mensagens,
    imoveisQueResponderam: responderamNoPeriodo.length,
    coorteAbordados,
    coorteResponderam,
    taxaCoorte: coorteAbordados > 0 ? (coorteResponderam / coorteAbordados) * 100 : null,
    medianaAteResponder: mediana(atrasos),
    angariados,
    encerrados,
    emAberto,
  };
}

/* --- Seção 3: onde perdemos --------------------------------------------- */

/**
 * "Sem resposta" é terminal para o funil, mas NÃO é perda decidida — e essa
 * distinção salvou a seção inteira quando ela rodou na carteira real.
 *
 * Na primeira versão ela contava os três terminais juntos, e o resultado
 * (31/07/2026) foi um documento que se contradizia: 81 "encerramentos" na
 * seção 3, dos quais 29 eram imóveis em "Sem resposta" — os MESMOS que a seção
 * 4 listava logo abaixo como "73 esperando a próxima mensagem". O relatório
 * dava por perdido exatamente o público que a outra metade dele mandava
 * trabalhar hoje.
 *
 * O estrago não parava na contradição. "Sem resposta" não tem `motivoPerda`
 * por construção, então os 29 viravam o maior balde da tela ("sem motivo
 * informado", 40%) e diluíam toda taxa: "chegamos tarde" aparecia como 37%
 * quando, sobre os encerramentos que de fato foram decididos, é **58%** —
 * 30 de 52. A leitura da manhã mudava por causa do denominador.
 *
 * É a mesma régua de `conversaoCaptacao` e de `FOLLOWUP_STATUS_ALVO`: quem
 * ainda está em jogo é pendência, não fracasso. "Perdido" e "Cancelado" são
 * saídas deliberadas — alguém disse não. "Sem resposta" é silêncio.
 */
/** Rótulo dos que o app já desistiu de cutucar. Eles CONTAM como perda
    decidida (ver `ehPerdaDecidida`), mas nunca têm `motivoPerda` — sem um
    rótulo próprio cairiam em "sem motivo informado" e voltariam a ser o maior
    balde da tela, que é justamente o que esta seção evita. */
export const MOTIVO_SEM_RETORNO = "Sem retorno após a última tentativa";

export interface PerdasPeriodo {
  /** Encerramentos DECIDIDOS no período (Perdido/Cancelado). É o denominador
      de todas as taxas desta seção. */
  decididos: number;
  /** Foram parar em "Sem resposta" no período. Exibido ao lado, nunca somado:
      é silêncio, e o follow-up ainda os trabalha (ver {@link STATUS_DECIDIDOS}). */
  semResposta: number;
  /** Motivos dos DECIDIDOS. */
  porMotivo: ContagemRotulada[];
  /** Ver {@link MOTIVOS_CHEGAMOS_TARDE}. */
  chegamosTarde: number;
  /** Ver {@link MOTIVOS_DADO_RUIM}. */
  dadoRuim: number;
  /** Ver {@link MOTIVOS_PERDA_POS_CAPTACAO}: captamos e perdemos a locação. */
  posCaptacao: number;
  /** O resto: recusa de verdade, desistência, valor, "Outro". */
  demais: number;
  /** `chegamosTarde ÷ decididos × 100`; null sem encerramento decidido. */
  pctChegamosTarde: number | null;
}

export function perdasDoPeriodo(imoveis: Imovel[], start: string, end: string): PerdasPeriodo {
  const porMotivo = new Map<string, number>();
  let decididos = 0;
  let semResposta = 0;
  let chegamosTarde = 0;
  let dadoRuim = 0;
  let posCaptacao = 0;

  for (const imovel of imoveis) {
    if (!TERMINAIS.includes(imovel.status)) continue;
    // A data do ENCERRAMENTO vem do statusHistory, não do cadastro — é o
    // invariante de sempre: a verdade sobre o progresso mora no histórico.
    const quando = dateEnteredStatus(imovel, imovel.status);
    if (!quando || quando < start || quando > end) continue;

    // A mesma régua do motor, para relatório e Dashboard não discordarem sobre
    // o que é derrota: silêncio que o follow-up ainda trabalha fica de fora;
    // silêncio que esgotou a cadência entra, com rótulo próprio.
    if (!ehPerdaDecidida(imovel)) {
      semResposta++;
      continue;
    }

    decididos++;
    // O motivo passa pela FASE antes de ser classificado. "Já aluguei" dito por
    // quem nunca foi captado é "chegamos tarde"; dito por um imóvel angariado, é
    // a locação que se perdeu depois de a captação ter dado certo — e o seletor
    // do cadastro oferece os dois rótulos lado a lado, então o clique errado é
    // esperado. Derivar aqui, em vez de confiar no que está gravado, é o que faz
    // o encerramento manual e os registros antigos saírem certos sem migração
    // (mesma disciplina de `resultadoObservado.ts`). O rótulo corrigido vale
    // também para `porMotivo`, senão a tabela contradiria os números acima dela.
    const motivo =
      imovel.status === "Sem resposta"
        ? MOTIVO_SEM_RETORNO
        : motivoPerdaPelaFase(
            imovel.statusHistory,
            (imovel.motivoPerda || "").trim() || MOTIVO_NAO_INFORMADO,
          );
    porMotivo.set(motivo, (porMotivo.get(motivo) || 0) + 1);
    if (MOTIVOS_CHEGAMOS_TARDE.includes(motivo)) chegamosTarde++;
    else if (MOTIVOS_DADO_RUIM.includes(motivo)) dadoRuim++;
    else if (MOTIVOS_PERDA_POS_CAPTACAO.includes(motivo)) posCaptacao++;
  }

  return {
    decididos,
    semResposta,
    porMotivo: ordenarContagem(porMotivo),
    chegamosTarde,
    dadoRuim,
    posCaptacao,
    demais: decididos - chegamosTarde - dadoRuim - posCaptacao,
    pctChegamosTarde: decididos > 0 ? (chegamosTarde / decididos) * 100 : null,
  };
}

/* --- O documento -------------------------------------------------------- */

export interface RelatorioCompleto {
  esforco: EsforcoPeriodo;
  respostas: RespostasPeriodo;
  perdas: PerdasPeriodo;
  /**
   * Seção 4 — a fila que ficou.
   *
   * **É a situação de HOJE, sempre, mesmo com um período passado
   * selecionado**, e isso é limitação assumida, não descuido: a fila do
   * follow-up depende da cadência contada a partir de hoje
   * (`diasDesdeUltimoContato`), então reconstruí-la para 30 de junho exigiria
   * refazer o estado do banco naquela data. Inventar esse número seria pior
   * que não tê-lo. A tela avisa quando o período não é o corrente.
   *
   * É o MESMO cálculo do card da Início (`rodadaDoDia`), de propósito: o
   * relatório e a tela inicial nunca podem discordar sobre quantos
   * proprietários estão esperando.
   */
  fila: RodadaDia;
  /** Período coberto pelas seções 1 a 3. */
  start: string;
  end: string;
}

export function relatorioCompleto(
  imoveis: Imovel[],
  agenda: AgendaItem[],
  abordagens: Abordagem[],
  start: string,
  end: string,
  hoje: string,
): RelatorioCompleto {
  return {
    esforco: esforcoDoPeriodo(imoveis, start, end),
    respostas: respostasDoPeriodo(imoveis, start, end),
    perdas: perdasDoPeriodo(imoveis, start, end),
    fila: rodadaDoDia(imoveis, agenda, abordagens, hoje),
    start,
    end,
  };
}
