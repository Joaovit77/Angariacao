import { randomUUID } from "node:crypto";
import { registrarEvento } from "./registro";

export type IniciadorColeta = "cron" | "monitor_navegador" | "verificar_agora" | "pesquisar" | "desconhecido";
export type AquisicaoColeta = "cache" | "firecrawl" | "playwright" | "http_direto" | "desconhecida";
export type FaseColeta = "caminho_escolhido" | "cache_hit" | "single_flight"
  | "fetch_iniciado" | "resposta_recebida" | "resultado_interpretado" | "falha"
  | "fallback" | "coleta_compartilhada_concluida";

export interface EventoColetaSeguro {
  fase: FaseColeta;
  aquisicao?: AquisicaoColeta;
  coletaId?: string;
  statusHttp?: number;
  statusPortalHttp?: number;
  codigo?: string;
  /** Contagens agregadas do parser do ZAP (R4.2h); reconstruídas por allowlist. */
  diagnosticoZap?: unknown;
}

function contagem(valor: unknown): number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= 10_000_000 ? valor : 0;
}

function objetoOuVazio(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
}

const MOTIVOS_DESCARTE_ZAP = [
  "sem_link_imovel", "sem_id", "multiplos_ids", "url_invalida",
  "id_duplicado", "id_inconsistente", "sem_titulo", "filtro_local",
] as const;
const MARCADORES_ZAP = new Set(["cloudflare", "captcha", "acesso_negado", "aguarde_verificacao"]);
const ANCESTRAIS_ZAP = ["li", "article", "section", "role", "dataTestid", "dataCy", "itemtype"] as const;
const ATRIBUTOS_ESTRUTURAIS_ZAP = new Set(["tag", "role", "dataTestid", "dataCy", "itemprop", "itemtype"]);
const TAG_ZAP = /^[a-z][a-z0-9-]{0,15}$/;
const ROTULO_ZAP = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const ASSINATURA_ZAP = /^[a-z][a-z0-9-]{0,15}( > [a-z][a-z0-9-]{0,15}){0,6}$/;

function rotuloZapSeguro(valor: unknown): valor is string {
  return typeof valor === "string" && ROTULO_ZAP.test(valor) && !/\d{6,}/.test(valor);
}

/** Histograma: só chaves numéricas curtas e contagens. */
function histogramaSeguro(valor: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(objetoOuVazio(valor))
    .filter(([chave]) => /^\d{1,3}$/.test(chave))
    .slice(0, 40)
    .map(([chave, quantidade]) => [chave, contagem(quantidade)]));
}

function paresEstruturaisSeguros(valor: unknown) {
  return (Array.isArray(valor) ? valor : []).slice(0, 15)
    .map(objetoOuVazio)
    .filter((par) => typeof par.atributo === "string" && ATRIBUTOS_ESTRUTURAIS_ZAP.has(par.atributo)
      && (par.atributo === "tag" ? typeof par.valor === "string" && TAG_ZAP.test(par.valor) : rotuloZapSeguro(par.valor)))
    .map((par) => ({ atributo: par.atributo as string, valor: par.valor as string, quantidade: contagem(par.quantidade) }));
}

function estruturaCardsZapSegura(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const e = valor as Record<string, unknown>;
  const campos = (grupo: unknown, nomes: readonly string[]) => {
    const origem = objetoOuVazio(grupo);
    return Object.fromEntries(nomes.map((nome) => [nome, contagem(origem[nome])]));
  };
  const ancestrais = objetoOuVazio(e.ancestrais);
  return {
    cruzamento: campos(e.cruzamento, [
      "idsLinks", "idsProduct", "idsApartment",
      "idsLinkComProduct", "idsLinkSemProduct", "idsProductSemLink",
      "idsLinkComApartment", "idsLinkSemApartment", "idsApartmentSemLink",
      "idsComVariosLinks", "idsComUrlsDiferentes",
    ]),
    recomendacoes: campos(e.recomendacoes, ["listas", "linksDentro", "idsDentro", "linksFora", "idsFora"]),
    atributos_do_link: paresEstruturaisSeguros(e.atributosDoLink),
    ancestrais: Object.fromEntries(ANCESTRAIS_ZAP.map((tipo) => {
      const a = objetoOuVazio(ancestrais[tipo]);
      return [tipo, {
        ...campos(a, ["linksComAncestral", "containers", "unitarios", "comProduct", "semProduct", "comApartment", "semApartment"]),
        profundidade: histogramaSeguro(a.profundidade),
        linksPorContainer: histogramaSeguro(a.linksPorContainer),
        idsPorContainer: histogramaSeguro(a.idsPorContainer),
        atributos: paresEstruturaisSeguros(a.atributos),
      }];
    })),
    assinaturas: (Array.isArray(e.assinaturas) ? e.assinaturas : []).slice(0, 10)
      .map(objetoOuVazio)
      .filter((item) => typeof item.valor === "string" && ASSINATURA_ZAP.test(item.valor))
      .map((item) => ({ valor: item.valor as string, quantidade: contagem(item.quantidade) })),
  };
}

