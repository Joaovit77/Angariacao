import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { CreateEmbeddingResponse } from "openai/resources/embeddings";
import { CONFIGURACAO_COMPARAVEIS_MERCADO } from "@/lib/calculo/comparaveisMercado";
import { registrarUsoDaResposta, type MetadadosUsoIa } from "./registro";
import { registrarFalhaDaChamada } from "./ia/executor-openai";
import { modeloServidoSaneado, requisicaoProvedorSaneada } from "./ia/metadados-chamada";
import {
  chamadaOpenAIRealAutorizada,
  criarClienteOpenAIReal,
} from "./openai-real";

export function hashConteudoEmbedding(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function modeloEmbeddingImoveis(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim()
    || CONFIGURACAO_COMPARAVEIS_MERCADO.modeloEmbedding;
}

/** Metadados de um lote bem-sucedido (IA-M1c-E1). Só o que a Embeddings
    API informa: o modelo servido e o request id, saneados. Rota, esforço,
    configuração, motivo de fim, recusa e raciocínio não existem aqui e
    ficam null. Uma resposta fora da forma esperada não lança. */
function metadadosDoLote(resposta: unknown, execucaoId: string, duracaoMs: number): MetadadosUsoIa {
  let modeloServido: string | null = null;
  let requisicaoProvedorId: string | null = null;
  try {
    const bruta = resposta as { model?: unknown; _request_id?: unknown } | null | undefined;
    modeloServido = modeloServidoSaneado(bruta?.model);
    requisicaoProvedorId = requisicaoProvedorSaneada(bruta?._request_id);
  } catch {
    // Forma inesperada: os campos ficam null.
  }
  return {
    execucaoId,
    rota: null,
    esforco: null,
    configOrigem: null,
    configVersao: null,
    modeloServido,
    requisicaoProvedorId,
    duracaoMs,
    motivoFim: null,
    recusa: null,
    tokensRaciocinio: null,
  };
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
  if (!apiKey || !chamadaOpenAIRealAutorizada()) return [];
  const cliente = criarClienteOpenAIReal({ apiKey });
  // IA-M1c-E1: uma chamada desta função é uma execução; os lotes dela
  // compartilham o id, que vai só para a linha de uso e para o evento de
  // falha, nunca no corpo enviado.
  const execucaoId = randomUUID();
  const resultado: number[][] = [];
  for (let inicio = 0; inicio < textos.length; inicio += CONFIGURACAO_COMPARAVEIS_MERCADO.maximoTextosPorLote) {
    const lote = textos.slice(inicio, inicio + CONFIGURACAO_COMPARAVEIS_MERCADO.maximoTextosPorLote);
    const modelo = modeloEmbeddingImoveis();
    const corpo = {
      model: modelo,
      input: lote,
      dimensions: CONFIGURACAO_COMPARAVEIS_MERCADO.dimensoesEmbedding,
      encoding_format: "float" as const,
    };
    // Só a chamada ao provedor fica no try, e a duração mede só ela. A falha
    // vira `ia-chamada-falhou` (o contrato do executor comum) e a mesma
    // exceção sobe; o lote que falhou não grava uso.
    const comeco = performance.now();
    let resposta: CreateEmbeddingResponse;
    try {
      resposta = await cliente.embeddings.create(corpo);
    } catch (erro) {
      registrarFalhaDaChamada(erro, userId, {
        tipo: tipoUso,
        execucaoId,
        rota: null,
        esforco: null,
        configOrigem: null,
        configVersao: null,
        modelo,
        duracaoMs: Math.max(0, Math.round(performance.now() - comeco)),
      });
      throw erro;
    }
    const duracaoMs = Math.max(0, Math.round(performance.now() - comeco));
    registrarUsoDaResposta(userId, tipoUso, modelo, resposta.usage, metadadosDoLote(resposta, execucaoId, duracaoMs));
    const ordenados = [...resposta.data].sort((a, b) => a.index - b.index);
    if (ordenados.length !== lote.length) throw new Error("A API não devolveu todos os embeddings do lote.");
    resultado.push(...ordenados.map((item) => item.embedding));
  }
  return resultado;
}
