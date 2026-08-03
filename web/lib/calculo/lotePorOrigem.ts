/* ================================================================
   O LOTE SEPARADO PELA ORIGEM DO IMÓVEL

   Um lote de 10 mensagens não é uma conversa só. O que se pode dizer
   ao proprietário depende de COMO a oportunidade foi encontrada, e a
   diferença não é de estilo, é de FATO:

   . anúncio em site de outra imobiliária: o dono já está atendido,
     e o imóvel está declaradamente para locação;
   . anúncio do próprio dono (OLX, redes sociais, placa): está para
     locação, e quem divulgou foi ele;
   . Copel: sabemos que o imóvel está DESOCUPADO, e nada mais. Não
     sabemos se é para locar, se é para vender ou se ele vai voltar
     a morar lá.

   Até aqui o lote tinha um seletor só para as dez mensagens, e a fila
   ordena por sinal e tempo de espera, que não sabem nada de origem.
   O resultado saiu na carteira real em 03/08/2026, entre 12:31 e
   12:36: quatro imóveis vindos do Copel receberam o roteiro
   "Retomada educada do contato", que abre com "vi que o imóvel está
   disponível para locação". Para quem só apareceu como desocupado
   essa é uma frase FALSA, e é a primeira que aquele proprietário lê
   da imobiliária. No mesmo dia, os envios individuais acertavam: 22
   das 26 tentativas em imóveis do Copel usaram o roteiro escrito
   para imóvel vazio. Quem misturava era só o lote.

   A REGRA DAQUI, e é uma só: um texto nunca cobre duas origens
   diferentes, a menos que uma abordagem declare que serve as duas.

   O agrupamento não vem de uma tabela de premissas no código, e a
   razão é medível: das 61 pessoas elegíveis naquele dia, 22 estavam
   em origens que o corretor CRIOU (Copel desocupado, Chaves na mão,
   Wimoveis), Copel inclusive, que é o caso que deu origem a tudo.
   Uma tabela fixa no código não alcança nenhuma delas. Então quem
   junta origem com roteiro é a declaração do próprio corretor, em
   `Abordagem.origens`, e o agrupamento cai dela: duas origens que
   compartilham um roteiro declarado viram UM grupo (é assim que
   garimpo em site, Chaves na mão e Wimoveis deixam de ser três
   escolhas), e as que ninguém declarou ficam separadas, cada uma com
   o seu seletor.

   Sem declaração nenhuma o lote se comporta como o pior caso
   aceitável: um grupo por origem, mais trabalho para o corretor, mas
   nenhuma mistura silenciosa. Nunca como antes, com uma frase só
   para todos.
   ================================================================ */
import type { Abordagem, Imovel } from "../tipos";

/** Como a falta de origem aparece no rótulo do grupo. O imóvel sem origem
    cadastrada não some do lote: ele é o caso do cadastro rápido antigo, que
    não gravava origem nenhuma, e continua sendo gente esperando resposta. */
export const ROTULO_SEM_ORIGEM = "Sem origem cadastrada";

/** Um pedaço do lote que compartilha o mesmo texto. */
export interface GrupoLote {
  /** Chave estável: é por ela que o modal guarda a escolha de cada grupo. */
  id: string;
  /** Abordagem declarada para estas origens, quando exatamente uma declara.
      `null` quando ninguém declarou (ou quando duas declaram a mesma origem,
      ver `ambiguo`): aí a escolha volta a ser do corretor, na hora. */
  abordagemId: string | null;
  /** Nome do roteiro declarado, ou a própria origem quando não há declaração. */
  rotulo: string;
  /** As origens reunidas aqui. A tela mostra, senão o corretor não tem como
      saber o que o app juntou por conta dele. */
  origens: string[];
  /** Duas ou mais abordagens ativas declaram esta origem. O app não escolhe
      por ele: escolher a "melhor" pelo ranking faria a sugestão se
      autoconfirmar, que é a razão de o lote nunca pré-selecionar a
      recomendada. */
  ambiguo: boolean;
  imoveis: Imovel[];
}

/** A origem como chave de comparação. Só apara espaços: os rótulos vêm de
    seletor nos dois lados (cadastro do imóvel e declaração da abordagem), e
    normalizar mais que isso faria "Copel" casar com "Copel desocupado". */
function chaveOrigem(origem: string | null | undefined): string {
  return (origem || "").trim();
}

/** As abordagens ATIVAS que declaram servir esta origem.

    Arquivada não conta: ela sai dos seletores de propósito (segue nomeando as
    tentativas antigas, não os envios novos), e deixá-la declarar faria o lote
    pré-selecionar um roteiro que o corretor não consegue mais escolher. */
export function abordagensQueServem(abordagens: Abordagem[], origem: string | null | undefined): Abordagem[] {
  const alvo = chaveOrigem(origem);
  if (!alvo) return [];
  return abordagens.filter(
    (a) => !a.arquivada && (a.origens || []).some((o) => chaveOrigem(o) === alvo),
  );
}

/**
 * Separa o lote em grupos que podem compartilhar um texto.
 *
 * A ordem dos grupos segue a ordem em que os imóveis chegaram, que é a da
 * fila (sinal primeiro, antiguidade dentro da faixa). Ordenar por tamanho
 * poria o silêncio na frente todo dia, porque em captação ele é sempre a
 * categoria mais populosa: é a armadilha que matou a faixa de "imóvel parado"
 * no termômetro e que a `rodadaDia` também evita.
 */
export function agruparLotePorOrigem(imoveis: Imovel[], abordagens: Abordagem[]): GrupoLote[] {
  const grupos: GrupoLote[] = [];
  const porChave = new Map<string, GrupoLote>();

  for (const imovel of imoveis) {
    const origem = chaveOrigem(imovel.origemImovel);
    const servem = abordagensQueServem(abordagens, origem);
    const declarada = servem.length === 1 ? servem[0] : null;

    // Com roteiro declarado a chave é o ROTEIRO, e é isso que junta origens
    // diferentes num grupo só. Sem ele (ou com dois candidatos), a chave é a
    // origem, e cada uma fica por si.
    const chave = declarada ? `roteiro:${declarada.id}` : `origem:${origem}`;
    const existente = porChave.get(chave);

    if (existente) {
      existente.imoveis.push(imovel);
      if (!existente.origens.includes(origem || ROTULO_SEM_ORIGEM)) {
        existente.origens.push(origem || ROTULO_SEM_ORIGEM);
      }
      continue;
    }

    const grupo: GrupoLote = {
      id: chave,
      abordagemId: declarada?.id ?? null,
      rotulo: declarada ? declarada.nome : origem || ROTULO_SEM_ORIGEM,
      origens: [origem || ROTULO_SEM_ORIGEM],
      ambiguo: servem.length > 1,
      imoveis: [imovel],
    };
    porChave.set(chave, grupo);
    grupos.push(grupo);
  }

  return grupos;
}

/**
 * Quantas origens deste lote ainda não têm roteiro declarado.
 *
 * Serve ao aviso da tela: enquanto for maior que zero, o corretor escolhe
 * roteiro grupo a grupo toda rodada, e o caminho para parar com isso é marcar
 * as origens na abordagem. Sem esse número escrito em algum lugar, a
 * declaração é uma tela que existe e ninguém sabe por quê.
 */
export function origensSemRoteiro(grupos: GrupoLote[]): string[] {
  const fora: string[] = [];
  for (const g of grupos) {
    if (g.abordagemId) continue;
    for (const o of g.origens) if (!fora.includes(o)) fora.push(o);
  }
  return fora;
}
