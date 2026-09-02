import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { agoraTimestamp } from "@/lib/datas";
import { comCaracteristicasDoAnuncio, type AnuncioCentralAngariacao, type PortalAngariacao } from "@/lib/calculo/centralAngariacao";
import { familiaTipoMercado } from "@/lib/calculo/comparaveisMercado";
import { buscarComFirecrawl, FirecrawlIndisponivel, LIMITE_RESULTADOS, type CodigoErroFirecrawl } from "./firecrawlCentralAngariacao";
import { finalizarColetaCentralAngariacao } from "./finalizacaoCentralAngariacao";
import { planejarColetaMercado } from "./planejadorColetaMercados";
import { consultarUsoFirecrawl } from "./usoFirecrawl";

// Duas ondas de até 60 s de Firecrawl deixam margem para persistência/conclusão.
export const LIMITE_MERCADOS_POR_RODADA = 1;
export const CONCORRENCIA_COLETA_MERCADOS = 2;
const LIMITE_INICIAR_CONSULTA_MS = 180_000;

export type CodigoErroColetaMercado = CodigoErroFirecrawl
  | "sem_portal_suportado" | "mercado_nao_suportado" | "saldo_insuficiente"
  | "saldo_indisponivel" | "persistencia_falhou" | "sem_resultados"
  | "limite_tempo" | "falha_total" | "lease_perdido" | "conclusao_indisponivel";

export interface MercadoReclamado {
  id: string; user_id: string; cidade: string; estado: string;
  finalidade: string; segmento: string; lease_token: string;
}

export interface DiagnosticoColetaMercado {
  mercadoId: string; cidade: string; estado: string;
  consultasPlanejadas: number; consultasExecutadas: number;
  cacheHits: number; reutilizacoesEmAndamento: number; chamadasFirecrawl: number;
  resultadosBrutos: number; resultadosNormalizados: number; comparaveisFinalizados: number;
  falhasPorPortal: { portal: PortalAngariacao; codigo: CodigoErroColetaMercado }[];
  duracaoMs: number; status: "sucesso" | "parcial" | "falha";
  erro: CodigoErroColetaMercado | null;
}

interface DependenciasColeta {
  supabase: SupabaseClient;
  buscar: typeof buscarComFirecrawl;
  finalizar: typeof finalizarColetaCentralAngariacao;
  consultarSaldo: () => Promise<number>;
  agora: () => number;
  registrar: (diagnostico: DiagnosticoColetaMercado) => void;
}