/** Reconstrói o diagnóstico do ZAP campo a campo: só números e rótulos curtos
    conhecidos. Qualquer campo extra (HTML, texto, URL, ID) é descartado. */
export function diagnosticoZapSeguro(valor: unknown) {
  const d = objetoOuVazio(valor);
  const campos = (grupo: unknown, nomes: readonly string[]) => {
    const origem = objetoOuVazio(grupo);
    return Object.fromEntries(nomes.map((nome) => [nome, contagem(origem[nome])]));
  };
  const estrutura = objetoOuVazio(d.estrutura);
  const saida = objetoOuVazio(d.saida);
  return {
    html_caracteres: contagem(d.htmlCaracteres),
    marcadores_bloqueio: (Array.isArray(d.marcadoresBloqueio) ? d.marcadoresBloqueio : [])
      .filter((m): m is string => typeof m === "string" && MARCADORES_ZAP.has(m)),
    titulo_menciona_londrina: d.tituloMencionaLondrina === true,
    estrutura: {
      ...campos(estrutura, ["li", "links", "linksImovelComId", "idsUnicosNosLinks", "elementosComDataTestid"]),
      dataTestid: (Array.isArray(estrutura.dataTestid) ? estrutura.dataTestid : []).slice(0, 20)
        .map(objetoOuVazio)
        .filter((item) => typeof item.valor === "string"
          && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(item.valor) && !/\d{6,}/.test(item.valor))
        .map((item) => ({ valor: item.valor as string, quantidade: contagem(item.quantidade) })),
    },
    seletor_cards: contagem(d.seletorCards),
    cards: campos(d.cards, ["processados", "alemDoLimite", "comUmId", "idsUnicos", "idsDuplicados"]),
    json_ld: campos(d.jsonLd, [
      "blocos", "invalidos", "product", "apartment", "offer", "rentAction", "priceSpecification",
      "realEstateListing", "productsComId", "apartmentsComId", "idsUnicos",
    ]),
    pareamento: campos(d.pareamento, ["comProduct", "semProduct", "comApartment", "semApartment", "ambiguos", "jsonLdSemCard"]),
    titulo: campos(d.titulo, ["comProductName", "comTituloHtml", "semTitulo"]),
    saida: {
      aceitos: contagem(saida.aceitos),
      descartes: campos(saida.descartes, MOTIVOS_DESCARTE_ZAP),
    },
    estrutura_cards: estruturaCardsZapSegura(d.estruturaCards),
  };
}

const FASES = new Set<FaseColeta>([
  "caminho_escolhido", "cache_hit", "single_flight", "fetch_iniciado",
  "resposta_recebida", "resultado_interpretado", "falha", "fallback",
  "coleta_compartilhada_concluida",
]);
const AQUISICOES = new Set<AquisicaoColeta>(["cache", "firecrawl", "playwright", "http_direto", "desconhecida"]);
const CODIGOS = new Set([
  "firecrawl_429", "firecrawl_timeout", "firecrawl_indisponivel",
  "firecrawl_http_falhou", "firecrawl_resposta_invalida", "firecrawl_resposta_falhou",
  "firecrawl_html_invalido", "portal_http_falhou", "parser_falhou",
  "navegador_falhou", "portal_falhou", "fallback_vazio", "persistencia_falhou", "falha_interna",
  "http_status_falhou", "http_timeout", "http_transporte_falhou",
  "http_parser_falhou", "http_resultado_indeterminado", "http_orcamento_insuficiente",
]);

/** Allowlist: jamais serializa um erro, URL, filtro ou anúncio recebido. */
function faseSegura(evento: EventoColetaSeguro) {
  return {
    fase: FASES.has(evento.fase) ? evento.fase : "falha",
    aquisicao: evento.aquisicao && AQUISICOES.has(evento.aquisicao) ? evento.aquisicao : "desconhecida",
    coleta_id: evento.coletaId && /^[0-9a-f-]{36}$/i.test(evento.coletaId) ? evento.coletaId : null,
    status_http: typeof evento.statusHttp === "number" && Number.isInteger(evento.statusHttp)
      && evento.statusHttp >= 100 && evento.statusHttp <= 599 ? evento.statusHttp : null,
    status_portal_http: typeof evento.statusPortalHttp === "number" && Number.isInteger(evento.statusPortalHttp)
      && evento.statusPortalHttp >= 100 && evento.statusPortalHttp <= 599 ? evento.statusPortalHttp : null,
    codigo: evento.codigo && CODIGOS.has(evento.codigo) ? evento.codigo : null,
  };
}

