/* ================================================================
   GARIMPO EM CAMPO — MEMÓRIA DE IDENTIDADE DO IMÓVEL (C13, V7 Fase 3 reduzida)

   Módulo puro: nenhum acesso a rede, banco, Storage ou React. Ele decide
   três coisas e só três:

   1. O que uma execução do Investigador pode virar afirmação persistida
      (`extrairAfirmacoesDaInvestigacao`). Só campos estruturados do
      catálogo fechado; texto livre (título, descrição, evidências, a
      consulta digitada) nunca entra, e texto curto com cara de dado
      pessoal é recusado e contado. A faixa de correspondência do anúncio
      não vira confiança do atributo: vai `null`. Ela só decide QUEM pode
      afirmar (B3-M1): muito forte e forte geram hipóteses; possível e
      indício seguem na investigação, mas não gravam atributo.
   2. Qual afirmação está vigente para cada atributo, dado o histórico
      append-only (`derivarMemoriaAtual`). Vigência é derivada na leitura:
      confirmação humana vence; senão, a hipótese mais recente. Rejeitada
      (B3-M3, "está incorreta") nunca é candidata. O resto fica visível
      como histórico; valores distintos ATIVOS viram "divergente". Atributo
      em que tudo foi rejeitado não tem vigente e sai à parte
      (`derivarAtributosSemVigente`), com o histórico inteiro.
   3. Como a memória compõe o que o módulo já sabe por outras tabelas
      (`montarMemoriaIdentidade`): passagens, fotos, tipo, investigações,
      confirmações e promoção numa linha do tempo, sem copiar nada.

   Ausência é neutra: sem linha, sem afirmação, sem evento. Nada aqui
   promove, investiga ou chama IA. (V7 §13.0, §14, §16.)
   ================================================================ */
import type {
  CorrespondenciaInvestigacao,
  FaixaConfiancaInvestigacao,
} from "./investigadorImoveis";
import type {
  DetalheImovelIdentificado,
  FotoAvistamento,
} from "../prospeccao";

/* ------------------------------------------------------------------
   Catálogo fechado. Espelha o CHECK da tabela: mudar aqui sem migration
   é recusa no banco, mudar lá sem aqui é recusa aqui. Os dois têm teste.
   ------------------------------------------------------------------ */
export const ATRIBUTOS_MEMORIA = [
  "area_m2",
  "quartos",
  "vagas",
  "valor_anunciado",
  "condominio",
  "referencia_anuncio",
] as const;
export type AtributoMemoria = (typeof ATRIBUTOS_MEMORIA)[number];

export type TipoValorMemoria = "numero" | "texto";
export type FormatoValorMemoria = "inteiro" | "area" | "moeda" | "texto";

export interface DefinicaoAtributoMemoria {
  rotulo: string;
  tipo: TipoValorMemoria;
  formato: FormatoValorMemoria;
}

export const CATALOGO_ATRIBUTOS_MEMORIA: Record<AtributoMemoria, DefinicaoAtributoMemoria> = {
  area_m2: { rotulo: "Área", tipo: "numero", formato: "area" },
  quartos: { rotulo: "Quartos", tipo: "numero", formato: "inteiro" },
  vagas: { rotulo: "Vagas", tipo: "numero", formato: "inteiro" },
  valor_anunciado: { rotulo: "Valor anunciado", tipo: "numero", formato: "moeda" },
  condominio: { rotulo: "Condomínio", tipo: "texto", formato: "texto" },
  referencia_anuncio: { rotulo: "Referência do anúncio", tipo: "texto", formato: "texto" },
};

export const ORIGEM_MEMORIA_INVESTIGADOR = "investigador-web" as const;
export type OrigemMemoria = typeof ORIGEM_MEMORIA_INVESTIGADOR;
export const ESTADOS_AFIRMACAO_MEMORIA = ["hipotese", "confirmada", "rejeitada"] as const;
export type EstadoAfirmacaoMemoria = (typeof ESTADOS_AFIRMACAO_MEMORIA)[number];

export function estadoAfirmacaoValido(valor: unknown): valor is EstadoAfirmacaoMemoria {
  return typeof valor === "string" && (ESTADOS_AFIRMACAO_MEMORIA as readonly string[]).includes(valor);
}

