import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  analisarCorrespondenciasInvestigacao,
  consultaInvestigadorValida,
  deduplicarResultadosInvestigacao,
  gerarConsultasInvestigacao,
  LIMITE_CONSULTA_INVESTIGADOR,
  type EventoInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import {
  consultaInicialDoAnuncio,
  consultaInicialDoImovel,
  contextoInvestigadorIdValido,
  type AnuncioParaInvestigacao,
  type ImovelParaInvestigacao,
  type ReferenciaContextoInvestigador,
} from "@/lib/calculo/contextoInvestigador";
import { PORTAIS_ANGARIACAO, type PortalAngariacao } from "@/lib/calculo/centralAngariacao";
import { buscarImovelNaWeb, BuscaWebIndisponivel } from "@/lib/servidor/investigadorImoveis";
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

function referenciaDaRequisicao(request: Request): ReferenciaContextoInvestigador | null {
  const parametros = new URL(request.url).searchParams;
  const candidatas: ReferenciaContextoInvestigador[] = [
    { origem: "imovel" as const, id: parametros.get("imovel")?.trim() || "" },
    { origem: "radar-anuncio" as const, id: parametros.get("radarAnuncio")?.trim() || "" },
    { origem: "comparavel" as const, id: parametros.get("comparavel")?.trim() || "" },
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

  const tabela = referencia.origem === "imovel"
    ? "imoveis"
    : referencia.origem === "radar-anuncio" ? "radar_anuncios" : "comparaveis_mercado";
  const campos = referencia.origem === "imovel"
    ? CAMPOS_CONTEXTO
    : referencia.origem === "radar-anuncio"
      ? "id,portal,id_externo,dados"
      : "id,portal,id_externo,titulo,endereco,bairro,cidade,estado,tipo,area_m2,quartos,banheiros,vagas";
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
  let origem: "pipeline" | "radar" | "central";
  if (referencia.origem === "imovel") {
    consulta = consultaInicialDoImovel(paraImovelInvestigavel(data as unknown as LinhaImovelInvestigador));
    origem = "pipeline";
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
    if (erro.motivo === "configuracao") return "O Investigador ainda não está configurado neste ambiente.";
    if (erro.motivo === "limite") {
      return erro.retryAfterSegundos !== undefined
        ? `O limite de pesquisas foi atingido. Tente novamente em ${erro.retryAfterSegundos} segundos.`
        : "O limite de pesquisas foi atingido. Tente novamente mais tarde.";
    }
  }
  return "A pesquisa na web está indisponível agora. Tente novamente em alguns minutos.";
}

export async function POST(request: Request): Promise<Response> {
  const acesso = await acessoAutenticado(request);
  if (!acesso) return Response.json({ mensagem: "Sessão inválida." }, { status: 401 });
  const { userId } = acesso;
  const tamanhoDeclarado = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > 4_096) {
    return Response.json({ mensagem: "A consulta excede o tamanho permitido." }, { status: 413 });
  }
  const corpo = await request.json().catch(() => null) as { consulta?: unknown } | null;
  if (!consultaInvestigadorValida(corpo?.consulta)) {
    return Response.json({ mensagem: "Informe ao menos 3 caracteres sobre o imóvel." }, { status: 400 });
  }
  const consultaOriginal = corpo.consulta.replace(/\s+/g, " ").trim().slice(0, LIMITE_CONSULTA_INVESTIGADOR);
  const chaveEmAndamento = `${userId}:${consultaOriginal.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`;
  if (investigacoesEmAndamento.has(chaveEmAndamento)) {
    return Response.json({ mensagem: "Esta investigação já está em andamento." }, { status: 409 });
  }
  investigacoesEmAndamento.add(chaveEmAndamento);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (evento: EventoInvestigacao) => controller.enqueue(encoder.encode(`${JSON.stringify(evento)}\n`));
      try {
        emitir({ tipo: "etapa", etapa: "gerando-buscas" });
        const consultas = gerarConsultasInvestigacao(consultaOriginal);
        emitir({ tipo: "etapa", etapa: "pesquisando-web" });
        const busca = await buscarImovelNaWeb(
          consultaOriginal,
          consultas,
          undefined,
          (consultasExecutadas) => emitir({ tipo: "consultas", consultas: consultasExecutadas }),
        );
        emitir({ tipo: "etapa", etapa: "normalizando-resultados" });
        const unicos = deduplicarResultadosInvestigacao(busca.resultados);
        emitir({ tipo: "etapa", etapa: "cruzando-informacoes" });
        const correspondencias = analisarCorrespondenciasInvestigacao(consultaOriginal, unicos);
        const resultados = await associarReferenciasAvaliacaoDoInvestigador(
          acesso.supabase,
          userId,
          correspondencias,
        );
        const aviso = busca.limiteAtingido
          ? busca.retryAfterSegundos !== undefined
            ? `Investigação concluída parcialmente por limite do provedor. Tente novamente em ${busca.retryAfterSegundos} segundos.`
            : "Investigação concluída parcialmente porque o limite do provedor foi atingido."
          : busca.falhas
            ? `${busca.falhas} das ${busca.consultasExecutadas.length} pesquisas executadas não responderam; os demais resultados foram mantidos.`
          : resultados.length ? undefined : "Nenhuma possível correspondência apareceu nessas buscas.";
        emitir({
          tipo: "resultado",
          dados: {
            ok: true,
            consultaOriginal,
            consultas: busca.consultasExecutadas,
            resultados,
            pesquisasEvitadas: busca.pesquisasEvitadas,
            encerramentoAntecipado: busca.encerramentoAntecipado,
            limiteAtingido: busca.limiteAtingido,
            aviso,
          },
        });
      } catch (erro) {
        console.warn("[investigador-imoveis] investigação não concluída", {
          motivo: erro instanceof BuscaWebIndisponivel ? erro.motivo : "inesperado",
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
