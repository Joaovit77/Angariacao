import { CATALOGO_CAPACIDADES_ASSISTENTE } from "./capacidades";
import type { ContextoAssistente } from "./tipos";

export type TipoBlocoContextoAssistente =
  | "imovel"
  | "agenda"
  | "pipeline"
  | "conversa"
  | "mensagens"
  | "protocolos"
  | "avaliacao"
  | "mercado";

export type AutoridadeContextoAssistente =
  | "dado_estruturado_atual"
  | "protocolo"
  | "historico_operacional"
  | "historico_conversacional"
  | "resultado_ferramenta";

export type TemporalidadeContextoAssistente =
  | "atual"
  | "ultimo_observado"
  | "historico"
  | "agendado"
  | "futuro";

export type EstadoBlocoContextoAssistente = "disponivel" | "ausente" | "indisponivel";

export interface BlocoContextoAssistente<Tipo extends TipoBlocoContextoAssistente, Dados> {
  tipo: Tipo;
  estado: EstadoBlocoContextoAssistente;
  fonte: string;
  autoridade: AutoridadeContextoAssistente;
  temporalidade: TemporalidadeContextoAssistente;
  observadoEm: string | null;
  dados: Dados | null;
  motivoAusencia?: string;
}

export interface MovimentacaoContextoAssistente {
  em: string;
  categoria: "status" | "nota" | "tentativa";
  fonte: string;
}

export interface DadosContextoImovelAssistente {
  /** Mantido apenas no servidor para reuso por loaders e validações. */
  idInterno: string;
  codigo: string | null;
  referenciaCrm: string | null;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  unidade: string | null;
  bloco: string | null;
  edificio: string | null;
  tipoImovel: string | null;
  statusAtual: string;
  proprietarioNome: string | null;
  responsavel: string | null;
  origemImovel: string | null;
  dataCadastro: string | null;
  ultimaMovimentacao: MovimentacaoContextoAssistente | null;
}

export interface ItemContextoAgendaAssistente {
  /** Mantido apenas no servidor; a serialização consultiva não o expõe. */
  idInterno: string;
  titulo: string;
  tipoCompromisso: string;
  data: string;
  hora: string | null;
  concluido: boolean;
  imovelIdInterno: string | null;
  origem: string | null;
}

export interface DadosContextoAgendaAssistente {
  escopo: "entidade_atual" | "imovel" | "periodo";
  itens: ItemContextoAgendaAssistente[];
}

export interface DadosContextoPipelineAssistente {
  statusAtual: string;
  responsavel: string | null;
  ultimaMovimentacao: MovimentacaoContextoAssistente | null;
}

export interface DadosContextoProtocolosAssistente {
  catalogo: Array<{ id: string; titulo: string }>;
}

export interface ContextoTipadoAssistente {
  base: {
    /** Identidade de autorização. Nunca é serializada para o modelo. */
    userIdInterno: string;
    papel: "usuario_autenticado";
    capacidadesSelecionadas: string[];
    blocosSelecionados: TipoBlocoContextoAssistente[];
    blocosSobDemanda: TipoBlocoContextoAssistente[];
    dataHoraOperacional: string;
    fuso: "America/Sao_Paulo";
    contextoVisual: {
      rota: string;
      pagina: string;
      superficie: "pagina" | "drawer" | "modal";
      entidade: "imovel" | "agenda" | null;
    };
  };
  imovel?: BlocoContextoAssistente<"imovel", DadosContextoImovelAssistente>;
  agenda?: BlocoContextoAssistente<"agenda", DadosContextoAgendaAssistente>;
  pipeline?: BlocoContextoAssistente<"pipeline", DadosContextoPipelineAssistente>;
  protocolos?: BlocoContextoAssistente<"protocolos", DadosContextoProtocolosAssistente>;
}

export interface SelecaoContextoAssistente {
  capacidades: string[];
  blocos: TipoBlocoContextoAssistente[];
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function correspondeAoTermo(pergunta: string, termo: string): boolean {
  const termoNormalizado = normalizar(termo);
  if (!termoNormalizado) return false;
  if (pergunta.includes(termoNormalizado)) return true;
  const palavras = termoNormalizado.split(" ").filter((palavra) => palavra.length > 2);
  return palavras.length > 1 && palavras.every((palavra) => pergunta.includes(palavra));
}

/**
 * Seleção determinística: usa o catálogo existente e não chama outro modelo.
 * A seleção declara o que pode ser útil; loaders ainda exigem uma referência
 * inequívoca antes de consultar uma entidade específica.
 */
export function selecionarContextoAssistente(
  mensagem: string,
  contextoVisual: ContextoAssistente,
): SelecaoContextoAssistente {
  const pergunta = normalizar(mensagem);
  const capacidades = CATALOGO_CAPACIDADES_ASSISTENTE
    .filter((capacidade) => capacidade.tipo !== "limite")
    .filter((capacidade) => capacidade.termosDescoberta.some((termo) => correspondeAoTermo(pergunta, termo)))
    .map((capacidade) => capacidade.id);

  const porId = new Map(CATALOGO_CAPACIDADES_ASSISTENTE.map((capacidade) => [capacidade.id, capacidade]));
  const blocos = new Set<TipoBlocoContextoAssistente>();
  for (const id of capacidades) {
    for (const bloco of porId.get(id)?.contextoNecessario || []) blocos.add(bloco);
  }

  const temEntidadeImovel = contextoVisual.entidade?.tipo === "imovel"
    && (contextoVisual.superficie === "drawer" || contextoVisual.superficie === "modal");
  const mencionaImovel = /\b(imovel|proprietari[oa]|lead|dele|dela|desse|dessa|este|esta)\b/.test(pergunta)
    || /\b[A-Z]{1,6}-?\d{1,10}\b/i.test(mensagem);
  if (temEntidadeImovel && mencionaImovel && !/\bmercado\b/.test(pergunta)) blocos.add("imovel");

  return { capacidades, blocos: [...blocos] };
}
