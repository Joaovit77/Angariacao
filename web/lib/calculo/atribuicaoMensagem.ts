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
     NR exatamente um imóvel RETIRADO com retomada enviada dentro da
        janela, sem contexto concorrente em outro imóvel (Retirados B3)
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
import { TIPO_RETOMADA_RETIRADO } from "../mensagensAgendadas";
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
  /** Código visível ("LD-225"), quando existe. */
  codigo?: string | null;
  /** Campos de localização opcionais para desempate conservador quando o
      proprietário cita a rua, edifício, unidade ou bairro no WhatsApp. */
  endereco?: string | null;
  bairro?: string | null;
  edificio?: string | null;
  unidade?: string | null;
  bloco?: string | null;
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
  /** `mensagens_agendadas.tipo` e `.status`. Só o nível da retomada (NR) os
      lê, e exige os dois explícitos: contexto sem eles se comporta como
      antes do B3 e nunca vira retomada. O N3 continua sem olhar para eles. */
  tipo?: string | null;
  status?: string | null;
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
  /** Janela do contexto de retomada (NR). Própria, mas nunca maior que a
      do N3: é a do N3 que limita a consulta dos envios. */
  janelaRetomadaHoras: number;
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
  | "contexto-retomada"
  | "contexto-tentativa"
  | "contexto-agendamento"
  | "unico";

export type EvidenciaAtribuicao =
  | { tipo: "codigo"; codigo: string }
  | { tipo: "endereco"; criterio: "logradouro" | "edificio" | "unidade" | "bairro" }
  | { tipo: "retomada"; enviadoEm: string }
  | { tipo: "tentativa"; tentativaEm: string }
  | { tipo: "agendamento"; enviadoEm: string }
  | { tipo: "unico-plausivel" };

export interface AtribuicaoResolvida {
  ok: true;
  contatoId: string;
  imovelId: string;
  nivel: NivelAtribuicao;
  /** true quando o imóvel resolvido está num estado terminal para
      atribuição. Só acontece por referência explícita ou por contexto de
      retomada: é atribuição HISTÓRICA. Quem integra usa isto para não
      liberar efeito nenhum — responder a um imóvel perdido ou retirado
      não o reabre. */
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
   4b. REFERÊNCIA EXPLÍCITA POR ENDEREÇO / EDIFÍCIO / UNIDADE / BAIRRO

