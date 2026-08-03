/* ================================================================
   CONQUISTAS DO MÊS — o que se move enquanto o mês corre

   `gamificacao.ts` são as MEDALHAS: o acumulado de uma vida, que
   ninguém perde. Este módulo é o outro recorte, e nasceu de um sintoma
   que o corretor descreveu melhor do que qualquer métrica: "quando o
   mês vira, as conquistas não viram junto".

   Ele tinha razão, e os números diziam por quê. Em 03/08/2026 a grade
   de medalhas estava congelada: 13 angariações no total (todas de
   julho), o degrau seguinte em 25, e a trilha de locação parada em
   "0 de 1" desde sempre. Entre 31/07 e 01/08 não mudava um pixel. Uma
   tela de progresso que não se move deixa de ser lida, que é o mesmo
   fim da faixa de "imóvel parado" no termômetro.

   POR QUE ESFORÇO, E NÃO DESFECHO. A resposta óbvia seria fazer as
   conquistas do mês medirem angariação — e elas quase não andariam
   também: foram 13 em julho INTEIRO, e em captação o desfecho é raro e
   lento (é a mesma razão de `relatorioCompleto.ts` ter uma seção só
   para esforço). O que se move todo dia é o trabalho: mensagem enviada,
   proprietário respondendo, dia útil trabalhado. Medido na carteira
   real de julho/2026: 209 tentativas, 165 respostas e 9 dias úteis
   seguidos com atividade, contra 13 angariações no mesmo período.

   OS ALVOS SAÍRAM DA MEDIÇÃO, não da imaginação. Cada desafio é uma
   escada curta cujo primeiro degrau cai na primeira semana e cujo topo
   fica um pouco acima do melhor mês observado. Alvo inventado erra dos
   dois lados: alto demais nunca acende e o corretor para de olhar;
   baixo demais acende no dia 2 e a tela volta a ficar parada — que é
   exatamente o problema que este módulo existe para resolver.

   Módulo puro: só tipos, datas e outros cálculos. Determinístico a
   partir dos parâmetros (recebe `hoje`, nunca chama `todayISO`), o que
   mantém os testes independentes do relógio — mesma disciplina de
   `gamificacao.ts` e `projecao.ts`.
   ================================================================ */
import { addDaysISO, ehDiaUtil } from "../datas";
import type { Imovel, Metas } from "../tipos";
import { ehNotaDeResposta } from "./notas";
import { imoveisAngariadosNoMes } from "./motor";

export interface DesafioMes {
  id: string;
  nome: string;
  icone: string;
  descricao: string;
  /** O valor medido agora. */
  valor: number;
  /** O degrau que está sendo perseguido (ou o topo, quando tudo caiu). */
  alvo: number;
  concluido: boolean;
  /** 0..1 rumo ao alvo, para a barrinha. */
  progresso: number;
  /** "18 de 40", pronto para a tela. */
  progressoTexto: string;
  /** Complemento curto exibido abaixo da barra. */
  detalhe?: string;
}

/* --- As escadas ------------------------------------------------------
   Medidas em julho/2026 na carteira real, o único mês cheio com o app
   registrando: 209 tentativas, respostas vindas de 26 proprietários
   distintos e 9 dias úteis seguidos com atividade (nenhum dia útil em
   branco desde que o registro automático entrou, em 21/07). */

/** Tentativas registradas no mês. Topo acima do melhor mês observado. */
const ALVOS_RITMO = [50, 100, 200, 300];

/** PROPRIETÁRIOS distintos que responderam, não mensagens. Um dono
    falante mandou 64 mensagens sozinho em julho; contar mensagem faria
    a barra encher por causa de uma conversa só, e a mesma regra já vale
    na caixa de respostas ("a unidade da lista é o imóvel"). */
const ALVOS_RESPOSTAS = [5, 10, 20, 30];

/** Dias úteis seguidos com pelo menos uma tentativa. O topo é 21 porque é
    aproximadamente um MÊS de dias úteis — e porque a carteira real já
    chegou a 16 seguidos em 03/08/2026 (a sequência só quebra em 09/07).
    Um topo em 15 nasceria conquistado, que é o mural encerrado de novo. */
const ALVOS_CONSTANCIA = [3, 5, 10, 21];

/** O degrau da vez: o primeiro não alcançado, ou o topo quando tudo caiu. */
function degrauAtual(valor: number, alvos: number[]): { alvo: number; concluido: boolean } {
  const proximo = alvos.find((a) => valor < a);
  if (proximo != null) return { alvo: proximo, concluido: false };
  return { alvo: alvos[alvos.length - 1], concluido: true };
}

function montar(
  id: string,
  nome: string,
  icone: string,
  descricao: string,
  valor: number,
  alvos: number[],
  detalhe?: string,
): DesafioMes {
  const { alvo, concluido } = degrauAtual(valor, alvos);
  return {
    id,
    nome,
    icone,
    descricao,
    valor,
    alvo,
    concluido,
    progresso: alvo > 0 ? Math.min(1, Math.max(0, valor / alvo)) : 0,
    // No topo da escada o valor PASSA do alvo (16 dias seguidos contra um topo
    // de 15), e "16 de 15" se lê como bug. Quem já completou não precisa de
    // fração: o número exato continua logo abaixo, no `detalhe`.
    progressoTexto: concluido ? "completo" : `${valor} de ${alvo}`,
    detalhe,
  };
}

