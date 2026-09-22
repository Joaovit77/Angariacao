/* ================================================================
   A QUAL IMÓVEL ESTA MENSAGEM PERTENCE

   Uma pessoa pode ter vários imóveis na mesma carteira. Resolver QUEM
   mandou (contato, pelo canal) não resolve SOBRE O QUE ela está falando,
   e é esse segundo problema que este módulo decide.

   Hoje o webhook responde a pergunta com `order("updated_at").limit(2)` e
   fica com o primeiro: escolhe em silêncio e acerta na maioria das vezes —
   o que é o pior desfecho possível, porque o erro fecha tentativa, encerra
   imóvel como perdido e marca visita no imóvel errado sem ninguém ver.
   Aqui a ambiguidade é uma resposta legítima: `pendente`, com o nível em
   que o empate aconteceu e os candidatos, para um humano decidir depois.

   A REGRA QUE GOVERNA TUDO: um nível de maior confiança que encontra mais
   de um candidato ENCERRA a busca. Não se desce para um nível inferior
   para desempatar — duas tentativas pendentes não viram "a mais recente",
   viram `pendente`. Descer seria trocar uma dúvida honesta por um palpite
   melhor escrito.

   Precedência (uma só, em ordem):
     N1 referência explícita ao imóvel no texto (código)
     N2 exatamente um imóvel plausível com tentativa pendente elegível
     N3 exatamente um imóvel plausível com mensagem programada enviada
        dentro da janela
     N4 exatamente um imóvel plausível
     — caso contrário: `pendente` (ou `sem-candidatos`, quando não há
       nenhum imóvel vinculado a considerar)

   Módulo PURO, e a pureza aqui é requisito de correção, não estilo: sem
   Supabase, sem fetch, sem React/Next, sem env, sem relógio. O instante de
   referência é `mensagem.recebidaEm`, que vem de fora — a mesma entrada
   produz a mesma saída em qualquer máquina, e a ordem dos arrays de
   entrada não muda o resultado. `imoveis.updated_at` não entra aqui por
   decisão arquitetural: ele muda por motivos que nada têm a ver com a
   conversa (inclusive pela projeção de contatos da Fase 1a-A).

   Esta fatia NÃO integra nada: não grava nota, não executa nem suspende
   efeito, não move mensagem. Ela só devolve a decisão. O portão de
   efeitos, o armazenamento da mensagem pendente e a atribuição humana são
   as fatias seguintes.
   ================================================================ */
import { ATRIBUICAO_MENSAGEM } from "../constantes";
import { daysBetween, minutosEntre } from "../datas";
import { chaveNormalizada } from "../normalizacao";
import { DIAS_COBRANCA_RESULTADO } from "./abordagens";

/* ----------------------------------------------------------------
   1. O QUE ENTRA
   ---------------------------------------------------------------- */

/** O mínimo de uma tentativa que a decisão precisa ler. O tipo é local (e
    não `Pick<Tentativa, …>`) para o motor não depender do formato inteiro:
    quem chama monta a partir de `imoveis.tentativas`. */
export interface TentativaParaAtribuicao {
  /** Datetime local "YYYY-MM-DDTHH:mm" (convenção do projeto). */
  data: string;
  /** Marca do registro automático que ainda espera desfecho. */
  aguardandoResultado?: boolean | null;
}

/** Um imóvel com vínculo VIGENTE com o contato que mandou a mensagem.
    Vínculo encerrado não entra: quem decide o que é vigente é quem
    consulta o banco, não este módulo. */
export interface ImovelParaAtribuicao {
  id: string;
  /** Dono da linha. Candidato de outra conta é descartado aqui mesmo. */
  userId: string;
  /** Código visível ("LD-225"), quando existe. É a única referência
      explícita reconhecida nesta fatia. */
  codigo?: string | null;
  /** Status do funil, como está gravado. */
  status: string;
  retirado?: boolean | null;
  tentativas?: readonly TentativaParaAtribuicao[] | null;
}

