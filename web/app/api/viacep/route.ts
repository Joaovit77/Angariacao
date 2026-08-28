import { consultarViaCep, type ConsultaViaCep, type FalhaViaCep } from "@/lib/servidor/viacep";

const MENSAGENS: Record<FalhaViaCep, string> = {
  "requisicao-invalida": "Informe um CEP ou endereço válido.",
  "nao-encontrado": "Endereço não encontrado pelo ViaCEP.",
  indisponivel: "O ViaCEP está indisponível no momento. Tente novamente em instantes.",
  "resposta-invalida": "O ViaCEP devolveu uma resposta inválida. Tente novamente em instantes.",
};

export async function GET(request: Request): Promise<Response> {
  const parametros = new URL(request.url).searchParams;
  const cep = (parametros.get("cep") || "").replace(/\D/g, "");
  const uf = (parametros.get("uf") || "").trim().toUpperCase();
  const cidade = (parametros.get("cidade") || "").trim().replace(/\s+/g, " ");
  const logradouro = (parametros.get("logradouro") || "").trim().replace(/\s+/g, " ");
  const consulta: ConsultaViaCep = cep
    ? { tipo: "cep", cep }
    : { tipo: "endereco", uf, cidade, logradouro };
  const resultado = await consultarViaCep(consulta);
  if (!resultado.ok) {
    return Response.json(
      { ok: false, falha: resultado.falha, mensagem: MENSAGENS[resultado.falha] },
      { status: resultado.status },
    );
  }
  return Response.json({ ok: true, resultados: resultado.resultados });
}