export function novoIdExecucao(): string { return randomUUID(); }

export function criarObservadorRadar(contexto: {
  execucaoId: string;
  rodadaId?: string;
  iniciador: IniciadorColeta;
  portal: string;
  buscaId?: string;
}) {
  const fases: ReturnType<typeof faseSegura>[] = [];
  let reutilizacao: "nenhuma" | "single_flight" | "desconhecida" = "desconhecida";
  let aquisicao: AquisicaoColeta = "desconhecida";
  let coletaId: string | null = null;
  let chamadaPropriaIniciada: boolean | null = null;
  let respostaRecebida: boolean | null = null;
  let resultadoInterpretado: boolean | null = null;
  let diagnosticoZap: ReturnType<typeof diagnosticoZapSeguro> | null = null;

  function observar(evento: EventoColetaSeguro): void {
    try {
      const seguro = faseSegura(evento);
      fases.push(seguro);
      // Um único resumo agregado por execução, só no resultado interpretado.
      if (seguro.fase === "resultado_interpretado" && evento.diagnosticoZap) {
        diagnosticoZap = diagnosticoZapSeguro(evento.diagnosticoZap);
      }
      if (seguro.coleta_id) coletaId = seguro.coleta_id;
      if (seguro.fase === "fallback") {
        respostaRecebida = null;
        resultadoInterpretado = null;
      }
      if (seguro.fase === "single_flight") {
        reutilizacao = "single_flight";
        chamadaPropriaIniciada = false;
      } else if (seguro.fase === "cache_hit") {
        reutilizacao = "nenhuma";
        chamadaPropriaIniciada = false;
      } else if (seguro.fase === "caminho_escolhido" && reutilizacao === "desconhecida") {
        reutilizacao = "nenhuma";
      }
      if (seguro.aquisicao !== "desconhecida") aquisicao = seguro.aquisicao;
      if (seguro.fase === "fetch_iniciado") chamadaPropriaIniciada = true;
      if (seguro.fase === "resposta_recebida") respostaRecebida = true;
      if (seguro.fase === "resultado_interpretado") resultadoInterpretado = true;
      if (seguro.fase === "falha" && seguro.codigo === "parser_falhou") resultadoInterpretado = false;
      console.info("[radar-observabilidade]", {
        execucao_id: contexto.execucaoId,
        ...(contexto.rodadaId ? { rodada_id: contexto.rodadaId } : {}),
        portal: contexto.portal,
        ...seguro,
      });
    } catch {
      // A telemetria não pode interferir na aquisição nem em seus fallbacks.
    }
  }

  function resumo() {
    return {
      execucao_id: contexto.execucaoId,
      ...(contexto.rodadaId ? { rodada_id: contexto.rodadaId } : {}),
      ...(contexto.buscaId ? { busca_id: contexto.buscaId } : {}),
      iniciador: contexto.iniciador,
      portal: contexto.portal,
      coleta_id: coletaId,
      reutilizacao,
      aquisicao,
      chamada_propria_iniciada: chamadaPropriaIniciada,
      resposta_recebida: respostaRecebida,
      resultado_interpretado: resultadoInterpretado,
      fases,
      ...(diagnosticoZap ? { diagnostico_zap: diagnosticoZap } : {}),
    };
  }

  function concluir(userId: string, evento: "central-busca-ok" | "central-busca-falhou", contagens: {
    coletados?: number;
    aposFiltro?: number;
    comparaveisSalvos?: number;
    duracaoMs: number;
  }): void {
    try {
      registrarEvento({
        userId,
        categoria: "radar",
        nivel: evento === "central-busca-ok" ? "info" : "erro",
        evento,
        detalhe: JSON.stringify({
          ...resumo(),
          coletados: contagens.coletados ?? null,
          apos_filtro: contagens.aposFiltro ?? null,
          comparaveis_salvos: contagens.comparaveisSalvos ?? null,
          novos: contexto.iniciador === "pesquisar" ? "nao_aplicavel" : null,
          duracao_ms: Math.max(0, Math.round(contagens.duracaoMs)),
        }),
      });
    } catch {
      // Registrar no banco é acessório.
    }
  }

  return { observar, resumo, concluir };
}
