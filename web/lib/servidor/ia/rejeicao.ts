/* ================================================================
   IA-M1c-C: A APLICAÇÃO REJEITOU A RESPOSTA DO PROVEDOR

   Três fatos diferentes, três registros diferentes:

   - o provedor respondeu com usage → uma linha em `ia_uso` (M1c-A);
   - o provedor falhou → `ia-chamada-falhou` (M1c-B, no executor);
   - o provedor respondeu, mas a aplicação recusou a resposta →
     `ia-resposta-rejeitada` (este módulo, em quem chamou o executor).

   Um evento por CHAMADA rejeitada, ligado à linha de uso pelo
   `execucao_id` e pelo id da requisição. Só ids, enums e códigos
   fechados: nunca a resposta, o prompt ou qualquer texto do erro. E
   nunca lança: a telemetria não muda retorno, status ou exceção de quem
   a chamou.
   ================================================================ */
import { registrarEvento, type EntradaEvento } from "@/lib/servidor/registro";

export type CategoriaRejeicao = "resposta-invalida" | "fora-do-contrato" | "reprovada-pela-validacao";

export type MotivoRespostaInvalida = "sem-choices" | "recusa" | "truncada" | "vazia" | "json-invalido";

export type MotivoRejeicao =
  | MotivoRespostaInvalida
  | "fora-do-vocabulario"
  | "campo-obrigatorio-ausente"
  | "lista-vazia"
  | "estrutura-invalida"
  | "validacao-reprovada";

export const CATEGORIA_DO_MOTIVO: Readonly<Record<MotivoRejeicao, CategoriaRejeicao>> = {
  "sem-choices": "resposta-invalida",
  recusa: "resposta-invalida",
  truncada: "resposta-invalida",
  vazia: "resposta-invalida",
  "json-invalido": "resposta-invalida",
  "fora-do-vocabulario": "fora-do-contrato",
  "campo-obrigatorio-ausente": "fora-do-contrato",
  "lista-vazia": "fora-do-contrato",
  "estrutura-invalida": "fora-do-contrato",
  "validacao-reprovada": "reprovada-pela-validacao",
};

/** O vocabulário fechado de `validarSaidaAnaliseAprofundada` (F11). Um
    código fora desta lista nunca vai para o evento. */
export const CODIGOS_VALIDACAO_ANALISE: ReadonlySet<string> = new Set([
  "estrutura-invalida",
  "fonte-desconhecida",
  "fato-sem-fonte",
  "inferencia-sem-fonte",
  "atendimento-nao-autorizado",
  "temporalidade-incompativel",
  "acao-operacional-alegada",
  "outro-imovel-referenciado",
  "valor-monetario-sem-autoridade",
  "avaliacao-numerica-sem-fonte-deterministica",
  "protocolo-nao-carregado",
]);

type ConclusaoBruta = {
  _request_id?: unknown;
  choices?: unknown;
};
type EscolhaBruta = {
  finish_reason?: unknown;
  message?: { refusal?: unknown; content?: unknown } | null;
} | null | undefined;

/**
 * Por que uma conclusão não pôde ser usada, lido só da forma da resposta
 * (na mesma ordem de `textoDaResposta`: recusa antes de truncamento). Um
 * conteúdo que é JSON válido e mesmo assim foi rejeitado é estrutura fora
 * do contrato, não JSON inválido. O conteúdo é lido para classificar e
 * nunca sai daqui. Nunca lança.
 */
export function motivoDaConclusaoRejeitada(conclusao: unknown): MotivoRespostaInvalida | "estrutura-invalida" {
  try {
    const bruta = conclusao as ConclusaoBruta | null | undefined;
    if (!Array.isArray(bruta?.choices) || bruta.choices.length === 0) return "sem-choices";
    const escolha = bruta.choices[0] as EscolhaBruta;
    if (escolha?.message?.refusal) return "recusa";
    if (escolha?.finish_reason === "length") return "truncada";
    const conteudo = escolha?.message?.content;
    if (typeof conteudo !== "string" || conteudo.trim() === "") return "vazia";
    try {
      JSON.parse(conteudo);
    } catch {
      return "json-invalido";
    }
    return "estrutura-invalida";
  } catch {
    return "sem-choices";
  }
}

/** `_request_id` da conclusão, com o contrato do M1c-A e do M1c-B: até 200
    caracteres de `[\w.:-]`; qualquer outra coisa vira null. */
export function requisicaoDaConclusao(conclusao: unknown): string | null {
  try {
    const valor = (conclusao as ConclusaoBruta | null | undefined)?._request_id;
    return typeof valor === "string" && valor.length > 0 && valor.length <= 200 && /^[\w.:-]+$/.test(valor)
      ? valor
      : null;
  } catch {
    return null;
  }
}

function codigosPermitidos(codigos: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(codigos)) return [];
  return [...new Set(codigos.filter((c): c is string => typeof c === "string" && CODIGOS_VALIDACAO_ANALISE.has(c)))];
}

export interface RespostaRejeitada {
  userId: string | null;
  /** O mesmo `tipo` da linha de uso (`classificar-resposta`, `resumo-dia`…). */
  tipo: string;
  execucaoId: string;
  /** A conclusão rejeitada: dela saem o id da requisição e, sem `motivo`,
      o motivo. */
  conclusao: unknown;
  /** Sem motivo explícito, ele é lido da conclusão. */
  motivo?: MotivoRejeicao;
  /** 1 para fluxos de uma chamada; a tentativa, no F11. */
  tentativa?: number;
  /** Só os códigos fechados da validação do F11. */
  codigos?: readonly unknown[];
  /** Quem grava o evento; por padrão, o registro comum. */
  registrar?: (entrada: EntradaEvento) => void;
}

/** Um `ia-resposta-rejeitada` (ia, aviso) para uma chamada rejeitada. */
export function registrarRespostaRejeitada(entrada: RespostaRejeitada): void {
  try {
    const motivo = entrada.motivo ?? motivoDaConclusaoRejeitada(entrada.conclusao);
    const tentativa = Number.isInteger(entrada.tentativa) && (entrada.tentativa as number) > 0 ? entrada.tentativa as number : 1;
    (entrada.registrar ?? registrarEvento)({
      userId: entrada.userId,
      categoria: "ia",
      nivel: "aviso",
      evento: "ia-resposta-rejeitada",
      detalhe: JSON.stringify({
        tipo: entrada.tipo,
        execucao_id: entrada.execucaoId,
        requisicao_provedor_id: requisicaoDaConclusao(entrada.conclusao),
        tentativa,
        categoria: CATEGORIA_DO_MOTIVO[motivo],
        motivo,
        codigos: codigosPermitidos(entrada.codigos),
      }),
    });
  } catch {
    // A telemetria nunca muda o caminho de quem rejeitou a resposta.
  }
}
