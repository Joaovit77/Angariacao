/* ================================================================
   DESEMPENHO POR ABORDAGEM — parte pura
   Feature nova da pós-migração (sem oráculo do app antigo).

   Responde "qual ROTEIRO de captação funciona?" — o que se diz ao
   proprietário, não o canal por onde se diz (isso é o desempenho
   por canal, em canais.ts, que lê `origemImovel`).

   A leitura é feita sobre as TENTATIVAS (`imovel.tentativas`), não
   sobre um campo único do imóvel. Essa é a decisão central do
   módulo: um imóvel costuma receber várias tentativas com roteiros
   diferentes, e creditar só uma delas produziria um ranking
   enviesado — os roteiros de fechamento sempre pareceriam melhores
   que os de abertura, porque só eles apareceriam nos casos que
   deram certo. É a mesma razão de existir do `statusHistory`: a
   verdade está no histórico, não no último valor.

   Três medidas independentes por abordagem, de propósito:
   - taxaResposta ....... fez o proprietário reagir (mede abertura)
   - taxaAngariacao ..... os imóveis que a receberam foram angariados
                          (mede participação, sem atribuir causa)
   - destravou .......... foi a última tentativa ANTES da angariação
                          (mede fechamento)

   Puro: consome só tipos + constantes + helpers do motor, sem
   React/Next/Supabase/store.
   ================================================================ */
import { RESULTADOS_COM_RESPOSTA, RESULTADOS_FORA_DO_RANKING } from "../constantes";
import { daysBetween, minutosEntre } from "../datas";
import type { Abordagem, Imovel, Tentativa } from "../tipos";
import { dateEnteredStatus, foiAngariado } from "./motor";
import { dataPrimeiraResposta } from "./notas";
import { resultadoEfetivo } from "./resultadoObservado";

/**
 * Mínimo de tentativas para uma abordagem entrar no ranking com número
 * fechado. Mesmo valor e mesma razão do MIN_SAMPLE dos insights: abaixo
 * disso, "100% de conversão" significa "aconteceu uma vez".
 */
export const MIN_TENTATIVAS = 3;

/** Rótulo das tentativas registradas sem roteiro (canal anotado, script não). */
export const ABORDAGEM_NAO_INFORMADA = "Sem roteiro registrado";

export interface AbordagemDesempenho {
  abordagemId: string;
  nome: string;
  /** Total de tentativas feitas com esta abordagem. */
  tentativas: number;
  /** Tentativas em que o proprietário reagiu (inclui recusa — reagir ≠ aceitar). */
  respostas: number;
  /** respostas ÷ tentativas, em % (0–100). */
  taxaResposta: number;
  /** Imóveis distintos que receberam esta abordagem ao menos uma vez. */
  imoveis: number;
  /** Dos `imoveis`, quantos chegaram à etapa Angariado. */
  angariados: number;
  /** angariados ÷ imoveis, em % (0–100). */
  taxaAngariacao: number;
  /** Imóveis angariados em que esta foi a ÚLTIMA tentativa antes da angariação. */
  destravou: number;
  /** Vezes em que foi a 1ª tentativa do imóvel (uso como abertura). */
  aberturas: number;
  /** Vezes em que foi usada depois de outra tentativa (uso como seguimento). */
  seguimentos: number;
  /**
   * false quando `tentativas` < MIN_TENTATIVAS. As taxas continuam calculadas,
   * mas a UI deve mostrá-las como indicativas — não ordenar decisão por elas.
   */
  amostraSuficiente: boolean;
}

export interface PeriodoTentativas {
  inicio: string;
  fim: string;
}

function tentativaNoPeriodo(tentativa: Tentativa, periodo?: PeriodoTentativas): boolean {
  if (!periodo) return true;
  const data = tentativa.data.slice(0, 10);
  return data >= periodo.inicio && data <= periodo.fim;
}

