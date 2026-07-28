/* ================================================================
   PROJEÇÃO DE META — o mês tem calendário (parte pura)
   Feature nova da pós-migração (sem oráculo do app antigo).

   O card de meta sabia dividir (`realizado / meta`) e subtrair
   ("faltam 4"), mas não sabia que existe calendário: no dia 3 do mês
   ele dizia exatamente a mesma coisa que no dia 28. "Faltam 4" é
   tranquilidade no começo do mês e emergência no fim, e o número
   sozinho não distingue os dois — então não informa decisão nenhuma.

   Este módulo acrescenta o eixo que faltava, o TEMPO, e responde as
   duas perguntas que o corretor de fato faz olhando a meta:
   "no ritmo que eu vou, dá?" e "quanto por dia eu preciso fazer?".

   Duas decisões de desenho:

   - **O ritmo é medido em dias ÚTEIS, não corridos.** Captação é
     trabalho de horário comercial: proprietário não atende ligação
     no domingo, e portal de anúncio não é garimpado no fim de semana.
     Dividir por dias corridos diria "0,5 por dia" para quem faz 1 por
     dia útil, e o "precisa de X por dia" mandaria trabalhar sábado.
   - **Sem meta não há projeção.** Nada de inventar alvo: se o corretor
     não definiu a meta do mês, o card segue mudo como antes
     (`situacao: "sem-meta"`), porque projetar contra zero acusaria
     "meta atingida" em todo card vazio.

   A projeção vale para o mês CORRENTE. Para um mês já fechado não há o
   que projetar — `projetarMeta` devolve `situacao: "encerrado"` e o
   histórico continua mostrando só o realizado.

   Puro: consome só helpers de data. Sem React/Next/Supabase/store.
   ================================================================ */
import { diasUteisEntre, primeiroDiaDoMes, ultimoDiaDoMes } from "../datas";

/** Fração da meta que a projeção precisa alcançar para o mês ser "aperto" em
    vez de "fora do ritmo". Abaixo de 80% do alvo, o ritmo atual não chega nem
    perto e chamar isso de "quase" seria consolo, não informação. */
export const LIMIAR_APERTO = 0.8;

export type SituacaoMeta =
  /** Não há meta definida para o mês — o card não projeta nada. */
  | "sem-meta"
  /** O realizado já alcançou o alvo. */
  | "atingida"
  /** No ritmo atual, o mês fecha na meta ou acima. */
  | "no-ritmo"
  /** Fecha abaixo, mas perto (≥ LIMIAR_APERTO do alvo). */
  | "aperto"
  /** No ritmo atual não chega. */
  | "fora-do-ritmo"
  /** Mês já encerrado: sobra só o realizado. */
  | "encerrado";

export interface ProjecaoMeta {
  situacao: SituacaoMeta;
  /** Dias úteis do 1º ao dia de referência, inclusive — o denominador do ritmo. */
  diasUteisDecorridos: number;
  /** Dias úteis de hoje até o fim do mês, inclusive. É o divisor do "por dia":
      hoje ainda é dia de trabalho. */
  diasUteisRestantes: number;
  /** Realizado por dia útil decorrido. 0 quando ainda não houve dia útil. */
  ritmoDiario: number;
  /** Onde o mês fecha mantendo o ritmo. Nunca menor que o realizado. */
  projecao: number;
  /** Quanto ainda falta para o alvo (0 quando batida). */
  falta: number;
  /** Quanto por dia útil restante para bater. null quando não há mais dia útil
      (o mês acabou em termos de trabalho) ou quando a meta já foi batida. */
  porDiaUtil: number | null;
}

/**
 * A projeção da meta do mês `mKey` no dia `hoje`.
 *
 * `hoje` fora do mês de `mKey` significa mês encerrado (ou ainda por vir): sem
 * projeção. O caso "mês futuro" cai no mesmo balde de propósito — projetar um
 * mês que não começou é extrapolar de zero dia trabalhado.
 */
