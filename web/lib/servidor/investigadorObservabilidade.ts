/* ================================================================
   INVESTIGADOR DE IMÓVEIS — observabilidade do provider e da investigação

   Tudo o que o Investigador conta sobre si mesmo no log passa por aqui,
   com a mesma política da Fase 5B1: nomes operacionais, números e
   códigos locais. Nunca a consulta digitada, nunca URL com query, nunca
   chave, Bearer, header privado ou resposta bruta.

   Por que existe: no incidente de 17/09/2026 só a falha era logada, com
   `tentativa` (que na verdade era o índice da consulta na fila) e sem o
   nome do erro; timeout, DNS e reset caíam no mesmo `status: null`. Sem
   log de sucesso não há como medir a latência real do provider, e sem
   latência real não dá para escolher o timeout por chamada (A2). Separado
   de `investigadorImoveis.ts` para que os testes que substituem aquele
   módulo inteiro não percam a rota.
   ================================================================ */
import type { ResumoPontuacaoInvestigacao } from "@/lib/calculo/investigadorImoveis";
import type { ResumoContextoConfirmado } from "@/lib/calculo/contextoConfirmadoInvestigador";

export const PROVIDER_INVESTIGADOR = "rapidapi";
export const OPERACAO_PESQUISAR_IMOVEL = "pesquisar_imovel";

/** Como a chamada ao provider terminou mal. `timeout-provider` é o teto
    individual da chamada; `abort-orcamento` é o orçamento global (A2);
    `abortada` é qualquer outro abort; `rede` é o fetch rejeitado por
    DNS/TLS/reset; `http` é resposta com status não-2xx; `resposta-invalida`
    é 200 sem `organic_results` utilizável. */
export type CausaFalhaProvider =
  | "timeout-provider"
  | "abort-orcamento"
  | "abortada"
  | "rede"
  | "http"
  | "resposta-invalida";

/** Por que a investigação terminou. Os valores ligados a tempo entram no A2. */
export type EncerramentoInvestigacao =
  | "concluida"
  | "evidencia-suficiente"
  | "limite-provider"
  | "provider-indisponivel"
  | "configuracao"
  | "orcamento-parcial"
  | "orcamento-sem-resultados"
  | "erro";

/** B1: por que a fila progressiva não executou a próxima etapa.
    `plano-esgotado` cobre também o plano de uma etapa só (sem âncora
    para ampliar). Falha individual não para a fila; é contada à parte. */
export type MotivoParadaPesquisa =
  | "evidencia-suficiente"
  | "plano-esgotado"
  | "orcamento"
  | "limite-provider";

/** Uma etapa executada: só contagens e tempo, nunca a consulta. */
export interface ResumoEtapaPesquisa {
  /** Cards normalizados que a etapa trouxe. */
  resultados: number;
  /** Quantos deles ainda não existiam depois do dedupe das etapas anteriores. */
  novos: number;
  falhou: boolean;
  /** Orçamento A2 disponível ao iniciar a etapa; null sem prazo global. */
  orcamentoRestanteMs: number | null;
}

export interface ClassificacaoErroFetch {
  causa: CausaFalhaProvider;
  /** `erro.name`, só letras, para não carregar mensagem. */
  erro: string;
  /** `erro.cause.code` quando é um código curto (ETIMEDOUT, ECONNRESET...). */
  codigo?: string;
}

function nomeSeguro(valor: unknown): string {
  return typeof valor === "string" && /^[A-Za-z]{1,40}$/.test(valor) ? valor : "desconhecido";
}

function codigoSeguro(valor: unknown): string | undefined {
  return typeof valor === "string" && /^[A-Z0-9_]{2,30}$/.test(valor) ? valor : undefined;
}

/** Classifica o motivo de um `fetch` rejeitado sem guardar a mensagem. */
export function classificarErroFetch(erro: unknown): ClassificacaoErroFetch {
  const objeto = erro && typeof erro === "object" ? erro as { name?: unknown; cause?: unknown } : {};
  const nome = nomeSeguro(objeto.name);
  const causaInterna = objeto.cause && typeof objeto.cause === "object"
    ? objeto.cause as { code?: unknown; name?: unknown }
    : null;
  const codigo = codigoSeguro(causaInterna?.code);

  let causa: CausaFalhaProvider;
  if (nome === "TimeoutError") causa = "timeout-provider";
  else if (nome === "OrcamentoEsgotadoError") causa = "abort-orcamento";
  else if (nome === "AbortError") causa = "abortada";
  else causa = "rede";

  return codigo ? { causa, erro: nome, codigo } : { causa, erro: nome };
}

interface BaseRegistroProvider {
  execucao: string | null;
  /** Posição da consulta na fila (1..3). Não é retry: o Investigador não repete consulta. */
  indiceConsulta: number;
  duracaoMs: number;
}

export interface RegistroFalhaProvider extends BaseRegistroProvider {
  causa: CausaFalhaProvider;
  /** Classificação de negócio que a rota já usa (mantida). */
  motivo: "limite" | "indisponivel" | "resposta-invalida";
  status?: number;
  erro?: string;
  codigo?: string;
  headersRateLimit?: Record<string, string>;
}

export interface RegistroSucessoProvider extends BaseRegistroProvider {
  status: number;
  /** Quantidade de `organic_results` recebidos, antes de qualquer corte. */
  resultadosBrutos: number;
}

