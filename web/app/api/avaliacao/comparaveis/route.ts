import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sanitizarErroExterno, type ContextoErroExterno } from "@/lib/servidor/erroExterno";
import {
  comparavelEhOProprioAnuncio,
  type EntradaAvaliacao,
  type OrigemExternaAvaliacao,
} from "@/lib/calculo/avaliacao";
import { contextoAvaliacaoIdValido } from "@/lib/calculo/contextoAvaliacao";
import { PORTAIS_ANGARIACAO } from "@/lib/calculo/centralAngariacao";
import {
  CONFIGURACAO_COMPARAVEIS_MERCADO,
  familiaTipoMercado,
  textoSemanticoDoImovel,
} from "@/lib/calculo/comparaveisMercado";
import { chaveNormalizada } from "@/lib/normalizacao";
import { normalizarUf, ufValida } from "@/lib/calculo/geografia";
import {
  gerarEmbeddingsDeImoveis,
  modeloEmbeddingImoveis,
} from "@/lib/servidor/embeddingsImoveis";
import {
  carregarComparaveisMercadoComCliente,
  mapearFatosHistoricosComparavelMercado,
  mapearComparaveisMercado,
} from "@/lib/persistencia/comparaveisMercado";

export const runtime = "nodejs";
export const maxDuration = 30;

interface SessaoAutenticada {
  supabase: SupabaseClient;
  userId: string;
}

async function autenticado(request: Request): Promise<SessaoAutenticada | null> {
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

function entradaValida(valor: unknown): valor is EntradaAvaliacao {
  if (!valor || typeof valor !== "object") return false;
  const item = valor as Partial<EntradaAvaliacao>;
  return (item.finalidade === "locacao" || item.finalidade === "venda")
    && typeof item.cidade === "string"
    && typeof item.estado === "string" && ufValida(item.estado)
    && typeof item.tipo === "string"
    && typeof item.areaM2 === "number" && item.areaM2 >= 10 && item.areaM2 <= 10000
    && typeof item.quartos === "number" && Number.isInteger(item.quartos)
    && item.quartos >= 0 && item.quartos <= 30
    && origemExternaValida(item.origemExterna);
}

function origemExternaValida(valor: unknown): valor is OrigemExternaAvaliacao | null | undefined {
  if (valor == null) return true;
  if (typeof valor !== "object") return false;
  const origem = valor as Partial<OrigemExternaAvaliacao>;
  return (origem.tipo === "comparavel" || origem.tipo === "radar-anuncio")
    && contextoAvaliacaoIdValido(origem.referenciaId)
    && (origem.comparavelId == null || contextoAvaliacaoIdValido(origem.comparavelId))
    && typeof origem.portal === "string"
    && PORTAIS_ANGARIACAO.includes(origem.portal as (typeof PORTAIS_ANGARIACAO)[number])
    && typeof origem.idExterno === "string"
    && origem.idExterno.trim().length > 0
    && origem.idExterno.length <= 500;
}

function textoLimitado(valor: string | null | undefined, limite: number): string | null {
  const limpo = (valor || "").replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, limite) : null;
}

function origemExternaSegura(origem: OrigemExternaAvaliacao | null | undefined) {
  if (!origem) return null;
  return {
    tipo: origem.tipo,
    referenciaId: origem.referenciaId.trim(),
    comparavelId: origem.comparavelId?.trim() || null,
    portal: origem.portal,
    idExterno: origem.idExterno.trim(),
  } satisfies OrigemExternaAvaliacao;
}

function entradaSegura(entrada: EntradaAvaliacao): EntradaAvaliacao {
  return {
    ...entrada,
    endereco: textoLimitado(entrada.endereco, 240) || "",
    bairro: textoLimitado(entrada.bairro, 100),
    cidade: textoLimitado(entrada.cidade, 100),
    estado: normalizarUf(textoLimitado(entrada.estado, 32)),
    edificio: textoLimitado(entrada.edificio, 160),
    tipo: textoLimitado(entrada.tipo, 80) || "",
    descricaoSemantica: textoLimitado(entrada.descricaoSemantica, 5_000),
    origemExterna: origemExternaSegura(entrada.origemExterna),
  };
}

