/* ================================================================
   TERMÔMETRO DO PROPRIETÁRIO — quem cutucar hoje (parte pura)
   Feature nova da pós-migração (sem oráculo do app antigo).

   O Foco do dia (calculo/planoDia.ts) responde "onde prospectar hoje";
   este módulo responde a outra metade da manhã: "de quem eu corro
   atrás AGORA, do que já está dentro?". São perguntas diferentes — uma
   é sobre entrada nova, a outra sobre não deixar esfriar quem já
   reagiu — e por isso dois módulos, não um.

   Nenhum estado novo no banco: tudo sai do `tentativas` e do
   `statusHistory` que já existem. O sinal mais forte já estava
   gravado e ninguém consumia — quando o proprietário responde "me
   chama semana que vem", o webhook grava a data em
   `sugestaoIa.retomarEm`, mas nada avisava quando o dia chegava. O
   corretor tinha um compromisso marcado pelo próprio proprietário e
   só o veria se abrisse a lista de pendências por conta própria.

   A ordem é por FAIXA de sinal, e dentro dela pelo tempo esperando.
   Faixa, e não uma nota contínua, porque a lista precisa ser
   explicável: o corretor tem que conseguir olhar e concordar com o
   motivo, senão ele para de confiar na ordem e volta a escolher no
   olho. Cada linha carrega o `motivo` escrito por isso.

   Puro: só tipos, constantes, helpers de data/formato e o motor —
   sem React/Next/Supabase/store.
   ================================================================ */
import { STATUS_TERMINAL_NEGATIVE } from "../constantes";
import { daysBetween } from "../datas";
import { fmtDate } from "../formatadores";
import type { Imovel, Tentativa } from "../tipos";
import { daysInCurrentStatus, imoveisDeCaptacao, isPausado } from "./motor";
import { dataUltimaResposta } from "./notas";

/** Dias que um lead pode ficar cadastrado sem NENHUMA tentativa antes de
    virar cobrança. Três dias é o intervalo em que "vou falar com ele depois"
    ainda é verdade; passou disso, virou esquecimento. */
export const DIAS_LEAD_ESQUECIDO = 3;

/** Quantas linhas o card mostra. Lista longa não é priorização — é a mesma
    carteira em outra ordem, e o corretor volta a escolher no olho. */
export const LIMITE_TERMOMETRO = 8;

/** Etapas em que o imóvel JÁ foi captado: a captação acabou e o que se espera
    é inquilino, não o sim do proprietário. A cobrança dessa fase é o lembrete
    de disponibilidade (60 dias), não esta lista — ver
    `FAIXA_MINIMA_JA_CAPTADO` para o que ainda passa. */
const STATUS_JA_CAPTADO = ["Angariado", "Publicado", "Locado"] as const;

/** As faixas, do mais quente para o mais frio. O número é só a ordem —
    não é nota, não é probabilidade, e não deve ser exibido como se fosse.

    **Não existe faixa de "imóvel parado", e isso é deliberado.** Ela existiu na
    primeira versão e, na carteira real, inundou o card: de 8 linhas, 7 eram
    "parado há 11 dias" — os MESMOS imóveis que o card "Imóveis parados" já
    lista logo abaixo, na mesma ordem. A única linha de calor de verdade ficava
    enterrada no meio da repetição.

    A causa é estrutural, não um acaso daquele dia: numa captação saudável a
    grande maioria dos contatos fica sem resposta, então a faixa mais fraca é
    sempre a mais populosa e sempre vence no volume. Estagnação é cobrança de
    funil e já tem card próprio; este aqui responde outra pergunta — quem
    demonstrou interesse e está esfriando. Misturar as duas transforma a
    resposta rara na exceção invisível. */
export const FAIXA = {
  compromissoVencido: 100,
  agendou: 90,
  vaiRetornar: 80,
  respondeu: 70,
  leadEsquecido: 60,
} as const;

