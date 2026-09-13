/* ================================================================
   CEP (ViaCEP) e GEOCODIFICAÇÃO (Nominatim/OpenStreetMap)
   Port de buscarCEP(), nominatimSearch(), geocodeEndereco() e
   maskCEP() (app.js, seção 6A). Ambos gratuitos e sem chave de API.
   Aqui ficam só as chamadas e a lógica de tentativas; o modal cuida
   dos campos e das mensagens de status.
   ================================================================ */

export function maskCEP(valor: string): string {
  let v = valor.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
  return v;
}

export interface EnderecoViaCep {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

interface RespostaViaCepInterna {
  ok: boolean;
  resultados?: EnderecoViaCep[];
  falha?: string;
  mensagem?: string;
}

export class ErroConsultaViaCep extends Error {
  constructor(
    mensagem: string,
    readonly falha = "indisponivel",
  ) {
    super(mensagem);
    this.name = "ErroConsultaViaCep";
  }
}

async function consultarViaCepInterno(
  parametros: URLSearchParams,
  signal?: AbortSignal,
): Promise<EnderecoViaCep[]> {
  const res = await fetch(`/api/viacep?${parametros.toString()}`, { signal });
  const corpo = (await res.json().catch(() => null)) as RespostaViaCepInterna | null;
  if (!res.ok || !corpo?.ok || !Array.isArray(corpo.resultados)) {
    throw new ErroConsultaViaCep(
      corpo?.mensagem || "Não foi possível consultar o ViaCEP agora.",
      corpo?.falha,
    );
  }
  return corpo.resultados;
}

export async function buscarCep(cep: string): Promise<EnderecoViaCep> {
  const resultados = await consultarViaCepInterno(new URLSearchParams({ cep }));
  return resultados[0] || { erro: true };
}

export async function buscarEnderecosViaCep(
  pesquisa: { uf: string; cidade: string; logradouro: string },
  signal?: AbortSignal,
): Promise<EnderecoViaCep[]> {
  return consultarViaCepInterno(
    new URLSearchParams({
      uf: pesquisa.uf,
      cidade: pesquisa.cidade,
      logradouro: pesquisa.logradouro,
    }),
    signal,
  );
}

export interface ResultadoNominatim {
  lat: string;
  lon: string;
  /** Com `addressdetails=1`: "building", "house", "road", "suburb", "city"… */
  addresstype?: string;
  class?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city_district?: string;
    postcode?: string;
  };
}

const LIMITE_CANDIDATOS_NOMINATIM = 5;

