/* ================================================================
   GARIMPO EM CAMPO — MEMÓRIA DE IDENTIDADE DO IMÓVEL (C13, V7 Fase 3 reduzida)

   Módulo puro: nenhum acesso a rede, banco, Storage ou React. Ele decide
   três coisas e só três:

   1. O que uma execução do Investigador pode virar afirmação persistida
      (`extrairAfirmacoesDaInvestigacao`). Só campos estruturados do
      catálogo fechado; texto livre (título, descrição, evidências) nunca
      entra, e texto curto com cara de dado pessoal é recusado e contado.
   2. Qual afirmação está vigente para cada atributo, dado o histórico
      append-only (`derivarMemoriaAtual`). Vigência é derivada na leitura:
      confirmação humana vence; senão, a hipótese mais recente. O resto
      fica visível como histórico, e valores distintos viram "divergente".
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
export type EstadoAfirmacaoMemoria = "hipotese" | "confirmada";

export const LIMITE_VALOR_TEXTO_MEMORIA = 200;
export const LIMITE_FONTE_URL_MEMORIA = 2048;
export const LIMITE_FONTE_DOMINIO_MEMORIA = 255;
export const LIMITE_CONSULTA_MEMORIA = 500;

export function atributoMemoriaValido(valor: unknown): valor is AtributoMemoria {
  return typeof valor === "string" && (ATRIBUTOS_MEMORIA as readonly string[]).includes(valor);
}

/* ------------------------------------------------------------------
   1. Extração: de uma execução concluída para afirmações candidatas.
   ------------------------------------------------------------------ */

/** Uma afirmação candidata, ainda sem id: é o que a rota manda para a RPC. */
export interface AfirmacaoMemoria {
  atributo: AtributoMemoria;
  valorTexto: string | null;
  valorNum: number | null;
  confianca: FaixaConfiancaInvestigacao | null;
  fonteUrl: string;
  fonteDominio: string;
}

export interface ExtracaoAfirmacoes {
  afirmacoes: AfirmacaoMemoria[];
  /** Candidatas descartadas (fora da forma, PII, duplicadas na execução). */
  recusadas: number;
}

const FAIXAS_CONFIANCA: readonly FaixaConfiancaInvestigacao[] = ["muito-forte", "forte", "possivel", "indicio"];

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

/** Campo do resultado → atributo do catálogo. `endereco` fica de fora de
    propósito: o endereço já é a identidade (C2) e é texto livre. */
const CAMPOS_PARA_ATRIBUTO: ReadonlyArray<[keyof CorrespondenciaInvestigacao, AtributoMemoria]> = [
  ["area", "area_m2"],
  ["quartos", "quartos"],
  ["vagas", "vagas"],
  ["preco", "valor_anunciado"],
  ["condominio", "condominio"],
  ["referencia", "referencia_anuncio"],
];

function chaveDeDuplicidade(a: AfirmacaoMemoria): string {
  return `${a.atributo}|${a.valorNum ?? ""}|${a.valorTexto ?? ""}|${a.fonteUrl}`;
}

/** Só o que é estruturado, do catálogo, sem PII e com fonte válida vira
    afirmação. Título, descrição, evidências e contradições NÃO entram: são
    texto livre da web. Dentro da mesma execução, a mesma afirmação da
    mesma fonte conta uma vez. */
