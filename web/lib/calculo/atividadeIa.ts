import { timestampDeIso } from "@/lib/datas";

export type IconeAtividadeIa =
  | "analise"
  | "atendimento"
  | "contexto"
  | "imoveis"
  | "resposta"
  | "whatsapp";

export interface LinhaUsoIa {
  id: string | number;
  tipo: string;
  criado_em: string;
}

export interface AtividadeIa {
  id: string;
  titulo: string;
  fluxo: string[];
  concluidaEm: string;
  icone: IconeAtividadeIa;
}

interface ApresentacaoAtividade {
  titulo: string;
  fluxo: string[];
  icone: IconeAtividadeIa;
}

const APRESENTACOES: Record<string, ApresentacaoAtividade> = {
  "assistente-chat": {
    titulo: "Conversa com o Assistente",
    fluxo: ["Solicitação", "Consulta", "Validação", "Resposta"],
    icone: "atendimento",
  },
  "rascunhar-resposta": {
    titulo: "Resposta ao proprietário preparada",
    fluxo: ["Conversa", "Protocolos", "Validação", "Rascunho"],
    icone: "resposta",
  },
  "sugerir-roteiros": {
    titulo: "Roteiros de abordagem sugeridos",
    fluxo: ["Cenário", "Estratégias", "Validação", "Sugestões"],
    icone: "atendimento",
  },
  "extrair-anuncio": {
    titulo: "Anúncio analisado",
    fluxo: ["Texto", "Leitura", "Validação", "Dados do imóvel"],
    icone: "imoveis",
  },
  "gerar-anuncio": {
    titulo: "Anúncio do imóvel gerado",
    fluxo: ["Imóvel", "Características", "Validação", "Anúncio"],
    icone: "imoveis",
  },
  "abordagem-anuncio": {
    titulo: "Abordagem do proprietário preparada",
    fluxo: ["Anúncio", "Contexto", "Validação", "Mensagem"],
    icone: "atendimento",
  },
  "analisar-abordagens": {
    titulo: "Desempenho das abordagens analisado",
    fluxo: ["Resultados", "Comparação", "Leitura", "Orientação"],
    icone: "analise",
  },
  "analisar-dashboard": {
    titulo: "Indicadores do Dashboard analisados",
    fluxo: ["Indicadores", "Contexto", "Leitura", "Resumo"],
    icone: "analise",
  },
  "analisar-mapa": {
    titulo: "Mapa analisado pela IA",
    fluxo: ["Região", "Imóveis", "Leitura", "Ação sugerida"],
    icone: "analise",
  },
  "resumo-dia": {
    titulo: "Resumo do dia preparado",
    fluxo: ["Carteira", "Agenda", "Prioridades", "Resumo"],
    icone: "contexto",
  },
  "explicar-foco": {
    titulo: "Prioridades do dia explicadas",
    fluxo: ["Pendências", "Prioridade", "Critérios", "Explicação"],
    icone: "analise",
  },
  "classificar-resposta": {
    titulo: "Resposta do proprietário analisada",
    fluxo: ["Resposta", "Contexto", "Classificação", "Atualização"],
    icone: "whatsapp",
  },
  transcricao: {
    titulo: "Áudio do WhatsApp transcrito",
    fluxo: ["Áudio", "Transcrição", "Validação", "Texto"],
    icone: "whatsapp",
  },
  "embedding-imovel": {
    titulo: "Imóvel preparado para comparação",
    fluxo: ["Imóvel", "Características", "Organização", "Comparação"],
    icone: "imoveis",
  },
};

const APRESENTACAO_GENERICA: ApresentacaoAtividade = {
  titulo: "Interação com a IA",
  fluxo: ["Solicitação", "Processamento", "Validação", "Resposta"],
  icone: "analise",
};

/** Une as etapas técnicas que pertencem a uma mesma solicitação do usuário. */
export function normalizarTipoAtividadeIa(tipo: string): string {
  const limpo = tipo.trim().toLowerCase();
  if (limpo.startsWith("rascunhar-resposta-")) return "rascunhar-resposta";
  return limpo;
}

/**
 * Converte o registro contábil da IA em atividade de produto.
 * Nunca recebe nem devolve prompt, resposta, modelo, tokens ou dados pessoais.
 */
export function criarAtividadesIa(linhas: LinhaUsoIa[], limite = 8): AtividadeIa[] {
  if (limite <= 0) return [];
  const ordenadas = [...linhas]
    .filter((linha) => linha.tipo.trim() && timestampDeIso(linha.criado_em) !== null)
    .sort((a, b) => (timestampDeIso(b.criado_em) ?? 0) - (timestampDeIso(a.criado_em) ?? 0));
  const atividades: AtividadeIa[] = [];
  const ultimaPorTipo = new Map<string, number>();

  for (const linha of ordenadas) {
    const tipo = normalizarTipoAtividadeIa(linha.tipo);
    const data = timestampDeIso(linha.criado_em) ?? 0;
    const ultima = ultimaPorTipo.get(tipo);
    if (ultima !== undefined && Math.abs(ultima - data) <= 60_000) continue;

    const apresentacao = APRESENTACOES[tipo] ?? APRESENTACAO_GENERICA;
    atividades.push({
      id: `ia-${linha.id}`,
      titulo: apresentacao.titulo,
      fluxo: [...apresentacao.fluxo],
      concluidaEm: linha.criado_em,
      icone: apresentacao.icone,
    });
    ultimaPorTipo.set(tipo, data);
    if (atividades.length >= Math.max(0, limite)) break;
  }

  return atividades;
}
