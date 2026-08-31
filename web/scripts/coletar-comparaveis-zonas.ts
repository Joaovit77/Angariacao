import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { planejarColetaPorZonasLondrina, REGIOES_LONDRINA } from "@/lib/calculo/regioesLondrina";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { buscarComFirecrawlAoVivo } from "@/lib/servidor/firecrawlCentralAngariacao";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { consultarUsoFirecrawl } from "@/lib/servidor/usoFirecrawl";

const LIMITE_TOTAL = 100;
const INTERVALO_ENTRE_CONSULTAS_MS = 6_500;

function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Variável obrigatória ausente: ${nome}.`);
  return valor;
}

function numeroInteiroDoAmbiente(nome: string, padrao: number): number {
  const bruto = process.env[nome]?.trim();
  if (!bruto) return padrao;
  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < 0) throw new Error(`${nome} deve ser um inteiro não negativo.`);
  return valor;
}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  try { return JSON.stringify(erro); } catch { return String(erro); }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consultarUsoComTentativas(apiKey: string) {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      return await consultarUsoFirecrawl(apiKey);
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < 3) await esperar(2_000 * tentativa);
    }
  }
  throw ultimoErro;
}

function intercalarZonas<T extends { regiao: string }>(plano: T[]): T[] {
  const grupos = [...new Set(plano.map((item) => item.regiao))]
    .map((regiao) => plano.filter((item) => item.regiao === regiao));
  return Array.from({ length: Math.max(...grupos.map((grupo) => grupo.length)) })
    .flatMap((_, indice) => grupos.flatMap((grupo) => grupo[indice] ? [grupo[indice]] : []));
}

async function contarPorRegiao(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  const contagens = await Promise.all(Object.keys(REGIOES_LONDRINA).map(async (regiao) => {
    const { count, error } = await supabase
      .from("comparaveis_mercado")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("cidade_chave", "londrina")
      .eq("regiao", regiao);
    if (error) throw error;
    return [regiao, count || 0] as const;
  }));
  return Object.fromEntries(contagens);
}

export async function executarColetaComparaveisPorZonas(): Promise<void> {
  if (process.env.CONFIRMAR_COLETA_100_CREDITOS !== "SIM") {
    throw new Error("Defina CONFIRMAR_COLETA_100_CREDITOS=SIM para autorizar a execução.");
  }

  const apiKey = variavelObrigatoria("FIRECRAWL_API_KEY");
  const userId = variavelObrigatoria("COLETA_COMPARAVEIS_USER_ID");
  const supabase = createClient(
    variavelObrigatoria("NEXT_PUBLIC_SUPABASE_URL"),
    variavelObrigatoria("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const planoCompleto = intercalarZonas(planejarColetaPorZonasLondrina(LIMITE_TOTAL / 4));
  if (planoCompleto.length !== LIMITE_TOTAL) throw new Error("O plano deve conter exatamente 100 consultas.");

  const usoAntes = await consultarUsoComTentativas(apiKey);
  const saldoInicialAutorizado = numeroInteiroDoAmbiente(
    "COLETA_SALDO_INICIAL_AUTORIZADO",
    usoAntes.creditosDisponiveis,
  );
  const pisoAutorizado = saldoInicialAutorizado - LIMITE_TOTAL;
  const creditosRestantesAutorizados = Math.max(0, usoAntes.creditosDisponiveis - pisoAutorizado);
  const indiceInicial = numeroInteiroDoAmbiente("COLETA_INDICE_INICIAL", 0);
  const quantidadeSolicitada = numeroInteiroDoAmbiente(
    "COLETA_QUANTIDADE",
    creditosRestantesAutorizados,
  );
  const plano = planoCompleto.slice(
    indiceInicial,
    indiceInicial + Math.min(quantidadeSolicitada, creditosRestantesAutorizados),
  );
  if (!plano.length) throw new Error("Não há créditos autorizados ou consultas selecionadas para executar.");
  const baseAntes = await contarPorRegiao(supabase, userId);

  // A coleta aumenta a base estruturada sem consumir créditos de embedding.
  delete process.env.OPENAI_API_KEY;
  let consultasConcluidas = 0;
  let anunciosAceitos = 0;
  let comparaveisSalvos = 0;
  const falhas: Array<{ consulta: number; regiao: string; bairro: string; portal: string; erro: string }> = [];

  let interrompidaPorSaldo = false;
  for (let indice = 0; indice < plano.length; indice += 1) {
      const item = plano[indice];
      const usoAtual = await consultarUsoComTentativas(apiKey);
      if (usoAtual.creditosDisponiveis <= pisoAutorizado) {
        interrompidaPorSaldo = true;
        break;
      }
      const filtros: FiltrosCentralAngariacao = {
        portal: item.portal,
        cidade: "Londrina",
        estado: "PR",
        bairro: item.bairro,
        regiao: item.regiao,
      };
      try {
        const coletados = await buscarComFirecrawlAoVivo(filtros, urlDaPesquisa(filtros));
        const finalizada = await finalizarColetaCentralAngariacao(
          supabase,
          userId,
          coletados,
          filtros,
        );
        if (finalizada.erroComparaveis) throw finalizada.erroComparaveis;
        anunciosAceitos += finalizada.anuncios.length;
        comparaveisSalvos += finalizada.comparaveisSalvos;
        consultasConcluidas += 1;
        console.info(JSON.stringify({
          progresso: `${consultasConcluidas + falhas.length}/${plano.length}`,
          ...item,
          anuncios: finalizada.anuncios.length,
          salvos: finalizada.comparaveisSalvos,
        }));
      } catch (erro) {
        falhas.push({
          consulta: indice + 1,
          ...item,
          erro: mensagemDoErro(erro),
        });
        console.error(JSON.stringify({
          progresso: `${consultasConcluidas + falhas.length}/${plano.length}`,
          ...item,
          erro: mensagemDoErro(erro),
        }));
      }
      if (indice < plano.length - 1) await esperar(INTERVALO_ENTRE_CONSULTAS_MS);
  }
  const usoDepois = await consultarUsoComTentativas(apiKey);
  const baseDepois = await contarPorRegiao(supabase, userId);
  console.info(JSON.stringify({
    resumo: true,
    consultasPlanejadas: plano.length,
    consultasConcluidas,
    interrompidaPorSaldo,
    falhas,
    anunciosAceitos,
    comparaveisSalvos,
    creditosAntes: usoAntes.creditosDisponiveis,
    creditosDepois: usoDepois.creditosDisponiveis,
    creditosConsumidos: usoAntes.creditosDisponiveis - usoDepois.creditosDisponiveis,
    baseAntes,
    baseDepois,
  }));

  if (falhas.length) throw new Error(`${falhas.length} consultas falharam; consulte o resumo acima.`);
}
