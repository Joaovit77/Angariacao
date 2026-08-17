import type {
  BlocoAssistente,
  ContextoAssistente,
  ItemHistoricoAssistente,
  ItemImovelAssistente,
} from "./tipos";
import { fmtDate } from "../formatadores";

type Marco = NonNullable<ItemImovelAssistente["marco"]>;

export interface EntidadeConversacional {
  id: string | null;
  codigo: string | null;
  marco: Marco | null;
  marcoEm: string | null;
}

export interface ContinuidadeEntidade {
  relacao: "mesma_entidade" | "entidade_diferente";
  origemReferencia: "entidade_visual" | "resultado_anterior";
  anterior: EntidadeConversacional;
  atual: EntidadeConversacional;
}

function codigoCanonico(valor: string | null | undefined): string | null {
  const codigo = (valor || "").trim().toUpperCase();
  return codigo && codigo !== "SEM CODIGO" ? codigo : null;
}

function entidadeDoItem(item: {
  id: string;
  codigo?: string;
  marco?: Marco;
  marcoEm?: string | null;
}): EntidadeConversacional {
  return {
    id: item.id.trim() || null,
    codigo: codigoCanonico(item.codigo),
    marco: item.marco || null,
    marcoEm: item.marcoEm || null,
  };
}

function entidadeVisual(contexto: ContextoAssistente): EntidadeConversacional | null {
  const ativa = (contexto.superficie === "drawer" || contexto.superficie === "modal")
    && contexto.entidade?.tipo === "imovel";
  return ativa && contexto.entidade ? {
    id: contexto.entidade.id.trim() || null,
    codigo: null,
    marco: null,
    marcoEm: null,
  } : null;
}

/** Usa apenas o resultado estruturado da resposta imediatamente anterior.
    Não procura códigos no texto e não ressuscita uma entidade antiga depois
    de um turno quantitativo ou sem card. */
export function entidadeDaRespostaAnterior(
  historico: ItemHistoricoAssistente[],
): EntidadeConversacional | null {
  const anterior = historico.at(-1);
  if (anterior?.papel !== "assistente") return null;
  const resultado = [...(anterior.resultados || [])]
    .reverse()
    .find((item) => item.tipo === "imoveis");
  if (resultado?.tipo !== "imoveis" || resultado.itens.length !== 1) return null;
  return entidadeDoItem(resultado.itens[0]);
}

function itemHistoricoSingular(bloco: BlocoAssistente | undefined): ItemImovelAssistente | null {
  if (bloco?.tipo !== "imoveis" || bloco.itens.length !== 1) return null;
  const item = bloco.itens[0];
  // A composição determinística fica restrita aos marcos históricos. Outros
  // cards singulares continuam sob a formulação normal do Assistente.
  return item.marco ? item : null;
}

/** Compara somente depois de a nova ferramenta devolver um card singular.
    ID tem precedência; código canônico é fallback quando algum lado não tem ID. */
export function compararEntidadeComResultadoAtual(
  contexto: ContextoAssistente,
  historico: ItemHistoricoAssistente[],
  bloco: BlocoAssistente | undefined,
): ContinuidadeEntidade | null {
  const itemAtual = itemHistoricoSingular(bloco);
  if (!itemAtual) return null;
  const visual = entidadeVisual(contexto);
  const anterior = visual || entidadeDaRespostaAnterior(historico);
  if (!anterior) return null;

  const atual = entidadeDoItem(itemAtual);
  const mesma = anterior.id && atual.id
    ? anterior.id === atual.id
    : !!anterior.codigo && anterior.codigo === atual.codigo;

  return {
    relacao: mesma ? "mesma_entidade" : "entidade_diferente",
    origemReferencia: visual ? "entidade_visual" : "resultado_anterior",
    anterior,
    atual,
  };
}

const ROTULO_MARCO: Record<Marco, string> = {
  angariado: "a última angariação",
  publicado: "o último publicado",
  locado: "o último locado",
};

function fraseDaData(marco: Marco, marcoEm: string | null): string {
  if (!marcoEm) return "";
  const data = fmtDate(marcoEm);
  if (marco === "angariado") return `O marco de angariação foi em ${data}.`;
  if (marco === "publicado") return `Ele foi publicado em ${data}.`;
  return `Ele foi locado em ${data}.`;
}

/** Redação curta e vinculada ao mesmo objeto usado pelo card. Assim o modelo
    decide ferramentas e argumentos, mas não pode fazer texto e card divergirem
    justamente no caso em que a continuidade estrutural já resolveu a frase. */
export function respostaNaturalDaContinuidade(
  continuidade: ContinuidadeEntidade,
): string {
  const { atual } = continuidade;
  const identificacao = atual.codigo ? `o ${atual.codigo}` : "o imóvel consultado";
  const data = atual.marco ? fraseDaData(atual.marco, atual.marcoEm) : "";

  if (continuidade.relacao === "mesma_entidade") {
    const inicio = continuidade.origemReferencia === "entidade_visual"
      ? `Foi este mesmo imóvel: ${identificacao}.`
      : continuidade.anterior.marco === atual.marco
        ? `Sim — continua sendo ${identificacao}.`
        : `Foi o mesmo imóvel que mencionei acima: ${identificacao}.`;
    return [inicio, data].filter(Boolean).join(" ");
  }

  const rotulo = atual.marco ? ROTULO_MARCO[atual.marco] : "o novo resultado";
  return [`Já ${rotulo} foi outro imóvel: ${identificacao}.`, data].filter(Boolean).join(" ");
}

export function continuidadeParaModelo(continuidade: ContinuidadeEntidade) {
  return {
    ...continuidade,
    instrucaoDeRedacao:
      continuidade.relacao === "mesma_entidade"
        ? "A nova consulta confirmou a mesma entidade. Diga isso naturalmente e evite repetir endereço, bairro ou responsável já apresentados."
        : "A nova consulta retornou outra entidade. Deixe a mudança clara sem sugerir que o resultado anterior estava errado.",
  };
}
