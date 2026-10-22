import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { identidadeVendaRadar } from "@/lib/calculo/identidadeVendaRadar";
import { agoraISOString, timestampDeIso } from "@/lib/datas";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { urlUniversoRadar } from "./universoRadar";
import { avaliarSequenciaChavesRadar, classificarPaginaChavesRadar, type AquisicaoPortalRadar, type MotivoTerminoRadar, type PaginaPortalRadar } from "./coberturaRadar";
import { criarOrcamentoRadar, exigirTempoFaseRadar, LimiteOperacionalRadar, type OrcamentoRodadaRadar } from "./orcamentoRadar";
import { buscarComFallbackHttpChaves, RESERVA_PROCESSAMENTO_CENTRAL_MS } from "./fallbackHttpChaves";
import { TIMEOUT_FIRECRAWL_FETCH_MS, type DiagnosticoPaginaOlx, type EventoConsultaFirecrawl, type PoliticaRetryFirecrawl } from "./firecrawlCentralAngariacao";
import type { OrigemColetaCentral } from "./fallbackHttpChaves";

export interface ResumoPaginacaoRadar {
  paginasLidas: number; resultadosColetados: number; totalDeclarado: number | null;
  motivoTermino: MotivoTerminoRadar;
  resultadosObservados?: number;
  populacao?: { raw_count: number; qualified_count: number; out_of_scope_count: number; indeterminate_count: number; declared_total: number | null };
  avisosEvidencia?: Array<{ pagina: number; codigo: "portal_document_url_not_pagination_aware" }>;
}
interface Opcoes {
  orcamento?: OrcamentoRodadaRadar; restanteMs: () => number;
  observar?: (evento: EventoConsultaFirecrawl) => void;
  registrarOrigem?: (origem: OrigemColetaCentral) => void;
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void;
  politicaRetry?: PoliticaRetryFirecrawl;
}
/** Orquestra o transporte existente. Um teto jamais prova o fim do universo. */
export async function buscarColetaPaginadaRadar(filtros: FiltrosCentralAngariacao, opcoes: Opcoes) {
  const orcamento = opcoes.orcamento ?? criarOrcamentoRadar();
  const tempo = { restanteMs: opcoes.restanteMs, reservaFinalizacaoMs: RESERVA_PROCESSAMENTO_CENTRAL_MS };
  const politicaRetry = opcoes.politicaRetry ? { ...opcoes.politicaRetry, restanteMs: tempo.restanteMs } : undefined;
  const base = urlUniversoRadar(filtros);
  if (!base) return { anuncios: [] as AnuncioCentralAngariacao[], aquisicao: undefined,
    resumo: { paginasLidas: 0, resultadosColetados: 0, totalDeclarado: null,
      motivoTermino: "bairro_sem_rota_canonica" as const }, orcamento: orcamento.resumo() };
  const paginas: PaginaPortalRadar[] = [];
  const anuncios: AnuncioCentralAngariacao[] = [];
  const conteudosPorIdentidade = new Map<string, string>();
  let resultadosObservados = 0;
  const avisosEvidencia: NonNullable<ResumoPaginacaoRadar["avisosEvidencia"]> = [];
  let url: string | null = base, total: number | null = null;
  let motivo: MotivoTerminoRadar = "formato_desconhecido";
  let primeira: AquisicaoPortalRadar | undefined;
  let paginasLidas = 0;
  while (url) {
    let fonte: AquisicaoPortalRadar | undefined;
    let coletados: AnuncioCentralAngariacao[];
    try {
      // Reserva a aquisição primária e a finalização. O fallback só é orçado se necessário.
      exigirTempoFaseRadar(tempo, TIMEOUT_FIRECRAWL_FETCH_MS);
      orcamento.reservarPagina(`${filtros.portal}:${url}`);
      coletados = await buscarComFallbackHttpChaves(filtros, url, opcoes.registrarOrigem,
        opcoes.registrarDiagnosticoOlx, opcoes.observar, opcoes.restanteMs, politicaRetry,
        (valor) => { fonte = valor; }, orcamento, tempo);
      paginasLidas++;
    } catch (erro) {
      if (erro instanceof LimiteOperacionalRadar) motivo = erro.motivo;
      else if (!paginasLidas) throw erro;
      else motivo = "falha_pagina";
      break;
    }
    if (!primeira) primeira = fonte;
    if (filtros.portal !== "chaves-na-mao") {
      anuncios.push(...coletados); motivo = "formato_desconhecido"; break;
    }
    resultadosObservados += coletados.length;
    for (const anuncio of coletados) {
      const identidade = identidadeVendaRadar("chaves-na-mao", anuncio.url);
      const chave = anuncio.portal === "chaves-na-mao" && identidade?.id === anuncio.idExterno ? identidade.id : null;
      const conteudo = JSON.stringify(anuncio);
      // O adapter entrega uma oferta por identidade. Conflitos de conteúdo continuam chegando
      // à ponte para fechar o gate, e anúncios sem identidade forte continuam consultáveis.
      if (chave && conteudosPorIdentidade.get(chave) === conteudo) continue;
      if (chave) conteudosPorIdentidade.set(chave, conteudo);
      anuncios.push(anuncio);
    }
    if (!fonte?.confiavel) { motivo = "sem_proveniencia"; break; }
    paginas.push({ ...fonte, url });
    const prova = avaliarSequenciaChavesRadar(paginas, base, filtros);
    if (!prova) { motivo = "evidencia_inconsistente"; break; }
    total = prova.total;
    const e = prova.paginas.at(-1)!;
    avisosEvidencia.push(...e.avisos.map((codigo) => ({ pagina: e.numero, codigo })));
    if (!prova.proxima) { motivo = "fim_comprovado"; break; }
    url = prova.proxima;
  }
  let aquisicao = primeira;
  if (filtros.portal === "chaves-na-mao" && paginas.length) {
    const tempos = paginas.map((p) => timestampDeIso(p.em));
    const validos = tempos.every((t) => t != null && t <= (timestampDeIso(agoraISOString()) ?? 0));
    const instantes = tempos.filter((t): t is number => t != null);
    if (!validos || Math.max(...instantes) - Math.min(...instantes) > 20 * 60_000) motivo = "evidencia_inconsistente";
    // Identidade estável para replay do mesmo conjunto de aquisições e motivo.
    const hash = createHash("sha256").update(JSON.stringify({ paginas: paginas.map((p) => [p.url, p.id]), motivo })).digest("hex");
    const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
    aquisicao = { id, em: paginas.reduce((a,b) => (timestampDeIso(a.em) ?? Infinity) < (timestampDeIso(b.em) ?? Infinity) ? a : b).em,
      origem: paginas[0].origem, html: "", confiavel: validos, paginas, paginasLidas, motivoTermino: motivo };
  } else if (!aquisicao && motivo.startsWith("limite_")) {
    aquisicao = { id: randomUUID(), em: agoraISOString(), origem: "firecrawl", html: "", confiavel: false,
      paginas: [], paginasLidas, motivoTermino: motivo };
  }
  const classes = new Map<string, "qualificados" | "fora" | "indeterminados">();
  for (const pagina of paginas) {
    const p = classificarPaginaChavesRadar(pagina, base, filtros);
    for (const classe of ["qualificados", "fora", "indeterminados"] as const) {
      for (const id of p?.[classe] ?? []) classes.set(id, classes.has(id) && classes.get(id) !== classe ? "indeterminados" : classe);
    }
  }
  const contar = (classe: "qualificados" | "fora" | "indeterminados") => [...classes.values()].filter((c) => c === classe).length;
  const populacao = filtros.portal === "chaves-na-mao" ? { raw_count: classes.size,
    qualified_count: contar("qualificados"), out_of_scope_count: contar("fora"), indeterminate_count: contar("indeterminados"), declared_total: total } : undefined;
  const resumo: ResumoPaginacaoRadar = { paginasLidas, resultadosColetados: anuncios.length, totalDeclarado: total, motivoTermino: motivo, ...(populacao ? { populacao } : {}),
    ...(avisosEvidencia.length ? { avisosEvidencia } : {}),
    ...(resultadosObservados > anuncios.length ? { resultadosObservados } : {}) };
  return { anuncios, aquisicao, resumo, orcamento: orcamento.resumo() };
}
