import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  consultaInvestigadorValida,
  deduplicarResultadosInvestigacao,
  LIMITE_CONSULTA_INVESTIGADOR,
  ordenarMantidosInvestigacao,
  planejarPesquisasInvestigacao,
  resumirPontuacaoInvestigacao,
  resumirTriagemInvestigacao,
  triarCorrespondenciasInvestigacao,
  type EventoInvestigacao,
  type PesquisaPlanejadaInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import {
  consultaInicialDoAnuncio,
  consultaInicialDoImovel,
  consultaInicialDoImovelIdentificado,
  contextoInvestigadorIdValido,
  type AnuncioParaInvestigacao,
  type ImovelIdentificadoParaInvestigacao,
  type ImovelParaInvestigacao,
  type ReferenciaContextoInvestigador,
} from "@/lib/calculo/contextoInvestigador";
import { PORTAIS_ANGARIACAO, type PortalAngariacao } from "@/lib/calculo/centralAngariacao";
import {
  buscarImovelNaWeb,
  BuscaWebIndisponivel,
} from "@/lib/servidor/investigadorImoveis";
import {
  MARGEM_FINALIZACAO_INVESTIGACAO_MS,
  ORCAMENTO_TOTAL_INVESTIGACAO_MS,
} from "@/lib/servidor/investigadorOrcamento";
import {
  registrarConclusaoInvestigacao,
  type EncerramentoInvestigacao,
  type ResumoEtapaPesquisa,
} from "@/lib/servidor/investigadorObservabilidade";
import { novaExecucaoInvestigacao, persistirMemoriaDaInvestigacao } from "@/lib/servidor/memoriaIdentidade";
import { associarReferenciasAvaliacaoDoInvestigador } from "@/lib/servidor/referenciasAvaliacaoInvestigador";

export const runtime = "nodejs";
export const maxDuration = 60;

// Trava somente enquanto a promessa existe na instância atual. Não persiste
// consulta nem vira cache; apenas evita cobrar duas vezes pelo mesmo clique.
const investigacoesEmAndamento = new Set<string>();

interface AcessoAutenticado {
  supabase: SupabaseClient;
  userId: string;
}

async function acessoAutenticado(request: Request): Promise<AcessoAutenticado | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !key || !token) return null;
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user ? { supabase, userId: data.user.id } : null;
}

interface LinhaImovelInvestigador {
  id: string;
  codigo: string | null;
  referencia_crm: string | null;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  unidade: string | null;
  bloco: string | null;
  edificio: string | null;
  tipo: string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
}

const CAMPOS_CONTEXTO = [
  "id", "codigo", "referencia_crm", "endereco", "bairro", "cidade", "estado",
  "unidade", "bloco", "edificio", "tipo", "quartos", "banheiros", "vagas",
].join(",");

function paraImovelInvestigavel(linha: LinhaImovelInvestigador): ImovelParaInvestigacao {
  return {
    id: linha.id,
    codigo: linha.codigo,
    referenciaCrm: linha.referencia_crm,
    endereco: linha.endereco,
    bairro: linha.bairro,
    cidade: linha.cidade,
    estado: linha.estado,
    unidade: linha.unidade,
    bloco: linha.bloco,
    edificio: linha.edificio,
    tipo: linha.tipo,
    quartos: linha.quartos,
    banheiros: linha.banheiros,
    vagas: linha.vagas,
  };
}

const MENSAGEM_CONTEXTO_INDISPONIVEL =
  "Não foi possível carregar o imóvel indicado. Você ainda pode preencher a pesquisa manualmente.";

interface LinhaRadarInvestigador {
  id: string;
  portal: string;
  id_externo: string;
  dados: Record<string, unknown> | null;
}

interface LinhaComparavelInvestigador {
  id: string;
  portal: string;
  id_externo: string;
  titulo: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  estado: string | null;
  tipo: string | null;
  area_m2: number | string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
}

// O Garimpo em Campo manda só o que identifica o lugar. A observação da
// passagem mora em outra tabela e nem é selecionada; a entidade não tem
// coluna de dado pessoal (V7 §14, §18.1).
const CAMPOS_CONTEXTO_IDENTIFICADO = [
  "id", "logradouro", "numero", "unidade", "bloco", "edificio", "bairro", "cidade", "estado", "tipo",
].join(",");

