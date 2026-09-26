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
  "http_parser_falhou", "http_resultado_indeterminado",
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

  function observar(evento: EventoColetaSeguro): void {
    try {
      const seguro = faseSegura(evento);
      fases.push(seguro);
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