export function projetarMeta(realizado: number, meta: number, mKey: string, hoje: string): ProjecaoMeta {
  const primeiro = primeiroDiaDoMes(mKey);
  const ultimo = ultimoDiaDoMes(mKey);
  const dentroDoMes = hoje >= primeiro && hoje <= ultimo;

  const diasUteisDecorridos = dentroDoMes ? diasUteisEntre(primeiro, hoje) : diasUteisEntre(primeiro, ultimo);
  const diasUteisRestantes = dentroDoMes ? diasUteisEntre(hoje, ultimo) : 0;
  const ritmoDiario = diasUteisDecorridos > 0 ? realizado / diasUteisDecorridos : 0;

  // Os dias úteis DEPOIS de hoje — hoje já está contado no realizado, então
  // extrapolar sobre ele contaria o dia corrente duas vezes.
  const uteisAposHoje = Math.max(0, diasUteisRestantes - 1);
  const projecao = Math.max(realizado, realizado + ritmoDiario * uteisAposHoje);
  const falta = Math.max(0, meta - realizado);

  const base = { diasUteisDecorridos, diasUteisRestantes, ritmoDiario, projecao, falta };

  if (meta <= 0) return { ...base, situacao: "sem-meta", projecao: realizado, porDiaUtil: null };
  if (realizado >= meta) return { ...base, situacao: "atingida", porDiaUtil: null };
  if (!dentroDoMes) return { ...base, situacao: "encerrado", projecao: realizado, porDiaUtil: null };

  const porDiaUtil = diasUteisRestantes > 0 ? falta / diasUteisRestantes : null;
  const situacao: SituacaoMeta =
    projecao >= meta ? "no-ritmo" : projecao >= meta * LIMIAR_APERTO ? "aperto" : "fora-do-ritmo";

  return { ...base, situacao, porDiaUtil };
}

/** Tom visual da situação, no vocabulário que o resto do app já usa. */
export function tomProjecao(situacao: SituacaoMeta): "pos" | "warn" | "bad" | "neutro" {
  switch (situacao) {
    case "atingida":
    case "no-ritmo":
      return "pos";
    case "aperto":
      return "warn";
    case "fora-do-ritmo":
      return "bad";
    default:
      return "neutro";
  }
}

/** Ponto final sem duplicar quando o valor formatado já termina em ponto.
    "2 un." + "." saía na tela como "2 un..". */
function ponto(frase: string): string {
  return frase.endsWith(".") ? frase : `${frase}.`;
}

/** "4 dias úteis" / "1 dia útil" — em vez do "dia(s) útil(eis)" de formulário. */
export function diasUteisTexto(n: number): string {
  return n === 1 ? "1 dia útil" : `${n} dias úteis`;
}

/**
 * A frase do rodapé do card, em pt-BR e pronta para a tela.
 *
 * Dois formatadores, e não um, porque total e taxa não têm a mesma precisão
 * natural: o mês fecha em "13 imóveis" (inteiro — meio imóvel não existe), mas
 * R$ 90,50 por dia útil é um valor legítimo.
 *
 * O texto diz o ESFORÇO, não a probabilidade: "faltam 3 em 4 dias úteis" é
 * acionável; "68% de chance de bater" seria um número que ninguém consegue
 * conferir nem usar.
 *
 * **`divisivel` decide COMO o esforço é dito, e não é escolha cosmética.**
 * Numa meta contável a taxa por dia é uma instrução impossível: "0,8 un./dia
 * útil" manda captar oito décimos de um imóvel, e quem lê precisa refazer a
 * conta de cabeça para chegar em "3 nos 4 dias que faltam" — que era a
 * pergunta. E ela não podia ser arredondada para 1 sem mentir que o ritmo está
 * em dia, que foi por que a decimal existia. A saída não era arredondar melhor:
 * era não usar taxa. O que se conta em unidades inteiras se cobra em números
 * absolutos.
 *
 * Em dinheiro a taxa fica, porque dinheiro é divisível de verdade — "R$ 800/dia
 * útil" é um alvo diário que dá para perseguir.
 */
export function textoProjecao(
  p: ProjecaoMeta,
  formatarTotal: (v: number) => string,
  formatarTaxa: (v: number) => string,
  divisivel = false,
): string | null {
  switch (p.situacao) {
    case "sem-meta":
    case "encerrado":
      return null;
    case "atingida":
      return p.diasUteisRestantes > 0
        ? `Batida com ${diasUteisTexto(p.diasUteisRestantes)} de sobra.`
        : "Batida no último dia útil do mês.";
    default: {
      if (p.porDiaUtil == null) {
        return ponto(`Não há mais dia útil no mês — faltaram ${formatarTotal(p.falta)}`);
      }
      const restam = diasUteisTexto(p.diasUteisRestantes);
      if (divisivel) {
        const ritmo = ponto(
          `No seu ritmo (${formatarTaxa(p.ritmoDiario)}/dia útil) o mês fecha em ${formatarTotal(p.projecao)}`,
        );
        return `${ritmo} Para bater: ${formatarTaxa(p.porDiaUtil)}/dia útil nos ${restam} que faltam.`;
      }
      // Contável: nenhuma taxa. O "no seu ritmo" vira a própria projeção, que é
      // o que a taxa existia para justificar.
      const ritmo = ponto(`No seu ritmo, o mês fecha em ${formatarTotal(p.projecao)}`);
      return `${ritmo} Para bater: ${formatarTotal(p.falta)} nos ${restam} que faltam.`;
    }
  }
}
