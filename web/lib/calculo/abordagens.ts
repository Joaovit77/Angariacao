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
import { daysBetween } from "../datas";
import type { Abordagem, Imovel, Tentativa } from "../tipos";
import { dateEnteredStatus, foiAngariado } from "./motor";

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

/** Tentativas do imóvel em ordem cronológica (a `data` é ordenável como string). */
export function tentativasOrdenadas(imovel: Imovel): Tentativa[] {
  return [...(imovel.tentativas || [])].sort((a, b) => a.data.localeCompare(b.data));
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
    implicância, e o dado já está certo do jeito que está. */
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
}

/** Tentativas criadas no envio que ainda esperam confirmação de desfecho,
    da mais antiga para a mais recente (quem esperou mais pergunta primeiro). */
export function resultadosPendentes(
  imoveis: Imovel[],
  abordagens: Abordagem[],
  hoje: string,
): ResultadoPendente[] {
  const nomePorId = new Map(abordagens.map((a) => [a.id, a.nome]));
  const pendentes: ResultadoPendente[] = [];

  for (const imovel of imoveis) {
    for (const t of imovel.tentativas || []) {
      if (!t.aguardandoResultado) continue;
      const dias = daysBetween(t.data.slice(0, 10), hoje);
      if (dias === null || dias > DIAS_COBRANCA_RESULTADO) continue;
      pendentes.push({
        imovelId: imovel.id,
        imovelRotulo: rotuloImovel(imovel),
        tentativa: t,
        abordagemNome: (t.abordagemId && nomePorId.get(t.abordagemId)) || ABORDAGEM_NAO_INFORMADA,
        dias: Math.max(0, dias),
      });
    }
  }

  return pendentes.sort((a, b) => a.tentativa.data.localeCompare(b.tentativa.data));
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
export function desempenhoPorAbordagem(imoveis: Imovel[], abordagens: Abordagem[]): AbordagemDesempenho[] {
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
      // Tentativa sem roteiro não entra no ranking: não há o que ranquear.
      // Ela continua contando no resumo geral (resumoTentativas).
      if (!t.abordagemId) return;
      // Número errado: o roteiro não chegou a ser lido por ninguém. Fica fora
      // dos dois lados da conta — contá-lo como "sem resposta" faria uma
      // abordagem boa parecer ruim por causa de um telefone mal cadastrado.
      if (foraDoRanking(t)) return;
      const a = pegar(t.abordagemId);
      a.tentativas++;
      if (RESPONDEU.includes(t.resultado)) a.respostas++;
      if (indice === 0) a.aberturas++;
      else a.seguimentos++;
      a.imoveis.add(imovel.id);
      if (angariado) a.angariados.add(imovel.id);
    });

    const destravador = abordagemQueDestravou(imovel);
    if (destravador) pegar(destravador).destravou++;
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

export function resumoTentativas(imoveis: Imovel[]): ResumoTentativas {
  let total = 0;
  let semAbordagem = 0;
  let imoveisComTentativa = 0;
  const contagensAteAngariar: number[] = [];

  for (const imovel of imoveis) {
    const tentativas = tentativasOrdenadas(imovel);
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