   O proprietário raramente conhece o código interno do CRM ("LD-464"); na
   conversa real ele fala a rua ("o da Achiro Kawasaki"), o prédio ("o do
   Edifício Solar"), o apartamento ("o ap 202") ou o bairro ("o do Jardim
   Tókio"). A regra aqui é estritamente CONSERVADORA: só resolve quando a
   referência identifica INEQUIVOCAMENTE exatamente 1 imóvel do contato. Dois
   imóveis na mesma rua sem número/unidade continuam em empate (`pendente`),
   nunca no chute.
   ---------------------------------------------------------------- */
const CONECTORES_LOCAL = new Set(["de", "da", "do", "das", "dos", "e"]);
const PREFIXOS_VIA = new Set([
  "r", "rua", "av", "avenida", "al", "alameda", "trav", "travessa", "tv",
  "estr", "estrada", "rod", "rodovia", "praca", "pc", "largo", "lgo",
  "via", "viela", "servidao", "beco", "passagem",
]);
const PREFIXOS_EDIFICIO = new Set([
  "ed", "edif", "edificio", "cond", "condominio", "res", "residencial",
  "torre", "torres", "conjunto", "conj",
]);
const PREFIXOS_BAIRRO = new Set([
  "jd", "jardim", "pq", "parque", "vl", "vila", "cj", "conjunto", "res", "residencial",
]);
const STOPWORDS_LOCAL = new Set([
  "centro", "londrina", "parana", "brasil", "santos", "paulo", "pedro", "maria",
  "joao", "jose", "carlos", "antonio", "aluguel", "aluguei", "alugado", "alugada",
  "locado", "locada", "locacao", "venda", "vendi", "vendido", "vendida", "imovel",
  "imoveis", "casa", "apartamento", "apto", "sobrado", "terreno", "sala", "galpao",
  "comercial", "imobiliaria", "proprietario", "proprietaria", "disponivel",
  "indisponivel", "obrigado", "obrigada", "desisti", "exclusividade", "contrato",
  "visita", "horario", "amanha", "hoje", "tarde", "manha", "noite", "conta",
  "propria", "outra", "outro", "teste", "numero", "bloco", "torre", "andar",
  "frente", "fundo", "fundos", "lote", "quadra", "unidade", "bairro", "cidade",
]);
const MARCADORES_UNIDADE = new Set(["ap", "apto", "apartamento", "unidade", "un", "sala", "casa", "lote"]);
const MARCADORES_BLOCO = new Set(["bloco", "bl", "torre"]);

function semConectores(lista: readonly string[]): string[] {
  return lista.filter((t) => !CONECTORES_LOCAL.has(t));
}

function removerPrefixo(lista: readonly string[], prefixos: ReadonlySet<string>): string[] {
  let i = 0;
  while (i < lista.length && prefixos.has(lista[i])) i += 1;
  return lista.slice(i);
}

function contemSequencia(textoTokens: readonly string[], alvo: readonly string[]): boolean {
  if (alvo.length === 0 || alvo.length > textoTokens.length) return false;
  for (let i = 0; i <= textoTokens.length - alvo.length; i += 1) {
    let ok = true;
    for (let j = 0; j < alvo.length; j += 1) {
      if (textoTokens[i + j] !== alvo[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function tamanhoTokens(lista: readonly string[]): number {
  return lista.reduce((soma, t) => soma + t.length, 0);
}

function sequenciaElegivel(lista: readonly string[]): boolean {
  if (lista.length === 0) return false;
  if (tamanhoTokens(lista) < 4) return false;
  if (lista.length === 1 && (STOPWORDS_LOCAL.has(lista[0]) || /^\d+$/.test(lista[0]))) return false;
  return true;
}

interface DescritorEndereco {
  imovel: ImovelParaAtribuicao;
  tokensRua: string[];
  numeroPorta: string | null;
  tokensEdificio: string[];
  tokensBairroCompleto: string[];
  tokensBairroCurto: string[];
  unidade: string | null;
  bloco: string | null;
}

function descreverEndereco(imovel: ImovelParaAtribuicao): DescritorEndereco {
  const bruto = (imovel.endereco || "").trim();
  let parteVia = bruto;
  let numeroPorta: string | null = null;
  const comVirgula = bruto.match(/^([^,]+),\s*(\d{1,6})\b/);
  if (comVirgula) {
    parteVia = comVirgula[1];
    numeroPorta = comVirgula[2];
  } else {
    const numeroFim = bruto.match(/^(.*?)\s+(?:n[º°o.]?\s*)?(\d{1,6})(?:\s+[a-z])?$/i);
    if (numeroFim && tokens(numeroFim[1]).length > 0) {
      parteVia = numeroFim[1];
      numeroPorta = numeroFim[2];
    }
  }

  const tokensRua = semConectores(removerPrefixo(tokens(parteVia), PREFIXOS_VIA));
  const tokensEdificio = semConectores(removerPrefixo(tokens(imovel.edificio), PREFIXOS_EDIFICIO));
  const tokensBairroCompleto = semConectores(tokens(imovel.bairro));
  const tokensBairroCurto = semConectores(removerPrefixo(tokens(imovel.bairro), PREFIXOS_BAIRRO));

  const unidadeTokens = tokens(imovel.unidade).filter((t) => !MARCADORES_UNIDADE.has(t));
  const blocoTokens = tokens(imovel.bloco).filter((t) => !MARCADORES_BLOCO.has(t));

  return {
    imovel,
    tokensRua,
    numeroPorta,
    tokensEdificio,
    tokensBairroCompleto,
    tokensBairroCurto,
    unidade: unidadeTokens.length > 0 ? unidadeTokens.join("") : null,
    bloco: blocoTokens.length > 0 ? blocoTokens.join("") : null,
  };
}

function textoCitaMarcadorValor(
  textoTokensBrutos: readonly string[],
  marcadores: ReadonlySet<string>,
  valor: string | null,
): boolean {
  if (!valor) return false;
  for (let i = 0; i < textoTokensBrutos.length - 1; i += 1) {
    if (!marcadores.has(textoTokensBrutos[i])) continue;
    if (textoTokensBrutos[i + 1] === valor) return true;
    if (i + 2 < textoTokensBrutos.length && textoTokensBrutos[i + 1] + textoTokensBrutos[i + 2] === valor) {
      return true;
    }
  }
  return false;
}

function textoCitaNumeroPorta(textoTokensBrutos: readonly string[], numero: string | null): boolean {
  if (!numero) return false;
  const ignorarAntes = new Set(["dia", "as", "pelas", "r", "rs", "reais", "valor", "aluguel", "condominio", "iptu"]);
  for (let i = 0; i < textoTokensBrutos.length; i += 1) {
    if (textoTokensBrutos[i] !== numero) continue;
    const anterior = i > 0 ? textoTokensBrutos[i - 1] : "";
    const proximo = i + 1 < textoTokensBrutos.length ? textoTokensBrutos[i + 1] : "";
    if (ignorarAntes.has(anterior)) continue;
    if (proximo === "h" || proximo === "horas" || proximo === "reais" || proximo === "dias") continue;
    return true;
  }
  return false;
}

function refinarPorNumeroOuUnidade(
  candidatos: readonly DescritorEndereco[],
  textoTokensBrutos: readonly string[],
): DescritorEndereco[] {
  const porUnidade = candidatos.filter(
    (d) =>
      textoCitaMarcadorValor(textoTokensBrutos, MARCADORES_UNIDADE, d.unidade) ||
      textoCitaMarcadorValor(textoTokensBrutos, MARCADORES_BLOCO, d.bloco),
  );
  if (porUnidade.length > 0) return porUnidade;

  const porNumero = candidatos.filter((d) => textoCitaNumeroPorta(textoTokensBrutos, d.numeroPorta));
  if (porNumero.length > 0) return porNumero;

  return [...candidatos];
}

export type ResultadoReferenciaEndereco =
  | { ok: true; imovel: ImovelParaAtribuicao; criterio: "logradouro" | "edificio" | "unidade" | "bairro" }
  | { ok: false; empate: boolean };

/**
 * Tenta identificar inequivocamente um único imóvel do contato a partir do
 * endereço (logradouro + número), edifício, unidade/bloco ou bairro citados
 * no texto da mensagem. Nunca chuta em caso de ambiguidade.
 */
export function referenciaPorEndereco(
  texto: string,
  vinculados: readonly ImovelParaAtribuicao[],
): ResultadoReferenciaEndereco {
  const textoTokensBrutos = tokens(texto);
  if (textoTokensBrutos.length === 0) return { ok: false, empate: false };
  const textoSemConectores = semConectores(textoTokensBrutos);
  const descritores = vinculados.map(descreverEndereco);

  // Camada 1: frase completa de logradouro ou edifício.
  const porLogradouroOuEdificio = descritores.filter((d) => {
    const casouRua = sequenciaElegivel(d.tokensRua) && contemSequencia(textoSemConectores, d.tokensRua);
    const casouEd = sequenciaElegivel(d.tokensEdificio) && contemSequencia(textoSemConectores, d.tokensEdificio);
    return casouRua || casouEd;
  });
  if (porLogradouroOuEdificio.length === 1) {
    const unico = porLogradouroOuEdificio[0];
    const casouEd =
      sequenciaElegivel(unico.tokensEdificio) && contemSequencia(textoSemConectores, unico.tokensEdificio);
    return { ok: true, imovel: unico.imovel, criterio: casouEd ? "edificio" : "logradouro" };
  }
  if (porLogradouroOuEdificio.length > 1) {
    const refinados = refinarPorNumeroOuUnidade(porLogradouroOuEdificio, textoTokensBrutos);
    if (refinados.length === 1) {
      return { ok: true, imovel: refinados[0].imovel, criterio: "logradouro" };
    }
    return { ok: false, empate: true };
  }

  // Camada 2: token distintivo (>= 5 letras, fora de stopwords) do logradouro
  // ou edifício (ex.: "o da Kawasaki" -> "Rua Achiro Kawasaki").
  if (descritores.length >= 2) {
    const conjuntoTexto = new Set(textoSemConectores);
    const tokensDistintivos = (lista: readonly string[]) =>
      lista.filter((t) => t.length >= 5 && !/^\d+$/.test(t) && !STOPWORDS_LOCAL.has(t));
    const porTokenDistintivo = descritores.filter((d) => {
      const dist = [...tokensDistintivos(d.tokensRua), ...tokensDistintivos(d.tokensEdificio)];
      return dist.some((t) => conjuntoTexto.has(t));
    });
    if (porTokenDistintivo.length === 1) {
      const unico = porTokenDistintivo[0];
      const casouEd = tokensDistintivos(unico.tokensEdificio).some((t) => conjuntoTexto.has(t));
      return { ok: true, imovel: unico.imovel, criterio: casouEd ? "edificio" : "logradouro" };
    }
    if (porTokenDistintivo.length > 1) {
      const refinados = refinarPorNumeroOuUnidade(porTokenDistintivo, textoTokensBrutos);
      if (refinados.length === 1) {
        return { ok: true, imovel: refinados[0].imovel, criterio: "logradouro" };
      }
      return { ok: false, empate: true };
    }
  }

  // Camada 3: unidade ou bloco explícito ("ap 701", "bloco b").
  const porUnidade = descritores.filter(
    (d) =>
      textoCitaMarcadorValor(textoTokensBrutos, MARCADORES_UNIDADE, d.unidade) ||
      textoCitaMarcadorValor(textoTokensBrutos, MARCADORES_BLOCO, d.bloco),
  );
  if (porUnidade.length === 1) {
    return { ok: true, imovel: porUnidade[0].imovel, criterio: "unidade" };
  }
  if (porUnidade.length > 1) {
    return { ok: false, empate: true };
  }

  // Camada 4: bairro único entre os imóveis vinculados (somente com 2+ imóveis).
  if (descritores.length >= 2) {
    const porBairro = descritores.filter((d) => {
      if (sequenciaElegivel(d.tokensBairroCompleto) && contemSequencia(textoSemConectores, d.tokensBairroCompleto)) {
        return true;
      }
      if (sequenciaElegivel(d.tokensBairroCurto) && contemSequencia(textoSemConectores, d.tokensBairroCurto)) {
        return true;
      }
      // Caso especial "Centro": só aceita se acompanhado de preposição de lugar ("no centro", "do centro").
      if (
        d.tokensBairroCompleto.length === 1 &&
        d.tokensBairroCompleto[0] === "centro" &&
        (contemSequencia(textoTokensBrutos, ["no", "centro"]) ||
          contemSequencia(textoTokensBrutos, ["do", "centro"]))
      ) {
        return true;
      }
      return false;
    });
    if (porBairro.length === 1) {
      return { ok: true, imovel: porBairro[0].imovel, criterio: "bairro" };
    }
  }

  return { ok: false, empate: false };
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

/** O envio mais recente na janela, por imóvel, considerando só os ids
    pedidos e só os contextos que `aceita` deixa passar. É a mesma conta
    do N3 (que aceita qualquer contexto) e do NR (que aceita só retomada
    enviada). "Mais recente" aqui é só a EVIDÊNCIA de um imóvel já
    escolhido, nunca desempate entre imóveis. */
function enviosNaJanelaPorImovel(
  contextos: readonly ContextoAgendamento[],
  recebidaEm: string,
  janelaHoras: number,
  ids: readonly string[],
  aceita: (contexto: ContextoAgendamento) => boolean,
): Map<string, string> {
  const porImovel = new Map<string, string>();
  for (const contexto of contextos) {
    if (!aceita(contexto)) continue;
    if (!agendamentoNaJanela(contexto, recebidaEm, janelaHoras)) continue;
    for (const imovelId of contexto.imovelIds) {
      if (!ids.includes(imovelId)) continue;
      const atual = porImovel.get(imovelId);
      if (!atual || contexto.enviadoEm.localeCompare(atual) > 0) {
        porImovel.set(imovelId, contexto.enviadoEm);
      }
    }
  }
  return porImovel;
}

/** Retomada que conta para o NR: o tipo próprio e o envio confirmado, os
    dois explícitos. Agendada, processando, cancelada ou em erro não é
    contexto de conversa nenhuma. */
function ehRetomadaEnviada(contexto: ContextoAgendamento): boolean {
  return contexto.tipo === TIPO_RETOMADA_RETIRADO && contexto.status === "enviada";
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
    janelaRetomadaHoras:
      entrada.config?.janelaRetomadaHoras ?? ATRIBUICAO_MENSAGEM.janelaRetomadaHoras,
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

  // N1 — referência explícita (código interno OU endereço/edifício/unidade/bairro
  // inequívoco). Considera TAMBÉM os terminais: uma resposta que cita o imóvel
  // perdido ou retirado é sobre ele, e é assim que o histórico fica no lugar
  // certo (sem efeito nenhum, marcado por `terminal`).
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

  const citadoPorEndereco = referenciaPorEndereco(mensagem.texto, vinculados);
  if (citadoPorEndereco.ok) {
    const { imovel, criterio } = citadoPorEndereco;
    return {
      ok: true,
      contatoId,
      imovelId: imovel.id,
      nivel: "referencia-explicita",
      terminal: ehImovelTerminalParaAtribuicao(imovel),
      evidencia: { tipo: "endereco", criterio },
      candidatos: idsPlausiveis,
      terminais: idsTerminais,
    };
  }
  if (citadoPorEndereco.empate) return pendente("referencia-explicita");

  // NR — contexto de retomada (Retirados, Fase B / B3). A ÚNICA exceção à
  // regra "terminal só por referência": uma retomada é uma mensagem
  // deliberada do Angario a um imóvel RETIRADO, e a resposta a ela é sobre
  // ele — sem isto, um ativo do mesmo dono a levaria pelo N4. Fica antes do
  // "sem plausíveis" abaixo, senão o dono que só tem o retirado ficaria sem
  // candidato. Concorrência é contexto de OUTRO imóvel (tentativa do N2 ou
  // envio do N3 num plausível): com ela, não há evidência inequívoca, e é
  // empate. O contexto do próprio retirado não concorre: ele nem é
  // plausível. Duas retomadas em retirados diferentes também empatam.
  const contextos = entrada.agendamentos || [];
  const retirados = vinculados.filter((i) => i.retirado === true);
  const retomadaPorImovel = enviosNaJanelaPorImovel(
    contextos,
    mensagem.recebidaEm,
    config.janelaRetomadaHoras,
    ordenarIds(retirados),
    ehRetomadaEnviada,
  );
  const comRetomada = retirados.filter((i) => retomadaPorImovel.has(i.id));
  if (comRetomada.length > 1) return pendente("contexto-retomada");
  if (comRetomada.length === 1) {
    const alvo = comRetomada[0];
    const enviosDosPlausiveis = enviosNaJanelaPorImovel(
      contextos,
      mensagem.recebidaEm,
      config.janelaAgendamentoHoras,
      idsPlausiveis,
      () => true,
    );
    const concorrente = plausiveis.some(
      (i) =>
        i.id !== alvo.id &&
        (tentativaMaisRecente(i, mensagem.recebidaEm, config.diasTentativaPendente) !== null ||
          enviosDosPlausiveis.has(i.id)),
    );
    if (concorrente) return pendente("contexto-retomada");
    return {
      ok: true,
      contatoId,
      imovelId: alvo.id,
      nivel: "contexto-retomada",
      terminal: ehImovelTerminalParaAtribuicao(alvo),
      evidencia: { tipo: "retomada", enviadoEm: retomadaPorImovel.get(alvo.id) || "" },
      candidatos: idsPlausiveis,
      terminais: idsTerminais,
    };
  }

  // Daqui para baixo só imóvel plausível: terminal não é escolhido por
  // contexto, só por referência (ou pela retomada acima).
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
  const enviadoPorImovel = enviosNaJanelaPorImovel(
    contextos,
    mensagem.recebidaEm,
    config.janelaAgendamentoHoras,
    idsPlausiveis,
    () => true,
  );
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