/* --- Imóvel já captado não entra aqui, por NENHUMA faixa --------------------
   **É a mesma armadilha da faixa de "imóvel parado", por outra porta.** Depois
   de angariar, o proprietário fala MUITO mais: documentação, fotos, metragem,
   dúvidas de contrato. Então o captado ganha no volume e enterra o lead que
   ainda precisa do "sim" — que é a pergunta inteira deste card. Medido em
   28/07/2026: 5 das 8 linhas eram imóveis já angariados, e NENHUMA tinha
   compromisso marcado; todas entraram pela faixa mais fraca. Uma delas
   (LD-156) tinha 64 respostas — CPF, e-mail, fotos, "Já Assinei". Isso é
   execução de um contrato ganho, não calor de captação.

   **Nem "agendou" passa, e essa foi a parte contraintuitiva.** A primeira
   versão do corte abria exceção para promessa marcada, com o argumento de que
   hora combinada é hora combinada. Só que num imóvel já captado a visita
   marcada é com o INQUILINO — o corretor acompanhando quem quer ver o imóvel.
   É trabalho de locação, e quem cobra hora marcada é a AGENDA, que já existe e
   já tem data e horário. Foi o corretor que apontou, sobre o LD-123: a
   exceção teria mantido no card justamente a linha que não é captação.

   O que sobra para essa fase já tem dono, e são três telas: a **agenda** (hora
   marcada), o **lembrete de disponibilidade** de 60 dias (o imóvel ainda está
   disponível?) e o **nudge de resultados pendentes** (o desfecho da conversa).
   Quatro das cinco linhas de 28/07 diziam "desfecho ainda não confirmado" —
   este card estava repetindo o nudge. */

export interface LinhaTemperatura {
  imovelId: string;
  /** Faixa do sinal (ver FAIXA). Ordena; não é nota a exibir. */
  score: number;
  /** Por que este imóvel está aqui, em pt-BR e pronto para a tela. */
  motivo: string;
  /** Dias esperando desde o sinal — desempata dentro da faixa. */
  dias: number;
}

/** A tentativa mais recente. As datas são "YYYY-MM-DDTHH:mm", ordenáveis
    lexicograficamente (mesma garantia de NotaImovel). */
export function ultimaTentativa(imovel: Imovel): Tentativa | null {
  const lista = imovel.tentativas || [];
  if (!lista.length) return null;
  return lista.reduce((maior, t) => (t.data > maior.data ? t : maior));
}

/** A data (YYYY-MM-DD) marcada pelo próprio proprietário para retomar, quando
    ela existe e já chegou. Só vale a sugestão ainda não confirmada: quando o
    corretor confirma o desfecho, `sugestaoIa` some e o compromisso deixou de
    estar pendente. */
function compromissoVencido(t: Tentativa | null, hoje: string): string | null {
  const marcada = t?.sugestaoIa?.retomarEm;
  if (!marcada) return null;
  return marcada.slice(0, 10) <= hoje ? marcada.slice(0, 10) : null;
}

/** Data (YYYY-MM-DD) da mensagem mais recente que o PROPRIETÁRIO mandou, lida
    das notas gravadas pelo webhook. null quando ele nunca escreveu.
    A leitura mora em `calculo/notas.ts` — o motor usa a mesma. */
function ultimaRespostaRecebida(imovel: Imovel): string | null {
  return dataUltimaResposta(imovel.notas);
}

/* ----------------------------------------------------------------
   O SINAL DO PROPRIETÁRIO — a parte compartilhada

   Isto é só "o que ELE fez", sem nenhuma regra de quem pergunta. Mora
   aqui, num lugar só, porque há DOIS consumidores com perguntas
   diferentes: o termômetro ("de quem eu corro atrás hoje, na carteira
   toda") e a fila do follow-up em lote ("dentro do público do lote,
   quem vai na frente"). Duas cópias da escada de sinal divergiriam na
   primeira vez que alguém acrescentasse um desfecho.

   Cada consumidor aplica os PRÓPRIOS filtros por fora: o termômetro
   descarta terminal negativo, pausado e quem foi tocado hoje; o lote
   já chega com o público filtrado por status, telefone e recência.
   ---------------------------------------------------------------- */