/* --- As medidas ------------------------------------------------------ */

/** Tentativas registradas no mês, somando a carteira toda. */
export function tentativasNoMes(imoveis: Imovel[], mKey: string): number {
  let n = 0;
  for (const imovel of imoveis) {
    for (const t of imovel.tentativas || []) {
      if ((t.data || "").slice(0, 7) === mKey) n++;
    }
  }
  return n;
}

/** Quantos PROPRIETÁRIOS responderam no mês (um por imóvel, ver ALVOS_RESPOSTAS). */
export function proprietariosQueResponderamNoMes(imoveis: Imovel[], mKey: string): number {
  let n = 0;
  for (const imovel of imoveis) {
    const respondeu = (imovel.notas || []).some(
      (nota) => ehNotaDeResposta(nota) && (nota.data || "").slice(0, 7) === mKey,
    );
    if (respondeu) n++;
  }
  return n;
}

/**
 * Dias ÚTEIS seguidos com pelo menos uma tentativa, contados de trás para
 * frente a partir de `hoje`.
 *
 * Duas decisões que parecem detalhe e definem se o card motiva ou irrita:
 *
 * **O dia de hoje ainda não conta contra.** Às 9h da manhã nada foi enviado
 * ainda, e zerar a sequência de nove dias por causa disso seria punir o
 * corretor por acordar cedo. Quando hoje não tem tentativa, a contagem começa
 * no dia útil anterior — o dia corrente só entra quando soma.
 *
 * **A sequência ATRAVESSA o mês, e é a única coisa aqui que atravessa.** Os
 * outros três desafios são contadores do mês e zeram no dia 1º, que é o que o
 * corretor pediu. Constância zerar junto diria "1" a quem trabalhou vinte dias
 * seguidos, e constância medida em pedaços de calendário não é constância.
 */
export function diasUteisSeguidosComTentativa(imoveis: Imovel[], hoje: string): number {
  const diasComTentativa = new Set<string>();
  for (const imovel of imoveis) {
    for (const t of imovel.tentativas || []) {
      const dia = (t.data || "").slice(0, 10);
      if (dia) diasComTentativa.add(dia);
    }
  }
  if (diasComTentativa.size === 0) return 0;

  // Recua até o último dia ÚTIL (fim de semana não interrompe nem conta), e
  // depois até o último que de fato teve trabalho — é o "hoje ainda não conta
  // contra" descrito acima.
  let cursor: string | null = hoje;
  while (cursor && !ehDiaUtil(cursor)) cursor = addDaysISO(cursor, -1);
  if (cursor && !diasComTentativa.has(cursor)) {
    do {
      cursor = addDaysISO(cursor, -1);
    } while (cursor && !ehDiaUtil(cursor));
  }

  let seguidos = 0;
  while (cursor && diasComTentativa.has(cursor)) {
    seguidos++;
    do {
      cursor = addDaysISO(cursor, -1);
    } while (cursor && !ehDiaUtil(cursor));
  }
  return seguidos;
}

/* --- O bloco --------------------------------------------------------- */

/**
 * Os desafios do mês corrente, na ordem em que aparecem na tela.
 *
 * A meta entra por último e **só quando existe** — projetar contra meta zero
 * acusaria "concluído" num card vazio, a mesma razão de `projecao.ts` não
 * projetar sem meta. Os outros três não dependem de configuração nenhuma: é o
 * que faz o bloco funcionar para quem nunca abriu a tela de metas.
 */
export function conquistasDoMes(
  imoveis: Imovel[],
  metas: Metas,
  mKey: string,
  hoje: string,
): DesafioMes[] {
  const tentativas = tentativasNoMes(imoveis, mKey);
  const responderam = proprietariosQueResponderamNoMes(imoveis, mKey);
  const constancia = diasUteisSeguidosComTentativa(imoveis, hoje);

  const desafios: DesafioMes[] = [
    montar(
      "mes-ritmo",
      "Ritmo",
      "🔥",
      "Mensagens e contatos registrados neste mês.",
      tentativas,
      ALVOS_RITMO,
      tentativas > 0 ? `${tentativas} tentativa(s) no mês` : undefined,
    ),
    montar(
      "mes-respostas",
      "Deu retorno",
      "💬",
      "Proprietários que responderam neste mês.",
      responderam,
      ALVOS_RESPOSTAS,
      responderam > 0 ? `${responderam} proprietário(s) responderam` : undefined,
    ),
    montar(
      "mes-constancia",
      "Constância",
      "📅",
      "Dias úteis seguidos com pelo menos um contato.",
      constancia,
      ALVOS_CONSTANCIA,
      constancia > 0 ? `${constancia} dia(s) útil(eis) seguido(s)` : undefined,
    ),
  ];

  const alvoMeta = metas[mKey]?.angariacoes ?? 0;
  if (alvoMeta > 0) {
    const angariadas = imoveisAngariadosNoMes(imoveis, mKey).length;
    desafios.push(
      montar(
        "mes-meta",
        "Meta do mês",
        "🎯",
        "Angariações rumo à meta que você definiu.",
        angariadas,
        [alvoMeta],
        angariadas >= alvoMeta ? "meta batida" : undefined,
      ),
    );
  }

  return desafios;
}
