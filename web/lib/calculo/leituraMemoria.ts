/* ================================================================
   GARIMPO EM CAMPO — C13C: leitura da memória de identidade (read model)

   Módulo puro: recebe a memória composta pelo núcleo do C13A
   (`montarMemoriaIdentidade`) e o registro do imóvel, e devolve o que a
   tela mostra — rótulos amigáveis, valores formatados, fonte segura,
   datas legíveis, resumo curto e um histórico enxuto. Ele NÃO decide
   vigência, conflito nem prioridade: isso já vem decidido do núcleo
   (`vigente`, `historico`, `divergente`). Aqui só se apresenta.

   O histórico da memória não repete a linha do tempo de passagens: fotos
   e passagens individuais ficam onde já estão. Entram a primeira e a
   última passagem (derivadas de colunas que o banco já mantém), o tipo,
   as investigações, as confirmações, as divergências e a promoção.
   ================================================================ */
import { fmtDataIso } from "../datas";
import type { ImovelIdentificado } from "../prospeccao";
import {
  CATALOGO_ATRIBUTOS_MEMORIA,
  ROTULO_ESTADO_MEMORIA,
  formatarValorMemoria,
  valorCanonico,
  type AfirmacaoRegistrada,
  type AtributoMemoria,
  type EstadoAfirmacaoMemoria,
  type MemoriaIdentidade,
  type TipoEventoMemoria,
  type VisaoAtributoMemoria,
} from "./memoriaIdentidade";

export const ROTULO_FONTE_SEM_DOMINIO = "Fonte registrada";
export const TITULO_DIVERGENCIA = "Informações divergentes";
export const TEXTO_NUNCA_INVESTIGADO = "Este imóvel ainda não foi investigado.";
export const TEXTO_SEM_DESCOBERTAS = "Ainda não há descobertas externas salvas para este imóvel.";

export interface FonteLeitura {
  /** Domínio da fonte, ou "Fonte registrada" quando não há domínio. */
  rotulo: string;
  /** Só http(s); qualquer outra coisa não vira link. */
  url: string | null;
}

export interface AfirmacaoLeitura {
  id: number;
  valor: string;
  estado: EstadoAfirmacaoMemoria;
  rotuloEstado: string;
  fonte: FonteLeitura;
  observadoEm: string;
  observadoEmTexto: string;
  confirmadoEm: string | null;
  confirmadoEmTexto: string | null;
  /** Hipótese que uma pessoa pode validar agora (registro sem exclusão pendente). */
  podeConfirmar: boolean;
}

export interface FatoLeitura {
  atributo: AtributoMemoria;
  rotulo: string;
  vigente: AfirmacaoLeitura;
  /** As outras afirmações do histórico deste atributo, da mais recente à mais antiga. */
  outros: AfirmacaoLeitura[];
  /** Entre as outras, as que dizem um valor DIFERENTE do vigente (pelo
      mesmo valor canônico do núcleo). É o que a tela mostra como
      "também encontrado"; a mesma informação vinda de outra fonte não é
      divergência. */
  divergentes: AfirmacaoLeitura[];
  divergente: boolean;
}

export type TipoEventoLeitura = TipoEventoMemoria | "primeiro-avistamento" | "ultimo-avistamento" | "divergencia";

export interface EventoLeitura {
  chave: string;
  tipo: TipoEventoLeitura;
  em: string;
  emTexto: string;
  titulo: string;
  detalhe: string | null;
}

export interface ResumoLeitura {
  informacoes: number;
  confirmadas: number;
  divergentes: number;
  /** "3 informações · 1 confirmada", ou null quando não há nada a resumir. */
  texto: string | null;
}

export interface LeituraMemoria {
  /** `ultima_investigacao_em` preenchido: houve ao menos uma investigação. */
  investigado: boolean;
  resumo: ResumoLeitura;
  fatos: FatoLeitura[];
  historico: EventoLeitura[];
}

export type IdentificadoParaLeitura = Pick<
  ImovelIdentificado,
  "situacao" | "exclusaoSolicitadaEm" | "ultimaInvestigacaoEm" | "primeiroAvistamentoEm" | "ultimoAvistamentoEm" | "avistamentosTotal"
