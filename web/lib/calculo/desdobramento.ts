/* ================================================================
   DESDOBRAMENTO — um espaço captado que vira várias unidades

   O caso que originou isto: o proprietário aceita angariar o galpão E
   dividi-lo em salas comerciais. São quatro anúncios, quatro aluguéis
   possíveis, mas UMA conversa ganha — e os quatro cenários são
   parcialmente excludentes (locou o galpão inteiro, não há salas).

   Daí a regra de QUANDO desdobrar, que é o coração deste módulo:
   **só depois que o cenário virou fato**. Enquanto o espaço está
   vago, cadastrar as quatro possibilidades é encher a carteira de
   imóveis que provavelmente nunca vão existir — e eles não ficam
   quietos: entram no pipeline, disparam `isStale` cobrando o corretor
   por imóvel parado, empilham no mapa e entram na fila do follow-up.
   Quem desdobra é quem já tem um interessado numa sala.

   O que a unidade nova HERDA (endereço, proprietário, origem, canal,
   data e histórico de status) e o que ela NÃO herda são decisões de
   medição, não conveniência:

   - **statusHistory é copiado.** A unidade não teve captação própria;
     ela É a mesma captação. Copiando, `tempoAteLocacao` mede da
     conversa original até o contrato — que é o tempo real do negócio.
     Isso não infla nada porque unidade desdobrada já está fora das
     métricas de esforço (ver `imoveisDeCaptacao` em motor.ts).
   - **tentativas NÃO são copiadas.** Elas alimentam o ranking de
     abordagens, e duplicá-las faria uma mensagem enviada valer por
     quatro — exatamente o viés que `calculo/abordagens.ts` existe
     para não ter. As tentativas ficam no principal, onde aconteceram.
   - **notas NÃO são copiadas.** São o diário daquela conversa; a
     conversa é uma só e mora no principal.

   Núcleo puro: sem React/Next/Supabase (regra do CLAUDE.md).
   ================================================================ */
import { STATUS_TERMINAL_NEGATIVE } from "../constantes";
import type { Imovel } from "../tipos";
import { foiAngariado } from "./motor";

/** Teto de unidades por desdobramento. Não é limite técnico: é o mesmo
    princípio do resto do módulo — quem precisa de mais de dez unidades no
    mesmo endereço está cadastrando um prédio, e prédio se cadastra imóvel a
    imóvel, com a captação de cada proprietário. */
export const MAX_UNIDADES_DESDOBRAMENTO = 10;

/** O que o corretor preenche para cada unidade nova. O resto vem do principal. */
export interface EspecificacaoUnidade {
  /** Identificação dentro do endereço ("Sala 1", "Loja B"). Entra na
      identidade do imóvel (calculo/duplicidade.ts) — é o que impede as
      unidades de parecerem cadastro repetido umas das outras. */
  unidade: string;
  /** Um de TIPOS_IMOVEL. O tipo é justamente o que muda entre as unidades. */
  tipo: string;
  codigo: string;
  valorAluguel: number;
  valorCondominio: number;
}

/**
 * Por que este imóvel não pode ser desdobrado, ou `null` quando pode.
 *
 * As três recusas seguem a regra do cabeçalho — desdobrar é registrar um
 * cenário que se concretizou, e nenhum destes três estados concretizou nada:
 *
 * - **não angariado**: ainda não há espaço captado para dividir. Desdobrar
 *   aqui multiplicaria por N um contato que talvez nem responda.
 * - **já é unidade**: sublocar uma sala em duas é outro negócio, e uma
 *   corrente de vínculos faria "de quem é esta captação?" deixar de ter
 *   resposta única — que é a pergunta inteira que o vínculo responde.
 * - **saída lateral**: Perdido/Cancelado/Sem resposta é negócio que não
 *   aconteceu; não há o que dividir.
 */
export function motivoNaoPodeDesdobrar(imovel: Imovel): string | null {
  if (imovel.imovelPrincipalId)
    return "Este imóvel já é uma unidade de outro. Desdobre a partir do imóvel principal.";
  if ((STATUS_TERMINAL_NEGATIVE as readonly string[]).includes(imovel.status))
    return "Só dá para desdobrar um imóvel que segue em negociação ou já foi angariado.";
  if (!foiAngariado(imovel))
    return "Desdobre depois de angariar. Enquanto o proprietário não fechou, as unidades seriam imóveis que talvez nunca existam.";
  return null;
}

