/* ================================================================
   A RODADA DO DIA — o trabalho de captação que hoje pede execução
   Feature nova da pós-migração (sem oráculo do app antigo).

   Não calcula nada próprio: junta o que os módulos já sabem
   (`followup`, `respostas`, `abordagens`, a agenda) numa lista de
   FRENTES, cada uma com o tamanho da fila e a ferramenta que a
   resolve. É composição, como a própria Home — a regra de ouro
   continua valendo, e por isso nenhuma contagem daqui pode divergir
   da tela que a origina (o badge de respostas, os botões do Pipeline).

   ## O buraco que ela tapa: a fila existia e ninguém a via

   Todas as ferramentas de lote já estavam prontas, e todas moram no
   PIPELINE — atrás de um clique, numa tela que se abre para procurar
   um imóvel, não para começar o dia. O resultado, medido na carteira
   real em 31/07/2026: **82 proprietários em "Novo contato"/"Sem
   resposta" com UMA única tentativa, parados há 7 dias ou mais** —
   todos elegíveis para a segunda cutucada. No histórico inteiro, só
   18 imóveis já tinham recebido uma segunda mensagem.

   Não é falta de ferramenta nem de disciplina: é que nada nunca disse
   quantos eram. O corretor rodava o lote quando lembrava (21, 22, 23,
   27 e 30/07), e nos dias vazios a fila seguia crescendo em silêncio.

   E o custo disso é alto **porque a segunda mensagem converte melhor
   que a primeira**: ~15% de resposta no lote de 21–23/07 contra ~12,5%
   da primeira abordagem na carteira toda. A fila parada é a fonte de
   lead mais barata que existe aqui — não precisa de garimpo nenhum.

   ## Por que CAPACIDADE, e não só a fila

   O número que faltava não é "82". É "82, e cabem 20 por dia".

   Os freios anti-spam de `followup.ts` (teto diário, lote de 10,
   intervalo sorteado) não são negociáveis — eles é que mantêm o número
   da imobiliária vivo. Mas eles transformam a fila num recurso que
   DRENA devagar: 82 esperando a 20 por dia são quatro dias de rodadas,
   e um dia pulado não é adiar uma tarefa, é perder uma vaga que não
   volta. Um contador de fila sozinho não diz isso; ele parece uma
   caixa de entrada, que a pessoa esvazia "quando der".

   `diasParaVazar` é sobre a fila de HOJE, de propósito, e não é
   previsão: ele ignora quem vai entrar amanhã (todo dia de prospecção
   bem-feita reabastece a fila). Contar o que ainda não existe daria
   um número maior e menos verdadeiro — e a decisão que ele informa
   ("vale abrir o lote hoje?") não muda com isso.

   ## A ordem: quem já agiu vem antes de quem não sabe que existimos

   As frentes saem ordenadas por `urgencia`, e o critério é de quem é
   a vez — não o tamanho da fila:

   - **`agora`** — o outro lado JÁ FEZ a parte dele. O proprietário
     escreveu e a mensagem está sem leitura; a hora marcada é hoje.
     Isso é dívida com uma pessoa que está esperando.
   - **`hoje`** — iniciativa nossa com vaga limitada (o follow-up).
     Perde para o item acima porque adiar um follow-up custa um dia de
     fila; adiar uma resposta custa o lead.
   - **`quando-der`** — o que arruma o REGISTRO, não a conversa:
     confirmar desfechos pendentes e a confirmação de disponibilidade
     (ciclo de 60 dias — um dia a mais não muda nada).

   Ordenar por volume inverteria isso todo dia, porque em captação o
   silêncio é sempre a categoria mais populosa — é a mesma armadilha
   que matou a faixa de "imóvel parado" no termômetro.

   ## O que ela NÃO é

   Não é o termômetro (`temperatura.ts`), que lista PESSOAS por sinal
   e responde "quem eu chamo agora". A rodada lista FRENTES com fila e
   responde "o que o dia pede". As duas convivem na Home de propósito:
   o termômetro é nominal e curto, esta é agregada e acionável.

   Puro: só tipos, datas e os outros módulos de cálculo. Sem
   React/Next/Supabase/store.
   ================================================================ */
import type { Abordagem, AgendaItem, Imovel } from "../tipos";
import { resultadosPendentes } from "./abordagens";
import {
  FOLLOWUP_TETO_DIA,
  selecionarFollowUp,
  selecionarVerificacaoDisponibilidade,
} from "./followup";
import { contarRespostasPendentes } from "./respostas";

