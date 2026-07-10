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
  erro?: boolean;
}

export async function buscarCep(cep: string): Promise<EnderecoViaCep> {
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  return res.json();
}

interface ResultadoNominatim {
  lat: string;
  lon: string;
}

async function nominatimSearch(query: string): Promise<ResultadoNominatim | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
  const data = await res.json();
  return data && data.length > 0 ? data[0] : null;
}

export interface Geocodificacao {
  lat: number;
  lon: number;
  /** true quando o endereço exato não foi achado e caiu numa tentativa mais larga. */
  usedFallback: boolean;
}

/**
 * Separa "Rua X, 123" em rua + número, para poder tentar de novo sem
 * o número caso o endereço exato não esteja mapeado no OpenStreetMap
 * (muito comum no Brasil, principalmente em bairros mais novos).
 */
export function tentativasGeocode(enderecoCompleto: string, bairro: string, cidade: string): string[] {
  const partes = enderecoCompleto.match(/^(.*?),?\s*(\d+[a-zA-Z]?)\s*$/);
  const ruaSemNumero = partes ? partes[1].trim() : enderecoCompleto;

  return (
    [
      [enderecoCompleto, bairro, cidade, "Brasil"],
      ruaSemNumero !== enderecoCompleto ? [ruaSemNumero, bairro, cidade, "Brasil"] : null,
      [ruaSemNumero, cidade, "Brasil"],
      [bairro, cidade, "Brasil"],
    ].filter(Boolean) as string[][]
  ).map((parts) => parts.filter(Boolean).join(", "));
}

export async function geocodeEndereco(
  enderecoCompleto: string,
  bairro: string,
  cidade: string,
): Promise<Geocodificacao | null> {
  const tentativas = tentativasGeocode(enderecoCompleto, bairro, cidade);
  for (let i = 0; i < tentativas.length; i++) {
    const found = await nominatimSearch(tentativas[i]);
    if (found) return { lat: Number(found.lat), lon: Number(found.lon), usedFallback: i > 0 };
  }
  return null;
}