export interface RegistroConclusaoInvestigacao {
  execucao: string;
  /** Consultas de fato executadas. */
  consultas: number;
  falhas: number;
  resultadosBrutos: number;
  resultadosExibidos: number;
  /** B2: resultados únicos (após dedupe) que chegaram ao gate de relevância. */
  resultadosUnicos?: number;
  resultadosRelevantes?: number;
  resultadosInconclusivos?: number;
  /** B2: únicos descartados como claramente irrelevantes. */
  resultadosDescartados?: number;
  /** B2: descartes por motivo; só códigos e contagens. */
  motivosDescarte?: Partial<Record<string, number>>;
  /** B3: versão, distribuição e motivos do score; só contagens e códigos. */
  pontuacao?: ResumoPontuacaoInvestigacao;
  /** B3.2a: somente agregados da comparação posterior à persistência. */
  b3_2a?: ResumoContextoConfirmado;
  encerramento: EncerramentoInvestigacao;
  duracaoMs: number;
  orcamentoTotalMs?: number;
  margemFinalizacaoMs?: number;
  consultasPuladasPorOrcamento?: number;
  consultasLimitadasPeloOrcamento?: number;
  resultadoParcial?: boolean;
  /** B1: tamanho do plano progressivo desta investigação. */
  etapasPlanejadas?: number;
  motivoParada?: MotivoParadaPesquisa;
  /** B1: etapas executadas, na ordem, com o nome da etapa do plano.
      B2: `descartados` diz quantos dos novos da etapa o gate retirou. */
  etapas?: (ResumoEtapaPesquisa & { etapa: string; descartados?: number })[];
  /** B1: orçamento que sobrava quando a próxima etapa foi recusada. */
  orcamentoRestanteNaParadaMs?: number;
}

export function registrarFalhaProvider(registro: RegistroFalhaProvider): void {
  console.warn("[investigador-imoveis] chamada ao provider falhou", {
    provider: PROVIDER_INVESTIGADOR,
    operation: OPERACAO_PESQUISAR_IMOVEL,
    execucao: registro.execucao,
    indiceConsulta: registro.indiceConsulta,
    status: registro.status ?? null,
    causa: registro.causa,
    motivo: registro.motivo,
    ...(registro.erro ? { erro: registro.erro } : {}),
    ...(registro.codigo ? { codigo: registro.codigo } : {}),
    duracaoMs: Math.round(registro.duracaoMs),
    headersRateLimit: registro.headersRateLimit ?? {},
  });
}

export function registrarSucessoProvider(registro: RegistroSucessoProvider): void {
  console.info("[investigador-imoveis] chamada ao provider concluída", {
    provider: PROVIDER_INVESTIGADOR,
    operation: OPERACAO_PESQUISAR_IMOVEL,
    execucao: registro.execucao,
    indiceConsulta: registro.indiceConsulta,
    status: registro.status,
    duracaoMs: Math.round(registro.duracaoMs),
    resultadosBrutos: registro.resultadosBrutos,
  });
}

/** Uma linha por investigação, sempre, inclusive quando termina em erro.
    A ausência desta linha para uma execução iniciada passa a ser a
    assinatura de "a plataforma matou a função". */
export function registrarConclusaoInvestigacao(registro: RegistroConclusaoInvestigacao): void {
  console.info("[investigador-imoveis] investigação concluída", {
    execucao: registro.execucao,
    consultas: registro.consultas,
    falhas: registro.falhas,
    resultadosBrutos: registro.resultadosBrutos,
    resultadosExibidos: registro.resultadosExibidos,
    ...(registro.resultadosUnicos !== undefined ? { resultadosUnicos: registro.resultadosUnicos } : {}),
    ...(registro.resultadosRelevantes !== undefined ? { resultadosRelevantes: registro.resultadosRelevantes } : {}),
    ...(registro.resultadosInconclusivos !== undefined
      ? { resultadosInconclusivos: registro.resultadosInconclusivos }
      : {}),
    ...(registro.resultadosDescartados !== undefined ? { resultadosDescartados: registro.resultadosDescartados } : {}),
    ...(registro.motivosDescarte !== undefined ? { motivosDescarte: registro.motivosDescarte } : {}),
    ...(registro.pontuacao !== undefined ? { pontuacao: registro.pontuacao } : {}),
    ...(registro.b3_2a !== undefined ? { b3_2a: registro.b3_2a } : {}),
    encerramento: registro.encerramento,
    duracaoMs: Math.round(registro.duracaoMs),
    ...(registro.orcamentoTotalMs !== undefined ? { orcamentoTotalMs: registro.orcamentoTotalMs } : {}),
    ...(registro.margemFinalizacaoMs !== undefined ? { margemFinalizacaoMs: registro.margemFinalizacaoMs } : {}),
    ...(registro.consultasPuladasPorOrcamento !== undefined ? { consultasPuladasPorOrcamento: registro.consultasPuladasPorOrcamento } : {}),
    ...(registro.consultasLimitadasPeloOrcamento !== undefined ? { consultasLimitadasPeloOrcamento: registro.consultasLimitadasPeloOrcamento } : {}),
    ...(registro.resultadoParcial !== undefined ? { resultadoParcial: registro.resultadoParcial } : {}),
    ...(registro.etapasPlanejadas !== undefined ? { etapasPlanejadas: registro.etapasPlanejadas } : {}),
    ...(registro.motivoParada !== undefined ? { motivoParada: registro.motivoParada } : {}),
    ...(registro.etapas !== undefined ? { etapas: registro.etapas } : {}),
    ...(registro.orcamentoRestanteNaParadaMs !== undefined
      ? { orcamentoRestanteNaParadaMs: registro.orcamentoRestanteNaParadaMs }
      : {}),
  });
}
