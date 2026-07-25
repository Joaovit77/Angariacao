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

/** Dias que um lead pode ficar cadastrado sem NENHUMA tentativa antes de
    virar cobrança. Três dias é o intervalo em que "vou falar com ele depois"
    ainda é verdade; passou disso, virou esquecimento. */
export const DIAS_LEAD_ESQUECIDO = 3;

/** Quantas linhas o card mostra. Lista longa não é priorização — é a mesma
    carteira em outra ordem, e o corretor volta a escolher no olho. */
export const LIMITE_TERMOMETRO = 8;

/** Etapas em que o imóvel JÁ foi captado: a captação acabou e o que se espera
    é inquilino, não o sim do proprietário. Ficam de fora da faixa de
    esquecimento — a cobrança dessa fase é o lembrete de disponibilidade
    (60 dias), não esta lista. Uma reação ou um compromisso explícito continuam
    valendo, porque promessa marcada é promessa. */
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

  const jaCaptado = (STATUS_JA_CAPTADO as readonly string[]).includes(imovel.status);
  const linha = (score: number, motivo: string, dias: number): LinhaTemperatura => ({
    imovelId: imovel.id,
    score,
    motivo,
    dias: Math.max(0, dias),
  });

  // 1. O proprietário marcou o dia, e o dia chegou. Nada supera isso: quem
  //    pediu para ser chamado está esperando a ligação.
  const marcada = compromissoVencido(ultima, hoje);
  if (marcada) {
    const atraso = daysBetween(marcada, hoje) ?? 0;
    return linha(
      FAIXA.compromissoVencido,
      atraso > 0
        ? `Pediu para retomar em ${fmtDate(marcada)} — ${atraso} dia(s) atrás.`
        : `Pediu para retomar hoje.`,
      atraso,
    );
  }

  // 2. Reagiu. Ordem entre os desfechos = quanto ele se comprometeu.
  if (ultima && diasDesdeTentativa !== null && diasDesdeTentativa > 0) {
    if (ultima.resultado === "agendou") {
      return linha(FAIXA.agendou, `Agendou com você há ${diasDesdeTentativa} dia(s).`, diasDesdeTentativa);
    }
    if (ultima.resultado === "vai-retornar") {
      return linha(
        FAIXA.vaiRetornar,
        `Disse que ia retornar há ${diasDesdeTentativa} dia(s) — sem prazo marcado.`,
        diasDesdeTentativa,
      );
    }
    if (ultima.resultado === "respondeu") {
      return linha(FAIXA.respondeu, `Respondeu há ${diasDesdeTentativa} dia(s).`, diasDesdeTentativa);
    }
  }

  // Daqui para baixo, só o que ainda está em captação: quem já foi captado
  // tem a cobrança própria de disponibilidade.
  if (jaCaptado) return null;

  // 3. Cadastrado e nunca tocado — o lead que entrou no garimpo e a semana
  //    passou por cima. Última faixa: é a única cobrança daqui que não nasce de
  //    uma reação do proprietário, e entra porque ninguém mais a faz (o card de
  //    parados só olha tempo no status, não a ausência de tentativa).
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
