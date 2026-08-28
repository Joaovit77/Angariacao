import type { ResultadoEnderecoViaCep } from "@/lib/calculo/enderecoViaCep";

const URL_VIACEP = "https://viacep.com.br/ws";
const TIMEOUT_VIACEP_MS = 8_000;

export type FalhaViaCep =
  | "requisicao-invalida"
  | "nao-encontrado"
  | "indisponivel"
  | "resposta-invalida";

export type ResultadoConsultaViaCep =
  | { ok: true; resultados: ResultadoEnderecoViaCep[] }
  | { ok: false; falha: FalhaViaCep; status: number };

export type ConsultaViaCep =
  | { tipo: "cep"; cep: string }
  | { tipo: "endereco"; uf: string; cidade: string; logradouro: string };

function consultaValida(consulta: ConsultaViaCep): boolean {
  if (consulta.tipo === "cep") return /^\d{8}$/.test(consulta.cep);
  return (
    /^[A-Z]{2}$/.test(consulta.uf) &&
    consulta.cidade.length >= 3 &&
    consulta.cidade.length <= 80 &&
    consulta.logradouro.length >= 3 &&
    consulta.logradouro.length <= 120
  );
}

function urlDaConsulta(consulta: ConsultaViaCep): string {
  if (consulta.tipo === "cep") return `${URL_VIACEP}/${consulta.cep}/json/`;
  return `${URL_VIACEP}/${encodeURIComponent(consulta.uf)}/${encodeURIComponent(
    consulta.cidade,
  )}/${encodeURIComponent(consulta.logradouro)}/json/`;
}

function ehResultadoViaCep(valor: unknown): valor is ResultadoEnderecoViaCep {
  if (!valor || typeof valor !== "object") return false;
  const item = valor as Record<string, unknown>;
  return ["cep", "logradouro", "complemento", "bairro", "localidade", "uf"].every(
    (campo) => item[campo] === undefined || typeof item[campo] === "string",
  ) && (item.erro === undefined || typeof item.erro === "boolean");
}

/** Fronteira única com o ViaCEP. O host é fixo e a entrada é validada antes
    de compor a URL, portanto a rota interna não funciona como proxy aberto. */
export async function consultarViaCep(
  consulta: ConsultaViaCep,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoConsultaViaCep> {
  if (!consultaValida(consulta)) {
    return { ok: false, falha: "requisicao-invalida", status: 400 };
  }

  let resposta: Response;
  try {
    resposta = await fetcher(urlDaConsulta(consulta), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_VIACEP_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, falha: "indisponivel", status: 503 };
  }

  if (!resposta.ok) {
    return { ok: false, falha: "indisponivel", status: 502 };
  }

  const dados = await resposta.json().catch(() => null);
  const lista = Array.isArray(dados) ? dados : dados ? [dados] : [];
  if (!lista.every(ehResultadoViaCep)) {
    return { ok: false, falha: "resposta-invalida", status: 502 };
  }
  const resultados = lista.filter((item) => item.erro !== true);
  if (consulta.tipo === "cep" && resultados.length === 0) {
    return { ok: false, falha: "nao-encontrado", status: 404 };
  }
  return { ok: true, resultados };
}
