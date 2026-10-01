/* ================================================================
   IA-M1c-D1: METADADOS DE UMA CHAMADA À RESPONSES API (F10)

   O chat do Assistente não passa pelo executor de Chat Completions, então
   os metadados da linha de uso (os mesmos do M1c-A) são lidos aqui da
   resposta da Responses API. Só ids, enums, booleanos e números; nunca o
   texto da resposta, da recusa ou das ferramentas. Tudo com encadeamento
   opcional: uma resposta fora da forma esperada não lança, só vira null.
   ================================================================ */
import type { MetadadosUsoIa } from "@/lib/servidor/registro";

type BaseMetadados = Pick<MetadadosUsoIa, "execucaoId" | "rota" | "esforco" | "configOrigem" | "configVersao" | "duracaoMs">;

type RespostaBruta = {
  model?: unknown;
  _request_id?: unknown;
  status?: unknown;
  incomplete_details?: { reason?: unknown } | null;
  output?: unknown;
  usage?: { output_tokens_details?: { reasoning_tokens?: unknown } | null } | null;
};
type ItemBruto = { type?: unknown; content?: unknown } | null | undefined;

/** O mesmo contrato do M1c-A para valores vindos do provedor. */
const textoCurto = (valor: unknown, maximo: number, padrao?: RegExp): string | null =>
  typeof valor === "string" && valor.length > 0 && valor.length <= maximo && (!padrao || padrao.test(valor))
    ? valor
    : null;

/**
 * A Responses API não tem `finish_reason`. O motivo é mapeado para o
 * vocabulário que a coluna já usa, nesta ordem: houve chamada de
 * ferramenta → `tool_calls`; `completed` → `stop`; `incomplete` por
 * `max_output_tokens` → `length`; por `content_filter` → `content_filter`;
 * qualquer outra coisa → null.
 */
export function motivoFimDaResposta(resposta: unknown): string | null {
  try {
    const bruta = resposta as RespostaBruta | null | undefined;
    const saida = Array.isArray(bruta?.output) ? (bruta.output as ItemBruto[]) : null;
    if (saida?.some((item) => item?.type === "function_call")) return "tool_calls";
    if (bruta?.status === "completed") return "stop";
    if (bruta?.status === "incomplete") {
      const motivo = bruta.incomplete_details?.reason;
      if (motivo === "max_output_tokens") return "length";
      if (motivo === "content_filter") return "content_filter";
    }
    return null;
  } catch {
    return null;
  }
}

/** true se algum item da saída traz uma recusa; false se há saída sem
    recusa; null se não há lista de saída observável. Só o booleano. */
export function recusaDaResposta(resposta: unknown): boolean | null {
  try {
    const saida = (resposta as RespostaBruta | null | undefined)?.output;
    if (!Array.isArray(saida)) return null;
    return (saida as ItemBruto[]).some((item) =>
      Array.isArray(item?.content) && (item.content as Array<{ type?: unknown } | null>).some((parte) => parte?.type === "refusal"));
  } catch {
    return null;
  }
}

/** Os metadados de uma rodada do F10. Nunca lança. */
export function metadadosDaRespostaResponses(resposta: unknown, base: BaseMetadados): MetadadosUsoIa {
  let modeloServido: string | null = null;
  let requisicaoProvedorId: string | null = null;
  let tokensRaciocinio: number | null = null;
  try {
    const bruta = resposta as RespostaBruta | null | undefined;
    modeloServido = textoCurto(bruta?.model, 120);
    requisicaoProvedorId = textoCurto(bruta?._request_id, 200, /^[\w.:-]+$/);
    const raciocinio = bruta?.usage?.output_tokens_details?.reasoning_tokens;
    tokensRaciocinio = typeof raciocinio === "number" && Number.isInteger(raciocinio) && raciocinio >= 0 ? raciocinio : null;
  } catch {
    // Forma inesperada: os campos ficam null.
  }
  return {
    ...base,
    modeloServido,
    requisicaoProvedorId,
    motivoFim: motivoFimDaResposta(resposta),
    recusa: recusaDaResposta(resposta),
    tokensRaciocinio,
  };
}