function clienteServidor(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Coleta de mercados não configurada.");
  return createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Owner exclusivamente do claim. A rota não encaminha query/body.
 * Dependências permitem smoke local sem créditos ou serviços externos reais. */
export async function executarColetaMercados(dependencias: Partial<DependenciasColeta> = {}) {
  const deps: DependenciasColeta = {
    supabase: dependencias.supabase ?? clienteServidor(),
    buscar: buscarComFirecrawl,
    finalizar: finalizarColetaCentralAngariacao,
    consultarSaldo: async () => {
      const chave = process.env.FIRECRAWL_API_KEY?.trim();
      if (!chave) throw new Error("Saldo indisponível.");
      return (await consultarUsoFirecrawl(chave)).creditosDisponiveis;
    },
    agora: agoraTimestamp,
    registrar: (d) => console.info("[mercados-cron] mercado concluído", d),
    ...dependencias,
  };
  const inicioRodada = deps.agora();
  const { data, error } = await deps.supabase.rpc("claim_mercados_monitorados", {
    p_limite: LIMITE_MERCADOS_POR_RODADA,
  });
  if (error) throw new Error("Não foi possível reclamar mercados.");
  const reclamados = (data ?? []) as MercadoReclamado[];
  const diagnosticos: DiagnosticoColetaMercado[] = [];
  // Saldo preguiçoso: uma consulta por execução, somente havendo plano útil.
  let saldo: Promise<number> | undefined;
  for (const mercado of reclamados) {
    const inicio = deps.agora();
    const plano = planejarColetaMercado(mercado);
    const d: DiagnosticoColetaMercado = {
      mercadoId: mercado.id, cidade: mercado.cidade, estado: mercado.estado,
      consultasPlanejadas: plano.consultas.length, consultasExecutadas: 0,
      cacheHits: 0, reutilizacoesEmAndamento: 0, chamadasFirecrawl: 0,
      resultadosBrutos: 0, resultadosNormalizados: 0, comparaveisFinalizados: 0,
      falhasPorPortal: [], duracaoMs: 0, status: "falha", erro: plano.erro,
    };
    try {
      if (!d.erro) {
        try {
          saldo ??= deps.consultarSaldo();
          const disponiveis = await saldo;
          if (!Number.isFinite(disponiveis) || disponiveis < plano.consultas.length) d.erro = "saldo_insuficiente";
        } catch { d.erro = "saldo_indisponivel"; }
      }
      const coletados: AnuncioCentralAngariacao[] = [];
      if (!d.erro) {
        for (let i = 0; i < plano.consultas.length; i += CONCORRENCIA_COLETA_MERCADOS) {
          await Promise.all(plano.consultas.slice(i, i + CONCORRENCIA_COLETA_MERCADOS).map(async ({ filtros, url }) => {
            if (deps.agora() - inicioRodada >= LIMITE_INICIAR_CONSULTA_MS) {
              d.falhasPorPortal.push({ portal: filtros.portal, codigo: "limite_tempo" });
              return;
            }
            d.consultasExecutadas++;
            try {
              const anuncios = await deps.buscar(filtros, url, (origem) => {
                if (origem === "cache") d.cacheHits++;
                if (origem === "em_andamento") d.reutilizacoesEmAndamento++;
                if (origem === "firecrawl") d.chamadasFirecrawl++;
              });
              // O parser já limita; esta fronteira protege também adaptadores futuros.
              const amostra = anuncios.slice(0, LIMITE_RESULTADOS).map((a) => comCaracteristicasDoAnuncio(a));
              d.resultadosBrutos += amostra.length;
              coletados.push(...amostra.filter((a) => ["apartamento", "casa"].includes(familiaTipoMercado(a.tipo))));
            } catch (erro) {
              d.falhasPorPortal.push({ portal: filtros.portal,
                codigo: erro instanceof FirecrawlIndisponivel ? erro.codigo : "firecrawl_indisponivel" });
            }
          }));
        }
        if (coletados.length) {
          try {
            // Única finalização: UF/cidade explícitas, owner do claim, sem Radar.
            const resultado = await deps.finalizar(deps.supabase, mercado.user_id, coletados, plano.consultas[0].filtros);
            d.resultadosNormalizados = resultado.anuncios.length;
            d.comparaveisFinalizados = resultado.comparaveisSalvos;
            if (resultado.erroComparaveis) d.erro = "persistencia_falhou";
          } catch { d.erro = "persistencia_falhou"; }
        }
        if (d.comparaveisFinalizados > 0 && !d.erro) {
          d.status = d.falhasPorPortal.length ? "parcial" : "sucesso";
        } else {
          d.erro ??= d.falhasPorPortal.length === plano.consultas.length
            ? d.falhasPorPortal[0]?.codigo ?? "falha_total" : "sem_resultados";
        }
      }
    } catch { d.erro = "falha_total"; }
    // Sem retries em loop: falha de transporte deixa o lease expirar.
    try {
      const concluido = await deps.supabase.rpc("concluir_mercado_monitorado", {
        p_mercado_id: mercado.id, p_lease_token: mercado.lease_token,
        p_sucesso: d.status !== "falha", p_erro_codigo: d.erro,
      });
      if (concluido.error || concluido.data !== true) {
        d.status = "falha";
        d.erro = concluido.error ? "conclusao_indisponivel" : "lease_perdido";
      }
    } catch { d.status = "falha"; d.erro = "conclusao_indisponivel"; }
    d.duracaoMs = deps.agora() - inicio;
    deps.registrar(d);
    diagnosticos.push(d);
  }
  return { mercadosReclamados: reclamados.length, mercados: diagnosticos };
}
