import "server-only";
import { sanitizarErroExterno, type ContextoErroExterno } from "@/lib/servidor/erroExterno";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  baseFingerprintAnuncio,
  CONFIGURACAO_COMPARAVEIS_MERCADO,
  familiaTipoMercado,
  fingerprintEhForte,
  textoSemanticoDoImovel,
  urlCanonicaDeAnuncio,
} from "@/lib/calculo/comparaveisMercado";
import { chaveEndereco } from "@/lib/calculo/duplicidade";
import { chaveNormalizada } from "@/lib/normalizacao";
import { regiaoDeBairroLondrina } from "@/lib/calculo/regioesLondrina";
import { ehLondrinaParana, normalizarUf, ufValida } from "@/lib/calculo/geografia";
import { agoraISOString } from "@/lib/datas";
import {
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import {
  gerarEmbeddingsDeImoveis,
  hashConteudoEmbedding,
  modeloEmbeddingImoveis,
} from "./embeddingsImoveis";

interface RegistroPreparado {
  dados: Record<string, unknown>;
  textoEmbedding: string;
  hashEmbedding: string;
}

interface ResultadoRegistroRpc {
  id: string;
  criado: boolean;
  precisa_embedding: boolean;
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor == null) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function partesEndereco(endereco: string | null | undefined): { logradouro: string | null; numero: string | null } {
  const limpo = (endereco || "").replace(/\s+/g, " ").trim();
  if (!limpo) return { logradouro: null, numero: null };
  const correspondencia = limpo.match(/^(.*?)(?:,|\s+n(?:º|°|o)?\.?\s*)\s*(\d+[a-z]?)\b/i)
    || limpo.match(/^(.*?\D)\s+(\d+[a-z]?)$/i);
  return {
    logradouro: (correspondencia?.[1] || limpo).trim() || null,
    numero: correspondencia?.[2] || null,
  };
}

function prepararRegistro(
  original: AnuncioCentralAngariacao,
  filtros: FiltrosCentralAngariacao,
  observadoEm: string,
  userId: string,
): RegistroPreparado | null {
  const anuncio = comCaracteristicasDoAnuncio(original, filtros.tipo);
  const valor = numero(anuncio.preco);
  const cidade = anuncio.cidade?.trim() || filtros.cidade.trim();
  const estado = normalizarUf(filtros.estado);
  const cidadeChave = chaveNormalizada(cidade);
  if (!valor || valor <= 0 || !cidadeChave || !ufValida(estado) || !anuncio.url || !anuncio.titulo) return null;
  const regiao = ehLondrinaParana(cidade, estado) ? (regiaoDeBairroLondrina(anuncio.bairro)
    || (filtros.regiao && filtros.bairro && anuncio.bairro
      && chaveNormalizada(anuncio.bairro) === chaveNormalizada(filtros.bairro)
      ? filtros.regiao
      : null)) : null;

  const sinais = {
    portal: anuncio.portal,
    idExterno: anuncio.idExterno,
    url: anuncio.url,
    cidade,
    estado,
    bairro: anuncio.bairro,
    endereco: anuncio.endereco,
    tipo: anuncio.tipo,
    areaM2: anuncio.areaM2,
    quartos: anuncio.quartos,
    anunciante: anuncio.anunciante,
  };
  const endereco = partesEndereco(anuncio.endereco);
  const textoEmbedding = textoSemanticoDoImovel({
    finalidade: "locacao",
    tipo: anuncio.tipo,
    cidade,
    bairro: anuncio.bairro,
    regiao,
    endereco: anuncio.endereco,
    areaPrivativaM2: anuncio.areaM2,
    areaTotalM2: anuncio.areaTotalM2,
    areaTerrenoM2: anuncio.areaTerrenoM2,
    quartos: anuncio.quartos,
    suites: anuncio.suites,
    banheiros: anuncio.banheiros,
    vagas: anuncio.vagas,
    andar: anuncio.andar,
    pavimentos: anuncio.pavimentos,
    mobiliado: anuncio.mobiliado,
    titulo: anuncio.titulo,
    descricao: anuncio.descricao,
  });
  const hashEmbedding = hashConteudoEmbedding(textoEmbedding);
  return {
    textoEmbedding,
    hashEmbedding,
    dados: {
      user_id: userId, // usado somente quando uma futura rotina operar com service role
      portal: anuncio.portal,
      id_externo: anuncio.idExterno,
      url: anuncio.url,
      url_canonica: urlCanonicaDeAnuncio(anuncio.url),
      anuncio_fingerprint: hashConteudoEmbedding(baseFingerprintAnuncio(sinais)),
      fingerprint_forte: fingerprintEhForte(sinais),
      finalidade: "locacao",
      titulo: anuncio.titulo,
      descricao: anuncio.descricao || null,
      tipo: anuncio.tipo || null,
      tipo_familia: familiaTipoMercado(anuncio.tipo),
      endereco: anuncio.endereco || null,
      endereco_chave: chaveEndereco(anuncio.endereco) || null,
      logradouro: endereco.logradouro,
      numero: endereco.numero,
      bairro: anuncio.bairro || null,
      regiao,
      cidade,
      estado,
      cidade_chave: cidadeChave,
      bairro_chave: chaveNormalizada(anuncio.bairro) || null,
      area_privativa_m2: anuncio.areaM2 ?? null,
      area_total_m2: anuncio.areaTotalM2 ?? null,
      area_terreno_m2: anuncio.areaTerrenoM2 ?? null,
      area_m2: anuncio.areaM2 ?? null, // compatibilidade com a V2
      quartos: anuncio.quartos ?? null,
      suites: anuncio.suites ?? null,
      banheiros: anuncio.banheiros ?? null,
      vagas: anuncio.vagas ?? null,
      andar: anuncio.andar ?? null,
      pavimentos: anuncio.pavimentos ?? null,
      mobiliado: anuncio.mobiliado ?? null,
      valor_anunciado: valor,
      valor_condominio: anuncio.valorCondominio ?? null,
      valor_iptu: anuncio.valorIptu ?? null,
      publicado_em: anuncio.publicadoEm || null,
      observado_em: observadoEm,
      anunciante_tipo: anuncio.anunciante,
      status_anuncio: "ativo",
      embedding_texto: textoEmbedding,
      embedding_hash: hashEmbedding,
      embedding_modelo: modeloEmbeddingImoveis(),
      embedding_dimensoes: CONFIGURACAO_COMPARAVEIS_MERCADO.dimensoesEmbedding,
      dados_originais: anuncio,
    },
  };
}

async function mapearComConcorrencia<T, R>(
  itens: T[],
  limite: number,
  executar: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await executar(itens[indice]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

function rpcAusente(erro: { code?: string; message?: string }): boolean {
  return erro.code === "PGRST202"
    || erro.code === "42883"
    || /registrar_comparavel_mercado.*(?:schema cache|does not exist)/i.test(erro.message || "");
}

async function salvarNoSchemaV2(
  supabase: SupabaseClient,
  preparados: RegistroPreparado[],
): Promise<number> {
  const linhas = preparados.map(({ dados }) => ({
    user_id: dados.user_id,
    portal: dados.portal,
    id_externo: dados.id_externo,
    url: dados.url,
    finalidade: dados.finalidade,
    titulo: dados.titulo,
    tipo: dados.tipo,
    endereco: dados.endereco,
    bairro: dados.bairro,
    regiao: dados.regiao,
    cidade: dados.cidade,
    estado: dados.estado,
    cidade_chave: dados.cidade_chave,
    bairro_chave: dados.bairro_chave,
    area_m2: dados.area_m2,
    quartos: dados.quartos,
    banheiros: dados.banheiros,
    vagas: dados.vagas,
    valor_anunciado: dados.valor_anunciado,
    publicado_em: dados.publicado_em,
    ultimo_visto_em: dados.observado_em,
    dados_originais: dados.dados_originais,
  }));
  const { error } = await supabase
    .from("comparaveis_mercado")
    .upsert(linhas, { onConflict: "user_id,portal,id_externo" });
  if (error) throw error;
  return linhas.length;
}

async function registrarRegiaoDaColeta(
  supabase: SupabaseClient,
  userId: string,
  regiao: string | undefined,
  registros: ResultadoRegistroRpc[],
): Promise<void> {
  if (!regiao || !registros.length) return;
  const { error } = await supabase
    .from("comparaveis_mercado")
    .update({ regiao })
    .eq("user_id", userId)
    .in("id", registros.map((registro) => registro.id));
  if (error) throw error;
}

export async function salvarComparaveisMercado(
  supabase: SupabaseClient,
  userId: string,
  anuncios: AnuncioCentralAngariacao[],
  filtros: FiltrosCentralAngariacao,
): Promise<number> {
  const observadoEm = agoraISOString();
  const identidades = new Set<string>();
  const preparados = anuncios
    .map((anuncio) => prepararRegistro(anuncio, filtros, observadoEm, userId))
    .filter((item): item is RegistroPreparado => {
      if (!item) return false;
      const identidade = `${item.dados.portal}:${item.dados.id_externo}`;
      if (identidades.has(identidade)) return false;
      identidades.add(identidade);
      return true;
    });
  if (!preparados.length) return 0;

  const registros: ResultadoRegistroRpc[] = [];
  try {
    registros.push(...await mapearComConcorrencia(
      preparados,
      CONFIGURACAO_COMPARAVEIS_MERCADO.concorrenciaPersistencia,
      async (preparado) => {
        const { data, error } = await supabase.rpc("registrar_comparavel_mercado", {
          p_dados: preparado.dados,
        });
        if (error) throw error;
        const registro = (data as ResultadoRegistroRpc[] | null)?.[0];
        if (!registro?.id) throw new Error("O banco não confirmou o comparável registrado.");
        return registro;
      },
    ));
  } catch (erro) {
    if (rpcAusente(erro as { code?: string; message?: string })) {
      // Permite publicar o código antes do schema V3 sem interromper a Central.
      return salvarNoSchemaV2(supabase, preparados);
    }
    throw erro;
  }

  const registrosPorRegiao = new Map<string, ResultadoRegistroRpc[]>();
  registros.forEach((registro, indice) => {
    const regiao = preparados[indice].dados.regiao;
    if (typeof regiao !== "string" || !regiao) return;
    registrosPorRegiao.set(regiao, [...(registrosPorRegiao.get(regiao) || []), registro]);
  });
  for (const [regiao, registrosDaRegiao] of registrosPorRegiao) {
    await registrarRegiaoDaColeta(supabase, userId, regiao, registrosDaRegiao);
  }

  const pendentes = registros.flatMap((registro, indice) =>
    registro.precisa_embedding ? [{ registro, preparado: preparados[indice] }] : []
  );
  if (!pendentes.length || !process.env.OPENAI_API_KEY) return registros.length;

  let contextoErro: ContextoErroExterno = "embedding";
  try {
    const vetores = await gerarEmbeddingsDeImoveis(
      pendentes.map((item) => item.preparado.textoEmbedding),
      userId,
      "embedding-comparavel-mercado",
    );
    contextoErro = "persistirEmbedding";
    await mapearComConcorrencia(
      pendentes,
      CONFIGURACAO_COMPARAVEIS_MERCADO.concorrenciaPersistencia,
      async (item) => {
        const indice = pendentes.indexOf(item);
        const vetor = vetores[indice];
        if (!vetor) return;
        const { error } = await supabase
          .from("comparaveis_mercado")
          .update({ embedding: vetor, embedding_gerado_em: agoraISOString() })
          .eq("id", item.registro.id)
          .eq("user_id", userId)
          .eq("embedding_hash", item.preparado.hashEmbedding);
        if (error) throw error;
      },
    );
  } catch (erro) {
    // Persistência estruturada e histórico continuam válidos. A próxima coleta
    // tenta novamente porque o embedding permaneceu nulo.
    console.error("[comparaveis-mercado] falha ao gerar embeddings", sanitizarErroExterno(erro, contextoErro));
  }
  return registros.length;
}