/** As frentes de trabalho da rodada. O id é estável: a UI o usa para
    escolher o ícone e a ação (qual modal abrir, para qual view ir). */
export type FrenteRodada =
  | "respostas"
  | "compromissos"
  | "followup"
  | "disponibilidade"
  | "resultados";

/** De quem é a vez — ver "A ordem" no cabeçalho. */
export type UrgenciaRodada = "agora" | "hoje" | "quando-der";

const PESO_URGENCIA: Record<UrgenciaRodada, number> = {
  agora: 0,
  hoje: 1,
  "quando-der": 2,
};

export interface ItemRodada {
  frente: FrenteRodada;
  rotulo: string;
  /** Quantos itens esperam nesta frente agora. Zero some da lista. */
  quantos: number;
  /**
   * Quantos ainda cabem HOJE, onde existe teto (só o follow-up e a
   * confirmação de disponibilidade, que dividem a mesma cota diária).
   * `null` = sem teto, e aí `quantos` já é a resposta inteira.
   */
  cabemHoje: number | null;
  /** O que já saiu hoje nesta frente — o "12 de 20" que hoje só existe
      dentro do modal do lote, depois de aberto. */
  feitosHoje: number;
  /** Frase pronta em pt-BR explicando a fila. A UI não remonta texto:
      número solto ("82") não diz se é bom ou ruim. */
  detalhe: string;
  urgencia: UrgenciaRodada;
}