/** Tentativas do imóvel em ordem cronológica (a `data` é ordenável como string). */
export function tentativasOrdenadas(imovel: Imovel): Tentativa[] {
  return [...(imovel.tentativas || [])].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Janela em que dois registros idênticos são o MESMO contato, não dois.
 *
 * Cinco minutos cobre o caso real sem engolir trabalho de verdade: mandar dois
 * roteiros diferentes para o mesmo proprietário em menos de cinco minutos não
 * acontece, e mandar o MESMO roteiro duas vezes não é uma segunda tentativa —
 * é o mesmo contato registrado duas vezes.
 */
export const JANELA_DUPLICATA_MIN = 5;

/**
 * Este registro é a repetição de um que acabou de acontecer?
 *
 * Nasceu do LD-176 (31/07/2026): a Evolution mostrava **uma única mensagem**
 * enviada para o proprietário, e o imóvel tinha **duas tentativas**, com um
 * minuto de diferença, mesmo canal e mesma abordagem. O app oferece dois
 * caminhos de envio e contou os dois — o direto (que só registra com `r.ok` da
 * Evolution) e o `wa.me` (que registra com o "Sim, mandei" do corretor, e cujo
 * botão só aparece depois de um envio direto FALHAR). Bastava o primeiro envio
 * falhar, o corretor cair na saída manual e depois mandar pelo painel.
 *
 * **Só vale para registro AUTOMÁTICO** (`aguardandoResultado`), que é o que o
 * envio cria. Tentativa anotada à mão no ModalTentativas é afirmação do
 * corretor, e afirmação não se descarta em silêncio — é a mesma regra que faz
 * `resultadoEfetivo` respeitar o que foi confirmado por gente.
 */
export function ehTentativaDuplicada(
  imovel: Imovel,
  nova: Pick<Tentativa, "canal" | "abordagemId" | "modeloNome" | "aguardandoResultado">,
  agora: string,
): boolean {
  if (!nova.aguardandoResultado) return false;

  return (imovel.tentativas || []).some((t) => {
    if ((t.canal || null) !== (nova.canal || null)) return false;
    if ((t.abordagemId || null) !== (nova.abordagemId || null)) return false;
    if ((t.modeloNome || null) !== (nova.modeloNome || null)) return false;
    const minutos = minutosEntre(t.data, agora);
    return minutos !== null && minutos <= JANELA_DUPLICATA_MIN;
  });
}

/**
 * As tentativas que foram esforço para ALCANÇAR o proprietário — as que
 * aconteceram antes de ele responder pela primeira vez.
 *
 * Tentativa quer dizer "tentei chegar nessa pessoa". Depois que ela responde,
 * a conversa está aberta e o que sai daqui deixa de ser tentativa de alcance:
 * é réplica. O app registra as duas coisas na mesma lista de propósito (o
 * webhook precisa de uma tentativa em aberto para pendurar a classificação da
 * resposta que chega — ver "Registrar ≠ creditar" no CLAUDE.md), então quem
 * quer contar ESFORÇO tem que separar aqui, na leitura.
 *
 * Nasceu do LD-178 (31/07/2026): uma abordagem enviada, a proprietária
 * respondeu, o corretor treplicou duas vezes pelo painel e o card anunciava
 * "3ª tentativa" — a leitura exata oposta da realidade, porque ali ninguém
 * estava sendo perseguido, estava-se conversando. As réplicas saíram como
 * "Primeiro contato" porque é o modelo que o modal pré-seleciona para o status
 * "Novo contato", e ele está em `MODELOS_CAPTACAO`.
 *
 * Medido na carteira real no mesmo dia: dos 34 imóveis com 2+ tentativas, só
 * 2 mudam (LD-178 e LD-140). Os 32 restantes são silêncio de verdade e seguem
 * contando igual — inclusive o LD-55, com 3 tentativas TODAS anteriores à
 * primeira resposta, que continua dizendo "3ª tentativa" porque ali é verdade.
 *
 * Empate de minuto conta como alcance (`<=`): a nota do webhook e a tentativa
 * guardam o mesmo formato até o minuto, e mensagem nossa no mesmo minuto da
 * resposta quase certamente saiu ANTES dela — é o que a pessoa respondeu.
 */
export function tentativasDeAlcance(imovel: Imovel): Tentativa[] {
  const tentativas = imovel.tentativas || [];
  const primeiraResposta = dataPrimeiraResposta(imovel.notas);
  if (!primeiraResposta) return tentativas;
  return tentativas.filter((t) => (t.data || "") <= primeiraResposta);
}

/**
 * Selo do card do Pipeline: "3ª tentativa". `null` quando não vale mostrar.
 *
 * Existe porque o funil estava descrevendo errado um quarto de uma coluna. Na
 * carteira real de 31/07/2026, **24 dos 84 imóveis em "Novo contato" já tinham
 * recebido 2 ou mais mensagens** — não é contato novo nenhum. A causa é
 * conhecida e deliberada: nada move o status sozinho neste app
 * (`confirmarResultadoTentativa` marca o desfecho da TENTATIVA e não toca no
 * imóvel), e por isso "Novo contato" entrou em `FOLLOWUP_STATUS_ALVO`.
 *
 * A correção óbvia — migrar o status automaticamente depois de N tentativas —
 * foi MEDIDA e descartada: levaria 20 imóveis para "Sem resposta", que
 * `conversaoCaptacao` conta como derrota DECIDIDA, e a conversão de captação
 * cairia de 12,9% para 10,6% sem nada ter mudado na realidade. Pior, daria por
 * perdidos justamente os imóveis que o follow-up vai cutucar amanhã. O
 * problema é de LEITURA, e a correção também.
 *
 * Conta `tentativasDeAlcance`, não a lista inteira: o selo fala de insistência
 * sem retorno, e réplica dentro de conversa aberta não é insistência. Contar
 * tudo fazia o card mais BEM-SUCEDIDO da carteira — o que respondeu e virou
 * visita — exibir o número mais alto de "tentativas".
 *
 * **A partir da 2ª**, de propósito: "1ª tentativa" apareceria em 153 dos 171
 * imóveis com contato e viraria ruído — o selo só informa quando contradiz o
 * que a coluna diz.
 */
export function seloTentativas(imovel: Imovel): string | null {
  const n = tentativasDeAlcance(imovel).length;
  return n >= 2 ? `${n}ª tentativa` : null;
}

/* --- Resultados pendentes (o nudge) -----------------------------------------
   Enviar uma mensagem por uma abordagem registra a tentativa na hora — é o que
   liga o que o corretor FAZ ao ranking, em vez de depender de ele lembrar de
   anotar. Mas no instante do envio ninguém sabe o desfecho, então a tentativa
   nasce "sem-resposta" com a marca `aguardandoResultado`.

   Sem alguém confirmando depois, toda taxa de resposta tenderia a zero e o
   ranking viraria ruído — a marca existe para o nudge poder cobrar essa
   confirmação, e só ela. Tentativa anotada à mão não tem a marca e não é
   cobrada: ali o "sem resposta" é afirmação do corretor, não chute do sistema. */

/** Dias após os quais o palpite deixa de ser cobrado. Passado esse prazo,
    "não respondeu" é quase certamente verdade — continuar perguntando seria
    implicância, e o dado já está certo do jeito que está.

    Hoje isto praticamente não morde: o nudge passou a cobrar SÓ quem
    respondeu (ver abaixo), e resposta costuma chegar em poucos dias. Continua
    de pé como corte final — conversa que ficou meses sem classificação não é
    mais trabalho pendente, é arquivo. */
export const DIAS_COBRANCA_RESULTADO = 14;

export interface ResultadoPendente {
  imovelId: string;
  /** Rótulo do imóvel para a lista do nudge. */
  imovelRotulo: string;
  tentativa: Tentativa;
  /** Nome da abordagem usada, para o corretor lembrar o que mandou. */
  abordagemNome: string;
  /** Há quantos dias a mensagem saiu. */
  dias: number;
  /** Dia da mensagem do proprietário que colocou esta conversa na fila. */
  respondeuEm?: string;
}

/**
 * Conversas que ainda valem uma pergunta ao corretor.
 *
 * **Só entram as que o proprietário RESPONDEU.** Antes entrava toda tentativa
 * marcada, e o resultado, medido na carteira real em 31/07/2026, foi um nudge
 * de 77 linhas — das quais 73 eram silêncio puro. Pedir que a pessoa confirme
 * 73 vezes "não respondeu" é pedir que ela transcreva à mão o que o app já
 * observou: ele está ouvindo o webhook, e nada chegou. Isso agora se resolve
 * sozinho em `resultadoEfetivo`.
 *
 * O que sobra é o único caso em que o corretor sabe algo que o app não vê: a
 * categoria de quem reagiu (agendou? vai retornar? recusou?). Eram 4.
 *
 * Da mais antiga para a mais recente — quem esperou mais pergunta primeiro.
 */
export function resultadosPendentes(
  imoveis: Imovel[],
  abordagens: Abordagem[],
  hoje: string,
): ResultadoPendente[] {
  const nomePorId = new Map(abordagens.map((a) => [a.id, a.nome]));
  const pendentes: ResultadoPendente[] = [];

  for (const imovel of imoveis) {
    for (const t of imovel.tentativas || []) {
      const efetivo = resultadoEfetivo(imovel, t, hoje);
      if (!efetivo.pendente) continue;
      const dias = daysBetween(t.data.slice(0, 10), hoje);
      if (dias === null || dias > DIAS_COBRANCA_RESULTADO) continue;
      pendentes.push({
        imovelId: imovel.id,
        imovelRotulo: rotuloImovel(imovel),
        tentativa: t,
        // O modelo próprio do corretor não tem id no catálogo, mas tem nome —
        // e mostrar "não informada" para algo que ele nomeou faria o nudge
        // parecer quebrado justo onde ele precisa lembrar o que mandou.
        abordagemNome:
          (t.abordagemId && nomePorId.get(t.abordagemId)) || t.modeloNome || ABORDAGEM_NAO_INFORMADA,
        dias: Math.max(0, dias),
        respondeuEm: efetivo.respondeuEm,
      });
    }
  }

  return pendentes.sort((a, b) => a.tentativa.data.localeCompare(b.tentativa.data));
}

/**
 * Canal por onde o proprietário foi de fato abordado, lido do histórico de
 * tentativas. Mesma ideia do `statusHistory` aplicada ao contato: a verdade
 * está no que aconteceu, não num campo que alguém escolheu num seletor.
 *
 * Vale a PRIMEIRA tentativa com canal registrado, não a última — o campo
 * "Forma de abordagem" descreve como o contato foi ABERTO. Lendo a última, o
 * valor mudaria sozinho a cada follow-up, e o mesmo imóvel apareceria em canais
 * diferentes nos insights conforme o dia em que fosse consultado.
 *
 * Retorna null quando não há tentativa com canal — aí não há o que observar, e
 * chutar um padrão é exatamente o que esta função existe para evitar.
 */
export function canalObservado(imovel: Imovel): string | null {
  for (const t of tentativasOrdenadas(imovel)) {
    const canal = (t.canal || "").trim();
    if (canal) return canal;
  }
  return null;
}

/** "Marta — Rua Haddock Lobo, 55" */
function rotuloImovel(imovel: Imovel): string {
  const nome = (imovel.proprietarioNome || "").trim();
  const onde = (imovel.codigo || imovel.endereco || "imóvel sem endereço").trim();
  return nome ? `${nome} — ${onde}` : onde;
}

const RESPONDEU: readonly string[] = RESULTADOS_COM_RESPOSTA;
const FORA: readonly string[] = RESULTADOS_FORA_DO_RANKING;

/** A tentativa aconteceu, mas não testou roteiro nenhum (ver
    RESULTADOS_FORA_DO_RANKING). Fica registrada no histórico do imóvel e some
    das medidas de desempenho. */
function foraDoRanking(t: Tentativa): boolean {
  return FORA.includes(t.resultado);
}

/**
 * Id da abordagem que destravou o imóvel: a última tentativa registrada ANTES
 * da entrada em "Angariado". Retorna null se o imóvel não foi angariado, se não
 * há tentativa anterior à angariação, ou se essa tentativa não registrou
 * roteiro — casos em que não há a quem creditar.
 */
export function abordagemQueDestravou(imovel: Imovel): string | null {
  if (!foiAngariado(imovel)) return null;
  const dataAngariado = dateEnteredStatus(imovel, "Angariado");
  if (!dataAngariado) return null;

  // A tentativa guarda "YYYY-MM-DDTHH:mm" e o histórico guarda "YYYY-MM-DD":
  // comparar só a parte da data mantém no páreo a tentativa feita no MESMO dia
  // da angariação — que é justamente a que costuma ter destravado.
  // Número errado não destrava nada — a mensagem não chegou ao proprietário.
  // Sem este filtro, uma tentativa perdida logo antes da angariação roubaria
  // o crédito do roteiro que de fato conversou com ele.
  const anteriores = tentativasOrdenadas(imovel).filter(
    (t) => t.data.slice(0, 10) <= dataAngariado && !foraDoRanking(t),
  );
  const ultima = anteriores[anteriores.length - 1];
  return ultima?.abordagemId || null;
}

/**
 * Desempenho de cada abordagem do catálogo que tenha ao menos uma tentativa.
 * Ordena da mais para a menos eficaz; abordagens sem amostra suficiente vão
 * para o fim, independentemente da taxa (é o que evita que um 100% de uma
 * tentativa só encabece o ranking).
 */
export function desempenhoPorAbordagem(
  imoveis: Imovel[],
  abordagens: Abordagem[],
  hoje: string,
  periodo?: PeriodoTentativas,
): AbordagemDesempenho[] {
  const nomePorId = new Map(abordagens.map((a) => [a.id, a.nome]));

  interface Acumulador {
    tentativas: number;
    respostas: number;
    aberturas: number;
    seguimentos: number;
    imoveis: Set<string>;
    angariados: Set<string>;
    destravou: number;
  }
  const acc = new Map<string, Acumulador>();
  const pegar = (id: string): Acumulador => {
    let a = acc.get(id);
    if (!a) {
      a = { tentativas: 0, respostas: 0, aberturas: 0, seguimentos: 0, imoveis: new Set(), angariados: new Set(), destravou: 0 };
      acc.set(id, a);
    }
    return a;
  };

  for (const imovel of imoveis) {
    const tentativas = tentativasOrdenadas(imovel);
    if (tentativas.length === 0) continue;
    const angariado = foiAngariado(imovel);

    tentativas.forEach((t, indice) => {
      if (!tentativaNoPeriodo(t, periodo)) return;
      // Tentativa sem roteiro não entra no ranking: não há o que ranquear.
      // Ela continua contando no resumo geral (resumoTentativas).
      if (!t.abordagemId) return;
      // Número errado: o roteiro não chegou a ser lido por ninguém. Fica fora
      // dos dois lados da conta — contá-lo como "sem resposta" faria uma
      // abordagem boa parecer ruim por causa de um telefone mal cadastrado.
      // Lê o desfecho DERIVADO nos dois testes, e não o gravado. Ler só aqui e
      // não no `foraDoRanking` abaixo era uma incoerência com custo real: uma
      // tentativa marcada "numero-errado" por engano (foi o caso do LD-90, em
      // que a IA rotulou assim quem só não era o dono) sumia do ranking inteiro
      // — e sumia justamente por ter feito alguém responder.
      const efetivo = resultadoEfetivo(imovel, t, hoje).resultado;
      if (FORA.includes(efetivo)) return;
      const a = pegar(t.abordagemId);
      a.tentativas++;
      // O desfecho DERIVADO, não o gravado: enquanto ninguém confirmava, toda
      // tentativa enviada valia "sem-resposta" e a taxa de todo roteiro saía
      // subestimada — o ranking media a disciplina de anotação do corretor, e
      // não o roteiro. Ver calculo/resultadoObservado.ts.
      if (RESPONDEU.includes(efetivo)) a.respostas++;
      if (indice === 0) a.aberturas++;
      else a.seguimentos++;
      a.imoveis.add(imovel.id);
      if (angariado) a.angariados.add(imovel.id);
    });

    const destravador = abordagemQueDestravou(imovel);
    if (destravador) {
      const dataAngariado = dateEnteredStatus(imovel, "Angariado");
      const tentativaDestravadora = dataAngariado
        ? [...tentativas].reverse().find((t) => t.data.slice(0, 10) <= dataAngariado && t.abordagemId === destravador)
        : undefined;
      if (tentativaDestravadora && tentativaNoPeriodo(tentativaDestravadora, periodo)) {
        pegar(destravador).destravou++;
      }
    }
  }

  const lista: AbordagemDesempenho[] = [...acc.entries()].map(([abordagemId, a]) => ({
    abordagemId,
    nome: nomePorId.get(abordagemId) || ABORDAGEM_NAO_INFORMADA,
    tentativas: a.tentativas,
    respostas: a.respostas,
    taxaResposta: a.tentativas ? (a.respostas / a.tentativas) * 100 : 0,
    imoveis: a.imoveis.size,
    angariados: a.angariados.size,
    taxaAngariacao: a.imoveis.size ? (a.angariados.size / a.imoveis.size) * 100 : 0,
    destravou: a.destravou,
    aberturas: a.aberturas,
    seguimentos: a.seguimentos,
    amostraSuficiente: a.tentativas >= MIN_TENTATIVAS,
  }));

  return lista.sort((x, y) => {
    if (x.amostraSuficiente !== y.amostraSuficiente) return x.amostraSuficiente ? -1 : 1;
    if (y.taxaAngariacao !== x.taxaAngariacao) return y.taxaAngariacao - x.taxaAngariacao;
    if (y.destravou !== x.destravou) return y.destravou - x.destravou;
    if (y.taxaResposta !== x.taxaResposta) return y.taxaResposta - x.taxaResposta;
    return y.tentativas - x.tentativas;
  });
}

/* ----------------------------------------------------------------
   A RECOMENDAÇÃO — o ranking no momento da escolha

   O ranking acima era só RELATÓRIO: vivia na view de Relatórios e no
   resumo da IA. Na hora que importa — o seletor de modelo do
   ModalWhatsapp, o seletor do follow-up em lote — a lista saía na
   ordem do CATÁLOGO, isto é, na ordem em que o corretor cadastrou os
   roteiros. O sistema sabia qual roteiro fecha mais e não dizia nada
   onde a decisão acontece; para usar o que sabia, o corretor tinha que
   sair do envio, abrir Relatórios, ler o ranking e voltar.

   Duas regras que mantêm a sugestão honesta:

   - **Sem amostra não há recomendação.** Abordagem com menos de
     `MIN_TENTATIVAS` não recebe selo nem sobe na lista, e nenhuma
     abordagem é marcada como recomendada se a melhor não tiver
     amostra. Destacar "100% de angariação" de uma tentativa única
     ensinaria o corretor a repetir um acidente — e, pior, faria o
     ranking se autoconfirmar: o que é sugerido é usado, e o que é
     usado sobe.
   - **Abertura e seguimento não disputam o mesmo lugar.** O primeiro
     contato e a retomada de quem não respondeu são conversas
     diferentes, e a mesma lista serve as duas. O momento entra como
     desempate — entre abordagens igualmente comprovadas, sobe a que
     já foi usada NAQUELE momento — e não como filtro: filtrar
     esconderia roteiro bom por falta de histórico numa das pontas.

   A ordem do catálogo é preservada entre as abordagens sem amostra:
   elas não têm nada que as ordene, e reordená-las por ruído faria a
   lista dançar a cada envio.
   ---------------------------------------------------------------- */

/** Em que ponto da conversa o roteiro vai ser usado. */
export type MomentoContato = "abertura" | "seguimento";

/** O momento em que este imóvel está: nunca contatado = abertura. Lê o mesmo
    histórico do ranking, então não há campo novo nem chance de divergir. */
export function momentoDoContato(imovel: Imovel): MomentoContato {
  return tentativasOrdenadas(imovel).some((t) => !foraDoRanking(t)) ? "seguimento" : "abertura";
}

export interface AbordagemComDesempenho {
  abordagem: Abordagem;
  /** null quando a abordagem ainda não tem tentativa registrada. */
  desempenho: AbordagemDesempenho | null;
  /** Selo curto para a UI (ex.: "62% de angariação · 8 usos"); null sem amostra. */
  selo: string | null;
  /** true só na melhor abordagem COM amostra suficiente. No máximo uma. */
  recomendada: boolean;
}

/**
 * As abordagens na ordem em que devem ser oferecidas no envio: as comprovadas
 * primeiro (na ordem do ranking), as sem amostra depois (na ordem do catálogo).
 *
 * `momento` desempata entre as comprovadas — passe `momentoDoContato(imovel)`
 * quando o envio é para um imóvel específico. No lote, em que os imóveis estão
 * todos em "Sem resposta", o momento é sempre `"seguimento"`.
 */
export function abordagensParaEnvio(
  abordagens: Abordagem[],
  imoveis: Imovel[],
  momento: MomentoContato,
  hoje: string,
): AbordagemComDesempenho[] {
  const ranking = desempenhoPorAbordagem(imoveis, abordagens, hoje);
  const porId = new Map(ranking.map((d) => [d.abordagemId, d]));
  const posicao = new Map(ranking.map((d, n) => [d.abordagemId, n]));

  /** Só para ordenar: o que a UI recebe é o AbordagemComDesempenho limpo. */
  interface Candidata {
    abordagem: Abordagem;
    desempenho: AbordagemDesempenho | null;
    comAmostra: boolean;
    /** Usos desta abordagem no momento pedido (abertura ou seguimento). */
    usosNoMomento: number;
    ordemCatalogo: number;
  }

  const candidatas: Candidata[] = abordagens.map((abordagem, ordemCatalogo) => {
    const desempenho = porId.get(abordagem.id) ?? null;
    return {
      abordagem,
      desempenho,
      comAmostra: !!desempenho?.amostraSuficiente,
      usosNoMomento: desempenho ? (momento === "abertura" ? desempenho.aberturas : desempenho.seguimentos) : 0,
      ordemCatalogo,
    };
  });

  candidatas.sort((x, y) => {
    // 1. Comprovadas antes das sem amostra.
    if (x.comAmostra !== y.comAmostra) return x.comAmostra ? -1 : 1;
    // 2. Sem amostra: ordem do catálogo, porque não há nada que as ordene.
    if (!x.comAmostra) return x.ordemCatalogo - y.ordemCatalogo;
    // 3. Entre comprovadas: quem já foi usada neste momento da conversa sobe.
    const usoX = x.usosNoMomento > 0;
    const usoY = y.usosNoMomento > 0;
    if (usoX !== usoY) return usoX ? -1 : 1;
    // 4. Por fim, a ordem do ranking (taxa de angariação, destravou, resposta).
    return (posicao.get(x.abordagem.id) ?? 0) - (posicao.get(y.abordagem.id) ?? 0);
  });

  // A recomendada é a primeira COM amostra — e só se ela de fato angaria. Um
  // "recomendada" em cima de 0% de angariação seria sugerir repetir o que não
  // funcionou.
  const lider = candidatas[0];
  const idRecomendada =
    lider?.comAmostra && (lider.desempenho?.taxaAngariacao ?? 0) > 0 ? lider.abordagem.id : null;

  return candidatas.map(({ abordagem, desempenho, comAmostra }) => ({
    abordagem,
    desempenho,
    selo: comAmostra && desempenho
      ? `${desempenho.taxaAngariacao.toFixed(0)}% de angariação · ${desempenho.tentativas} usos`
      : null,
    recomendada: abordagem.id === idRecomendada,
  }));
}

export interface ResumoTentativas {
  /** Todas as tentativas registradas na carteira. */
  total: number;
  /** Tentativas sem roteiro — o "ponto cego" do ranking. */
  semAbordagem: number;
  /** Imóveis com ao menos uma tentativa registrada. */
  imoveisComTentativa: number;
  /**
   * Média de tentativas até a angariação, entre os imóveis angariados que
   * registraram tentativas antes dela. null quando ainda não há caso.
   */
  mediaTentativasAteAngariar: number | null;
}

export function resumoTentativas(imoveis: Imovel[], periodo?: PeriodoTentativas): ResumoTentativas {
  let total = 0;
  let semAbordagem = 0;
  let imoveisComTentativa = 0;
  const contagensAteAngariar: number[] = [];

  for (const imovel of imoveis) {
    const tentativas = tentativasOrdenadas(imovel).filter((t) => tentativaNoPeriodo(t, periodo));
    if (tentativas.length === 0) continue;
    imoveisComTentativa++;
    total += tentativas.length;
    semAbordagem += tentativas.filter((t) => !t.abordagemId).length;

    if (foiAngariado(imovel)) {
      const dataAngariado = dateEnteredStatus(imovel, "Angariado");
      if (dataAngariado) {
        const ate = tentativas.filter((t) => t.data.slice(0, 10) <= dataAngariado).length;
        if (ate > 0) contagensAteAngariar.push(ate);
      }
    }
  }

  return {
    total,
    semAbordagem,
    imoveisComTentativa,
    mediaTentativasAteAngariar: contagensAteAngariar.length
      ? contagensAteAngariar.reduce((s, n) => s + n, 0) / contagensAteAngariar.length
      : null,
  };
}