/** Estados que podem responder por um atributo (lista fechada, nunca de
    exclusão): confirmada e hipótese. `rejeitada` é decisão humana de que a
    informação está incorreta e jamais volta a ser usada — nem como vigente,
    nem como divergência ativa, nem como contexto de consumidor futuro. */
export const ESTADOS_CANDIDATOS_VIGENCIA: ReadonlyArray<EstadoAfirmacaoMemoria> = ["confirmada", "hipotese"];

export function afirmacaoAtiva(a: Pick<AfirmacaoRegistrada, "estado">): boolean {
  return ESTADOS_CANDIDATOS_VIGENCIA.includes(a.estado);
}

export const LIMITE_VALOR_TEXTO_MEMORIA = 200;
export const LIMITE_FONTE_URL_MEMORIA = 2048;
export const LIMITE_FONTE_DOMINIO_MEMORIA = 255;

export function atributoMemoriaValido(valor: unknown): valor is AtributoMemoria {
  return typeof valor === "string" && (ATRIBUTOS_MEMORIA as readonly string[]).includes(valor);
}

/* ------------------------------------------------------------------
   1. Extração: de uma execução concluída para afirmações candidatas.
   ------------------------------------------------------------------ */

/** Uma afirmação candidata, ainda sem id: é o que a rota manda para a RPC.
    `confianca` é a confiança FACTUAL do atributo ("a área É 82 m²"). O
    Investigador atual só mede se o anúncio corresponde ao imóvel, o que é
    outra pergunta; por isso toda afirmação dele sai com `null`. */
export interface AfirmacaoMemoria {
  atributo: AtributoMemoria;
  valorTexto: string | null;
  valorNum: number | null;
  confianca: FaixaConfiancaInvestigacao | null;
  fonteUrl: string;
  fonteDominio: string;
}

/** B3-M1: faixas de correspondência cujo anúncio pode virar hipótese na
    memória. Possível e indício são pistas para a pessoa olhar, não fonte
    de atributo: continuam na investigação, na UI e em `resultados_total`,
    mas não produzem afirmação. Ficar de fora por faixa NÃO é recusa — o
    dado não foi descartado por forma, PII ou duplicidade; só não é
    elegível. Lista fechada: faixa desconhecida também não é elegível. */
export const FAIXAS_ELEGIVEIS_MEMORIA: ReadonlyArray<FaixaConfiancaInvestigacao> = ["muito-forte", "forte"];

export function resultadoElegivelParaMemoria(resultado: Pick<CorrespondenciaInvestigacao, "confianca">): boolean {
  return FAIXAS_ELEGIVEIS_MEMORIA.includes(resultado.confianca);
}

export interface ExtracaoAfirmacoes {
  afirmacoes: AfirmacaoMemoria[];
  /** Candidatas descartadas (fora da forma, PII, duplicadas na execução). */
  recusadas: number;
}

/** Padrões de dado pessoal que NUNCA podem ir para a memória, mesmo num
    campo estruturado curto: telefone/WhatsApp, e-mail, CPF/CNPJ, sequência
    longa de dígitos (documento, conta). Falso positivo aqui custa uma
    afirmação recusada; falso negativo custaria PII persistida. Prefere-se
    o primeiro. */
const PADROES_DADO_PESSOAL: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // e-mail
  /\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/, // telefone fixo/celular com DDD
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, // CPF
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, // CNPJ
  /\d{8,}/, // qualquer sequência longa de dígitos
  /\bwhats?app\b|\bfone\b|\btelefone\b|\btel\.?\b|\bcel\.?\b|\bcpf\b|\brg\b/i,
];

export function contemDadoPessoal(texto: string): boolean {
  return PADROES_DADO_PESSOAL.some((padrao) => padrao.test(texto));
}

function textoAceitavel(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.replace(/\s+/g, " ").trim();
  if (!limpo || limpo.length > LIMITE_VALOR_TEXTO_MEMORIA) return null;
  if (contemDadoPessoal(limpo)) return null;
  return limpo;
}

function numeroAceitavel(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  return valor;
}