export interface RodadaDia {
  /** As frentes com fila, na ordem de execução. Frente vazia não entra:
      uma lista que mostra cinco zeros é uma lista que ninguém lê. */
  itens: ItemRodada[];
  /** Itens esperando, somando as frentes. É o número do cabeçalho. */
  total: number;
  /** Nada pendente em nenhuma frente. A UI usa para se esconder — o
      dia limpo não precisa de um card dizendo que está limpo. */
  vazia: boolean;
  /** Mensagens de WhatsApp que os lotes já gastaram do teto de hoje. */
  enviadosHoje: number;
  /** Quanto sobra da cota diária compartilhada pelos dois lotes. */
  vagasRestantes: number;
  /**
   * Dias de rodadas para vazar a fila de follow-up ATUAL, no teto de
   * hoje. `null` quando não há fila. Não é previsão: ignora quem entra
   * amanhã (ver o cabeçalho).
   */
  diasParaVazar: number | null;
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Monta a rodada do dia.
 *
 * Recebe `hoje` em vez de chamar `todayISO()` para o módulo continuar puro
 * e o teste ser determinístico — mesma convenção do resto de `lib/calculo`.
 */
export function rodadaDoDia(
  imoveis: Imovel[],
  agenda: AgendaItem[],
  abordagens: Abordagem[],
  hoje: string,
): RodadaDia {
  const itens: ItemRodada[] = [];

  /* --- Respostas por ler ---------------------------------------------------
     Conta só a CAPTAÇÃO, igual ao badge do menu (`contarRespostasPendentes`).
     Somar a carteira faria o número viver alto por causa de documentação e
     visita de inquilino — e uma frente que nunca zera deixa de ser lida. Se
     esta contagem divergir do badge, uma das duas está errada. */
  const respostas = contarRespostasPendentes(imoveis, hoje);
  if (respostas > 0) {
    itens.push({
      frente: "respostas",
      rotulo: "Respostas para ler",
      quantos: respostas,
      cabemHoje: null,
      feitosHoje: 0,
      detalhe:
        respostas === 1
          ? "Um proprietário escreveu e ainda não foi respondido"
          : `${respostas} proprietários escreveram e ainda não foram respondidos`,
      urgencia: "agora",
    });
  }

  /* --- Compromissos de hoje (e os que ficaram para trás) -------------------
     Hora marcada é hora marcada: entra em `agora` junto com as respostas.
     Atrasado conta na mesma frente porque a ação é a mesma tela — separar em
     duas linhas faria a agenda ocupar metade da rodada. */
  const compromissosHoje = agenda.filter((a) => !a.done && a.date === hoje).length;
  const atrasados = agenda.filter((a) => !a.done && a.date < hoje).length;
  const compromissos = compromissosHoje + atrasados;
  if (compromissos > 0) {
    const partes: string[] = [];
    if (compromissosHoje > 0) partes.push(plural(compromissosHoje, "compromisso hoje", "compromissos hoje"));
    if (atrasados > 0) partes.push(plural(atrasados, "atrasado", "atrasados"));
    itens.push({
      frente: "compromissos",
      rotulo: "Agenda",
      quantos: compromissos,
      cabemHoje: null,
      feitosHoje: 0,
      detalhe: partes.join(" · "),
      urgencia: "agora",
    });
  }

  /* --- Follow-up: a frente que justifica a rodada --------------------------
     `selecionarFollowUp` já aplica todos os freios (cadência por posição,
     teto de tentativas, um por proprietário), então `elegiveis` é a fila
     REAL de hoje, não o total de imóveis parados. */
  const seguimento = selecionarFollowUp(imoveis, hoje);
  const esperando = seguimento.elegiveis.length;
  const vagasRestantes = Math.max(0, FOLLOWUP_TETO_DIA - seguimento.enviadosHoje);
  const diasParaVazar = esperando > 0 ? Math.ceil(esperando / FOLLOWUP_TETO_DIA) : null;

  if (esperando > 0) {
    // A frase muda com a capacidade porque as três situações pedem decisões
    // diferentes: fila que cabe hoje, fila que não cabe (e vai levar dias), e
    // cota já gasta (não adianta abrir o lote).
    let detalhe: string;
    if (vagasRestantes === 0) {
      detalhe = `${esperando} na fila — o teto de ${FOLLOWUP_TETO_DIA} mensagens de hoje já foi usado`;
    } else if (diasParaVazar !== null && diasParaVazar > 1) {
      detalhe = `${esperando} esperando a próxima mensagem · ${plural(diasParaVazar, "dia de rodadas", "dias de rodadas")} nesse ritmo`;
    } else {
      detalhe = `${esperando} esperando a próxima mensagem — cabem todos hoje`;
    }
    itens.push({
      frente: "followup",
      rotulo: "Follow-up de quem não respondeu",
      quantos: esperando,
      cabemHoje: Math.min(esperando, vagasRestantes),
      feitosHoje: seguimento.enviadosHoje,
      detalhe,
      urgencia: "hoje",
    });
  }

  /* --- Confirmar disponibilidade -------------------------------------------
     Mesma cota, ciclo de 60 dias: um dia a mais não muda nada, então fica em
     `quando-der` mesmo quando a fila é grande. */
  const disponibilidade = selecionarVerificacaoDisponibilidade(imoveis, hoje).elegiveis.length;
  if (disponibilidade > 0) {
    itens.push({
      frente: "disponibilidade",
      rotulo: "Confirmar disponibilidade",
      quantos: disponibilidade,
      cabemHoje: Math.min(disponibilidade, vagasRestantes),
      feitosHoje: 0,
      detalhe: `${plural(disponibilidade, "imóvel anunciado", "imóveis anunciados")} há tempo, sem confirmação recente`,
      urgencia: "quando-der",
    });
  }

  /* --- Confirmar o desfecho das conversas ----------------------------------
     Arruma o REGISTRO, não a conversa — mas sem isso a taxa de resposta de
     todo roteiro tende a zero e o ranking de abordagens vira ruído. */
  const resultados = resultadosPendentes(imoveis, abordagens, hoje).length;
  if (resultados > 0) {
    itens.push({
      frente: "resultados",
      rotulo: "Confirmar resultado",
      quantos: resultados,
      cabemHoje: null,
      feitosHoje: 0,
      detalhe: `${plural(resultados, "mensagem enviada", "mensagens enviadas")} sem desfecho anotado`,
      urgencia: "quando-der",
    });
  }

  // Urgência primeiro; dentro da mesma faixa, a fila maior antes. O desempate
  // por volume só vale DENTRO da faixa — entre faixas ele inverteria a ordem
  // todo dia, porque o silêncio é sempre a categoria mais populosa.
  itens.sort((a, b) => {
    const pa = PESO_URGENCIA[a.urgencia];
    const pb = PESO_URGENCIA[b.urgencia];
    if (pa !== pb) return pa - pb;
    return b.quantos - a.quantos;
  });

  return {
    itens,
    total: itens.reduce((s, i) => s + i.quantos, 0),
    vazia: itens.length === 0,
    enviadosHoje: seguimento.enviadosHoje,
    vagasRestantes,
    diasParaVazar,
  };
}