export async function POST(request: Request) {
  const sessao = await autenticado(request);
  if (!sessao) return Response.json({ aviso: "Sessão inválida." }, { status: 401 });
  const recebida = await request.json().catch(() => null);
  if (!entradaValida(recebida)) {
    return Response.json({ aviso: "Dados da avaliação inválidos." }, { status: 400 });
  }
  const entrada = entradaSegura(recebida);

  const estruturados = async () => ({
    modo: "estruturado" as const,
    comparaveis: await carregarComparaveisMercadoComCliente(sessao.supabase, sessao.userId, entrada),
  });
  if (entrada.finalidade !== "locacao" || !process.env.OPENAI_API_KEY) {
    return Response.json(await estruturados());
  }

  const cidadeChave = chaveNormalizada(entrada.cidade);
  const estado = normalizarUf(entrada.estado);
  const tipoFamilia = familiaTipoMercado(entrada.tipo);
  if (!cidadeChave || !ufValida(estado) || !tipoFamilia) return Response.json(await estruturados());

  let contextoErro: ContextoErroExterno = "embedding";
  try {
    const texto = textoSemanticoDoImovel({
      finalidade: entrada.finalidade,
      tipo: entrada.tipo,
      cidade: entrada.cidade,
      bairro: entrada.bairro,
      endereco: entrada.endereco,
      edificio: entrada.edificio,
      areaPrivativaM2: entrada.areaM2,
      quartos: entrada.quartos,
      banheiros: entrada.banheiros,
      vagas: entrada.vagas,
      conservacao: entrada.conservacao,
      descricao: entrada.descricaoSemantica,
    });
    const [embedding] = await gerarEmbeddingsDeImoveis(
      [texto],
      sessao.userId,
      "embedding-consulta-avaliacao",
    );
    contextoErro = "buscarComparaveis";
    if (!embedding) return Response.json(await estruturados());

    const filtros = CONFIGURACAO_COMPARAVEIS_MERCADO.filtros;
    const { data, error } = await sessao.supabase.rpc("buscar_comparaveis_mercado_hibridos", {
      p_query_embedding: embedding,
      p_embedding_modelo: modeloEmbeddingImoveis(),
      p_embedding_dimensoes: CONFIGURACAO_COMPARAVEIS_MERCADO.dimensoesEmbedding,
      p_finalidade: entrada.finalidade,
      p_estado: estado,
      p_cidade_chave: cidadeChave,
      p_tipo_familia: tipoFamilia,
      p_area_min: entrada.areaM2 * filtros.areaMinimaRelativa,
      p_area_max: entrada.areaM2 * filtros.areaMaximaRelativa,
      p_quartos_min: Math.max(0, entrada.quartos - filtros.diferencaMaximaQuartos),
      p_quartos_max: entrada.quartos + filtros.diferencaMaximaQuartos,
      p_limite: CONFIGURACAO_COMPARAVEIS_MERCADO.maximoCandidatosVetoriais,
    });
    if (error) throw error;
    const vetoriais = mapearComparaveisMercado(
      (data || []) as Parameters<typeof mapearComparaveisMercado>[0],
    ).filter((item) => !comparavelEhOProprioAnuncio(entrada, item));
    if (vetoriais.length) {
      const { data: metadados, error: erroMetadados } = await sessao.supabase
        .from("comparaveis_mercado")
        .select("id, portal, id_externo, url, url_canonica, fingerprint_forte, cidade, estado, cidade_chave, primeiro_visto_em, ultimo_visto_em, regiao, observacoes_comparaveis_mercado(observado_em, tipo_evento, valor_anunciado, status_anuncio, dados_snapshot)")
        .in("id", vetoriais.map((item) => item.id));
      if (erroMetadados) throw erroMetadados;
      const metadadosPorId = new Map(
        (metadados || []).map((item) => [item.id, item]),
      );
      vetoriais.forEach((item) => {
        const metadado = metadadosPorId.get(item.id);
        item.regiao = (metadado?.regiao as string | null | undefined) ?? item.regiao ?? null;
        item.historico = metadado
          ? mapearFatosHistoricosComparavelMercado(
            metadado as Parameters<typeof mapearFatosHistoricosComparavelMercado>[0],
          )
          : item.historico ?? null;
      });
    }
    if (vetoriais.length < 3) {
      const complementares = await carregarComparaveisMercadoComCliente(
        sessao.supabase,
        sessao.userId,
        entrada,
      );
      const ids = new Set(vetoriais.map((item) => item.id));
      vetoriais.push(...complementares.filter((item) => !ids.has(item.id)));
    }
    return Response.json({
      modo: "hibrido",
      comparaveis: vetoriais,
    });
  } catch (erro) {
    console.error("[avaliacao] busca vetorial indisponível; usando filtros estruturados", sanitizarErroExterno(erro, contextoErro));
    return Response.json(await estruturados());
  }
}
