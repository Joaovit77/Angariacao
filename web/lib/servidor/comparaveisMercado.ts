import "server-only";
import { anuncioAdmitidoRecorteRadar, finalidadeContextoRadar } from "@/lib/calculo/aquisicaoRadar";
import { exigirCapacidadeAquisicaoRadar } from "./centralAngariacao";
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
  portal: AnuncioCentralAngariacao["portal"];
  idExterno: string;
  dados: Record<string, unknown>;
  textoEmbedding: string;
  hashEmbedding: string;
}

interface ResultadoRegistroRpc {
  id: string;
  criado: boolean;
  precisa_embedding: boolean;
}

/** Limites das check constraints de `comparaveis_mercado` em `supabase-schema.sql`. */
export const LIMITES_COMPARAVEL_BANCO = {
  areaPrivativaM2: { min: 10, max: 10_000 },
  areaTotalM2: { min: 10, max: 100_000 },
  areaTerrenoM2: { min: 10, max: 1_000_000 },
  comodo: { min: 0, max: 30 },
  andar: { min: -10, max: 300 },
  pavimentos: { min: 1, max: 300 },
} as const;

export type MotivoFalhaComparavel =
  | "restricao-banco"
  | "permissao-banco"
  | "timeout-ou-rede"
  | "resposta-invalida"
  | "erro-banco";

export interface FalhaPersistenciaComparavel {
  portal: AnuncioCentralAngariacao["portal"];
  idExterno: string;
  motivo: MotivoFalhaComparavel;
  codigoSql: string | null;
}

export interface ResultadoPersistenciaComparaveis {
  tentados: number;
  salvos: number;
  falhas: FalhaPersistenciaComparavel[];
  falhasPorMotivo: Partial<Record<MotivoFalhaComparavel, number>>;
  parcial: boolean;
  primeiroErro: unknown | null;
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor == null) return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

/** Valida número dentro da faixa aceita pelo banco; fora da faixa vira null
    sem descartar o anúncio nem alterar `dados_originais`. */
export function numeroNaFaixa(
  valor: number | string | null | undefined,
  min: number,
  max: number,
): number | null {
  const convertido = numero(valor);
  if (convertido === null || convertido < min || convertido > max) return null;
  return convertido;
}

function inteiroNaFaixa(
  valor: number | string | null | undefined,
  min: number,
  max: number,
): number | null {
  const convertido = numero(valor);
  if (convertido === null || !Number.isInteger(convertido) || convertido < min || convertido > max) {
    return null;
  }
  return convertido;
}

function valorNaoNegativo(valor: number | string | null | undefined): number | null {
  const convertido = numero(valor);
  if (convertido === null || convertido < 0) return null;
  return convertido;
}