>;

const URL_SEGURA = /^https?:\/\//i;

export function fonteParaLeitura(a: Pick<AfirmacaoRegistrada, "fonteUrl" | "fonteDominio">): FonteLeitura {
  const dominio = a.fonteDominio.trim();
  const url = a.fonteUrl.trim();
  return {
    rotulo: dominio || ROTULO_FONTE_SEM_DOMINIO,
    url: URL_SEGURA.test(url) ? url : null,
  };
}

/** "DD/MM/AAAA" de um instante ISO completo (timestamptz), no fuso local,
    como o resto do painel faz com `fmtDataHoraIso`. Inválido vira vazio. */
export function dataTexto(iso: string | null): string {
  return fmtDataIso(iso);
}

function podeConfirmarAgora(identificado: IdentificadoParaLeitura): boolean {
  return !identificado.exclusaoSolicitadaEm && identificado.situacao !== "fundido";
}

function afirmacaoParaLeitura(a: AfirmacaoRegistrada, identificado: IdentificadoParaLeitura): AfirmacaoLeitura {
  return {
    id: a.id,
    valor: formatarValorMemoria(a),
    estado: a.estado,
    rotuloEstado: ROTULO_ESTADO_MEMORIA[a.estado],
    fonte: fonteParaLeitura(a),
    observadoEm: a.observadoEm,
    observadoEmTexto: dataTexto(a.observadoEm),
    confirmadoEm: a.estado === "confirmada" ? a.confirmadoEm : null,
    confirmadoEmTexto: a.estado === "confirmada" ? dataTexto(a.confirmadoEm) || null : null,
    podeConfirmar: a.estado === "hipotese" && podeConfirmarAgora(identificado),
  };
}

