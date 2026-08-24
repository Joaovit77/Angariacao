import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { CONFIGURACAO_COMPARAVEIS_MERCADO } from "@/lib/calculo/comparaveisMercado";
import { registrarUsoDaResposta } from "./registro";

export function hashConteudoEmbedding(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function modeloEmbeddingImoveis(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim()
    || CONFIGURACAO_COMPARAVEIS_MERCADO.modeloEmbedding;
}

/** Gera em lotes pequenos para limitar memória, tamanho da requisição e o
    impacto de uma falha. A ordem devolvida é a mesma dos textos recebidos. */
export async function gerarEmbeddingsDeImoveis(
  textos: string[],
  userId: string | null = null,
  tipoUso = "embedding-imovel",
): Promise<number[][]> {
  if (!textos.length) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];
  const cliente = new OpenAI({ apiKey });
  const resultado: number[][] = [];
  for (let inicio = 0; inicio < textos.length; inicio += CONFIGURACAO_COMPARAVEIS_MERCADO.maximoTextosPorLote) {
    const lote = textos.slice(inicio, inicio + CONFIGURACAO_COMPARAVEIS_MERCADO.maximoTextosPorLote);
    const modelo = modeloEmbeddingImoveis();
    const resposta = await cliente.embeddings.create({
      model: modelo,
      input: lote,
      dimensions: CONFIGURACAO_COMPARAVEIS_MERCADO.dimensoesEmbedding,
      encoding_format: "float",
    });
    registrarUsoDaResposta(userId, tipoUso, modelo, resposta.usage);
    const ordenados = [...resposta.data].sort((a, b) => a.index - b.index);
    if (ordenados.length !== lote.length) throw new Error("A API não devolveu todos os embeddings do lote.");
    resultado.push(...ordenados.map((item) => item.embedding));
  }
  return resultado;
}