function classificarFalhaPersistencia(erro: unknown): {
  motivo: MotivoFalhaComparavel;
  codigoSql: string | null;
} {
  if (erro && typeof erro === "object") {
    const registro = erro as { code?: unknown; status?: unknown; name?: unknown };
    const codigoSql = typeof registro.code === "string" && /^[0-9A-Z]{5}$/.test(registro.code)
      ? registro.code
      : null;
    if (codigoSql?.startsWith("23")) return { motivo: "restricao-banco", codigoSql };
    if (codigoSql === "42501" || registro.status === 401 || registro.status === 403) {
      return { motivo: "permissao-banco", codigoSql };
    }
    const nome = typeof registro.name === "string" ? registro.name : "";
    if (nome === "AbortError" || nome === "TimeoutError" || nome === "TypeError") {
      return { motivo: "timeout-ou-rede", codigoSql };
    }
    return { motivo: "erro-banco", codigoSql };
  }
  return { motivo: "erro-banco", codigoSql: null };
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
  const finalidade = finalidadeContextoRadar(filtros);
  if (original.finalidade !== undefined && original.finalidade !== finalidade) return null;
  if (original.finalidadeObservada !== undefined && original.finalidadeObservada !== finalidade) return null;
  const anuncio = comCaracteristicasDoAnuncio(original, filtros.tipo);
  if (!anuncioAdmitidoRecorteRadar(anuncio, filtros)) return null;
  const valor = numero(anuncio.preco);
  // ZAP (R4.2h): cidade e UF só do que o anúncio publica. Sem UF comprovada o
  // anúncio continua oportunidade, mas não vira comparável. Os demais portais
  // mantêm o contrato anterior (cidade do anúncio ou do filtro; UF do filtro).
  const localSoDoAnuncio = anuncio.portal === "zap";
  const cidade = localSoDoAnuncio
    ? (anuncio.cidade?.trim() || "")
    : (anuncio.cidade?.trim() || filtros.cidade.trim());
  const estado = localSoDoAnuncio ? normalizarUf(anuncio.estado) : normalizarUf(filtros.estado);
  const cidadeChave = chaveNormalizada(cidade);
  if (!valor || valor <= 0 || !cidadeChave || !ufValida(estado) || !anuncio.url || !anuncio.titulo) return null;
  const regiao = ehLondrinaParana(cidade, estado) ? (regiaoDeBairroLondrina(anuncio.bairro)
    || (filtros.regiao && filtros.bairro && anuncio.bairro
      && chaveNormalizada(anuncio.bairro) === chaveNormalizada(filtros.bairro)
      ? filtros.regiao
      : null)) : null;

  const areaPrivativaM2 = numeroNaFaixa(
    anuncio.areaM2,
    LIMITES_COMPARAVEL_BANCO.areaPrivativaM2.min,
    LIMITES_COMPARAVEL_BANCO.areaPrivativaM2.max,
  );
  const areaTotalM2 = numeroNaFaixa(
    anuncio.areaTotalM2,
    LIMITES_COMPARAVEL_BANCO.areaTotalM2.min,
    LIMITES_COMPARAVEL_BANCO.areaTotalM2.max,
  );
  const areaTerrenoM2 = numeroNaFaixa(
    anuncio.areaTerrenoM2,
    LIMITES_COMPARAVEL_BANCO.areaTerrenoM2.min,
    LIMITES_COMPARAVEL_BANCO.areaTerrenoM2.max,
  );
  const quartos = inteiroNaFaixa(anuncio.quartos, LIMITES_COMPARAVEL_BANCO.comodo.min, LIMITES_COMPARAVEL_BANCO.comodo.max);
  const suites = inteiroNaFaixa(anuncio.suites, LIMITES_COMPARAVEL_BANCO.comodo.min, LIMITES_COMPARAVEL_BANCO.comodo.max);
  const banheiros = inteiroNaFaixa(anuncio.banheiros, LIMITES_COMPARAVEL_BANCO.comodo.min, LIMITES_COMPARAVEL_BANCO.comodo.max);
  const vagas = inteiroNaFaixa(anuncio.vagas, LIMITES_COMPARAVEL_BANCO.comodo.min, LIMITES_COMPARAVEL_BANCO.comodo.max);
  const andar = inteiroNaFaixa(anuncio.andar, LIMITES_COMPARAVEL_BANCO.andar.min, LIMITES_COMPARAVEL_BANCO.andar.max);
  const pavimentos = inteiroNaFaixa(anuncio.pavimentos, LIMITES_COMPARAVEL_BANCO.pavimentos.min, LIMITES_COMPARAVEL_BANCO.pavimentos.max);
  const valorCondominio = valorNaoNegativo(anuncio.valorCondominio);
  const valorIptu = valorNaoNegativo(anuncio.valorIptu);

  const sinais = {
    portal: anuncio.portal,
    idExterno: anuncio.idExterno,
    url: anuncio.url,
    cidade,
    estado,
    bairro: anuncio.bairro,
    endereco: anuncio.endereco,
    tipo: anuncio.tipo,
    areaM2: areaPrivativaM2,
    quartos,
    anunciante: anuncio.anunciante,
  };
  const endereco = partesEndereco(anuncio.endereco);
  const textoEmbedding = textoSemanticoDoImovel({
    finalidade,
    tipo: anuncio.tipo,
    cidade,
    bairro: anuncio.bairro,
    regiao,
    endereco: anuncio.endereco,
    areaPrivativaM2,
    areaTotalM2,
    areaTerrenoM2,
    quartos,
    suites,
    banheiros,
    vagas,
    andar,
    pavimentos,
    mobiliado: anuncio.mobiliado,
    titulo: anuncio.titulo,
    descricao: anuncio.descricao,
  });
  const hashEmbedding = hashConteudoEmbedding(textoEmbedding);
  return {
    portal: anuncio.portal,
    idExterno: anuncio.idExterno,
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
      finalidade,
      finalidade_observada: original.finalidadeObservada ?? null,
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
      area_privativa_m2: areaPrivativaM2,
      area_total_m2: areaTotalM2,
      area_terreno_m2: areaTerrenoM2,
      area_m2: areaPrivativaM2, // compatibilidade com a V2
      quartos,
      suites,
      banheiros,
      vagas,
      andar,
      pavimentos,
      mobiliado: anuncio.mobiliado ?? null,
      valor_anunciado: valor,
      valor_condominio: valorCondominio,
      valor_iptu: valorIptu,
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

type ResultadoItemPersistencia =
  | { ok: true; registro: ResultadoRegistroRpc; preparado: RegistroPreparado }
  | { ok: false; falha: FalhaPersistenciaComparavel; erro: unknown };

export async function salvarComparaveisMercadoDetalhado(
  supabase: SupabaseClient,
  userId: string,
  anuncios: AnuncioCentralAngariacao[],
  filtros: FiltrosCentralAngariacao,
): Promise<ResultadoPersistenciaComparaveis> {
  exigirCapacidadeAquisicaoRadar(filtros);
  const observadoEm = agoraISOString();
  const identidades = new Set<string>();
  const preparados = anuncios
    .map((anuncio) => prepararRegistro(anuncio, filtros, observadoEm, userId))
    .filter((item): item is RegistroPreparado => {
      if (!item) return false;
      const identidade = `${item.dados.finalidade}:${item.dados.portal}:${item.dados.id_externo}`;
      if (identidades.has(identidade)) return false;
      identidades.add(identidade);
      return true;
    });
  if (!preparados.length) {
    return {
      tentados: 0,
      salvos: 0,
      falhas: [],
      falhasPorMotivo: {},
      parcial: false,
      primeiroErro: null,
    };
  }

  // Isolamento por anúncio: uma falha de RPC em um card nunca aborta nem
  // descarta os demais anúncios válidos da mesma coleta.
  const resultados = await mapearComConcorrencia<RegistroPreparado, ResultadoItemPersistencia>(
    preparados,
    CONFIGURACAO_COMPARAVEIS_MERCADO.concorrenciaPersistencia,
    async (preparado) => {
      try {
        const { data, error } = await supabase.rpc("registrar_comparavel_mercado", {
          p_dados: preparado.dados,
        });
        if (error) {
          const { motivo, codigoSql } = classificarFalhaPersistencia(error);
          return {
            ok: false,
            falha: { portal: preparado.portal, idExterno: preparado.idExterno, motivo, codigoSql },
            erro: error,
          };
        }
        const registro = (data as ResultadoRegistroRpc[] | null)?.[0];
        if (!registro?.id) {
          const erroResposta = new Error("O banco não confirmou o comparável registrado.");
          return {
            ok: false,
            falha: {
              portal: preparado.portal,
              idExterno: preparado.idExterno,
              motivo: "resposta-invalida",
              codigoSql: null,
            },
            erro: erroResposta,
          };
        }
        return { ok: true, registro, preparado };
      } catch (erro) {
        const { motivo, codigoSql } = classificarFalhaPersistencia(erro);
        return {
          ok: false,
          falha: { portal: preparado.portal, idExterno: preparado.idExterno, motivo, codigoSql },
          erro,
        };
      }
    },
  );

  const salvosItens = resultados.filter(
    (item): item is Extract<ResultadoItemPersistencia, { ok: true }> => item.ok,
  );
  const falhosItens = resultados.filter(
    (item): item is Extract<ResultadoItemPersistencia, { ok: false }> => !item.ok,
  );
  const falhas = falhosItens.map((item) => item.falha);
  const falhasPorMotivo: Partial<Record<MotivoFalhaComparavel, number>> = {};
  for (const falha of falhas) {
    falhasPorMotivo[falha.motivo] = (falhasPorMotivo[falha.motivo] ?? 0) + 1;
  }
  const primeiroErro = falhosItens[0]?.erro ?? null;
  const parcial = salvosItens.length > 0 && falhas.length > 0;

  if (parcial) {
    console.error("[comparaveis-mercado] persistência parcial de comparáveis", {
      tentados: preparados.length,
      salvos: salvosItens.length,
      falhas: falhas.length,
      motivos: falhasPorMotivo,
    });
  }

  if (!salvosItens.length) {
    return {
      tentados: preparados.length,
      salvos: 0,
      falhas,
      falhasPorMotivo,
      parcial: false,
      primeiroErro,
    };
  }

  const registrosPorRegiao = new Map<string, ResultadoRegistroRpc[]>();
  for (const item of salvosItens) {
    const regiao = item.preparado.dados.regiao;
    if (typeof regiao !== "string" || !regiao) continue;
    registrosPorRegiao.set(regiao, [...(registrosPorRegiao.get(regiao) || []), item.registro]);
  }
  for (const [regiao, registrosDaRegiao] of registrosPorRegiao) {
    await registrarRegiaoDaColeta(supabase, userId, regiao, registrosDaRegiao);
  }

  const pendentes = salvosItens.filter((item) => item.registro.precisa_embedding);
  if (pendentes.length && process.env.OPENAI_API_KEY) {
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
  }

  return {
    tentados: preparados.length,
    salvos: salvosItens.length,
    falhas,
    falhasPorMotivo,
    parcial,
    primeiroErro,
  };
}

export async function salvarComparaveisMercado(
  supabase: SupabaseClient,
  userId: string,
  anuncios: AnuncioCentralAngariacao[],
  filtros: FiltrosCentralAngariacao,
): Promise<number> {
  const resultado = await salvarComparaveisMercadoDetalhado(supabase, userId, anuncios, filtros);
  if (resultado.salvos === 0 && resultado.primeiroErro) {
    throw resultado.primeiroErro;
  }
  return resultado.salvos;
}