export function podeDesdobrar(imovel: Imovel): boolean {
  return motivoNaoPodeDesdobrar(imovel) === null;
}

/**
 * O status com que a unidade nova nasce.
 *
 * Herda o do principal, com uma exceção: "Locado" não se herda. O contrato é
 * do espaço que foi alugado, e uma sala recém-criada está vaga — nascer
 * "Locado" somaria à conversão, ao faturamento e à comissão do mês um negócio
 * que não existiu. Cai para "Angariado", que é o que ela de fato é: captada e
 * esperando locação.
 */
export function statusDaUnidade(principal: Imovel): string {
  return principal.status === "Locado" ? "Angariado" : principal.status;
}

/**
 * A unidade nova, montada a partir do principal.
 *
 * `id` entra por parâmetro (e não de `crypto.randomUUID`) para o módulo seguir
 * puro e o teste ser determinístico — mesma disciplina do resto do núcleo.
 */
export function unidadeDesdobrada(
  principal: Imovel,
  spec: EspecificacaoUnidade,
  id: string,
): Imovel {
  const status = statusDaUnidade(principal);
  return {
    id,
    imovelPrincipalId: principal.id,

    // Próprio da unidade — é o que a distingue das irmãs.
    codigo: spec.codigo.trim(),
    unidade: spec.unidade.trim(),
    tipo: spec.tipo,
    valorAluguel: spec.valorAluguel,
    valorCondominio: spec.valorCondominio,

    // Herdado: é literalmente o mesmo lugar e o mesmo proprietário.
    cep: principal.cep ?? "",
    endereco: principal.endereco,
    bairro: principal.bairro ?? "",
    cidade: principal.cidade ?? "",
    estado: principal.estado ?? "",
    bloco: principal.bloco ?? "",
    edificio: principal.edificio ?? "",
    latitude: principal.latitude ?? null,
    longitude: principal.longitude ?? null,
    proprietarioNome: principal.proprietarioNome ?? "",
    proprietarioTelefone: principal.proprietarioTelefone ?? "",
    responsavel: principal.responsavel ?? "",

    // Herdado por medição: canal e origem descrevem COMO a oportunidade
    // apareceu, e ela apareceu uma vez só. Deixar em branco jogaria a unidade
    // no balde "Não informado" dos rankings, sujando uma leitura que o
    // principal já responde corretamente.
    formaAbordagem: principal.formaAbordagem ?? "",
    origemImovel: principal.origemImovel ?? "",
    imobiliariaConcorrente: principal.imobiliariaConcorrente ?? "",

    // A captação é a mesma — inclusive a data e o caminho até ela. Ver o
    // cabeçalho: é o que faz o tempo até a locação medir o negócio inteiro.
    dataAngariacao: principal.dataAngariacao ?? null,
    status,
    statusHistory: [...(principal.statusHistory || [])],

    // Históricos de conversa ficam no principal (ver cabeçalho).
    tentativas: [],
    notas: [],

    // Campos de metragem e desfecho começam limpos: são da unidade, e
    // ninguém os informou ainda.
    referenciaCrm: "",
    quartos: null,
    banheiros: null,
    vagas: null,
    observacoes: "",
    pausadoAte: null,
    motivoPerda: "",
    motivoPerdaOutro: "",
    comissaoRecebida: false,
    comissaoRecebidaValor: null,
    comissaoRecebidaData: null,
    preCadastro: false,
  };
}

/** Uma linha para o principal, dizendo o que foi feito. Fica no histórico de
    notas porque o desdobramento muda a cara da carteira e, sem registro, daqui
    a três meses ninguém lembra por que existem quatro imóveis nesse endereço. */
export function textoNotaDesdobramento(specs: EspecificacaoUnidade[]): string {
  const nomes = specs.map((s) => s.unidade.trim() || s.tipo).join(", ");
  return specs.length === 1
    ? `Imóvel desdobrado em 1 unidade: ${nomes}.`
    : `Imóvel desdobrado em ${specs.length} unidades: ${nomes}.`;
}