/** Uma mensagem programada que JÁ SAIU para este contato, e sobre quais
    imóveis ela perguntou. `imovelIds` carrega a consolidação inteira
    (`mensagens_agendadas.imoveis_consultados`), não só a âncora. */
export interface ContextoAgendamento {
  /** Datetime local "YYYY-MM-DDTHH:mm" do envio. */
  enviadoEm: string;
  imovelIds: readonly string[];
}

export interface MensagemParaAtribuicao {
  texto: string;
  /** Datetime local "YYYY-MM-DDTHH:mm" — o instante de referência de todas
      as janelas. É o que substitui o relógio. */
  recebidaEm: string;
}

export interface ConfigAtribuicao {
  /** Janela do contexto de agendamento (N3). */
  janelaAgendamentoHoras: number;
  /** Idade máxima da tentativa pendente (N2). Mesma janela do nudge. */
  diasTentativaPendente: number;
}

export interface EntradaAtribuicao {
  /** Conta dona da conversa. Toda comparação de tenant é contra este valor. */
  userId: string;
  /** Contato já resolvido pelo canal (a pessoa). */
  contatoId: string;
  mensagem: MensagemParaAtribuicao;
  /** Imóveis com vínculo vigente com o contato. */
  vinculos: readonly ImovelParaAtribuicao[];
  agendamentos?: readonly ContextoAgendamento[];
  config?: Partial<ConfigAtribuicao>;
}

/* ----------------------------------------------------------------
   2. O QUE SAI
   ---------------------------------------------------------------- */

export type NivelAtribuicao =
  | "referencia-explicita"
  | "contexto-tentativa"
  | "contexto-agendamento"
  | "unico";

export type EvidenciaAtribuicao =
  | { tipo: "codigo"; codigo: string }
  | { tipo: "tentativa"; tentativaEm: string }
  | { tipo: "agendamento"; enviadoEm: string }
  | { tipo: "unico-plausivel" };

export interface AtribuicaoResolvida {
  ok: true;
  contatoId: string;
  imovelId: string;
  nivel: NivelAtribuicao;
  /** true quando o imóvel resolvido está num estado terminal para
      atribuição. Só acontece por referência explícita: é atribuição
      HISTÓRICA. Quem integra usa isto para não liberar efeito nenhum —
      responder a um imóvel perdido não o reabre. */
  terminal: boolean;
  evidencia: EvidenciaAtribuicao;
  /** Imóveis plausíveis considerados, ordenados por id. */
  candidatos: readonly string[];
  /** Imóveis terminais vinculados, ordenados por id. */
  terminais: readonly string[];
}

export interface AtribuicaoPendente {
  ok: false;
  /** `pendente` = há candidatos, mas a evidência não é inequívoca.
      `sem-candidatos` = não há imóvel vinculado a considerar. */
  motivo: "pendente" | "sem-candidatos";
  contatoId: string;
  /** Nível em que a busca parou por empate; null quando nenhum nível
      chegou a ter candidatos (zero em todos). */
  nivelEmpate: NivelAtribuicao | null;
  candidatos: readonly string[];
  terminais: readonly string[];
}

export type ResultadoAtribuicao = AtribuicaoResolvida | AtribuicaoPendente;

/* ----------------------------------------------------------------
   3. PLAUSÍVEL x TERMINAL

   Terminal AQUI é a semântica da ATRIBUIÇÃO DE MENSAGEM, e ela não é a
   mesma de nenhuma lista existente — por isso mora aqui e não em
   `constantes.ts`, e por isso `STATUS_TERMINAL_NEGATIVE` não é reusada.

   A diferença que importa: **"Sem resposta" NÃO é terminal aqui.** Ele é
   terminal para o funil, mas é exatamente o público que o follow-up
   trabalha (`FOLLOWUP_STATUS_ALVO`) — o silêncio de ontem é quem responde
   hoje. Tratá-lo como terminal faria a resposta a um follow-up cair em
   `pendente`, que é regressão do fluxo que já funciona.

   "Locado" entra como terminal por ser desfecho positivo já fechado, e
   `retirado` por ser a saída explícita do imóvel da carteira.
   ---------------------------------------------------------------- */