export function extrairAfirmacoesDaInvestigacao(
  resultados: ReadonlyArray<CorrespondenciaInvestigacao>,
): ExtracaoAfirmacoes {
  const afirmacoes: AfirmacaoMemoria[] = [];
  const vistas = new Set<string>();
  let recusadas = 0;

  for (const resultado of resultados) {
    const fonte = fonteAceitavel(resultado.url, resultado.dominio);
    const confianca = FAIXAS_CONFIANCA.includes(resultado.confianca) ? resultado.confianca : null;
    for (const [campo, atributo] of CAMPOS_PARA_ATRIBUTO) {
      const bruto = resultado[campo];
      if (bruto === null || bruto === undefined || bruto === "") continue; // ausência é neutra
      if (!fonte) { recusadas += 1; continue; }
      const definicao = CATALOGO_ATRIBUTOS_MEMORIA[atributo];
      const valorNum = definicao.tipo === "numero" ? numeroAceitavel(bruto) : null;
      const valorTexto = definicao.tipo === "texto" ? textoAceitavel(bruto) : null;
      if (valorNum === null && valorTexto === null) { recusadas += 1; continue; }
      const afirmacao: AfirmacaoMemoria = { atributo, valorTexto, valorNum, confianca, ...fonte };
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
  criadoEm: string;
}

/** Linha persistida de `imoveis_identificados_investigacoes`. */
export interface InvestigacaoRegistrada {
  id: string;
  imovelIdentificadoId: string;
  origem: OrigemMemoria;
  consulta: string;
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
      hipótese mais recente. Nunca null: sem linhas não há visão. */
  vigente: AfirmacaoRegistrada;
  /** Todas as afirmações do atributo, da mais recente à mais antiga. */
  historico: AfirmacaoRegistrada[];
  valoresDistintos: number;
  divergente: boolean;
}

export function valorCanonico(a: Pick<AfirmacaoRegistrada, "valorTexto" | "valorNum">): string {
  if (a.valorNum !== null && a.valorNum !== undefined) return `n:${Number(a.valorNum)}`;
  return `t:${(a.valorTexto ?? "").trim().toLowerCase()}`;
}

function maisRecentePrimeiro(a: AfirmacaoRegistrada, b: AfirmacaoRegistrada): number {
  const porObservacao = b.observadoEm.localeCompare(a.observadoEm);
  if (porObservacao !== 0) return porObservacao;
  const porCriacao = b.criadoEm.localeCompare(a.criadoEm);
  if (porCriacao !== 0) return porCriacao;
  return b.id - a.id;
}

function confirmacaoMaisRecentePrimeiro(a: AfirmacaoRegistrada, b: AfirmacaoRegistrada): number {
  const porConfirmacao = (b.confirmadoEm ?? "").localeCompare(a.confirmadoEm ?? "");
  if (porConfirmacao !== 0) return porConfirmacao;
  return maisRecentePrimeiro(a, b);
}

/** Uma visão por atributo que tem pelo menos uma linha, na ordem do
    catálogo. Regra de vigência: confirmada (a de confirmação mais recente)
    vence qualquer hipótese, mesmo mais nova; sem confirmada, vale a
    hipótese de `observado_em` mais recente. Divergência é sobre TODOS os
    valores do histórico, porque é o histórico que o humano precisa ver. */
export function derivarMemoriaAtual(
  atributos: ReadonlyArray<AfirmacaoRegistrada>,
): VisaoAtributoMemoria[] {
  const visoes: VisaoAtributoMemoria[] = [];
  for (const atributo of ATRIBUTOS_MEMORIA) {
    const linhas = atributos.filter((a) => a.atributo === atributo);
    if (linhas.length === 0) continue;
    const historico = [...linhas].sort(maisRecentePrimeiro);
    const confirmadas = historico.filter((a) => a.estado === "confirmada").sort(confirmacaoMaisRecentePrimeiro);
    const vigente = confirmadas[0] ?? historico[0];
    const valoresDistintos = new Set(historico.map(valorCanonico)).size;
    visoes.push({
      atributo,
      rotulo: CATALOGO_ATRIBUTOS_MEMORIA[atributo].rotulo,
      vigente,
      historico,
      valoresDistintos,
      divergente: valoresDistintos > 1,
    });
  }
  return visoes;
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
  | "promocao";

export interface EventoMemoria {
  tipo: TipoEventoMemoria;
  em: string;
  descricao: string;
  /** Id da linha de origem (avistamento, foto, investigação, atributo). */
  referencia: string;
}

export interface MemoriaIdentidade {
  atributos: VisaoAtributoMemoria[];
  investigacoes: InvestigacaoRegistrada[];
  linhaDoTempo: EventoMemoria[];
  /** Atributos com valores distintos no histórico: pede olhar humano. */
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
  }
  if (identificado.promovidoEm) {
    eventos.push({ tipo: "promocao", em: identificado.promovidoEm, descricao: "Virou oportunidade no Pipeline", referencia: identificado.id });
  }

  const visoes = derivarMemoriaAtual(atributos);
  return {
    atributos: visoes,
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
};