export interface SinalProprietario {
  /** Faixa de FAIXA — ordena, não é nota a exibir. */
  faixa: number;
  /** Por que este imóvel tem sinal, em pt-BR e pronto para a tela. */
  motivo: string;
  /** Dias desde o sinal — desempata dentro da faixa. */
  dias: number;
}

/**
 * O que o proprietário sinalizou, ou null quando não sinalizou nada.
 *
 * A ordem das faixas é o quanto ele se comprometeu: marcou dia > agendou >
 * disse que retorna > respondeu.
 *
 * **A última fonte é a que faltava.** As faixas acima leem o `resultado` da
 * tentativa, que é uma AFIRMAÇÃO DO CORRETOR — e a tentativa nasce chutada como
 * "sem-resposta", esperando confirmação no nudge. Enquanto ninguém confirma, um
 * proprietário que respondeu de verdade fica indistinguível de um que sumiu. Só
 * que o webhook já gravou a mensagem dele em `notas`, e ninguém lia: era o
 * sinal mais duro que existe (ele escreveu) parado no banco. Por isso a nota de
 * resposta vale a faixa `respondeu` mesmo com a tentativa ainda em
 * "sem-resposta" — e o motivo diz que o desfecho segue por confirmar, para o
 * corretor não achar que o sistema decidiu por ele.
 */
export function sinalDoProprietario(imovel: Imovel, hoje: string): SinalProprietario | null {
  const ultima = ultimaTentativa(imovel);

  // Reagiu negando, ou o número nem era dele: não há sinal POSITIVO a promover.
  // Vale para quem chama sem pré-filtrar (o lote) — o termômetro já corta antes.
  if (ultima?.resultado === "recusou" || ultima?.resultado === "numero-errado") return null;

  const marcada = compromissoVencido(ultima, hoje);
  if (marcada) {
    const atraso = daysBetween(marcada, hoje) ?? 0;
    return {
      faixa: FAIXA.compromissoVencido,
      motivo:
        atraso > 0
          ? `Pediu para retomar em ${fmtDate(marcada)} — ${atraso} dia(s) atrás.`
          : `Pediu para retomar hoje.`,
      dias: Math.max(0, atraso),
    };
  }

  const diasDesdeTentativa = ultima ? (daysBetween(ultima.data.slice(0, 10), hoje) ?? 0) : null;
  if (ultima && diasDesdeTentativa !== null) {
    if (ultima.resultado === "agendou") {
      return {
        faixa: FAIXA.agendou,
        motivo: `Agendou com você há ${diasDesdeTentativa} dia(s).`,
        dias: Math.max(0, diasDesdeTentativa),
      };
    }
    if (ultima.resultado === "vai-retornar") {
      return {
        faixa: FAIXA.vaiRetornar,
        motivo: `Disse que ia retornar há ${diasDesdeTentativa} dia(s) — sem prazo marcado.`,
        dias: Math.max(0, diasDesdeTentativa),
      };
    }
    if (ultima.resultado === "respondeu") {
      return {
        faixa: FAIXA.respondeu,
        motivo: `Respondeu há ${diasDesdeTentativa} dia(s).`,
        dias: Math.max(0, diasDesdeTentativa),
      };
    }
  }

  const escreveuEm = ultimaRespostaRecebida(imovel);
  if (escreveuEm) {
    const dias = daysBetween(escreveuEm, hoje) ?? 0;
    return {
      faixa: FAIXA.respondeu,
      motivo: `Respondeu no WhatsApp há ${dias} dia(s) — desfecho ainda não confirmado.`,
      dias: Math.max(0, dias),
    };
  }

  return null;
}

/**
 * A linha do termômetro para um imóvel, ou null quando ele não deve aparecer.
 *
 * Fica de fora: quem já saiu do funil (terminais negativos), quem está pausado,
 * unidade de desdobramento (a captação é do principal — cobrar as duas seria
 * cobrar a mesma conversa duas vezes) e quem recusou ou tem o número errado.
 *
 * Também fica de fora quem foi contatado HOJE, por qualquer faixa: você acabou
 * de falar com a pessoa, e uma lista que manda cutucar de novo no mesmo dia
 * ensina a ignorá-la.
 */