async function nominatimSearch(query: string): Promise<ResultadoNominatim[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${LIMITE_CANDIDATOS_NOMINATIM}&addressdetails=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function normalizarTexto(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

/**
 * Uma avenida longa volta como vários trechos, e o primeiro é sorte: no
 * smoke de 12/09 a Duque de Caxias caiu ora no Centro, ora 2 km ao norte.
 * O bairro e o CEP que o ViaCEP já entregou ancoram o trecho certo: bairro
 * igual vale mais, CEP com os cinco primeiros dígitos iguais desempata.
 * Sem pista nenhuma, o primeiro.
 */
export function escolherResultadoNominatim(
  candidatos: ResultadoNominatim[],
  pistas: { bairro?: string; cep?: string },
): ResultadoNominatim | null {
  if (!candidatos.length) return null;
  const bairro = normalizarTexto(pistas.bairro ?? "");
  const cep5 = (pistas.cep ?? "").replace(/\D/g, "").slice(0, 5);
  const pontuar = (candidato: ResultadoNominatim): number => {
    const endereco = candidato.address ?? {};
    const bairrosDoResultado = [endereco.suburb, endereco.neighbourhood, endereco.quarter, endereco.city_district]
      .filter((valor): valor is string => Boolean(valor))
      .map(normalizarTexto);
    let pontos = 0;
    if (bairro && bairrosDoResultado.includes(bairro)) pontos += 2;
    if (cep5.length === 5 && (endereco.postcode ?? "").replace(/\D/g, "").startsWith(cep5)) pontos += 1;
    return pontos;
  };
  let melhor = candidatos[0];
  let melhorPontuacao = pontuar(melhor);
  for (const candidato of candidatos.slice(1)) {
    const pontuacao = pontuar(candidato);
    if (pontuacao > melhorPontuacao) {
      melhor = candidato;
      melhorPontuacao = pontuacao;
    }
  }
  return melhor;
}

/** O que a coordenada representa. Um centroide de bairro ou de cidade serve
    para região, nunca para distância entre imóveis. */
export type PrecisaoGeocodificacao = "endereco" | "rua" | "bairro" | "cidade";

const ORDEM_PRECISAO: PrecisaoGeocodificacao[] = ["endereco", "rua", "bairro", "cidade"];

/**
 * O Nominatim responde "Avenida X, 770" com a RUA quando não conhece o número
 * — e a consulta continua rotulada "endereco" se ninguém olhar o que voltou.
 * Aqui a precisão é a pior entre a pedida e a observada no resultado; sem
 * `addresstype` (resposta antiga ou mock) fica a pedida.
 */
export function precisaoObservada(
  pedida: PrecisaoGeocodificacao,
  resultado: Pick<ResultadoNominatim, "addresstype" | "class">,
): PrecisaoGeocodificacao {
  const tipo = (resultado.addresstype ?? "").toLowerCase();
  const classe = (resultado.class ?? "").toLowerCase();
  let observada: PrecisaoGeocodificacao | null = null;
  if (!tipo && !classe) observada = null;
  else if (tipo === "road" || classe === "highway") observada = "rua";
  else if (["suburb", "neighbourhood", "quarter", "residential", "hamlet"].includes(tipo)) observada = "bairro";
  else if (["city", "town", "village", "municipality", "county", "state", "country"].includes(tipo)) observada = "cidade";
  else observada = "endereco";
  if (observada === null) return pedida;
  return ORDEM_PRECISAO[Math.max(ORDEM_PRECISAO.indexOf(pedida), ORDEM_PRECISAO.indexOf(observada))];
}

export interface Geocodificacao {
  lat: number;
  lon: number;
  precisao: PrecisaoGeocodificacao;
  /** true quando o endereço exato não foi achado e caiu numa tentativa mais larga. */
  usedFallback: boolean;
}

export interface TentativaGeocode {
  consulta: string;
  precisao: PrecisaoGeocodificacao;
}

/**
 * Separa "Rua X, 123" em rua + número, para poder tentar de novo sem
 * o número caso o endereço exato não esteja mapeado no OpenStreetMap
 * (muito comum no Brasil, principalmente em bairros mais novos).
 * A precisão vem do que cada tentativa contém, não da ordem.
 */
export function tentativasGeocode(
  enderecoCompleto: string,
  bairro: string,
  cidade: string,
): TentativaGeocode[] {
  const partes = enderecoCompleto.match(/^(.*?),?\s*(\d+[a-zA-Z]?)\s*$/);
  const ruaSemNumero = partes ? partes[1].trim() : enderecoCompleto;
  const temNumero = ruaSemNumero !== enderecoCompleto;
  const montar = (parts: string[], precisao: PrecisaoGeocodificacao): TentativaGeocode => ({
    consulta: parts.filter(Boolean).join(", "),
    precisao,
  });

  return [
    montar([enderecoCompleto, bairro, cidade, "Brasil"], temNumero ? "endereco" : "rua"),
    temNumero ? montar([ruaSemNumero, bairro, cidade, "Brasil"], "rua") : null,
    montar([ruaSemNumero, cidade, "Brasil"], "rua"),
    montar([bairro, cidade, "Brasil"], bairro.trim() ? "bairro" : "cidade"),
  ].filter((tentativa): tentativa is TentativaGeocode => tentativa !== null);
}

export async function geocodeEndereco(
  enderecoCompleto: string,
  bairro: string,
  cidade: string,
  opcoes: { cep?: string } = {},
): Promise<Geocodificacao | null> {
  const tentativas = tentativasGeocode(enderecoCompleto, bairro, cidade);
  for (let i = 0; i < tentativas.length; i++) {
    const found = escolherResultadoNominatim(await nominatimSearch(tentativas[i].consulta), { bairro, cep: opcoes.cep });
    if (found) {
      const precisao = precisaoObservada(tentativas[i].precisao, found);
      return {
        lat: Number(found.lat),
        lon: Number(found.lon),
        precisao,
        usedFallback: i > 0 || precisao !== tentativas[i].precisao,
      };
    }
  }
  return null;
}

/* ================================================================
   POSIÇÃO DO APARELHO (navigator.geolocation) — Garimpo em Campo, C6.
   Uma leitura, com prazo. Cada saída tem nome: quem chama decide o que
   fazer com "negada" (cair para o endereço) e com "imprecisa" (guardar
   mesmo assim, avisando). Nunca lança: falha é resultado, não exceção.
   ================================================================ */

export type MotivoPosicaoIndisponivel = "indisponivel" | "negada" | "timeout" | "falha";

export type ResultadoPosicaoAparelho =
  | { ok: true; latitude: number; longitude: number; acuraciaMetros: number }
  | { ok: false; motivo: MotivoPosicaoIndisponivel };

export const OPCOES_POSICAO_APARELHO: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 0,
};

export function capturarPosicaoAtual(
  geolocation: Geolocation | undefined = typeof navigator === "undefined" ? undefined : navigator.geolocation,
  opcoes: PositionOptions = OPCOES_POSICAO_APARELHO,
): Promise<ResultadoPosicaoAparelho> {
  if (!geolocation || typeof geolocation.getCurrentPosition !== "function") {
    return Promise.resolve({ ok: false, motivo: "indisponivel" });
  }
  return new Promise((resolve) => {
    let respondido = false;
    const responder = (resultado: ResultadoPosicaoAparelho) => {
      if (respondido) return;
      respondido = true;
      resolve(resultado);
    };
    try {
      geolocation.getCurrentPosition(
        (posicao) => {
          const { latitude, longitude, accuracy } = posicao.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            responder({ ok: false, motivo: "falha" });
            return;
          }
          responder({ ok: true, latitude, longitude, acuraciaMetros: Number.isFinite(accuracy) ? accuracy : 0 });
        },
        (erro) => {
          // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
          responder({
            ok: false,
            motivo: erro.code === 1 ? "negada" : erro.code === 3 ? "timeout" : erro.code === 2 ? "indisponivel" : "falha",
          });
        },
        opcoes,
      );
    } catch {
      responder({ ok: false, motivo: "falha" });
    }
  });
}