function fatoParaLeitura(visao: VisaoAtributoMemoria, identificado: IdentificadoParaLeitura): FatoLeitura {
  const outras = visao.historico.filter((a) => a.id !== visao.vigente.id);
  const canonicoVigente = valorCanonico(visao.vigente);
  return {
    atributo: visao.atributo,
    rotulo: visao.rotulo,
    vigente: afirmacaoParaLeitura(visao.vigente, identificado),
    outros: outras.map((a) => afirmacaoParaLeitura(a, identificado)),
    divergentes: outras
      .filter((a) => valorCanonico(a) !== canonicoVigente)
      .map((a) => afirmacaoParaLeitura(a, identificado)),
    divergente: visao.divergente,
  };
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function resumirMemoria(fatos: ReadonlyArray<FatoLeitura>): ResumoLeitura {
  const informacoes = fatos.length;
  const confirmadas = fatos.filter((f) => f.vigente.estado === "confirmada").length;
  const divergentes = fatos.filter((f) => f.divergente).length;
  if (!informacoes) return { informacoes, confirmadas, divergentes, texto: null };
  const partes = [plural(informacoes, "informação", "informações")];
  if (confirmadas) partes.push(plural(confirmadas, "confirmada", "confirmadas"));
  if (divergentes) partes.push(plural(divergentes, "divergente", "divergentes"));
  return { informacoes, confirmadas, divergentes, texto: partes.join(" · ") };
}

const TIPOS_DO_NUCLEO_NO_HISTORICO: ReadonlySet<TipoEventoMemoria> = new Set(["tipo", "investigacao", "confirmacao", "promocao"]);

function dominiosDaInvestigacao(memoria: MemoriaIdentidade, investigacaoId: string): string[] {
  const vistos = new Set<string>();
  for (const visao of memoria.atributos) {
    for (const a of visao.historico) {
      if (a.investigacaoId === investigacaoId && a.fonteDominio) vistos.add(a.fonteDominio);
    }
  }
  return [...vistos].sort();
}

function rotulosDaInvestigacao(memoria: MemoriaIdentidade, investigacaoId: string): string[] {
  return memoria.atributos
    .filter((visao) => visao.historico.some((a) => a.investigacaoId === investigacaoId))
    .map((visao) => visao.rotulo);
}

function porDataDesc(a: EventoLeitura, b: EventoLeitura): number {
  return b.em.localeCompare(a.em) || a.chave.localeCompare(b.chave);
}

/** Só o que a memória acrescenta ao que a linha do tempo de passagens já
    conta. Cada evento aponta para a linha que já existe; nada é gravado. */
export function historicoParaLeitura(
  memoria: MemoriaIdentidade,
  identificado: IdentificadoParaLeitura,
  fatos: ReadonlyArray<FatoLeitura>,
): EventoLeitura[] {
  const eventos: EventoLeitura[] = [];

  if (identificado.primeiroAvistamentoEm) {
    eventos.push({
      chave: "primeiro-avistamento",
      tipo: "primeiro-avistamento",
      em: identificado.primeiroAvistamentoEm,
      emTexto: dataTexto(identificado.primeiroAvistamentoEm),
      titulo: "Primeiro avistamento",
      detalhe: null,
    });
  }
  if (identificado.ultimoAvistamentoEm && identificado.ultimoAvistamentoEm !== identificado.primeiroAvistamentoEm) {
    eventos.push({
      chave: "ultimo-avistamento",
      tipo: "ultimo-avistamento",
      em: identificado.ultimoAvistamentoEm,
      emTexto: dataTexto(identificado.ultimoAvistamentoEm),
      titulo: "Último avistamento",
      detalhe: identificado.avistamentosTotal > 2
        ? `${identificado.avistamentosTotal} passagens no total; cada uma está no histórico de passagens.`
        : null,
    });
  }

  for (const evento of memoria.linhaDoTempo) {
    if (!TIPOS_DO_NUCLEO_NO_HISTORICO.has(evento.tipo)) continue;
    let titulo = evento.descricao;
    let detalhe: string | null = null;
    if (evento.tipo === "investigacao") {
      const investigacao = memoria.investigacoes.find((x) => x.id === evento.referencia);
      const total = investigacao?.atributosTotal ?? 0;
      titulo = "Investigação realizada";
      const partes: string[] = [];
      partes.push(total ? plural(total, "descoberta estruturada", "descobertas estruturadas") : "nenhuma descoberta estruturada");
      const rotulos = rotulosDaInvestigacao(memoria, evento.referencia);
      if (rotulos.length) partes.push(rotulos.join(", "));
      const dominios = dominiosDaInvestigacao(memoria, evento.referencia);
      if (dominios.length) partes.push(`Fonte${dominios.length === 1 ? "" : "s"}: ${dominios.join(", ")}`);
      detalhe = partes.join(" · ");
    } else if (evento.tipo === "promocao") {
      titulo = "Transformado em oportunidade";
    } else if (evento.tipo === "confirmacao") {
      titulo = `${evento.descricao} por você`;
    }
    eventos.push({
      chave: `${evento.tipo}:${evento.referencia}`,
      tipo: evento.tipo,
      em: evento.em,
      emTexto: dataTexto(evento.em),
      titulo,
      detalhe,
    });
  }

  for (const fato of fatos) {
    if (!fato.divergente) continue;
    const todas = [fato.vigente, ...fato.outros];
    const maisRecente = todas.reduce((a, b) => (b.observadoEm > a.observadoEm ? b : a));
    const valores = [...new Set(todas.map((a) => a.valor))];
    eventos.push({
      chave: `divergencia:${fato.atributo}`,
      tipo: "divergencia",
      em: maisRecente.observadoEm,
      emTexto: dataTexto(maisRecente.observadoEm),
      titulo: `${TITULO_DIVERGENCIA}: ${fato.rotulo}`,
      detalhe: valores.join(" · "),
    });
  }

  return eventos.sort(porDataDesc);
}

/** A memória como a tela a lê. Ausência é ausência: atributo sem linha
    (inclusive `valor_anunciado`, reservado) não aparece. */
export function lerMemoria(memoria: MemoriaIdentidade, identificado: IdentificadoParaLeitura): LeituraMemoria {
  const fatos = memoria.atributos
    .filter((visao) => visao.atributo in CATALOGO_ATRIBUTOS_MEMORIA)
    .map((visao) => fatoParaLeitura(visao, identificado));
  return {
    investigado: Boolean(identificado.ultimaInvestigacaoEm),
    resumo: resumirMemoria(fatos),
    fatos,
    historico: historicoParaLeitura(memoria, identificado, fatos),
  };
}
