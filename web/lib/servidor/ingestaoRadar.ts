import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { agoraISOString, timestampDeIso } from "@/lib/datas";
import { regiaoDeBairroLondrina } from "@/lib/calculo/regioesLondrina";
import { chaveBairroRadar } from "@/lib/calculo/bairroUniversoRadar";
import { chaveNormalizada } from "@/lib/normalizacao";
import { anuncioPertenceAoMercado, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { anuncioAdmitidoRecorteRadar, capacidadeContratoExplicitoRadar } from "@/lib/calculo/aquisicaoRadar";
import { qualificarOfertaRadar } from "./qualificacaoOfertaRadar";
import { avaliarCoberturaRadar, avaliarSequenciaChavesRadar, rotaBairroComprovadaRadar, type AquisicaoPortalRadar } from "./coberturaRadar";
import { urlUniversoRadar } from "./universoRadar";

export interface LinhaDistribuidaRadar {
  id: string; busca_id: string; dados: AnuncioCentralAngariacao; visto: boolean;
  encontrado_em: string; novidade_varredura_id: string | null;
  cobertura_coleta?: string | null;
}
export interface ResultadoIngestaoRadar {
  novos: number; anuncios: LinhaDistribuidaRadar[]; varreduraId?: string;
  cobertura: "completa" | "parcial" | "desconhecida" | "truncada";
  baselineFormada: boolean; anunciosColetados?: LinhaDistribuidaRadar[];
}

/** Bairro é dimensão do universo. Preço, período e ações continuam privados. */
export function filtrosGlobaisRadar(filtros: FiltrosCentralAngariacao): FiltrosCentralAngariacao {
  const capacidade = capacidadeContratoExplicitoRadar(filtros);
  if (!capacidade.suportado) throw new Error(capacidade.motivo);
  return { portal: filtros.portal, cidade: filtros.cidade, estado: filtros.estado,
    finalidade: filtros.finalidade, tipoRecorte: filtros.tipoRecorte,
    ...(chaveBairroRadar(filtros.bairro) ? { bairro: chaveBairroRadar(filtros.bairro)! } : {}) };
}

export { qualificarOfertaRadar } from "./qualificacaoOfertaRadar";

/** A consulta privada conserva anúncios utilizáveis, mesmo sem prova para a camada global. */
function anuncioParaBasePrivada(anuncio: AnuncioCentralAngariacao, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao | null {
  const hosts = { "chaves-na-mao":"www.chavesnamao.com.br",olx:"pr.olx.com.br",wimoveis:"www.wimoveis.com.br",zap:"www.zapimoveis.com.br","viva-real":"www.vivareal.com.br" };
  let url: URL;
  try { url = new URL(anuncio.url, `https://${hosts[anuncio.portal]}`); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== hosts[anuncio.portal] || url.port || url.username || url.password
    || anuncio.portal !== filtros.portal || anuncio.finalidade !== filtros.finalidade
    || !anuncioPertenceAoMercado(anuncio, filtros.cidade, filtros.estado)
    || !anuncioAdmitidoRecorteRadar(anuncio, filtros) || !anuncio.idExterno?.trim()) return null;
  const base: AnuncioCentralAngariacao = { idExterno: anuncio.idExterno, portal: anuncio.portal,
    finalidade: anuncio.finalidade, titulo: anuncio.titulo, url: url.toString(), cidade: anuncio.cidade,
    estado: anuncio.estado, bairro: anuncio.bairro, endereco: anuncio.endereco, preco: anuncio.preco,
    anunciante: anuncio.anunciante, tipo: anuncio.tipo, tipoDeclarado: anuncio.tipoDeclarado };
  for (const campo of ["quartos","banheiros","vagas","areaM2"] as const) {
    const valor = anuncio[campo]; if (typeof valor === "number" && Number.isFinite(valor) && valor >= 0) base[campo] = valor;
  }
  if (anuncio.publicadoEm && timestampDeIso(anuncio.publicadoEm) != null) base.publicadoEm = anuncio.publicadoEm;
  if (chaveNormalizada(filtros.cidade) === "londrina" && filtros.estado.toUpperCase() === "PR") {
    Object.assign(base,{regiao:regiaoDeBairroLondrina(base.bairro) ?? undefined});
  }
  return base;
}

export function clienteServicoRadar(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Monitor do Radar indisponível neste ambiente.");
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** A mesma transação atende manual, navegador e cron; nunca recebe evidência do browser. */
export async function persistirColetaRadar(
  supabase: SupabaseClient,
  busca: { id: string; user_id: string },
  filtros: FiltrosCentralAngariacao,
  coletados: AnuncioCentralAngariacao[],
  aquisicao: AquisicaoPortalRadar | undefined,
  origem: "manual" | "navegador" | "cron",
): Promise<ResultadoIngestaoRadar> {
  if (filtros.regiao?.trim() || filtros.valorMin != null || filtros.valorMax != null
    || filtros.dormitorios != null || filtros.somenteProprietario || filtros.diasPublicacao) {
    throw new Error("A ingestão global exige coleta sem filtros privados.");
  }
  const urlUniverso = urlUniversoRadar(filtros);
  const bairro = chaveBairroRadar(filtros.bairro);
  const agora = agoraISOString();
  const origemValida = !!aquisicao?.confiavel && timestampDeIso(aquisicao.em) != null
    && timestampDeIso(aquisicao.em)! <= timestampDeIso(agora)!;
  const qualificados = origemValida ? coletados.flatMap((a) => {
    const oferta = qualificarOfertaRadar(a, filtros); return oferta ? [oferta] : [];
  }) : [];
  const unicos = new Map<string, AnuncioCentralAngariacao>();
  let divergente = false;
  for (const anuncio of qualificados) {
    const anterior = unicos.get(anuncio.idExterno);
    if (anterior && JSON.stringify(anterior) !== JSON.stringify(anuncio)) divergente = true;
    unicos.set(anuncio.idExterno, anuncio);
  }
  const anuncios = [...unicos.values()].sort((a,b) => a.idExterno.localeCompare(b.idExterno));
  const cobertura = avaliarCoberturaRadar(aquisicao, filtros, urlUniverso, anuncios);
  if (divergente || qualificados.length !== coletados.length) cobertura.cobertura = "parcial";
  const prova = aquisicao?.paginas && urlUniverso && filtros.portal === "chaves-na-mao"
    ? avaliarSequenciaChavesRadar(aquisicao.paginas, urlUniverso, filtros) : null;
  const paginas = aquisicao?.paginas?.map((pagina, indice) => {
    const e = prova?.paginas[indice];
    // A prova SQL conserva IDs únicos: patrocinados repetidos ficam como evidência observada,
    // cada identidade é atribuída à primeira página que a comprovou nesta aquisição.
    return { numero: e?.numero ?? 0, total: e?.total ?? null, ids: e?.idsNovos ?? [], proxima: !!e?.seguinte,
      ids_observados: e?.ids ?? [], ids_qualificados: e?.idsQualificadosNovos ?? [],
      ids_fora_universo: e?.populacao.fora.filter((id) => e.idsNovos.includes(id)) ?? [],
      ids_indeterminados: e?.populacao.indeterminados.filter((id) => e.idsNovos.includes(id)) ?? [], criterios_exclusao: e?.populacao.exclusoes ?? {}, avisos: e?.avisos ?? [], url_documento: e?.urlDocumento ?? null,
      url_canonical: e?.urlCanonical ?? null, transporte: pagina.transporte,
      aquisicao_id: pagina.id, em: pagina.em, confiavel: pagina.confiavel };
  });
  const lidas = aquisicao?.paginasLidas ?? paginas?.length ?? 1;
  const { data, error } = await supabase.rpc("registrar_coleta_radar", {
    p_user_id: busca.user_id, p_busca_id: busca.id, p_origem: origem,
    p_contexto: { portal: filtros.portal, finalidade: filtros.finalidade, uf: filtros.estado.toUpperCase(),
      cidade: chaveNormalizada(filtros.cidade), tipo_recorte: filtros.tipoRecorte, versao_semantica: 2, ...(bairro ? { bairro } : {}) },
    p_aquisicao: {
      id: origemValida ? aquisicao!.id : randomUUID(), em: origemValida ? aquisicao!.em : agora,
      origem: aquisicao?.origem || "desconhecida", confiavel: origemValida,
      ...cobertura, ...(prova ? { populacao: prova.contagens } : {}), ...(bairro ? { url_universo: urlUniverso,
        bairro_rota_comprovada: rotaBairroComprovadaRadar(aquisicao, filtros, urlUniverso) } : {}), contagem_bruta: coletados.length, paginas_lidas: lidas,
      paginas_planejadas: lidas + (paginas && aquisicao?.motivoTermino !== "fim_comprovado" ? 1 : 0),
      ...(paginas ? { paginas, motivo_termino: aquisicao?.motivoTermino } : {}),
    }, p_anuncios: anuncios,
    p_anuncios_base: [...new Map(coletados.flatMap((anuncio) => {
      const base = anuncioParaBasePrivada(anuncio,filtros); return base ? [[base.idExterno,base] as const] : [];
    })).values()].sort((a,b)=>a.idExterno.localeCompare(b.idExterno)),
  });
  if (error) throw error;
  return data as ResultadoIngestaoRadar;
}