export const STATUS_TERMINAL_ATRIBUICAO: readonly string[] = ["Perdido", "Cancelado", "Locado"];

export function ehImovelTerminalParaAtribuicao(
  imovel: Pick<ImovelParaAtribuicao, "status" | "retirado">,
): boolean {
  return imovel.retirado === true || STATUS_TERMINAL_ATRIBUICAO.includes(imovel.status);
}

/* ----------------------------------------------------------------
   4. REFERÊNCIA EXPLÍCITA (N1)

   Só CÓDIGO nesta fatia, e a limitação é deliberada. Casar endereço no
   texto livre foi medido contra a carteira real e reprovado: 47 imóveis
   têm endereço sem número nenhum ("Rua X"), 8 têm menos de 12 caracteres
   e 3 contatos têm dois imóveis no MESMO logradouro — "passei na Rua X
   hoje" viraria referência, e o falso positivo aqui é pior que a
   pendência. Endereço fica como extensão posterior, com regra própria.

   E o casamento é contra os CÓDIGOS DOS CANDIDATOS, nunca contra um
   formato inventado: o banco não garante "LD-123" (hoje 353 códigos
   seguem esse padrão, 652 imóveis não têm código nenhum). Sem lista de
   candidatos não existe referência.

   Duas defesas contra o falso positivo:

   - **Fronteira de token.** Texto e código viram sequências de tokens
     alfanuméricos; o código casa quando a JUNÇÃO de uma janela do texto é
     idêntica à junção dos tokens do código. A janela cresce só até o
     comprimento do alvo — não há número mágico de tokens, e por isso
     funciona nos dois sentidos: "ld 225" acha "LD-225" e "LD-225" acha
     "ld225". Assim "LD-2" não casa dentro de "LD-225", porque a
     comparação é do token inteiro, nunca de um pedaço dele.
   - **Código fraco não é referência.** Código sem letra, sem dígito ou
     com menos de três caracteres (ex.: "22") é ignorado no N1: ele
     casaria com qualquer número solto de uma conversa ("dia 22", "ap
     22"). Não é heurística de escolha — é recusa a tratar um token
     ambíguo como prova.
   ---------------------------------------------------------------- */
const MIN_CARACTERES_CODIGO = 3;