export function linhaTemperatura(imovel: Imovel, hoje: string): LinhaTemperatura | null {
  if ((STATUS_TERMINAL_NEGATIVE as readonly string[]).includes(imovel.status)) return null;
  if (isPausado(imovel)) return null;

  const ultima = ultimaTentativa(imovel);
  if (ultima?.resultado === "recusou" || ultima?.resultado === "numero-errado") return null;

  const diasDesdeTentativa = ultima ? (daysBetween(ultima.data.slice(0, 10), hoje) ?? 0) : null;

  // Tocou hoje, sai da lista — e sai INTEIRO, por qualquer faixa. Sem este
  // corte antes das faixas, quem respondeu hoje escapava da faixa de reação e
  // reaparecia como "parado há 8 dias" (o status não muda quando o
  // proprietário responde): a lista mandava cutucar de novo no mesmo dia
  // alguém com quem o corretor tinha acabado de falar.
  if (diasDesdeTentativa === 0) return null;

  // Já captado sai ANTES das faixas. O corte vinha DEPOIS delas, e por isso
  // qualquer reação do proprietário o trazia de volta — ver o bloco sobre
  // STATUS_JA_CAPTADO acima. A cobrança dessa fase é a agenda, o lembrete de
  // disponibilidade e o nudge de resultados; nenhuma delas é este card.
  if ((STATUS_JA_CAPTADO as readonly string[]).includes(imovel.status)) return null;

  const linha = (score: number, motivo: string, dias: number): LinhaTemperatura => ({
    imovelId: imovel.id,
    score,
    motivo,
    dias: Math.max(0, dias),
  });

  // 1 e 2. O que o proprietário sinalizou — compromisso marcado que venceu,
  //    ou a reação dele, na ordem de quanto se comprometeu. A escada mora em
  //    `sinalDoProprietario` porque a fila do follow-up usa a MESMA — e é por
  //    isso que o corte de status é aqui e não lá dentro: no lote o público já
  //    vem filtrado por status, e a régua é outra.
  const sinal = sinalDoProprietario(imovel, hoje);
  if (sinal) return linha(sinal.faixa, sinal.motivo, sinal.dias);

  // 3. Cadastrado e nunca tocado — o lead que entrou no garimpo e a semana
  //    passou por cima. Última faixa: é a única cobrança daqui que não nasce de
  //    uma reação do proprietário, e entra porque chega ANTES de qualquer
  //    outra — DIAS_LEAD_ESQUECIDO é 3, e o card de parados só marca aos 7.
  const noStatus = daysInCurrentStatus(imovel);
  if (!ultima && noStatus !== null && noStatus >= DIAS_LEAD_ESQUECIDO) {
    return linha(
      FAIXA.leadEsquecido,
      `Cadastrado há ${noStatus} dia(s) e nunca contatado.`,
      noStatus,
    );
  }

  // Enviou e ainda não houve reação nenhuma: não é calor, é espera. Quem cobra
  // isso é o follow-up em lote (a retomada) e o nudge de resultados pendentes
  // (a confirmação do desfecho) — cada um com seu próprio ritmo.
  return null;
}

/**
 * Os imóveis mais quentes agora, do mais para o menos. Dentro da mesma faixa,
 * quem espera há mais tempo vem primeiro; o id desempata para a ordem ser
 * estável entre renders.
 */
export function termometro(
  imoveis: Imovel[],
  hoje: string,
  limite = LIMITE_TERMOMETRO,
): LinhaTemperatura[] {
  return imoveisDeCaptacao(imoveis)
    .map((i) => linhaTemperatura(i, hoje))
    .filter((l): l is LinhaTemperatura => l !== null)
    .sort((a, b) => b.score - a.score || b.dias - a.dias || a.imovelId.localeCompare(b.imovelId))
    .slice(0, limite);
}