function fonteAceitavel(url: unknown, dominio: unknown): { fonteUrl: string; fonteDominio: string } | null {
  if (typeof url !== "string" || typeof dominio !== "string") return null;
  const fonteUrl = url.trim();
  const fonteDominio = dominio.trim().toLowerCase();
  if (!/^https?:\/\//i.test(fonteUrl) || fonteUrl.length > LIMITE_FONTE_URL_MEMORIA) return null;
  if (!fonteDominio || fonteDominio.length > LIMITE_FONTE_DOMINIO_MEMORIA) return null;
  if (/\s/.test(fonteDominio) || /\s/.test(fonteUrl)) return null;
  return { fonteUrl, fonteDominio };
}

/** Campo do resultado → atributo do catálogo. Ficam de fora de propósito:
    `endereco`, porque já é a identidade (C2) e é texto livre; e `preco`,
    porque o Investigador não diz se o anúncio é de venda ou de locação —
    R$ 450.000 e R$ 2.500 do mesmo imóvel não são contradição, e gravar os
    dois como `valor_anunciado` fabricaria uma. O atributo segue reservado
    no catálogo até a finalidade vir estruturada (`ATRIBUTOS_RESERVADOS`). */
const CAMPOS_PARA_ATRIBUTO: ReadonlyArray<[keyof CorrespondenciaInvestigacao, AtributoMemoria]> = [
  ["area", "area_m2"],
  ["quartos", "quartos"],
  ["vagas", "vagas"],
  ["condominio", "condominio"],
  ["referencia", "referencia_anuncio"],
];

/** Atributos do catálogo que existem no banco mas que NENHUMA origem atual
    alimenta com segurança. Só saem daqui quando a origem entregar o dado
    estruturado que falta. */
export const ATRIBUTOS_RESERVADOS: ReadonlyArray<AtributoMemoria> = ["valor_anunciado"];

/** Os que o Investigador atual alimenta: catálogo menos os reservados. */
export const ATRIBUTOS_ALIMENTADOS_PELO_INVESTIGADOR: ReadonlyArray<AtributoMemoria> =
  CAMPOS_PARA_ATRIBUTO.map(([, atributo]) => atributo);

function chaveDeDuplicidade(a: AfirmacaoMemoria): string {
  return `${a.atributo}|${a.valorNum ?? ""}|${a.valorTexto ?? ""}|${a.fonteUrl}`;
}

/** Só o que é estruturado, do catálogo, sem PII e com fonte válida vira
    afirmação. Título, descrição, evidências e contradições NÃO entram: são
    texto livre da web. A `confianca` do resultado (correspondência anúncio
    ↔ imóvel) NÃO é copiada: não diz se o valor do atributo é verdadeiro;
    ela só filtra quais resultados podem afirmar (`resultadoElegivelParaMemoria`),
    e o inelegível é pulado sem contar como recusa. Dentro da mesma
    execução, a mesma afirmação da mesma fonte conta uma vez. */
export function extrairAfirmacoesDaInvestigacao(
  resultados: ReadonlyArray<CorrespondenciaInvestigacao>,
): ExtracaoAfirmacoes {
  const afirmacoes: AfirmacaoMemoria[] = [];
  const vistas = new Set<string>();
  let recusadas = 0;

  for (const resultado of resultados) {
    if (!resultadoElegivelParaMemoria(resultado)) continue; // B3-M1: faixa fraca não afirma
    const fonte = fonteAceitavel(resultado.url, resultado.dominio);
    for (const [campo, atributo] of CAMPOS_PARA_ATRIBUTO) {
      const bruto = resultado[campo];
      if (bruto === null || bruto === undefined || bruto === "") continue; // ausência é neutra
      if (!fonte) { recusadas += 1; continue; }
      const definicao = CATALOGO_ATRIBUTOS_MEMORIA[atributo];
      const valorNum = definicao.tipo === "numero" ? numeroAceitavel(bruto) : null;
      const valorTexto = definicao.tipo === "texto" ? textoAceitavel(bruto) : null;
      if (valorNum === null && valorTexto === null) { recusadas += 1; continue; }
      const afirmacao: AfirmacaoMemoria = { atributo, valorTexto, valorNum, confianca: null, ...fonte };
      const chave = chaveDeDuplicidade(afirmacao);
      if (vistas.has(chave)) { recusadas += 1; continue; }
      vistas.add(chave);
      afirmacoes.push(afirmacao);
    }
  }
  return { afirmacoes, recusadas };
}

/* ------------------------------------------------------------------
   2. Vigência derivada do histórico append-only.
   ------------------------------------------------------------------ */

/** Linha persistida de `imoveis_identificados_atributos`. */
export interface AfirmacaoRegistrada {
  id: number;
  imovelIdentificadoId: string;
  investigacaoId: string;
  atributo: AtributoMemoria;
  valorTexto: string | null;
  valorNum: number | null;
  origem: OrigemMemoria;
  estado: EstadoAfirmacaoMemoria;
  confianca: FaixaConfiancaInvestigacao | null;
  fonteUrl: string;
  fonteDominio: string;
  observadoEm: string;
  confirmadoPor: string | null;
  confirmadoEm: string | null;
  rejeitadoPor: string | null;
  rejeitadoEm: string | null;
  criadoEm: string;
}

/** Linha persistida de `imoveis_identificados_investigacoes`. Não há a
    consulta digitada: é texto livre e nunca é gravada. */
export interface InvestigacaoRegistrada {
  id: string;
  imovelIdentificadoId: string;
  origem: OrigemMemoria;
  resultadosTotal: number;
  atributosTotal: number;
  recusadosTotal: number;
  concluidaEm: string;
  criadoEm: string;
}

export interface VisaoAtributoMemoria {
  atributo: AtributoMemoria;
  rotulo: string;
  /** A afirmação que responde hoje: confirmada mais recente, senão a
      hipótese mais recente; nunca rejeitada. Nunca null: atributo sem
      candidata não tem visão aqui (ver `VisaoAtributoSemVigente`). */
  vigente: AfirmacaoRegistrada;
  /** Todas as afirmações do atributo, rejeitadas inclusive, da mais
      recente à mais antiga. */
  historico: AfirmacaoRegistrada[];
  /** Valores distintos em TODO o histórico (contagem histórica). */
  valoresDistintos: number;
  /** Valores distintos entre as afirmações ativas (confirmadas + hipóteses). */
  valoresAtivos: number;
  /** Só sobre os valores ativos: o que um humano já marcou como incorreto
      não é mais conflito. */
  divergente: boolean;
  /** As marcadas como incorretas, da mais recente à mais antiga. */
  rejeitadas: AfirmacaoRegistrada[];
}

/** Atributo com histórico, mas em que TODAS as afirmações foram rejeitadas:
    não há valor vigente, e o histórico continua disponível. */
export interface VisaoAtributoSemVigente {
  atributo: AtributoMemoria;
  rotulo: string;
  historico: AfirmacaoRegistrada[];
}

export function valorCanonico(a: Pick<AfirmacaoRegistrada, "valorTexto" | "valorNum">): string {
  if (a.valorNum !== null && a.valorNum !== undefined) return `n:${Number(a.valorNum)}`;
  return `t:${(a.valorTexto ?? "").trim().toLowerCase()}`;
}

/** Mais recente primeiro. Com instantes empatados (B3-M2): dentro da MESMA
    investigação vence a primeira inserida (`id` asc), porque a RPC grava as
    afirmações em sequência, na ordem do B2 (melhor correspondência
    primeiro); entre investigações diferentes, a de `id` maior. Não é score
    do B3.1 nem confiança factual: é só a ordem em que a execução afirmou. */
function maisRecentePrimeiro(a: AfirmacaoRegistrada, b: AfirmacaoRegistrada): number {
  const porObservacao = b.observadoEm.localeCompare(a.observadoEm);
  if (porObservacao !== 0) return porObservacao;
  const porCriacao = b.criadoEm.localeCompare(a.criadoEm);
  if (porCriacao !== 0) return porCriacao;
  return a.investigacaoId === b.investigacaoId ? a.id - b.id : b.id - a.id;
}

function confirmacaoMaisRecentePrimeiro(a: AfirmacaoRegistrada, b: AfirmacaoRegistrada): number {
  const porConfirmacao = (b.confirmadoEm ?? "").localeCompare(a.confirmadoEm ?? "");
  if (porConfirmacao !== 0) return porConfirmacao;
  return maisRecentePrimeiro(a, b);
}

/** Uma visão por atributo que tem pelo menos uma afirmação ATIVA, na
    ordem do catálogo. Regra de vigência: confirmada (a de confirmação mais
    recente) vence qualquer hipótese, mesmo mais nova; sem confirmada, vale
    a hipótese mais recente (desempate do B3-M2); rejeitada nunca concorre.
    `divergente` olha só os valores ativos; `valoresDistintos` segue sobre
    todo o histórico, que continua inteiro na visão. */
export function derivarMemoriaAtual(
  atributos: ReadonlyArray<AfirmacaoRegistrada>,
): VisaoAtributoMemoria[] {
  const visoes: VisaoAtributoMemoria[] = [];
  for (const atributo of ATRIBUTOS_MEMORIA) {
    const linhas = atributos.filter((a) => a.atributo === atributo);
    if (linhas.length === 0) continue;
    const historico = [...linhas].sort(maisRecentePrimeiro);
    const ativas = historico.filter(afirmacaoAtiva);
    if (ativas.length === 0) continue; // tudo rejeitado: ver derivarAtributosSemVigente
    const confirmadas = ativas.filter((a) => a.estado === "confirmada").sort(confirmacaoMaisRecentePrimeiro);
    const vigente = confirmadas[0] ?? ativas[0];
    const valoresAtivos = new Set(ativas.map(valorCanonico)).size;
    visoes.push({
      atributo,
      rotulo: CATALOGO_ATRIBUTOS_MEMORIA[atributo].rotulo,
      vigente,
      historico,
      valoresDistintos: new Set(historico.map(valorCanonico)).size,
      valoresAtivos,
      divergente: valoresAtivos > 1,
      rejeitadas: historico.filter((a) => a.estado === "rejeitada"),
    });
  }
  return visoes;
}

/** Atributos que têm linhas, mas nenhuma ativa (todas rejeitadas), na
    ordem do catálogo. Complementa `derivarMemoriaAtual`: juntos cobrem
    todo atributo com histórico, sem sobreposição. */
export function derivarAtributosSemVigente(
  atributos: ReadonlyArray<AfirmacaoRegistrada>,
): VisaoAtributoSemVigente[] {
  const semVigente: VisaoAtributoSemVigente[] = [];
  for (const atributo of ATRIBUTOS_MEMORIA) {
    const linhas = atributos.filter((a) => a.atributo === atributo);
    if (linhas.length === 0 || linhas.some(afirmacaoAtiva)) continue;
    semVigente.push({
      atributo,
      rotulo: CATALOGO_ATRIBUTOS_MEMORIA[atributo].rotulo,
      historico: [...linhas].sort(maisRecentePrimeiro),
    });
  }
  return semVigente;
}

/* ------------------------------------------------------------------
   3. Composição: a memória lê o que já existe, não copia.
   ------------------------------------------------------------------ */

export type TipoEventoMemoria =
  | "passagem"
  | "foto"
  | "tipo"
  | "investigacao"
  | "confirmacao"
  | "rejeicao"
  | "promocao";

/** Concordância do rótulo do catálogo com "marcado como incorreto". */
const MARCADO_COMO_INCORRETO: Record<AtributoMemoria, string> = {
  area_m2: "marcada como incorreta",
  quartos: "marcados como incorretos",
  vagas: "marcadas como incorretas",
  valor_anunciado: "marcado como incorreto",
  condominio: "marcado como incorreto",
  referencia_anuncio: "marcada como incorreta",
};

export interface EventoMemoria {
  tipo: TipoEventoMemoria;
  em: string;
  descricao: string;
  /** Id da linha de origem (avistamento, foto, investigação, atributo). */
  referencia: string;
}

export interface MemoriaIdentidade {
  /** Só atributos com valor vigente. */
  atributos: VisaoAtributoMemoria[];
  /** Atributos com histórico em que tudo foi marcado como incorreto. */
  atributosSemVigente: VisaoAtributoSemVigente[];
  investigacoes: InvestigacaoRegistrada[];
  linhaDoTempo: EventoMemoria[];
  /** Atributos com valores ativos distintos: pede olhar humano. */
  divergentes: AtributoMemoria[];
}

function fotosAtivas(detalhe: DetalheImovelIdentificado): FotoAvistamento[] {
  return detalhe.avistamentos.flatMap((a) => a.fotos.filter((f) => f.estado === "ativa"));
}

function porDataDesc(a: EventoMemoria, b: EventoMemoria): number {
  const porData = b.em.localeCompare(a.em);
  return porData !== 0 ? porData : a.referencia.localeCompare(b.referencia);
}

/** Composição sem cópia: cada evento aponta para a linha que já existe
    (`referencia`). Ausência não produz evento. A memória é o que houve,
    na ordem em que houve, com a afirmação vigente por cima. */
export function montarMemoriaIdentidade(
  detalhe: DetalheImovelIdentificado,
  investigacoes: ReadonlyArray<InvestigacaoRegistrada>,
  atributos: ReadonlyArray<AfirmacaoRegistrada>,
): MemoriaIdentidade {
  const { identificado } = detalhe;
  const eventos: EventoMemoria[] = [];

  for (const a of detalhe.avistamentos) {
    eventos.push({ tipo: "passagem", em: a.observadoEm, descricao: "Passagem registrada", referencia: a.id });
  }
  for (const f of fotosAtivas(detalhe)) {
    eventos.push({ tipo: "foto", em: f.ativadaEm ?? f.criadoEm, descricao: "Foto da fachada", referencia: f.id });
  }
  if (identificado.tipo && identificado.tipoDefinidoEm) {
    eventos.push({
      tipo: "tipo",
      em: identificado.tipoDefinidoEm,
      descricao: identificado.tipoEstado === "confirmado"
        ? `Tipo confirmado: ${identificado.tipo}`
        : `Tipo definido: ${identificado.tipo}`,
      referencia: identificado.id,
    });
  }
  const investigacoesOrdenadas = [...investigacoes].sort((a, b) =>
    b.concluidaEm.localeCompare(a.concluidaEm) || b.id.localeCompare(a.id));
  for (const x of investigacoesOrdenadas) {
    const achou = x.atributosTotal === 1 ? "1 informação salva" : `${x.atributosTotal} informações salvas`;
    eventos.push({ tipo: "investigacao", em: x.concluidaEm, descricao: `Investigação na web: ${achou}`, referencia: x.id });
  }
  for (const a of atributos) {
    if (a.estado === "confirmada" && a.confirmadoEm) {
      eventos.push({
        tipo: "confirmacao",
        em: a.confirmadoEm,
        descricao: `${CATALOGO_ATRIBUTOS_MEMORIA[a.atributo].rotulo} confirmado`,
        referencia: String(a.id),
      });
    }
    if (a.estado === "rejeitada" && a.rejeitadoEm) {
      eventos.push({
        tipo: "rejeicao",
        em: a.rejeitadoEm,
        descricao: `${CATALOGO_ATRIBUTOS_MEMORIA[a.atributo].rotulo} ${MARCADO_COMO_INCORRETO[a.atributo]}`,
        referencia: String(a.id),
      });
    }
  }
  if (identificado.promovidoEm) {
    eventos.push({ tipo: "promocao", em: identificado.promovidoEm, descricao: "Virou oportunidade no Pipeline", referencia: identificado.id });
  }

  const visoes = derivarMemoriaAtual(atributos);
  return {
    atributos: visoes,
    atributosSemVigente: derivarAtributosSemVigente(atributos),
    investigacoes: investigacoesOrdenadas,
    linhaDoTempo: eventos.sort(porDataDesc),
    divergentes: visoes.filter((v) => v.divergente).map((v) => v.atributo),
  };
}

/* ------------------------------------------------------------------
   Apresentação do valor (puro, sem React).
   ------------------------------------------------------------------ */
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function formatarValorMemoria(a: Pick<AfirmacaoRegistrada, "atributo" | "valorTexto" | "valorNum">): string {
  const { formato } = CATALOGO_ATRIBUTOS_MEMORIA[a.atributo];
  if (formato === "texto") return a.valorTexto ?? "";
  const n = a.valorNum ?? 0;
  if (formato === "moeda") return MOEDA.format(n);
  if (formato === "area") return `${NUMERO.format(n)} m²`;
  return NUMERO.format(n);
}

export const ROTULO_ESTADO_MEMORIA: Record<EstadoAfirmacaoMemoria, string> = {
  hipotese: "Hipótese",
  confirmada: "Confirmado",
  rejeitada: "Incorreta",
};