function tokens(valor: string | null | undefined): string[] {
  return chaveNormalizada(valor)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Um código só serve como referência quando tem letra E dígito e pelo
    menos três caracteres depois de normalizado. */
export function codigoServeComoReferencia(codigo: string | null | undefined): boolean {
  const compacto = tokens(codigo).join("");
  return (
    compacto.length >= MIN_CARACTERES_CODIGO &&
    /[a-z]/.test(compacto) &&
    /[0-9]/.test(compacto)
  );
}

/** O texto cita este código exato? Comparação por janelas de tokens, sem
    substring solta e sem regex de formato. */
export function textoCitaCodigo(texto: string, codigo: string | null | undefined): boolean {
  if (!codigoServeComoReferencia(codigo)) return false;
  const alvo = tokens(codigo).join("");
  const doTexto = tokens(texto);
  for (let inicio = 0; inicio < doTexto.length; inicio += 1) {
    let janela = "";
    for (let tamanho = 0; inicio + tamanho < doTexto.length; tamanho += 1) {
      janela += doTexto[inicio + tamanho];
      if (janela === alvo) return true;
      // A janela nunca passa do tamanho do alvo: é o que a limita (cada
      // token soma ao menos um caractere) e o que impede casar por pedaço.
      if (janela.length >= alvo.length) break;
    }
  }
  return false;
}

/* ----------------------------------------------------------------
   5. ELEGIBILIDADE DE CONTEXTO (N2 e N3)
   ---------------------------------------------------------------- */

/** Tentativa que ainda espera desfecho, na MESMA semântica do webhook
    (`alvoPendente` em calculo/webhookWhatsapp.ts): marca automática e
    dentro da janela do nudge. Mantida idêntica de propósito — duas
    definições de "pendente" divergiriam em silêncio. */
function tentativaElegivel(
  tentativa: TentativaParaAtribuicao,
  recebidaEm: string,
  diasLimite: number,
): boolean {
  if (tentativa.aguardandoResultado !== true) return false;
  const dias = daysBetween(tentativa.data.slice(0, 10), recebidaEm.slice(0, 10));
  return dias !== null && dias <= diasLimite;
}

/** A tentativa elegível mais recente do imóvel — só como EVIDÊNCIA do
    resultado, nunca como desempate: o imóvel já foi escolhido por ser o
    único com tentativa pendente. Três tentativas no mesmo imóvel continuam
    sendo um candidato. */
function tentativaMaisRecente(
  imovel: ImovelParaAtribuicao,
  recebidaEm: string,
  diasLimite: number,
): TentativaParaAtribuicao | null {
  let alvo: TentativaParaAtribuicao | null = null;
  for (const t of imovel.tentativas || []) {
    if (!tentativaElegivel(t, recebidaEm, diasLimite)) continue;
    if (!alvo || t.data.localeCompare(alvo.data) > 0) alvo = t;
  }
  return alvo;
}

/** O envio aconteceu na janela anterior à chegada da resposta?
    `minutosEntre` devolve valor absoluto, então a ORDEM vem da comparação
    lexicográfica dos ISO locais (convenção do projeto): envio depois da
    resposta não é contexto dela. Sem hora utilizável, não conta — o motor
    prefere não ter evidência a inventar uma. */
function agendamentoNaJanela(
  contexto: ContextoAgendamento,
  recebidaEm: string,
  janelaHoras: number,
): boolean {
  if (contexto.enviadoEm.localeCompare(recebidaEm) > 0) return false;
  const minutos = minutosEntre(contexto.enviadoEm, recebidaEm);
  return minutos !== null && minutos <= janelaHoras * 60;
}

/* ----------------------------------------------------------------
   6. A DECISÃO
   ---------------------------------------------------------------- */

function ordenarIds(imoveis: readonly ImovelParaAtribuicao[]): string[] {
  return imoveis.map((i) => i.id).sort((a, b) => a.localeCompare(b));
}

/**
 * A qual imóvel esta mensagem pertence.
 *
 * Devolve `ok: true` só quando a evidência aponta um imóvel e apenas um.
 * Em qualquer empate devolve `ok: false` com o nível onde a busca parou —
 * que é informação de produto, não erro: é o que a tela de resolução vai
 * mostrar ao corretor.
 */
export function resolverAtribuicaoMensagem(entrada: EntradaAtribuicao): ResultadoAtribuicao {
  const config: ConfigAtribuicao = {
    janelaAgendamentoHoras:
      entrada.config?.janelaAgendamentoHoras ?? ATRIBUICAO_MENSAGEM.janelaAgendamentoHoras,
    diasTentativaPendente: entrada.config?.diasTentativaPendente ?? DIAS_COBRANCA_RESULTADO,
  };
  const { contatoId, mensagem } = entrada;

  // Tenant primeiro, e sem exceção: um imóvel de outra conta não é
  // candidato nem para referência explícita. A ordem de entrada não
  // importa — a lista é deduplicada por id e ordenada aqui.
  const vistos = new Set<string>();
  const vinculados: ImovelParaAtribuicao[] = [];
  for (const imovel of entrada.vinculos) {
    if (imovel.userId !== entrada.userId) continue;
    if (vistos.has(imovel.id)) continue;
    vistos.add(imovel.id);
    vinculados.push(imovel);
  }
  vinculados.sort((a, b) => a.id.localeCompare(b.id));

  const terminais = vinculados.filter(ehImovelTerminalParaAtribuicao);
  const plausiveis = vinculados.filter((i) => !ehImovelTerminalParaAtribuicao(i));
  const idsPlausiveis = ordenarIds(plausiveis);
  const idsTerminais = ordenarIds(terminais);

  if (vinculados.length === 0) {
    return {
      ok: false,
      motivo: "sem-candidatos",
      contatoId,
      nivelEmpate: null,
      candidatos: [],
      terminais: [],
    };
  }

  const pendente = (nivelEmpate: NivelAtribuicao | null): AtribuicaoPendente => ({
    ok: false,
    motivo: "pendente",
    contatoId,
    nivelEmpate,
    candidatos: idsPlausiveis,
    terminais: idsTerminais,
  });

  // N1 — referência explícita. Considera TAMBÉM os terminais: uma resposta
  // que cita o imóvel perdido é sobre ele, e é assim que o histórico fica
  // no lugar certo (sem efeito nenhum, marcado por `terminal`).
  const citados = vinculados.filter((i) => textoCitaCodigo(mensagem.texto, i.codigo));
  if (citados.length === 1) {
    const imovel = citados[0];
    return {
      ok: true,
      contatoId,
      imovelId: imovel.id,
      nivel: "referencia-explicita",
      terminal: ehImovelTerminalParaAtribuicao(imovel),
      evidencia: { tipo: "codigo", codigo: (imovel.codigo || "").trim() },
      candidatos: idsPlausiveis,
      terminais: idsTerminais,
    };
  }
  if (citados.length > 1) return pendente("referencia-explicita");

  // Daqui para baixo só imóvel plausível: terminal não é escolhido por
  // contexto, só por referência.
  if (plausiveis.length === 0) {
    return {
      ok: false,
      motivo: "sem-candidatos",
      contatoId,
      nivelEmpate: null,
      candidatos: [],
      terminais: idsTerminais,
    };
  }

  // N2 — tentativa pendente. A contagem é por IMÓVEL.
  const comTentativa = plausiveis.filter(
    (i) => tentativaMaisRecente(i, mensagem.recebidaEm, config.diasTentativaPendente) !== null,
  );
  if (comTentativa.length === 1) {
    const imovel = comTentativa[0];
    const tentativa = tentativaMaisRecente(imovel, mensagem.recebidaEm, config.diasTentativaPendente);
    return {
      ok: true,
      contatoId,
      imovelId: imovel.id,
      nivel: "contexto-tentativa",
      terminal: false,
      evidencia: { tipo: "tentativa", tentativaEm: tentativa ? tentativa.data : "" },
      candidatos: idsPlausiveis,
      terminais: idsTerminais,
    };
  }
  if (comTentativa.length > 1) return pendente("contexto-tentativa");

  // N3 — contexto de agendamento. A consolidação é expandida: uma mensagem
  // única que perguntou por A, B e C não dá precedência a nenhum dos três.
  // Se ela cobre dois plausíveis, isso é empate — e empate encerra a busca.
  const enviadoPorImovel = new Map<string, string>();
  for (const contexto of entrada.agendamentos || []) {
    if (!agendamentoNaJanela(contexto, mensagem.recebidaEm, config.janelaAgendamentoHoras)) continue;
    for (const imovelId of contexto.imovelIds) {
      if (!idsPlausiveis.includes(imovelId)) continue;
      const atual = enviadoPorImovel.get(imovelId);
      if (!atual || contexto.enviadoEm.localeCompare(atual) > 0) {
        enviadoPorImovel.set(imovelId, contexto.enviadoEm);
      }
    }
  }
  const comAgendamento = plausiveis.filter((i) => enviadoPorImovel.has(i.id));
  if (comAgendamento.length === 1) {
    const imovel = comAgendamento[0];
    return {
      ok: true,
      contatoId,
      imovelId: imovel.id,
      nivel: "contexto-agendamento",
      terminal: false,
      evidencia: { tipo: "agendamento", enviadoEm: enviadoPorImovel.get(imovel.id) || "" },
      candidatos: idsPlausiveis,
      terminais: idsTerminais,
    };
  }
  if (comAgendamento.length > 1) return pendente("contexto-agendamento");

  // N4 — único plausível.
  if (plausiveis.length === 1) {
    return {
      ok: true,
      contatoId,
      imovelId: plausiveis[0].id,
      nivel: "unico",
      terminal: false,
      evidencia: { tipo: "unico-plausivel" },
      candidatos: idsPlausiveis,
      terminais: idsTerminais,
    };
  }
  return pendente("unico");
}