function referenciaDaRequisicao(request: Request): ReferenciaContextoInvestigador | null {
  const parametros = new URL(request.url).searchParams;
  const candidatas: ReferenciaContextoInvestigador[] = [
    { origem: "imovel" as const, id: parametros.get("imovel")?.trim() || "" },
    { origem: "radar-anuncio" as const, id: parametros.get("radarAnuncio")?.trim() || "" },
    { origem: "comparavel" as const, id: parametros.get("comparavel")?.trim() || "" },
    { origem: "imovel-identificado" as const, id: parametros.get("imovelIdentificado")?.trim() || "" },
  ].filter((item) => Boolean(item.id));
  if (candidatas.length !== 1 || !contextoInvestigadorIdValido(candidatas[0].id)) return null;
  return candidatas[0];
}

function portalValido(valor: string): valor is PortalAngariacao {
  return PORTAIS_ANGARIACAO.includes(valor as PortalAngariacao);
}

function textoDoObjeto(dados: Record<string, unknown>, campo: string): string | null {
  const valor = dados[campo];
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function numeroDoObjeto(dados: Record<string, unknown>, campo: string): number | null {
  const valor = dados[campo];
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function paraAnuncioDoRadar(linha: LinhaRadarInvestigador): AnuncioParaInvestigacao | null {
  if (!portalValido(linha.portal)) return null;
  const dados = linha.dados || {};
  return {
    portal: linha.portal,
    idExterno: linha.id_externo,
    titulo: textoDoObjeto(dados, "titulo"),
    endereco: textoDoObjeto(dados, "endereco"),
    bairro: textoDoObjeto(dados, "bairro"),
    cidade: textoDoObjeto(dados, "cidade"),
    tipo: textoDoObjeto(dados, "tipo"),
    areaM2: numeroDoObjeto(dados, "areaM2"),
    quartos: numeroDoObjeto(dados, "quartos"),
    banheiros: numeroDoObjeto(dados, "banheiros"),
    vagas: numeroDoObjeto(dados, "vagas"),
  };
}

function paraAnuncioDoComparavel(linha: LinhaComparavelInvestigador): AnuncioParaInvestigacao | null {
  if (!portalValido(linha.portal)) return null;
  const areaM2 = linha.area_m2 == null ? null : Number(linha.area_m2);
  return {
    portal: linha.portal,
    idExterno: linha.id_externo,
    titulo: linha.titulo,
    endereco: linha.endereco,
    bairro: linha.bairro,
    cidade: linha.cidade,
    estado: linha.estado,
    tipo: linha.tipo,
    areaM2: Number.isFinite(areaM2) ? areaM2 : null,
    quartos: linha.quartos,
    banheiros: linha.banheiros,
    vagas: linha.vagas,
  };
}

function respostaContextoIndisponivel(status: number): Response {
  return Response.json({ mensagem: MENSAGEM_CONTEXTO_INDISPONIVEL }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const referencia = referenciaDaRequisicao(request);
  if (!referencia) return respostaContextoIndisponivel(400);

  const acesso = await acessoAutenticado(request);
  if (!acesso) {
    return Response.json({ mensagem: "Sessão inválida." }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const TABELA_POR_ORIGEM = {
    imovel: "imoveis",
    "radar-anuncio": "radar_anuncios",
    comparavel: "comparaveis_mercado",
    "imovel-identificado": "imoveis_identificados",
  } as const;
  const CAMPOS_POR_ORIGEM = {
    imovel: CAMPOS_CONTEXTO,
    "radar-anuncio": "id,portal,id_externo,dados",
    comparavel: "id,portal,id_externo,titulo,endereco,bairro,cidade,estado,tipo,area_m2,quartos,banheiros,vagas",
    "imovel-identificado": CAMPOS_CONTEXTO_IDENTIFICADO,
  } as const;
  const tabela = TABELA_POR_ORIGEM[referencia.origem];
  const campos = CAMPOS_POR_ORIGEM[referencia.origem];
  const { data, error } = await acesso.supabase
    .from(tabela)
    .select(campos)
    .eq("id", referencia.id)
    .eq("user_id", acesso.userId)
    .maybeSingle();

  if (error) {
    console.warn("[investigador-imoveis] contexto indisponível", { codigo: error.code || "consulta" });
    return respostaContextoIndisponivel(503);
  }
  if (!data) return respostaContextoIndisponivel(404);

  let consulta = "";
  let origem: "pipeline" | "radar" | "central" | "garimpo";
  if (referencia.origem === "imovel") {
    consulta = consultaInicialDoImovel(paraImovelInvestigavel(data as unknown as LinhaImovelInvestigador));
    origem = "pipeline";
  } else if (referencia.origem === "imovel-identificado") {
    // Devolve só a consulta editável; não muda situação, não promove, não
    // grava nada — investigar é enriquecimento, não transição (V7 §13.0).
    consulta = consultaInicialDoImovelIdentificado(data as unknown as ImovelIdentificadoParaInvestigacao);
    origem = "garimpo";
  } else if (referencia.origem === "radar-anuncio") {
    const anuncio = paraAnuncioDoRadar(data as unknown as LinhaRadarInvestigador);
    if (!anuncio) return respostaContextoIndisponivel(404);
    consulta = consultaInicialDoAnuncio(anuncio);
    origem = "radar";
  } else {
    const anuncio = paraAnuncioDoComparavel(data as unknown as LinhaComparavelInvestigador);
    if (!anuncio) return respostaContextoIndisponivel(404);
    consulta = consultaInicialDoAnuncio(anuncio);
    origem = "central";
  }

  return Response.json(
    { consulta, origem },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function mensagemSegura(erro: unknown): string {
  if (erro instanceof BuscaWebIndisponivel) {
    if (erro.motivo === "orcamento") return "A investigação excedeu o tempo disponível. Tente novamente.";
    if (erro.motivo === "configuracao") return "O Investigador ainda não está configurado neste ambiente.";
    if (erro.motivo === "limite") {
      return erro.retryAfterSegundos !== undefined
        ? `O limite de pesquisas foi atingido. Tente novamente em ${erro.retryAfterSegundos} segundos.`
        : "O limite de pesquisas foi atingido. Tente novamente mais tarde.";
    }
  }
  return "A pesquisa na web está indisponível agora. Tente novamente em alguns minutos.";
}

/** B1: nomeia cada etapa executada pela posição no plano; só contagens.
    B2: quando conhecido, soma quantos novos daquela etapa foram descartados. */
function etapasRotuladas(
  plano: PesquisaPlanejadaInvestigacao[],
  etapas: ResumoEtapaPesquisa[] = [],
  descartadosPorEtapa?: number[],
) {
  return etapas.map((etapa, indice) => ({
    etapa: plano[indice]?.etapa ?? "desconhecida",
    ...etapa,
    ...(descartadosPorEtapa ? { descartados: descartadosPorEtapa[indice] ?? 0 } : {}),
  }));
}

function encerramentoDaFalha(erro: unknown): EncerramentoInvestigacao {
  if (!(erro instanceof BuscaWebIndisponivel)) return "erro";
  if (erro.motivo === "configuracao") return "configuracao";
  if (erro.motivo === "limite") return "limite-provider";
  if (erro.motivo === "orcamento") return "orcamento-sem-resultados";
  return "provider-indisponivel";
}

export async function POST(request: Request): Promise<Response> {
  // Medido desde a entrada, antes da auth: a linha de conclusão precisa
  // refletir o tempo que a função de fato ocupou, não só a pesquisa.
  const inicioMs = performance.now();
  const deadlineMs = inicioMs + ORCAMENTO_TOTAL_INVESTIGACAO_MS;
  const acesso = await acessoAutenticado(request);
  if (!acesso) return Response.json({ mensagem: "Sessão inválida." }, { status: 401 });
  const { userId } = acesso;
  const tamanhoDeclarado = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > 4_096) {
    return Response.json({ mensagem: "A consulta excede o tamanho permitido." }, { status: 413 });
  }
  const corpo = await request.json().catch(() => null) as { consulta?: unknown; imovelIdentificado?: unknown } | null;
  if (!consultaInvestigadorValida(corpo?.consulta)) {
    return Response.json({ mensagem: "Informe ao menos 3 caracteres sobre o imóvel." }, { status: 400 });
  }
  const consultaOriginal = corpo.consulta.replace(/\s+/g, " ").trim().slice(0, LIMITE_CONSULTA_INVESTIGADOR);

  // C13B: a memória só existe para a origem do Garimpo. O corpo traz no
  // máximo o UUID do imóvel identificado; a posse é conferida aqui, sob
  // RLS e com filtro explícito de user_id, ANTES de gastar a pesquisa. O
  // id da execução nasce no servidor: nada do cliente vira id nem fato.
  let imovelIdentificadoId: string | null = null;
  if (corpo.imovelIdentificado !== undefined && corpo.imovelIdentificado !== null) {
    if (typeof corpo.imovelIdentificado !== "string" || !contextoInvestigadorIdValido(corpo.imovelIdentificado)) {
      return respostaContextoIndisponivel(400);
    }
    const { data, error } = await acesso.supabase
      .from("imoveis_identificados")
      .select("id")
      .eq("id", corpo.imovelIdentificado)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[investigador-imoveis] contexto indisponível", { codigo: error.code || "consulta" });
      return respostaContextoIndisponivel(503);
    }
    if (!data) return respostaContextoIndisponivel(404);
    imovelIdentificadoId = corpo.imovelIdentificado;
  }
  const execucaoId = novaExecucaoInvestigacao();
  const chaveEmAndamento = `${userId}:${consultaOriginal.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`;
  if (investigacoesEmAndamento.has(chaveEmAndamento)) {
    return Response.json({ mensagem: "Esta investigação já está em andamento." }, { status: 409 });
  }
  investigacoesEmAndamento.add(chaveEmAndamento);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (evento: EventoInvestigacao) => controller.enqueue(encoder.encode(`${JSON.stringify(evento)}\n`));
      // Contagem para a linha de conclusão mesmo quando a busca lança:
      // o callback é a única testemunha de quantas consultas rodaram.
      let consultasExecutadas = 0;
      let plano: PesquisaPlanejadaInvestigacao[] = [];
      try {
        emitir({ tipo: "etapa", etapa: "gerando-buscas" });
        plano = planejarPesquisasInvestigacao(consultaOriginal);
        emitir({ tipo: "etapa", etapa: "pesquisando-web" });
        const busca = await buscarImovelNaWeb(
          consultaOriginal,
          plano.map((item) => item.consulta),
          undefined,
          (lista) => {
            consultasExecutadas = lista.length;
            emitir({ tipo: "consultas", consultas: lista });
          },
          { execucao: execucaoId, deadlineMs },
        );
        emitir({ tipo: "etapa", etapa: "normalizando-resultados" });
        const unicos = deduplicarResultadosInvestigacao(busca.resultados);
        emitir({ tipo: "etapa", etapa: "cruzando-informacoes" });
        // B2: o gate de relevância retira só o ruído claro; os mantidos
        // conservam a confiança e a ordem da análise. Os descartados não
        // vão ao cliente nem à memória; aparecem apenas como contagem no log.
        const triagem = triarCorrespondenciasInvestigacao(consultaOriginal, unicos);
        const relevancia = resumirTriagemInvestigacao(triagem);
        const correspondencias = triagem.mantidos;
        const resultados = await associarReferenciasAvaliacaoDoInvestigador(
          acesso.supabase,
          userId,
          correspondencias,
          execucaoId,
        );
        // B3: só a cópia exibida é reordenada (faixa → score → ...). A
        // memória continua recebendo `resultados`, com o mesmo conteúdo e
        // a mesma ordem do B2; o score não vai ao cliente nem ao banco.
        const pontuados = ordenarMantidosInvestigacao(triagem, resultados);
        const exibidos = pontuados.map((item) => item.correspondencia);
        const pontuacao = resumirPontuacaoInvestigacao(resultados, pontuados);
        const aviso = busca.orcamentoEsgotado
          ? "Investigação concluída parcialmente pelo tempo disponível. Os resultados encontrados foram mantidos."
          : busca.limiteAtingido
            ? busca.retryAfterSegundos !== undefined
              ? `Investigação concluída parcialmente por limite do provedor. Tente novamente em ${busca.retryAfterSegundos} segundos.`
              : "Investigação concluída parcialmente porque o limite do provedor foi atingido."
          : busca.falhas
            ? `${busca.falhas} das ${busca.consultasExecutadas.length} pesquisas executadas não responderam; os demais resultados foram mantidos.`
          : resultados.length ? undefined : "Nenhuma possível correspondência apareceu nessas buscas.";
        // Ponto único de persistência (C13B): a pesquisa terminou com
        // sucesso (mesmo parcial ou vazia) e há um imóvel identificado
        // conferido. Antes disto nada é gravado; erro acima pula tudo.
        // A consulta digitada fica de fora de propósito: é texto livre.
        const memoria = imovelIdentificadoId
          ? await persistirMemoriaDaInvestigacao({ userId, execucaoId, imovelIdentificadoId, resultados })
          : undefined;
        registrarConclusaoInvestigacao({
          execucao: execucaoId,
          consultas: busca.consultasExecutadas.length,
          falhas: busca.falhas,
          resultadosBrutos: busca.resultados.length,
          resultadosExibidos: resultados.length,
          resultadosUnicos: relevancia.analisados,
          resultadosRelevantes: relevancia.relevantes,
          resultadosInconclusivos: relevancia.inconclusivos,
          resultadosDescartados: relevancia.descartados,
          motivosDescarte: relevancia.motivosDescarte,
          pontuacao,
          encerramento: busca.orcamentoEsgotado
            ? "orcamento-parcial"
            : busca.limiteAtingido
              ? "limite-provider"
              : busca.encerramentoAntecipado ? "evidencia-suficiente" : "concluida",
          duracaoMs: performance.now() - inicioMs,
          orcamentoTotalMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS,
          margemFinalizacaoMs: MARGEM_FINALIZACAO_INVESTIGACAO_MS,
          consultasPuladasPorOrcamento: busca.orcamentoEsgotado ? busca.pesquisasEvitadas : 0,
          consultasLimitadasPeloOrcamento: busca.consultasLimitadasPeloOrcamento ?? 0,
          resultadoParcial: Boolean(busca.orcamentoEsgotado || busca.limiteAtingido || busca.falhas),
          etapasPlanejadas: plano.length,
          motivoParada: busca.motivoParada,
          etapas: etapasRotuladas(plano, busca.etapas, busca.descartadosPorEtapa),
          orcamentoRestanteNaParadaMs: busca.orcamentoRestanteNaParadaMs,
        });
        emitir({
          tipo: "resultado",
          dados: {
            ok: true,
            consultaOriginal,
            consultas: busca.consultasExecutadas,
            resultados: exibidos,
            pesquisasEvitadas: busca.pesquisasEvitadas,
            encerramentoAntecipado: busca.encerramentoAntecipado,
            limiteAtingido: busca.limiteAtingido,
            aviso,
            ...(memoria ? { memoria } : {}),
          },
        });
      } catch (erro) {
        console.warn("[investigador-imoveis] investigação não concluída", {
          execucao: execucaoId,
          motivo: erro instanceof BuscaWebIndisponivel ? erro.motivo : "inesperado",
        });
        // A busca só lança quando nenhuma consulta trouxe resultado; as
        // contagens vêm no erro. Para erro inesperado, o callback é a fonte.
        const resumo = erro instanceof BuscaWebIndisponivel ? erro.resumo : null;
        registrarConclusaoInvestigacao({
          execucao: execucaoId,
          consultas: resumo?.consultasExecutadas ?? consultasExecutadas,
          falhas: resumo?.falhas ?? 0,
          resultadosBrutos: 0,
          resultadosExibidos: 0,
          encerramento: encerramentoDaFalha(erro),
          duracaoMs: performance.now() - inicioMs,
          orcamentoTotalMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS,
          margemFinalizacaoMs: MARGEM_FINALIZACAO_INVESTIGACAO_MS,
          consultasPuladasPorOrcamento: erro instanceof BuscaWebIndisponivel && erro.motivo === "orcamento"
            ? Math.max(0, plano.length - (resumo?.consultasExecutadas ?? consultasExecutadas))
            : 0,
          resultadoParcial: false,
          etapasPlanejadas: plano.length,
          motivoParada: resumo?.motivoParada,
          etapas: etapasRotuladas(plano, resumo?.etapas),
        });
        emitir({ tipo: "erro", mensagem: mensagemSegura(erro) });
      } finally {
        investigacoesEmAndamento.delete(chaveEmAndamento);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
