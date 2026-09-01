import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  contextoAvaliacaoIdValido,
  type ContextoExternoAvaliacao,
  type PrefillAvaliacao,
  type ReferenciaContextoAvaliacao,
} from "@/lib/calculo/contextoAvaliacao";
import { PORTAIS_ANGARIACAO, type PortalAngariacao } from "@/lib/calculo/centralAngariacao";

export const runtime = "nodejs";

interface AcessoAutenticado {
  supabase: SupabaseClient;
  userId: string;
}

interface LinhaComparavelAvaliacao {
  id: string;
  portal: string;
  id_externo: string;
  finalidade: "locacao" | "venda";
  endereco: string | null;
  bairro: string | null;
  cidade: string;
  estado: string | null;
  tipo: string | null;
  area_privativa_m2: number | string | null;
  area_m2: number | string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
}

interface LinhaRadarAvaliacao {
  id: string;
  portal: string;
  id_externo: string;
  dados: Record<string, unknown> | null;
}

const MENSAGEM_CONTEXTO_INDISPONIVEL =
  "Não foi possível carregar o anúncio indicado. Você ainda pode preencher a avaliação manualmente.";

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

function referenciaDaRequisicao(request: Request): ReferenciaContextoAvaliacao | null {
  const parametros = new URL(request.url).searchParams;
  const candidatas: ReferenciaContextoAvaliacao[] = [
    { origem: "radar-anuncio" as const, id: parametros.get("radarAnuncio")?.trim() || "" },
    { origem: "comparavel" as const, id: parametros.get("comparavel")?.trim() || "" },
  ].filter((item) => Boolean(item.id));
  if (candidatas.length !== 1 || !contextoAvaliacaoIdValido(candidatas[0].id)) return null;
  return candidatas[0];
}

function portalValido(valor: string): valor is PortalAngariacao {
  return PORTAIS_ANGARIACAO.includes(valor as PortalAngariacao);
}

function textoDoObjeto(dados: Record<string, unknown>, campo: string): string | null {
  const valor = dados[campo];
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function numero(valor: unknown): number | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function numeroDoObjeto(dados: Record<string, unknown>, campo: string): number | null {
  return numero(dados[campo]);
}

function respostaContextoIndisponivel(status: number): Response {
  return Response.json({ mensagem: MENSAGEM_CONTEXTO_INDISPONIVEL }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function contextoDoComparavel(linha: LinhaComparavelAvaliacao): ContextoExternoAvaliacao | null {
  if (!portalValido(linha.portal)) return null;
  const areaM2 = numero(linha.area_privativa_m2) ?? numero(linha.area_m2);
  const prefill: PrefillAvaliacao = {
    finalidade: linha.finalidade,
    endereco: linha.endereco,
    bairro: linha.bairro,
    cidade: linha.cidade,
    estado: linha.estado,
    tipo: linha.tipo,
    areaM2,
    quartos: linha.quartos,
    banheiros: linha.banheiros,
    vagas: linha.vagas,
  };
  return {
    origem: "central",
    prefill,
    origemExterna: {
      tipo: "comparavel",
      referenciaId: linha.id,
      comparavelId: linha.id,
      portal: linha.portal,
      idExterno: linha.id_externo,
    },
  };
}

async function contextoDoRadar(
  acesso: AcessoAutenticado,
  linha: LinhaRadarAvaliacao,
): Promise<ContextoExternoAvaliacao | null> {
  if (!portalValido(linha.portal)) return null;
  const dados = linha.dados || {};
  const { data: comparavel, error } = await acesso.supabase
    .from("comparaveis_mercado")
    .select("id")
    .eq("user_id", acesso.userId)
    .eq("portal", linha.portal)
    .eq("id_externo", linha.id_externo)
    .order("ultimo_visto_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return {
    origem: "radar",
    prefill: {
      finalidade: "locacao",
      endereco: textoDoObjeto(dados, "endereco"),
      bairro: textoDoObjeto(dados, "bairro"),
      cidade: textoDoObjeto(dados, "cidade"),
      estado: textoDoObjeto(dados, "estado"),
      tipo: textoDoObjeto(dados, "tipo"),
      areaM2: numeroDoObjeto(dados, "areaM2"),
      quartos: numeroDoObjeto(dados, "quartos"),
      banheiros: numeroDoObjeto(dados, "banheiros"),
      vagas: numeroDoObjeto(dados, "vagas"),
    },
    origemExterna: {
      tipo: "radar-anuncio",
      referenciaId: linha.id,
      comparavelId: comparavel?.id ? String(comparavel.id) : null,
      portal: linha.portal,
      idExterno: linha.id_externo,
    },
  };
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

  const tabela = referencia.origem === "comparavel" ? "comparaveis_mercado" : "radar_anuncios";
  const campos = referencia.origem === "comparavel"
    ? "id,portal,id_externo,finalidade,endereco,bairro,cidade,estado,tipo,area_privativa_m2,area_m2,quartos,banheiros,vagas"
    : "id,portal,id_externo,dados";
  const { data, error } = await acesso.supabase
    .from(tabela)
    .select(campos)
    .eq("id", referencia.id)
    .eq("user_id", acesso.userId)
    .maybeSingle();

  if (error) {
    console.warn("[avaliacao] contexto externo indisponível", { codigo: error.code || "consulta" });
    return respostaContextoIndisponivel(503);
  }
  if (!data) return respostaContextoIndisponivel(404);

  try {
    const contexto = referencia.origem === "comparavel"
      ? contextoDoComparavel(data as unknown as LinhaComparavelAvaliacao)
      : await contextoDoRadar(acesso, data as unknown as LinhaRadarAvaliacao);
    if (!contexto) return respostaContextoIndisponivel(404);
    return Response.json(contexto, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    console.warn("[avaliacao] associação do anúncio indisponível", {
      codigo: erro && typeof erro === "object" && "code" in erro ? String(erro.code) : "consulta",
    });
    return respostaContextoIndisponivel(503);
  }
}
